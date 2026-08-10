/**
 * shippingFeeCalc.js
 * Calculates per-user shipping fee breakdown for a ShippingPool.
 *
 * Single shipment fee per user (all orders belong to one user):
 *   balance_due + item_size_extra_fee(each order) + packing_fee + addon_fees + box_price + transit_shipping_fee
 *
 * Consolidation (transit/other) per user:
 *   Personal: balance_due + item_size_extra_fee(own orders) + transit_handling_fee + packing_fee_per_user + addon_fees + transit_shipping_fee
 *   Shared: (own_weight / total_weight) * (shipping_fee + box_price)
 *   Total = personal + shared
 *
 * All fees are in JPY unless otherwise noted. addon fees use fee_currency field.
 * For simplicity we treat all addon fees as JPY (they are stored in JPY per architecture rules).
 */

/**
 * @param {object} params
 * @param {object} params.pool - the ShippingPool record
 * @param {Array}  params.orders - orders in the pool (each: {id, user_email, weight_g, item_size_extra_fee, item_size_fee_currency})
 * @param {number} params.shippingFeeJpy - actual shipping fee (JPY) entered by admin
 * @param {number} params.boxPriceJpy - box price (JPY)
 * @param {number} params.globalPackingFeeJpy - global packing fee (JPY) included in shared pool for consolidation, or direct for single shipment
 * @param {Array}  params.packingFeesPerUser - [{user_email, fee_jpy}] per-user extra packing fees (added to individual personal total)
 * @param {object|null} params.transitLocation - TransitLocation record (for handling_fee)
 * @param {object|null} params.transitShippingMethod - TransitShippingMethod record (for fee)
 * @param {object} params.exchangeRates - {jpy_cny, jpy_usd, ...} for currency conversion
 * @param {boolean} params.transitHandlingFeeSplit - when true, transit location handling fee is split proportionally by weight (shared pool) instead of charged per-user
 * @returns {Array} [{user_email, items: [{label, amount_jpy}], personal_total_jpy, shared_jpy, total_jpy}]
 */
