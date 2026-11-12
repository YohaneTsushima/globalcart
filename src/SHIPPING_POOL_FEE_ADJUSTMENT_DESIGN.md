# 发货池「各用户追加费用」不落库问题与改价方案设计

> 结论摘要：`AdminShippingInfoPanel` 里的价格输入（各用户追加费用 / 全局捆包费 / 手填国际运费）目前**整条链路没有任何一处写入数据库**。点击 `-100` 只改 React state；`buildUpdatePayload()` 里的价格字段全部被注释；后端 `saveShippingDetail` 又只认 DB 并重算派生费用。因此「不把 -100 放进 `handleSaveInfoOnly` 的 payload」是正确方向——需要一条**独立的改价命令**。

---

## 1. 现象与根因

### 1.1 调用链

| # | 位置 | 行为 |
|---|---|---|
| 1 | `AdminShippingInfoPanel.jsx:1040-1065` | 渲染「各用户追加费用」，`+100/-100` 只 `setPackingFeesPerUser` |
| 2 | `AdminShippingInfoPanel.jsx:438-476` | `buildUpdatePayload()` 构造保存 payload，`shipping_fee_jpy`（460）、`packing_fee_jpy`（462）、`packing_fees_per_user`（463）、`fee_breakdown_per_user`（464）**全部注释** |
| 3 | `AdminShippingInfoPanel.jsx:479-498` | `handleSaveInfoOnly → handleSave → shippingPoolApi.handleSaveInfoOnly` |
| 4 | `ShippingPoolRecordServiceImpl.java:532` | `handleSaveInfoOnly` 只合并 payload 后调 `saveShippingDetail` |
| 5 | `ShippingPoolRecordServiceImpl.java:810-859` | `saveShippingDetail` 先 `objectMapper.updateValue`，然后在 839-849 行**强制重算**箱价 / 国际运费 / 按用户费用明细 / 收入快照 |

### 1.2 为什么截图 2 的 payload 没有 -100

`buildUpdatePayload()` 当前实际返回：

```jsonc
{
  "tracking_number": "",
  "box_template_id": 10,
  "box_template_name": "80サイズ",
  "final_weight_g": 1100,
  "total_weight_g": 300,
  "fee_currency": "JPY",
  "admin_note": "",
  "admin_packing_note": "",
  "label_image_urls": [],
  "packing_image_urls": [],
  "actual_international_shipping_cost_jpy": null
}
```

与截图 2 的 Request Payload 字段完全一致。`effectivePackingFeesPerUser`（336-342 行）只被 `feeBreakdowns` 预览和 `totalPackingFee` 消费，而 `totalPackingFee` 也没有被送出去——这是一条**死路径**。

### 1.3 后端当前的「价格权威」模型

`saveShippingDetail` 的设计是：**前端只能说「怎么算」，不能说「算出来多少」**。

- `applyBoxTemplateDerivedFields`（866）按模板重写 `box_price_jpy` / 两个快照；
- `calcInternationalShippingFee`（844-847）只要运输方式与目的国能匹配，就用费率表覆盖 `shipping_fee_jpy`——**手填国际运费本身也是无效的**（只有匹配不到费率时才保留）；
- `calcFeeBreakdownForPool`（1175）用 `packing_fees_per_user[].fee_jpy` 与 `packing_fees_per_user[0].base_fee_jpy` 重算每个人明细。

也就是说，目前真正能改变金额的**输入字段只有 3 类**：`packing_fee_jpy`（全局基数）、`packing_fees_per_user[].fee_jpy` + `base_fee_jpy`（个人追加）、`box_template_id` / `final_weight_g`（间接）。而这三类里前两类**前端从来没写过**。

### 1.4 相关但独立的问题：`/ShippingPool/update` 是空实现

`MutateTenantEntityController.java:255-258`：

```java
@PostMapping("/ShippingPool/update")
public ResponseEntity<R<ShippingPoolRecord>> updateShippingPool(@RequestBody TenantEntityRequestDto requestDto) {
    return ResponseEntity.ok(R.instance(SUCCESS_CODE, SUCCESS_MSG, null));
}
```

没有调用 `shippingPoolRecordService.updateShippingPool(...)`（该方法在 `ShippingPoolRecordServiceImpl.java:468` 有完整实现，但全仓库无人调用），且返回值恒为 `result: null`，所以前端 `shippingPoolApi.update` 不会抛错——**静默成功、实际不落库**。详见第 2 节影响清单。

---

## 2. `ShippingPool/update` 空实现的影响范围

### 2.1 仍在生效的调用点（会静默丢数据）

