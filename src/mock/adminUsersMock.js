
export const MOCK_ADMIN_USERS_DATA = 
{
  data: {
    users: [
      {
        id: 11,
        full_name: "张三",
        user_email: "zhangsan@example.com",
        role: "admin",           // platform_admin | tenant_admin | admin | staff | user
        is_active: true,
        created_date: "2024-01-15T10:30:00Z",
        assigned_role_ids: [7, 5],
        permission_overrides: {},
        member_tier_id: "tier_001",
        member_tier_name: "VIP会员",
        credit_enabled: true
      },
      {
        id: "user_002",
        full_name: "李四",
        user_email: "lisi@example.com",
        role: "user",
        is_active: true,
        created_date: "2024-02-20T14:20:00Z",
        assigned_role_ids: [],
        permission_overrides: {},
        member_tier_id: null,
        member_tier_name: null,
        credit_enabled: false
      },
      {
        id: "user_003",
        full_name: "王五",
        user_email: "wangwu@example.com",
        role: "platform_admin",
        is_active: true,
        created_date: "2024-01-01T00:00:00Z",
        assigned_role_ids: ["role_003"],
        permission_overrides: {},
        member_tier_id: "tier_002",
        member_tier_name: "SVIP会员",
        credit_enabled: true
      }
    ],
    orders: [
      {
        user_email: "zhangsan@example.com",
        paid_amount: 15000
      },
      {
        user_email: "zhangsan@example.com",
        paid_amount: 8500
      },
      {
        user_email: "lisi@example.com",
        paid_amount: 3200
      }
    ],
    tenants: [
      {
        id: "tenant_001",
        name: "默认租户",
        code: "default",
        theme_color: "#dc2626",
        is_active: true
      },
      {
        id: "tenant_002",
        name: "测试租户",
        code: "test",
        theme_color: "#2563eb",
        is_active: true
      }
    ],
    roles: [
      {
        id: "role_001",
        name: "客服",
        color: "#3b82f6",
        is_global: false,
        tenant_id: "tenant_001"
      },
      {
        id: "role_002",
        name: "财务",
        color: "#10b981",
        is_global: false,
        tenant_id: "tenant_001"
      },
      {
        id: "role_003",
        name: "超级管理员",
        color: "#ef4444",
        is_global: true,
        tenant_id: null
      }
    ]
  }
}