export function calcFeeBreakdownPerUser({
  pool,
  orders,
  shippingFeeJpy = 0,
  boxPriceJpy = 0,
  globalPackingFeeJpy = 0,
  packingFeesPerUser = [],
  transitLocation = null,
  transitShippingMethod = null,
  exchangeRates = null,
  transitHandlingFeeSplit = false,
}) {
  const isConsolidation = pool.consolidation_type === "transit" || pool.consolidation_type === "other";
  const totalWeightG = orders.reduce((s, o) => s + (o.weight_g || 0), 0);

  // Group orders by user
  const userOrderMap = {};
  for (const order of orders) {
    const email = order.user_email || "__unknown__";
    if (!userOrderMap[email]) userOrderMap[email] = [];
    userOrderMap[email].push(order);
  }

  // If packingFeesPerUser uses "__all__" (single user shorthand), expand to all users
  const expandedPackingFees = expandPackingFees(packingFeesPerUser, Object.keys(userOrderMap));

  // Addons are stored per-order (on each order's selected_addons field), not on the pool.
  // We compute per-user addon totals below inside the user loop.

  // Transit location handling fee — convert to JPY if needed
  const transitHandlingFee = convertToJpy(
    transitLocation?.handling_fee || 0,
    transitLocation?.handling_fee_currency || "JPY",
    exchangeRates
  );

  // Transit shipping method fee — convert to JPY based on its fee_currency
  const transitShippingFee = calcTransitShippingFeeJpy(transitShippingMethod, exchangeRates);

  const result = [];

  for (const [email, userOrders] of Object.entries(userOrderMap)) {
    const userWeightG = userOrders.reduce((s, o) => s + (o.weight_g || 0), 0);
    const packingEntry = expandedPackingFees.find(p => p.user_email === email);
    const packingFee = parseFloat(packingEntry?.fee_jpy) || 0;

    // Item size extra fees sum for this user's orders
    const itemSizeFeeJpy = userOrders.reduce((s, o) => s + (parseFloat(o.item_size_extra_fee) || 0), 0);

    // Rewarehouse fee: if any of user's orders have a rewarehouse_fee_jpy, sum them
    const rewarehouseFeeJpy = userOrders.reduce((s, o) => s + (parseFloat(o.rewarehouse_fee_jpy) || 0), 0);

    // Addon fees: per-user, deduplicated by addon id/name (one charge per user per service)
    const seenAddonKeys = new Set();
    const userAddons = [];
    for (const o of userOrders) {
      for (const a of (o.selected_addons || [])) {
        const key = a.id || a.service_name;
        if (key && !seenAddonKeys.has(key)) {
          seenAddonKeys.add(key);
          userAddons.push(a);
        }
      }
    }
    const userAddonFeeJpy = userAddons.reduce((s, a) => s + (parseFloat(a.fee) || 0), 0);

    // 货款尾款: remaining goods balance after prepayment, collected with the shipping fee.
    // order_balance_due_jpy / order_balance_surcharge_jpy are computed server-side at order creation.
    // Supplements already paid at order stage (paid_amount above prepayment) reduce base first, then surcharge.
    let balanceDueJpy = 0;
    let balanceSurchargeJpy = 0;
    const surchargeRateSet = new Set();
    for (const o of userOrders) {
      if (o.order_balance_settled) continue;
      const base = parseFloat(o.order_balance_due_jpy) || 0;
      const surcharge = parseFloat(o.order_balance_surcharge_jpy) || 0;
      if (base <= 0 && surcharge <= 0) continue;
      let extraPaid = Math.max(0, (parseFloat(o.paid_amount) || 0) - (parseFloat(o.prepayment_amount) || 0));
      const baseRemaining = Math.max(0, Math.round(base - extraPaid));
      extraPaid = Math.max(0, extraPaid - base);
      const surchargeRemaining = Math.max(0, Math.round(surcharge - extraPaid));
      balanceDueJpy += baseRemaining;
      balanceSurchargeJpy += surchargeRemaining;
      if (surchargeRemaining > 0 && o.order_balance_surcharge_rate) {
        surchargeRateSet.add(parseFloat(o.order_balance_surcharge_rate));
      }
    }

    const items = [];

    if (balanceDueJpy > 0) {
      items.push({ label: "货款尾款（未付货款差额）", amount_jpy: balanceDueJpy });
    }
    if (balanceSurchargeJpy > 0) {
      const rateLabel = surchargeRateSet.size === 1 ? `（${[...surchargeRateSet][0]}%）` : "";
      items.push({ label: `尾款加值${rateLabel}`, amount_jpy: balanceSurchargeJpy });
    }

    if (itemSizeFeeJpy > 0) {
      items.push({ label: "物品尺寸追加费", amount_jpy: itemSizeFeeJpy });
    }

    if (rewarehouseFeeJpy > 0) {
      items.push({ label: "再入库再处理费", amount_jpy: rewarehouseFeeJpy });
    }

    if (isConsolidation && !transitHandlingFeeSplit) {
      // Personal: transit handling fee charged per user
      if (transitHandlingFee > 0) {
        items.push({ label: `中转地手续费（${transitLocation?.name || "中转地"}）`, amount_jpy: transitHandlingFee });
      }
    }

    // Per-user extra packing fee (individual, not shared) — allows negative values as corrections
    if (packingFee !== 0) {
      items.push({ label: packingFee < 0 ? "捆包作业服务费（补正）" : "捆包作业服务费（个人追加）", amount_jpy: packingFee });
    }

    if (userAddonFeeJpy > 0) {
      items.push({ label: `发货增值服务（${userAddons.map(a => a.name).join("、")}）`, amount_jpy: userAddonFeeJpy });
    }

    if (transitShippingFee > 0) {
      items.push({ label: `中转运输费（${transitShippingMethod?.name || ""}）`, amount_jpy: transitShippingFee });
    }

    const personalTotal = items.reduce((s, i) => s + i.amount_jpy, 0);

    let sharedJpy = 0;
    if (isConsolidation && totalWeightG > 0) {
      // Global packing fee joins shipping + box in the shared pool
      // When transitHandlingFeeSplit=true, transit handling fee also joins the shared pool
      const sharedTransitFee = (transitHandlingFeeSplit && transitHandlingFee > 0) ? transitHandlingFee : 0;
      const sharedBase = (parseFloat(shippingFeeJpy) || 0) + (parseFloat(boxPriceJpy) || 0) + (parseFloat(globalPackingFeeJpy) || 0) + sharedTransitFee;
      sharedJpy = Math.round((userWeightG / totalWeightG) * sharedBase);
      if (sharedJpy > 0) {
        const packingPart = parseFloat(globalPackingFeeJpy) || 0;
        const labelParts = [`运费¥${Math.round(shippingFeeJpy || 0)}`, `外箱¥${Math.round(boxPriceJpy || 0)}`];
        if (packingPart > 0) labelParts.push(`手续费¥${Math.round(packingPart)}`);
        if (sharedTransitFee > 0) labelParts.push(`中转手续费¥${Math.round(sharedTransitFee)}`);
        items.push({
          label: `平摊金额（${labelParts.join("+")} × ${userWeightG}g/${totalWeightG}g）`,
          amount_jpy: sharedJpy,
          is_shared: true,
        });
      }
    } else {
      // Single shipment: box + shipping + global packing are direct
      if (boxPriceJpy > 0) {
        items.push({ label: "外箱费用", amount_jpy: Math.round(parseFloat(boxPriceJpy) || 0) });
      }
      if (shippingFeeJpy > 0) {
        items.push({ label: "国际运费", amount_jpy: Math.round(parseFloat(shippingFeeJpy) || 0) });
      }
      if (globalPackingFeeJpy > 0) {
        items.push({ label: "捆包作业服务费", amount_jpy: Math.round(parseFloat(globalPackingFeeJpy) || 0) });
      }
    }

    const directNonShared = isConsolidation ? 0 : (Math.round(parseFloat(boxPriceJpy) || 0) + Math.round(parseFloat(shippingFeeJpy) || 0) + Math.round(parseFloat(globalPackingFeeJpy) || 0));
    const totalJpy = personalTotal + (isConsolidation ? sharedJpy : directNonShared);

    result.push({
      user_email: email,
      user_orders: userOrders,
      user_weight_g: userWeightG,
      items,
      personal_total_jpy: personalTotal,
      shared_jpy: isConsolidation ? sharedJpy : 0,
      total_jpy: totalJpy,
    });
  }

  return result;
}