| 位置 | 功能 | 写入字段 | 后果 |
|---|---|---|---|
| `AdminShippingInfoPanel.jsx:503`（`updatePool`） | 被 533 / 557 / 579 / 665 / 735 / 761 / 1289 / 1300 调用：确认收款、确认收款并发货、发货后补付确认、通知补差/退款、通知补差并待发货、跳过付款直接待发货 / 直接发货 | `status`、`payment_status`、`per_user_payments`、`supplement_amount_per_user`、`messages`、`unread_roles`、`order_status` 等 | 全部不落库，但本地状态乐观更新 + toast 成功，刷新即回退 |
| `ShippingPoolDetailModal.jsx:192` | 转换发货池 / 保存收件地址 | `consolidation_type`、收件地址 5 个字段 | 地址丢失 |
| `ShippingPoolDetailModal.jsx:329` | 清除未读标记 | `unread_roles` | 红点不消失 |
| `ShippingPoolDetailModal.jsx:822`（`handlePoolEditSave`） | 编辑发货池 | `title`、`user_note`、`scheduled_ship_date`、`admin_note` | 编辑不生效 |
| `MessageThread.jsx:130` | 发货池留言 | `messages`、`unread_roles` | 留言不落库；通知仍会创建，点进去看不到内容 |
| `JoinOfficialPoolModal.jsx:167` | 加入官方拼邮 | `order_ids`、`order_names`、`total_weight_g`、`per_user_groups` | 加入不生效 |
| `OfficialPoolKanban.jsx:1111` / `:1128` | 看板拖拽分池 / 移池 | `order_ids`、`per_user_groups`、`total_weight_g`、箱型等 patch | 拖完刷新即回退 |
| `OfficialPoolOrderDetailModal.jsx:105` / `:143` / `:219` | 用户组留言 / 备注 | `per_user_groups` | 不落库 |
| `OfficialPoolUserGroupModal.jsx:94` / `:130` / `:172` | 用户组备注 | `per_user_groups` | 不落库 |

> `ShippingPoolNotUsed.jsx:436` / `:1275` 同样在用，但 `App.jsx` 未引用该页面（只有 `ShippingPool.jsx`），可暂时忽略。

### 2.2 已经迁移到专用接口、不受影响的路径

- 单用户「确认此用户已付款」→ `shippingPoolApi.confiredmProof`（`AdminShippingInfoPanel.jsx:1246`）
- 发货 → `shippingPoolApi.shipped`（`:786`）
- 确认发货 / 待发货 → `shippingPoolApi.confiredmProof`（`:674`）
- 仅保存信息 / 通知付款 → `handleSaveInfoOnly` / `handleSetAwaitingPayment`（真正落库）

所以面板现在的状态是**半迁移**：通知用户付款能存，全员确认收款却不能存，行为非常不一致。

### 2.3 已是死代码，排查时不必追

- `ShippingPoolDetailModal.jsx`：517 行 `return;` 之后的 527；957 行 `return;` 之后的 967；741 / 749 注释；1134-1196 注释
- `ShippingEditModal.jsx:219-235` 注释
- `AdminShippingInfoPanel.jsx:1242`、`770-799`（`handleShip` 里注释掉的 `updatePool`）
- `AdminShippingInfoPanel.jsx:1158-1169`、`:1329-1367`、`:1407-1456` 补差/退款 UI 已停用（`handleNotifyFeeUpdate` 因此只可能被 665 行的已停用按钮触发）

### 2.4 处理选项（仅供决策）

> 背景已确认：该端点是 base44 时代的「万金油更新」，后端重写后**故意置空**，用来禁止通用写入。因此 2.1 的清单不是 bug，而是**待迁移点**；后续新增的改价接口也应沿用「一个动作一个端点」的风格，不要复活 `update`。

1. **继续迁移**：为剩余场景各加专用端点（池信息编辑、留言、per_user_groups、归档…），`update` 保持空实现作为「禁止通用写入」的护栏；
2. **恢复通用 update + 字段白名单**：controller 接回 service，service 内剥离 `fee_breakdown_per_user` / `shipping_stage_income_jpy` / 箱价快照等派生字段，并限制可写属性集合；
3. **保持现状**：需要把上述入口在 UI 上禁用或提示，否则用户会持续以为保存成功。

> 不管选哪个，**价格字段都不应进入通用 update**（理由见第 3 节）。

---

## 3. 为什么「不把 -100 放进 handleSaveInfoOnly」是对的

1. `buildUpdatePayload()` 被 8+ 个动作复用。价格一旦进入，任何一次「仅保存信息 / 确认收款 / 发货 / 通知」都会顺带改钱。
2. 表单状态可能是**过期快照**：别人并发改过之后，这个页面一保存就把它覆盖回去，且没有 `version` 校验（实体有 `@Version`，见 `ShippingPoolRecord.java:251`，但面板没传 `expect_version`）。
3. `dataMap.values().removeIf(Objects::isNull)` 只剥 `null`，**空数组会被当成「清空」**：`packing_fees_per_user: []` 会把已有的个人追加费全部抹掉。
4. 没有操作人 / 原因 / before-after，无法审计「这 -100 是谁改的、为什么」。
5. 金额变化与用户通知必须分离：已通知或已付款的池子，金额被改掉而用户没收到补差/退款消息，会产生对账纠纷。补差逻辑在 `supplement_amount_per_user`，必须显式走 `handleNotifyFeeUpdatePaid` 一类动作（该 UI 目前已停用）。
6. 「-100」在语义上不一定是捆包费：可能是折扣、补偿、运费差额。塞进 `packing_fees_per_user.fee_jpy` 会让明细行显示成「捆包作业服务费（补正）」（`AdminShippingPoolUtility.java:467-474`），长期看会混淆。

---

## 4. 目标设计

### 4.1 四条原则

