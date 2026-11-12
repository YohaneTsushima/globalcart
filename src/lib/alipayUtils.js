/**
 * 支付宝支付公共方法
 * 用于 PaymentModal、Payment、ShippingPoolDetailModal 等组件
 */
import { toast } from "sonner";

function buildPopupFeatures(width, height) {
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  return `width=${width},height=${height},left=${left},top=${top}`;
}

/**
 * 同步预开一个空白支付窗口。
 * 必须在点击事件里立刻调用（await 之前），否则浏览器会把后面的 window.open 当成非用户操作而拦截。
 * @param {object} options
 * @param {number} options.width
 * @param {number} options.height
 * @returns {Window|null}
 */
export function openAlipayBlankPopup(options = {}) {
  const { width = 1024, height = 968 } = options;
  return window.open('', 'alipay_payment', buildPopupFeatures(width, height));
}

/**
 * 打开支付宝支付弹窗并提交表单
 * @param {string} alipayFormData - 后端返回的支付宝 HTML 表单
 * @param {object} options - 配置选项
 * @param {number} options.width - 弹窗宽度，默认 1024
 * @param {number} options.height - 弹窗高度，默认 968
 * @param {Window|null} options.targetWindow - 预先打开的空白窗口；传入时不再新开窗口
 * @returns {Window|null} - 返回弹窗对象，失败返回 null
 */
export function openAlipayPopup(alipayFormData, options = {}) {
  const { width = 1024, height = 968, targetWindow = null } = options;

  if (!alipayFormData) return targetWindow || null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(alipayFormData, 'text/html');
  const form = doc.querySelector('form');

  if (!form) {
    if (targetWindow && !targetWindow.closed) targetWindow.close();
    return null;
  }

  const popup = (targetWindow && !targetWindow.closed)
    ? targetWindow
    : window.open('', 'alipay_payment', buildPopupFeatures(width, height));

  if (!popup) {
    toast.error('请允许弹窗以完成支付');
    return null;
  }

  // 在弹窗中渲染表单并自动提交
  const realForm = popup.document.createElement('form');
  realForm.method = form.method || 'POST';
  realForm.action = form.action;

  form.querySelectorAll('input').forEach(el => {
    const field = popup.document.createElement('input');
    field.type = 'hidden';
    field.name = el.name;
    field.value = el.value;
    realForm.appendChild(field);
  });

  popup.document.body.appendChild(realForm);
  realForm.submit();

  return popup;
}
