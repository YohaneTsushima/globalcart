/**
 * UserProfileLink - 用户昵称公开资料页入口
 * 若目标用户开启了公开资料页则渲染为可点击链接（跳转 /{locale}/u/{handle}），否则渲染为普通文本。
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

export default function UserProfileLink({ email, name, className = "" }) {
  const { data } = useQuery({
    queryKey: ['public-handle', email],
    queryFn: async () => {
      const res = await base44.functions.invoke('user/stats/getPublicHandle', { filter: {email: email }});
      return res.data;
    },
    enabled: !!email,
    staleTime: 10 * 60 * 1000,
  });

  if (!data?.handle) return <span className={className}>{name}</span>;

  return (
    <Link
      to={createPageUrl(`u/${data.handle}`)}
      className={`${className} hover:underline hover:text-blue-600`}
      onClick={(e) => e.stopPropagation()}
      title="查看公开资料页"
    >
      {name}
    </Link>
  );
}