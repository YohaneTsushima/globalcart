/**
 * 浏览器桌面通知工具
 * 收到 WebSocket 推送时弹出系统通知（Win11 右下角 / macOS 右上角）
 */

const isSupported = typeof window !== 'undefined' && 'Notification' in window;

/**
 * 获取当前通知权限状态
 * @returns {'granted'|'denied'|'default'|'unsupported'}
 */
export function getNotificationPermission() {
  if (!isSupported) return 'unsupported';
  return Notification.permission;
}

/**
 * 请求通知权限（点击铃铛时调用，用户主动触发不会被浏览器拦截）
 * @returns {Promise<'granted'|'denied'|'default'>}
 */
export async function requestNotificationPermission() {
  if (!isSupported) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  return result;
}

/**
 * 显示桌面通知
 * @param {string} title - 通知标题
 * @param {string} body - 通知内容
 * @param {Function} [onClick] - 点击通知的回调
 */
export function showDesktopNotification(title, body, onClick) {
  if (!isSupported || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛒</text></svg>",
      tag: 'globalcart-notification',
      renotify: true,
    });
    if (typeof onClick === 'function') {
      n.onclick = () => {
        window.focus();
        onClick();
        n.close();
      };
    }
  } catch (_) {
    // 部分浏览器不支持 Notification 构造函数，静默忽略
  }
}