/**
 * Expand "__all__" packing fee shorthand to all user emails.
 */
function expandPackingFees(packingFeesPerUser, userEmails) {
  if (packingFeesPerUser.length === 0) return [];
  // If single entry with __all__, apply same fee to every user
  if (packingFeesPerUser.length === 1 && packingFeesPerUser[0].user_email === "__all__") {
    const fee = packingFeesPerUser[0].fee_jpy;
    return userEmails.map(email => ({ user_email: email, fee_jpy: fee }));
  }
  return packingFeesPerUser;
}

/**
 * Convert an amount in the given currency to JPY using provided exchange rates.
 * Falls back to the amount as-is (assumed JPY) if no rates available.
 */
function convertToJpy(amount, currency, exchangeRates) {
  if (!amount || amount === 0) return 0;
  if (!currency || currency === "JPY") return parseFloat(amount) || 0;
  if (!exchangeRates) return parseFloat(amount) || 0; // fallback: treat as JPY
  const rateKey = `jpy_${currency.toLowerCase()}`;
  const rate = exchangeRates[rateKey];
  if (!rate || rate === 0) return parseFloat(amount) || 0;
  // rate is jpy→foreign, so foreign→jpy = amount / rate
  return Math.round((parseFloat(amount) || 0) / rate);
}

/**
 * Calculate transit shipping method fee in JPY.
 * Converts from fee_currency to JPY using exchange rates.
 */
function calcTransitShippingFeeJpy(method, exchangeRates) {
  if (!method) return 0;
  let rawFee = 0;
  if (method.rate_mode === "fixed") {
    rawFee = parseFloat(method.fee) || 0;
  } else {
    // Simple rate: use first rate's first_weight_fee as a base estimate
    const rates = method.simple_rates || [];
    if (rates.length > 0) {
      const r = rates[0];
      // Use the rate's own currency if available
      const rateFee = parseFloat(r.first_weight_fee) || 0;
      const rateCurrency = r.currency || method.fee_currency || "JPY";
      return convertToJpy(rateFee, rateCurrency, exchangeRates);
    }
    rawFee = parseFloat(method.fee) || 0;
  }
  const currency = method.fee_currency || "JPY";
  return convertToJpy(rawFee, currency, exchangeRates);
}