1. **输入 / 派生分离**：接口只收「会影响计算」的输入字段，派生字段一律由后端产出，前端只读。
2. **价格只能通过显式的「调价命令」写入**：与状态流转、信息保存解耦。
3. **改价与发布分离**：弹窗只保存「价格输入」（草稿）；真正对用户生效（重算 `fee_breakdown_per_user`）发生在「通知用户付款 / 发布新金额」时。
4. **每次改价留痕**：谁、何时、对谁、改了多少、原因；支持撤销/更正。

### 4.2 命令划分与触发时机

| 命令 | 端点 | 触发 UI | 允许写 | 用户可见金额 |
|---|---|---|---|---|
| 仅保存信息 | `/ShippingPool/handleSaveInfoOnly`（已存在） | 「保存信息修改」 | 运单号、箱型、重量、备注、图片、实际成本等；**不含价格输入，也不重算 breakdown** | 不变 |
| 调整费用 | `/ShippingPool/handleAdjustFees`（新增） | `ShippingFeeAdjustDialog` 的「保存调整」；**仅 `pending` / `processing` 显示入口** | `packing_fee_jpy`、`packing_fees_per_user`（规范化后）；返回内存预览，不落 breakdown | 不变 |
| 通知付款 / 发布金额 | `handleSetAwaitingPayment` | 「通知用户付款」 | 重算并落 `fee_breakdown_per_user` + `shipping_stage_income_jpy`，发通知 | **变** |
| 状态流转 | 现有 `handleShip` / `confirmShipmentProof` 等 | 各自按钮 | 只改状态，不碰金额 | 不变 |

一句话：**弹窗负责「准备钱」，通知动作负责「让钱生效」，通知之后金额即定稿**。

> 业务规则（2026-11 确认）：执行过「通知用户付款」后不再提供调整费用入口，也不做补差/退款。曾停用的补差 UI 原因是汇率每日变动会导致频繁提醒，实际业务中价格基本一次定稿。

> 注意：现在的 `saveShippingDetail` 对「仅保存信息」也会重算 breakdown（`:848`），即保存信息也可能悄悄改金额。要落地这个语义，需要给 `saveShippingDetail` 加 `publishFees` 开关：`handleSaveInfoOnly` 传 `false`，`handleSetAwaitingPayment` 传 `true`。

---

## 5. 方案 A（推荐，零 schema 变更）

复用现有 `packing_fees_per_user` JSONB 字段，只新增一个专用接口 + 一个前端弹窗。

### 5.1 接口约定

```
POST /globalcart/mutateTenantEntity/ShippingPool/handleAdjustFees
```

```jsonc
{
  "id": "44",
  "data": {
    "base_packing_fee_jpy": 500,
    "adjustments": [
      { "user_email": "412137492@qq.com", "extra_fee_jpy": -100, "reason": "重复收取捆包费，退还" }
    ],
    "shipping_fee_override_jpy": null,   // 需要手填运费时才传
    "expect_version": 7
  }
}
```

返回（**注意：只返回预览，不落库**）：

```jsonc
{
  "result": {
    "pool": { ... },                                  // 最新池记录（packing_fees_per_user 已更新）
    "preview_fee_breakdown_per_user": [ ... ],        // 按新输入内存计算的预览
    "fee_breakdown_per_user": [ ... ],                // 仍是「已发布」的旧值
    "changes": [
      { "user_email": "412137492@qq.com", "before_total": 2055, "after_total": 1955, "delta": -100 }
    ]
  }
}
```

`handleAdjustFees` **不接收 `publish`**：发布是「通知用户付款」的职责，不在改价接口里做。

### 5.2 服务端实现要点

```java
@Override
@Transactional
public ShippingPoolRecord handleAdjustFees(TenantEntityRequestDto dto) {
    Long id = Long.parseLong(dto.getId());
    ShippingPoolRecord pool = getById(id);
    // 1) 状态白名单
    assertAdjustable(pool);                       // 仅 pending / processing（通知付款前）
    // 2) 乐观锁
    if (version != null && !Objects.equals(version, pool.getVersion()))
        throw new IllegalStateException("费用已被他人修改，请刷新后重试");
    // 3) 规范化写入（每行都带 base_fee_jpy，fee_jpy 只放「额外部分」）
    pool.setPackingFeeJpy(base);
    pool.setPackingFeesPerUser(normalize(rows, base));
    // 4) 可选：手动运费覆盖（见 5.4）
    if (override != null) { pool.setShippingFeeJpyOverrideJpy(override); }
    // 5) 只算预览，不写 fee_breakdown_per_user / shipping_stage_income_jpy
    List<FeeBreakdownPerUser> preview = calcFeeBreakdownForPool(pool);
    // 6) 审计（方案 A 先写 messages，方案 B 再换独立列）
    appendAuditMessage(pool, operator, preview, reason);
    updateById(pool);
    return pool;   // 预览通过接口层附加返回
}
```

关键校验：

- 每个用户「调整后 total >= 0」；`extra_fee_jpy` 绝对值设上限；同一 email 去重；
- 只允许把 `packing_fees_per_user` 写成「每行都有 `base_fee_jpy`、`fee_jpy` = 额外部分」的规范格式。原因：
  - `resolveBasePackingFee` 只读**第 0 行**的 `base_fee_jpy`（`ShippingPoolRecordServiceImpl.java:1583-1591`）；
  - `indexPackingFees` 把 `fee_jpy` 当个人追加（`AdminShippingPoolUtility.java:186-189`）；
  - 旧格式（`fee_jpy` = 全额）会与全局基数重复计费。
