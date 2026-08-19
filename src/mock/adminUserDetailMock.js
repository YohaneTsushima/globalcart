
export const MOCK_ADMIN_USER_DETAIL_DATA = {
  data: {
    userProfile: {
      id: "user_001",
      email: "zhangsan@example.com",
      full_name: "张三",
      display_name: "张三",
      avatar_url: "",
      role: "user",
      is_active: true,
      created_date: "2024-01-15T10:30:00Z",
      credit_enabled: true,
      credit_limit_jpy: 50000,
      credit_balance_jpy: 12000,
      credit_cycle: "monthly",
      member_tier_id: "tier_001",
      member_tier_name: "VIP会员",
      public_profile_bio: "这是个人简介",
      tenant_id: "tenant_001"
    },

    memberTier: {
      id: "tier_001",
      name: "VIP会员",
      color: "bg-yellow-100 text-yellow-700",
      icon: "Star",
      name_font_color: "#b45309",
      credit_enabled: true,
      default_credit_limit_jpy: 50000
    },

    metrics: {
      totalPaidJpy: 156800,
      totalOrders: 12,
      avgOrderValue: 13067,
      pendingShipOrderCount: 2,
      unpaidAmountJpy: 8500,
      unpaidOrderCount: 1,
      postShipmentPaidCount: 8,
      totalRefundJpy: 3200,
      totalGoodsJpy: 120000,
      totalServiceFeeJpy: 15800,
      totalProfitJpy: 21000,
      refundCount: 1,
      lastOrderDate: "2026-08-15T09:20:00Z"
    },

    recentOrders: [
      {
        id: "order_001",
        order_number: "GC20260815001",
        status: "shipped",
        payment_status: "paid",
        total_amount_jpy: 25000,
        created_date: "2026-08-15T09:20:00Z",
        items_summary: "3件商品",
        paid_amount: 1000
      },
      {
        id: "order_002",
        order_number: "GC20260810002",
        status: "in_warehouse",
        payment_status: "paid",
        total_amount_jpy: 18500,
        created_date: "2026-08-10T14:30:00Z",
        items_summary: "2件商品",
        paid_amount: 1020
      }
    ],

    pendingTasks: {
      unpaidOrders: [
        {
          id: "order_003",
          order_number: "GC20260818003",
          total_amount_jpy: 8500,
          created_date: "2026-08-18T11:00:00Z",
          amount: 8500
        }
      ],
      pendingShipOrders: [
        {
          id: "order_004",
          order_number: "GC20260816004",
          total_amount_jpy: 12000,
          created_date: "2026-08-16T16:45:00Z",
          paid_amount: 12000,
          status: 'ready_to_ship'
        },
        {
          id: "order_005",
          order_number: "GC20260817005",
          total_amount_jpy: 9800,
          created_date: "2026-08-17T10:20:00Z",
          paid_amount: 9800,
          status: 'ready_to_ship'
        }
      ]
    },

    riskFlags: [
      {
        severity: "low",
        message: "近期有1次退款记录"
      }
    ],

    preferences: {
      topStores: [
        { name: "Amazon Japan", count: 5 },
        { name: "乐天市场", count: 4 },
        { name: "Yahoo购物", count: 3 }
      ],
      topShippingMethods: [
        { name: "EMS", count: 6 },
        { name: "航空便", count: 4 },
        { name: "船运", count: 2 }
      ],
      topPaymentMethods: [
        { name: "支付宝", count: 8 },
        { name: "微信支付", count: 3 },
        { name: "银行转账", count: 1 }
      ],
      topCountries: [
        { name: "中国", count: 10 },
        { name: "香港", count: 2 }
      ]
    },

    timeline: [
      {
        id: "event_001",
        type: "order_shipped",
        title: "订单已发货",
        description: "订单 GC20260815001 已通过 EMS 发出",
        timestamp: "2026-08-17T15:30:00Z",
        metadata: { order_id: "order_001" }
      },
      {
        id: "event_002",
        type: "order_paid",
        title: "订单已付款",
        description: "订单 GC20260815001 已支付 ¥25,000",
        timestamp: "2026-08-15T10:00:00Z",
        metadata: { order_id: "order_001" }
      },
      {
        id: "event_003",
        type: "order_created",
        title: "订单已创建",
        description: "新订单 GC20260815001 已创建",
        timestamp: "2026-08-15T09:20:00Z",
        metadata: { order_id: "order_001" }
      }
    ],

    orders: [
      {
        id: "order_001",
        order_number: "GC20260815001",
        status: "shipped",
        payment_status: "paid",
        total_amount_jpy: 25000,
        goods_amount_jpy: 20000,
        service_fee_jpy: 3000,
        shipping_fee_jpy: 2000,
        created_date: "2026-08-15T09:20:00Z",
        items: [
          { name: "商品A", quantity: 2, price: 8000 },
          { name: "商品B", quantity: 1, price: 4000 }
        ],
        paid_amount: 25000
      }
    ],

    finance: {
      credit_enabled: true,
      credit_limit_jpy: 50000,
      credit_balance_jpy: 12000,
      credit_cycle: "monthly",
      transactions: [
        {
          id: "tx_001",
          type: "charge",
          amount_jpy: 25000,
          description: "订单 GC20260815001 付款",
          created_date: "2026-08-15T10:00:00Z"
        }
      ]
    },

    logistics: {
      shipments: [
        {
          id: "shipment_001",
          order_id: "order_001",
          tracking_number: "EM123456789JP",
          carrier: "EMS",
          status: "in_transit",
          shipped_date: "2026-08-17T15:30:00Z",
          estimated_delivery: "2026-08-22"
        }
      ],
      storage_items: []
    },

    notes: [
      {
        id: "note_001",
        content: "客户要求尽快发货",
        note_type: "internal",
        is_pinned: true,
        created_by: "admin_001",
        created_by_name: "管理员A",
        created_date: "2026-08-16T09:00:00Z"
      },
      {
        id: "note_002",
        content: "已确认收货地址",
        note_type: "internal",
        is_pinned: false,
        created_by: "admin_002",
        created_by_name: "管理员B",
        created_date: "2026-08-15T14:00:00Z"
      }
    ],

    roles: [
      {
        id: "role_001",
        name: "VIP客户",
        color: "#f59e0b"
      },
      {
        id: "role_002",
        name: "常客",
        color: "#10b981"
      }
    ]
  }
};
