import { useState, useEffect } from "react";
import { X, Check, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkSoftBreaks from "@/lib/remarkSoftBreaks";
import { base44 } from "@/api/base44Client";

const TYPE_STYLES = {
  urgent:  { header: "bg-red-600",    icon: "text-red-100", title: "text-white" },
  warning: { header: "bg-amber-500",  icon: "text-amber-100", title: "text-white" },
  success: { header: "bg-green-600",  icon: "text-green-100", title: "text-white" },
  info:    { header: "bg-blue-600",   icon: "text-blue-100", title: "text-white" },
};

const TYPE_LABELS = {
  urgent: "紧急公告", warning: "重要通知", success: "公告", info: "公告",
};

const DISMISSED_KEY = "announcement_dismissed";

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "{}"); } catch { return {}; }
}
function setDismissedStorage(id, version) {
  const d = getDismissed();
  d[id] = version || "1";
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(d));
}
function isDismissed(ann) {
  if (!ann.dismissible) return false;
  // 服务端记录优先：换浏览器 / 换设备也能保持已读
  if (ann.dismissed === true) return true;
  // 兼容旧数据的本地兜底（服务端接口异常时依然能不打扰用户）
  const d = getDismissed();
  return d[ann.id] === (ann.dismissed_version || "1");
}

export default function AnnouncementModal({ announcements = [] }) {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only initialize once (or when announcement IDs/versions change), not on every re-render
    const pending = announcements.filter(a => !isDismissed(a));
    if (pending.length > 0) {
      setQueue(pending);
      setCurrent(0);
      setVisible(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements.map(a => `${a.id}:${a.dismissed_version || '1'}`).join(',')]);

  if (!visible || queue.length === 0) return null;

  const ann = queue[current];
  if (!ann) return null;

  const style = TYPE_STYLES[ann.type] || TYPE_STYLES.info;
  const label = TYPE_LABELS[ann.type] || "公告";
  // 新公告的图片直接写在正文 Markdown 里；只有老数据（图片存在 image_urls、正文无图）才走画廊，避免同一张图显示两遍
  const hasImagesInContent = /!\[[^\]]*\]\(/.test(ann.content || "");
  const hasLegacyImages = Array.isArray(ann.image_urls) && ann.image_urls.length > 0 && !hasImagesInContent;

  const closeOrNext = () => {
    if (current < queue.length - 1) {
      setCurrent(c => c + 1);
    } else {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    // 服务端落库，失败不阻塞关闭（本地兜底已生效）
    base44.functions
      .invoke("mutateTenantEntity/Announcement/dismiss", {
        entity: "Announcement",
        action: "dismiss",
        id: String(ann.id),
        data: { version: ann.dismissed_version || "1" },
      })
      .catch((e) => console.warn("记录公告已读失败", e));
    setDismissedStorage(ann.id, ann.dismissed_version || "1");
    closeOrNext();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className={`${style.header} px-5 py-4 flex items-center gap-3`}>
          <Megaphone className={`w-5 h-5 ${style.icon} flex-shrink-0`} />
          <div className="flex-1">
            <div className={`text-xs font-semibold opacity-80 ${style.title}`}>{label}</div>
            <div className={`font-bold text-base ${style.title}`}>{ann.title}</div>
          </div>
          {queue.length > 1 && (
            <span className="text-xs text-white/70">{current + 1}/{queue.length}</span>
          )}
          <button onClick={closeOrNext} className="text-white/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* 历史公告的独立图片 */}
          {hasLegacyImages && (
            <div className="space-y-2">
              {ann.image_urls.map((url, idx) => (
                <img key={idx} src={url} alt="" className="w-full rounded-lg object-contain max-h-64" />
              ))}
            </div>
          )}
          <div className="text-gray-700 text-sm leading-relaxed prose prose-sm max-w-none prose-a:text-blue-600 prose-a:underline prose-img:rounded-lg prose-img:max-h-64 prose-img:object-contain">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkSoftBreaks]}>{ann.content}</ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2 justify-end">
          {ann.dismissible ? (
            <>
              <Button variant="outline" size="sm" onClick={closeOrNext}>
                稍后再说
              </Button>
              <Button size="sm" className="bg-gray-900 hover:bg-gray-800" onClick={handleDismiss}>
                <Check className="w-4 h-4 mr-1" />已知晓，不再显示
              </Button>
            </>
          ) : (
            <Button size="sm" className="bg-gray-900 hover:bg-gray-800" onClick={closeOrNext}>
              {current < queue.length - 1 ? "下一条" : "关闭"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}