- **任何情况下都不要在 adjust 里动 `fee_breakdown_per_user` / `shipping_stage_income_jpy`**，否则就是「没通知先改钱」。
- 负数合法（`addPackingItem` 已支持「捆包作业服务费（补正）」），但要求 `reason` 必填。

### 5.3 前端交互

- 把「各用户追加费用」从常规信息表单里移出，改为一个 **「调整费用」弹窗**：
  - 每用户一行：当前已通知金额、输入调整额（`+100 / -100 / 手填`）、原因；
  - 底部实时汇总「已发布合计 → 调整后合计」，显示每用户 delta；
  - 主按钮只有「保存调整」（= `handleAdjustFees`），**没有**「发布」按钮。
- 保存成功后：`onRefresh?.()`，面板上给一个状态提示「已调整，待通知用户」（判断依据：实时计算合计 ≠ `fee_breakdown_per_user` 合计）。
- 用户金额真正变化发生在管理员点「通知用户付款」时；该按钮已存在（`handleSetAwaitingPayment`），无需新 UI。
- `buildUpdatePayload()` 保持不带价格（现状不用改），只把注释块清理成明确说明，避免后人再打开。
- 已通知/已付款池的再调价：恢复补差/退款 UI（`handleNotifyFeeUpdatePaid`，当前停用），并迁移到专用端点 `handlePublishFees`——不能再走 `updatePool`。

### 5.4 关于「手填国际运费」

现在 `calcInternationalShippingFee` 会无条件覆盖手填值。若要允许人工改价，需要显式字段，例如：

- 实体加 `shipping_fee_override_jpy`（或 `shipping_fee_manual` 标记）；
- `buildFeeCalcContext` 优先取 override，其次 `calcInternationalShippingFee`；
- UI 加「手动覆盖运费」勾选 + 原因，并进入审计。

否则建议先不承诺「可以改国际运费」，只做个人追加/基数调整，避免管理员以为改了、保存后又跳回费率表金额。

### 5.5 旧数据迁移

- 扫描 `packing_fees_per_user`，凡 `fee_jpy != 0` 且 `base_fee_jpy` 为空或 `fee_jpy > base_fee_jpy` 的行，按 `fee_jpy = fee_jpy - base_fee_jpy` 归一，并补齐每行 `base_fee_jpy`；
- 迁移前后都要用 `calcFeeBreakdownPerUser` 对账；**不要求总额完全不变**（旧数据可能本来就重复计费），具体判定与范围见 13.7；
- 负数历史值不能被吞：前端回填的 `Math.max(0, fee_jpy - base)`（`AdminShippingInfoPanel.jsx:185 / 222 / 249`）会把它归零，需要去掉 `Math.max`。

---

## 6. 方案 B（要审计 / 多次调价 / 退款时）

把「覆盖式改数组」换成**追加式账本**：

```jsonc
fee_adjustments: [
  {
    "id": "adj_17...",
    "user_email": "412137492@qq.com",
    "kind": "discount",            // packing_extra | discount | refund | shipping_diff | other
    "amount_jpy": -100,             // 带符号
    "reason": "重复收取捆包费",
    "created_by": "admin@x.com",
    "created_at": "2026-11-12T01:52:21Z",
    "published_at": null,
    "voided_at": null
  }
]
```

接入点：

- `AdminShippingPoolUtility.calcFeeBreakdownPerUser`：按用户汇总未作废的调整，作为**独立明细行**（如「费用调整（重复收取捆包费）」），而不是混入捆包费；
- `packing_fees_per_user` 保留为「捆包费输入」，只装真正与捆包相关的调整；
- 撤销 = 写 `voided_at`，不改历史；
- 发布 = 把「所有未发布调整」标记 `published_at` 并重算 breakdown；
- 报表可按 `kind` / 月份 / 用户聚合，退款与折扣可区分。

代价：新增 DB 列（JSONB 或独立表）+ 计算逻辑改动 + 明细展示改动。建议在方案 A 稳定后演进。

---

## 7. 方案 C（临时补丁）

给 `packingFeesPerUser` / `basePackingFee` 加 `dirty` 标记；仅当管理员点击独立的「保存费用调整」时，构造只含 `packing_fee_jpy + packing_fees_per_user` 的 payload 调 `handleSaveInfoOnly`。

- 优点：改动最小，当天可用；
- 缺点：仍是覆盖式写入、无审计、无状态校验、与通知不分离；
- 如果采用，至少要做到：仅 dirty 时发送、发送前对比库值、发送后强制 `refreshPool()`、后端 `saveShippingDetail` 里对 `packing_fees_per_user` 做规范化。

---

## 8. 方案对比

