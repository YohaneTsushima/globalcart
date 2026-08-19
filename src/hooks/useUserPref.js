/**
 * useUserPref — 当前用户 UserPreference 记录的共享加载/保存 hook
 * 供个人档案页各设置模块（联系方式/地址管理/偏好设置）独立读写自己的字段切片
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userPrefApi } from "@/lib/tenantApi";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function useUserPref() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: prefs = [], isLoading } = useQuery({
    queryKey: ['user-preferences', user?.email],
    queryFn: async () => {
      const rows = await userPrefApi.list({ user_email: user.email });
      return [...(rows || [])].sort((a, b) => 
        new Date(b.updated_date || 0) - new Date(a.updated_date || 0)
      );
    },
    enabled: !!user?.email,
    staleTime: 5 * 60 * 1000,
  });

  const pref = prefs[0] || null;

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, user_email: user.email };
      if (pref) {
        await userPrefApi.update(pref.id, payload);
        return { ...pref, ...payload };
      } else {
        return await userPrefApi.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences', user?.email] });
    },
  });

  return { 
    user, 
    pref, 
    prefs, 
    loading: isLoading, 
    savePref: saveMutation.mutateAsync 
  };
}