| 维度 | A（专用接口，复用字段） | B（账本） | C（dirty 补丁） |
|---|---|---|---|
| 改动量 | 小（0 schema） | 中大（schema + 计算 + UI） | 最小 |
| 审计能力 | 中（messages 留痕） | 强（结构化、可查） | 无 |
| 多次调价 / 撤销 | 弱（覆盖） | 强（append + void） | 无 |
| 并发安全 | 中（`@Version` 校验） | 强（append） | 弱 |
| 改价/通知分离 | 支持（输入与发布分离） | 支持（`published_at`） | 不支持 |
| 语义清晰度 | 中（负数仍叫捆包费补正） | 强（kind 区分折扣/退款） | 弱 |
| 建议 | **现在做** | 后续演进 | 仅应急 |

---

## 9. 落地清单

### 后端

- [ ] `MutateTenantEntityController.java`：新增 `POST /ShippingPool/handleAdjustFees`（`@PreAuthorize("hasAnyRole('ADMIN','TENANT_ADMIN')")`）
- [ ] `ShippingPoolRecordService` / `Impl`：新增 `handleAdjustFees`；`recalcDerivedFees`（`:912`）保持给发布动作用
- [ ] `saveShippingDetail` 增加 `publishFees` 开关：`handleSaveInfoOnly` 传 `false`（不重算 breakdown），`handleSetAwaitingPayment` 传 `true`
- [ ] 抽出 `normalizePackingFeesPerUser(rows, baseFee)` 工具方法，供 adjust / save 两条路径共用
- [ ] 校验：状态白名单、`total >= 0`、金额上限、`reason` 必填、`version` 冲突 → 明确错误码
- [ ] 审计：方案 A 追加系统消息（沿用 `handleNotifyFeeUpdate` 的 `sysMsg` 格式）；方案 B 新增列
- [ ] （可选）`shipping_fee_override_jpy` 字段 + `buildFeeCalcContext` 优先读取
- [ ] 单测：规范化、负数、并发、调整后 breakdown 不变、通知后才变

### 前端

- [ ] `tenantApi.js`：新增 `shippingPoolApi.adjustFees`
- [ ] 新增 `ShippingFeeAdjustDialog`；`AdminShippingInfoPanel` 主表单里的价格输入改为只读展示 + 「调整费用」按钮
- [ ] `buildUpdatePayload()`：清理注释为明确说明，保持不含价格
- [ ] 修正 `Math.max(0, fee_jpy - base)`（185 / 222 / 249），避免吞负数
- [ ] 保存成功后 `onRefresh?.()`，并用返回值刷新预览
- [ ] 面板显示「已调整，待通知用户」；「通知用户金额更新」的 `hasPerUserFeeChanged` 改为「实时输入 vs 已发布 breakdown」比较

### 决策项

- [ ] 是否恢复 `/ShippingPool/update`（第 2.4 节三选一）
- [ ] 是否本轮支持「手动覆盖国际运费」（5.4）
- [ ] 审计放 `messages` 还是新列（A vs B）

---

## 10. 测试清单

1. 单人池不显示「各用户追加费用」区（`uniqueUsers.length > 1 && packingFeesPerUser.length > 1`）。
2. 双人池输入 `-100` → 「保存调整」→ DB `packing_fees_per_user` 每行有 `base_fee_jpy`，目标用户 `fee_jpy = -100`。
3. 保存调整后用户端金额**不变**（`fee_breakdown_per_user` 未被改写），面板出现「已调整，待通知」。
4. 点「通知用户付款」后，breakdown 出现「捆包作业服务费（补正）」，该用户 `total_jpy` 正好 -100，其他人不变。
5. 仅保存信息（改备注/运单号/重量）不会改动 `fee_breakdown_per_user` 和 `shipping_stage_income_jpy`。
6. 调整后某用户 `total < 0` 被拒绝，提示明确。
7. 两个管理员并发保存：后提交的返回冲突提示，不静默覆盖。
8. 已付款 / 已发货池：有 delta 时必须走补差或退款流程，不能直接改。
9. 刷新页面后输入框与合计不再回弹。
10. 旧数据迁移前后每个用户 `total_jpy` 符合预期（未付款池归一，已付款池不动）。
11. 只改备注、没点「保存调整」时，`handleSaveInfoOnly` 不会改动金额。

---

## 11. 风险与坑

| 风险 | 说明 / 规避 |
|---|---|
| `fee_jpy` 语义双义 | 旧数据是「全额」，新逻辑是「额外」。写入必须统一为额外 + 每行 `base_fee_jpy`，否则与全局基数重复计费 |
| 空数组 = 清空 | `dataMap.values().removeIf(Objects::isNull)` 不会过滤空 list；未改价时不要传 `packing_fees_per_user` |
| 派生字段被前端覆盖 | `fee_breakdown_per_user`、`shipping_stage_income_jpy`、`box_*_snapshot` 永远不要从浏览器写 |
| 手填运费被费率表覆盖 | `saveShippingDetail:844-847` 无条件覆盖；需 override 字段才能生效 |
| 覆盖式数组写入 | 并发下 last-write-wins；方案 A 至少加 `expect_version`，方案 B 用 append |
| 通知链路已停用 | 补差/退款 UI 在 `1329-1367`、`1407-1456` 被注释，改价发布后用户不会自动收到消息，需要同步恢复或补新通知 |
| `update` 空实现 | 改价后想复用「通知金额更新」会发现它走 `updatePool`，目前根本落不了库 |

---

## 12. 关键代码索引

| 主题 | 位置 |
|---|---|
| 各用户追加费用 UI | `globalcart/src/components/shippingpool/AdminShippingInfoPanel.jsx:1033-1066` |
| 保存 payload | `globalcart/src/components/shippingpool/AdminShippingInfoPanel.jsx:438-476` |
| `handleSaveInfoOnly` / `handleSetAwaitingPayment` | `globalcart/src/components/shippingpool/AdminShippingInfoPanel.jsx:478-498`、`tenantApi.js:182-183` |
| 后端保存与重算 | `api/.../ShippingPoolRecordServiceImpl.java:532`、`:810-859`、`:912-930` |
| 费用明细计算 | `api/.../AdminShippingPoolUtility.java:178-317`、`:467-474`（负数补正）、`:688-706`（`__all__` 展开） |
| 基数解析 | `api/.../ShippingPoolRecordServiceImpl.java:1583-1591` |
| 实体字段 / 版本 | `api/.../ShippingPoolRecord.java:150-198`、`:251-254`、`:470-487` |
| 通用 update 空实现 | `api/.../MutateTenantEntityController.java:255-258` |
| 池详情刷新 | `globalcart/src/components/shippingpool/ShippingPoolDetailModal.jsx:270-314` |

---

## 13. 方案 A 实施规格（文件级）

### 13.0 前置发现：读侧也没给字段

三个事实叠在一起，导致「保存成功也看不出来」：

1. `ShippingPoolDetailDto.SinglePool`（`ShippingPoolDetailDto.java:90-260`）**没有** `packing_fees_per_user` 字段；
2. `ShippingPoolRecordMapper.xml` 的 `poolColumnsPrefixed`（`:252-304`）**没有** select `packing_fees_per_user`，也没有 select `version`；
3. 列表查询 `getShippingPoolByPages`（`:396-456`）同样没有 select 这两列。

而 `AdminShippingInfoPanel` 的回填逻辑（`AdminShippingInfoPanel.jsx:181-189`、`236-252`）完全依赖 `initialPool.packing_fees_per_user`。所以现状是：**即使数据在库里，打开弹窗也读不到，永远按 0 渲染**。

> 结论：方案 A 的第一步是**补读侧**，否则接口做完仍然「看起来没存」。

### 13.1 读侧改动（先做）

**(1) `ShippingPoolDetailDto.SinglePool` 增加字段**

```java
@JsonProperty("packing_fees_per_user")
private List<PackingFeePerUser> packingFeesPerUser;

@JsonProperty("version")
private Integer version;
```

嵌套类按 `ShippingPoolRecord.PackingFeePerUser` 的 4 个字段定义（`user_email` / `base_fee_jpy` / `fee_jpy` / `extra_fee_jpy`）。`version` 在实体上是 `WRITE_ONLY`（`ShippingPoolRecord.java:251-254`），所以要单独加到 DTO 才能在详情响应里返回。

**(2) `ShippingPoolRecordMapper.xml`**

- `poolColumnsPrefixed` 增加两列：

```sql
pool.packing_fees_per_user AS pool_packing_fees_per_user,
pool.version AS pool_version,
```

- `SinglePoolResultMap`（`:232-250`）增加映射（`version` 可交给 autoMapping，`pool_` 前缀会被去掉）：

```xml
<result column="packing_fees_per_user" property="packingFeesPerUser"
        typeHandler="com.globalcart.config.JsonBTypeHandler"/>
```

- 若 Java 侧要读元素（而不只是透传给前端），按 `UserProfileDtoListTypeHandler` 的写法加一个专用 handler，避免拿到 `LinkedHashMap` 后强转 `PackingFeePerUser` 抛 `ClassCastException`。

**(3) 可选**：`getShippingPoolByPages` 也带上这两列。原因是列表页传入的 `pool` 打开弹窗时，详情请求返回前会先渲染一次；带上可以避免「先显示 0 再跳到真实值」的闪烁。

### 13.2 写侧改动

**(1) Controller**（`MutateTenantEntityController.java`，紧跟 `handleSaveInfoOnly`）

```java
@PostMapping("/ShippingPool/handleAdjustFees")
@PreAuthorize("hasAnyRole('ADMIN', 'TENANT_ADMIN')")
public ResponseEntity<R<ShippingPoolRecord>> handleAdjustFees(@RequestBody TenantEntityRequestDto requestDto) {
    return ResponseEntity.ok(R.instance(SUCCESS_CODE, SUCCESS_MSG,
            shippingPoolRecordService.handleAdjustFees(requestDto)));
}
```

**(2) Service 接口 + 实现**

- `ShippingPoolRecordService#handleAdjustFees(TenantEntityRequestDto)`
- `ShippingPoolRecordServiceImpl` 实现，复用：
  - `recalcDerivedFees(pool)`（`:912`）做派生重算；
  - `sumBreakdownIncome(...)`（`:897`）算收入快照；
  - `applyBoxTemplateDerivedFields(...)`（`:866`）与 `calcInternationalShippingFee(...)`（`:1182`）。

**(3) 抽两个工具方法**

- `normalizePackingFeesPerUser(List<PackingFeePerUser> rows, BigDecimal base)`：每行补齐 `base_fee_jpy`、`fee_jpy` 归一到「额外部分」、`extra_fee_jpy` 同步；供 adjust 与 `saveShippingDetail` 共用。
- `appendFeeAdjustAudit(pool, operator, changes, reason)`：方案 A 先写系统消息，格式沿用 `handleNotifyFeeUpdate` 的 `sysMsg`（`AdminShippingInfoPanel.jsx:586-594`），字段 `from_email: "__system__"`、`role: "admin"`。

**(4) 返回** `ShippingPoolRecord`（含最新 `packing_fees_per_user` / `fee_breakdown_per_user` / `version`），前端不必再猜。

### 13.3 请求 / 响应契约

```
POST /globalcart/mutateTenantEntity/ShippingPool/handleAdjustFees
```

```jsonc
{
  "id": "44",
  "data": {
    "base_packing_fee_jpy": 500,
    "adjustments": [
      { "user_email": "412137492@qq.com", "extra_fee_jpy": -100, "reason": "重复收取捆包费，退还" }
    ],
    "expect_version": 7
  }
}
```

```jsonc
{
  "code": 200,
  "msg": "success",
  "result": {
    "pool": {                                  // 最新池记录（packing_fees_per_user 已更新）
      "id": 44,
      "packing_fee_jpy": 500,
      "packing_fees_per_user": [
        { "user_email": "412137492@qq.com", "base_fee_jpy": 500, "fee_jpy": -100, "extra_fee_jpy": -100 }
      ],
      "fee_breakdown_per_user": [ /* 仍是已发布的旧值 */ ]
    },
    "version": 8,                              // 本次更新后的乐观锁版本
    "preview_fee_breakdown_per_user": [ /* 按新输入内存计算，未落库 */ ],
    "changes": [
      { "user_email": "412137492@qq.com", "before_total_jpy": 2055, "after_total_jpy": 1955, "delta_jpy": -100 }
    ]
  }
}
```

### 13.4 服务端执行顺序

1. `getById(id)`，不存在 → 报错；
2. 状态白名单：仅 `pending` / `processing`（`awaiting_payment` 及之后一律拒绝，报「费用已通知用户，不能再次调整」）；
3. `expect_version` 与 `pool.getVersion()` 比对，不一致 → `IllegalStateException("费用已被他人修改，请刷新后重试")`；
4. 参与人校验：`adjustments[].user_email` 必须属于该池订单用户；
5. 金额校验：单用户调整后 total `>= 0`；`|extra_fee_jpy|` 不超过上限（实现为 100000 JPY）；`extra_fee_jpy != 0` 时 `reason` 必填；
6. 写 `packing_fee_jpy = base`，`packing_fees_per_user = normalize(...)`（每行带 `base_fee_jpy`，`fee_jpy` 只放额外部分）；
7. **不重算、不写** `fee_breakdown_per_user` / `shipping_stage_income_jpy`；只调用 `calcFeeBreakdownForPool(pool)` 生成预览返回；
8. 追加审计系统消息（含 before/after/delta/reason）；
9. `updateById(pool)`；返回 0 行 → 并发冲突提示；
10. 返回 `{ pool, version, preview_fee_breakdown_per_user, changes }`。

> 配套改动：`saveShippingDetail` 增加 `publishFees` 开关，`handleSaveInfoOnly` 传 `false`（跳过第 7 步的 breakdown / 收入快照重算），`handleSetAwaitingPayment` 传 `true`。否则「仅保存信息」仍会发布草稿。

### 13.5 错误契约

`GlobalExceptionHandler`（`GlobalExceptionHandler.java:53-57`）会把异常统一转成 `{status, error, message}` + HTTP 500，前端 `handleSave` 读 `e.response.data.message`（`AdminShippingInfoPanel.jsx:492-494`）并走 `persistentToastError`。所以异常 message 要写人话：

- `费用已被他人修改，请刷新后重试`
- `当前状态不允许调整费用，请先处理付款/发货`
- `用户 xxx 的调整后金额不能为负数`
- `调整金额超出允许范围`
- `必须填写调整原因`
- `用户 xxx 不属于该发货池`

### 13.6 前端改动

**(1) `tenantApi.js`**

```js
adjustFees: (id, data) => mutate('ShippingPool', 'handleAdjustFees', { id, data })
                              .then(r => r?.result || r),
```

**(2) 新增 `ShippingFeeAdjustDialog.jsx`**

- props：`pool`、`orders`、`userProfileMap`、`onClose`、`onSaved(updatedPool)`；
- 行：用户名 / 已发布金额（来自 `pool.fee_breakdown_per_user`）/ 调整额输入 + `+100` `-100` / 原因；
- 底部：`已发布合计 → 调整后合计`、每用户 delta、提示「保存后不会立即通知用户」；
- 只有「保存调整」一个主按钮（**没有 publish 勾选**）；
- 请求带 `expect_version: pool.version`；
- 成功后 `onSaved(result)` 并关闭。

**(3) `AdminShippingInfoPanel.jsx`**

- 把 1017-1067 的「全局捆包费 + 各用户追加费用」区块改为**只读摘要 + 「调整费用」按钮**；
- 加「已调整，待通知用户」提示（实时合计 ≠ 已发布 breakdown 合计时显示）；
- `buildUpdatePayload()` 保持不含价格（现状即正确），把 460-464 的注释改成一句说明，避免后人重新打开；
- 删除/收敛 `effectivePackingFeesPerUser`、`totalPackingFee` 中不再被 payload 使用的部分；
- 修正 185 / 222 / 249 的 `Math.max(0, fee_jpy - base)`；
- 保存成功后 `onRefresh?.()`（`refreshPool` → `shipping/getShippingPoolDetail`）。

**(4) 可后置**：`hasPerUserFeeChanged` 改为「实时输入 vs 已发布 breakdown」比较，作为「待通知」判定。

### 13.7 旧数据处理

- **不要**批量迁移已付款 / 已发货池：历史金额与报表快照不能变；
- 只处理 `status in (pending, processing, awaiting_payment)` 且 `fee_jpy <> 0` 的池；
- 判定旧格式：`extra_fee_jpy` 为空且 `fee_jpy` 不等于 `base_fee_jpy`（说明 `fee_jpy` 是「全额」）；
- 归一：`fee_jpy = fee_jpy - base`，`extra_fee_jpy = fee_jpy`，`base_fee_jpy = base`；
- 迁移前必须 dry-run 对比 `calcFeeBreakdownPerUser` 的每用户 `total_jpy`。**注意**：旧数据若「全额 fee + 全局 base」同时计费，本身就重复计算；归一后总额会下降，这类池需要业务确认后再动。

### 13.8 顺序与工作量（估）

| 步骤 | 内容 | 估时 |
|---|---|---|
| 1 | 读侧（DTO + mapper + 可选列表） | 0.5d |
| 2 | 写侧（endpoint + service + 规范化 + 审计 + `publishFees` 开关） | 1d |
| 3 | 前端（api + 弹窗 + 面板改造 + 回填修正） | 1d |
| 4 | 旧数据 dry-run + 对账 | 0.5d |
| 5 | 按第 10 节回归 | 0.5d |

**验收标准**：打开已有额外费用的池能看到原值 → 调 `-100` 点「保存调整」→ 刷新后输入仍是 `-100`，但用户端金额**未变** → 点「通知用户付款」→ `fee_breakdown_per_user` 才出现「捆包作业服务费（补正）」→ 第二次保存时 `version` 已递增，旧页面保存会收到冲突提示。

---

## 14. 实现状态（本轮）

已落地：

| 文件 | 改动 |
|---|---|
| `ShippingPoolDetailDto.java` | `SinglePool` 增加 `packing_fees_per_user`、`version` 及嵌套 `PackingFeePerUser` |
| `ShippingPoolRecordMapper.xml` | `poolColumnsPrefixed` 增加两列；`SinglePoolResultMap` 增加 JSONB 映射 |
| `ShippingFeeAdjustRequest.java` | 新增请求 DTO（`base_packing_fee_jpy` / `adjustments[].extra_fee_jpy` / `reason` / `expect_version`） |
| `ShippingFeeAdjustResult.java` | 新增响应 DTO（`pool` / `version` / 预览 / `changes`） |
| `ShippingPoolRecordService(+Impl)` | 新增 `handleAdjustFees`：状态白名单、版本校验、参与人/金额/原因校验、规范化写入、预览、审计消息 |
| `MutateTenantEntityController.java` | 新增 `POST /ShippingPool/handleAdjustFees`（管理员） |
| `ShippingPoolRecordServiceImpl#saveShippingDetail` | 增加 `publishFees` 开关；`handleSaveInfoOnly` 传 `false`，`handleSetAwaitingPayment` 传 `true` |
| `tenantApi.js` | 新增 `shippingPoolApi.handleAdjustFees` |
| `ShippingFeeAdjustDialog.jsx` | 新增费用调整弹窗（基数 + 每人额外费用 + 原因 + 实时预览 + 负数校验） |
| `AdminShippingInfoPanel.jsx` | 价格输入改为只读摘要 + 「调整费用」按钮；接入弹窗；修正负数回填；显示「待发布」提示 |
| `AdminShippingInfoPanel.jsx`（2026-11 收紧） | 「调整费用」仅在 `pending` / `processing` 渲染；`awaiting_payment` 及之后完全隐藏；删除「按新金额通知用户付款」按钮 |
| `ShippingPoolRecordServiceImpl`（2026-11 收紧） | `FEE_ADJUSTABLE_STATUSES` 仅保留 `pending` / `processing`；之后调用返回「费用已通知用户，不能再次调整」 |
| `ShippingPoolRecordMapper.xml` | 管理端 `transit_methods` 补齐 `rate_mode` / `simple_rates`，修复前端中转运输费算成 0、明细缺行 |

验证：`mvnw -o -DskipTests compile`（408 文件）与 `vite build` 均通过。

明确不做（业务决定）：

- **不做补差/退款**：执行 `handleSetAwaitingPayment` 后金额定稿，不提供二次调价；如遇特殊情况走线下处理；
- `handlePublishFees` 不再计划；
- 仍建议做旧数据归一与对账（13.7）；
- `handleSaveInfoOnly` 不再发布金额属于**行为变更**，需要回归「改重量/箱型 → 保存信息 → 通知付款」这条业务链路。

