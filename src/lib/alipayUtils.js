/**
 * 支付宝支付公共方法
 * 用于 PaymentModal、Payment、ShippingPoolDetailModal 等组件
 */
import { toast } from "sonner";

/**
 * 打开支付宝支付弹窗并提交表单
 * @param {string} alipayFormData - 后端返回的支付宝 HTML 表单
 * @param {object} options - 配置选项
 * @param {number} options.width - 弹窗宽度，默认 1024
 * @param {number} options.height - 弹窗高度，默认 968
 * @returns {Window|null} - 返回弹窗对象，失败返回 null
 */
export function openAlipayPopup(alipayFormData, options = {}) {
  if (!alipayFormData) return null;

  const { width = 1024, height = 968 } = options;

  const parser = new DOMParser();
  const doc = parser.parseFromString(alipayFormData, 'text/html');
  const form = doc.querySelector('form');
  if (!form) return null;

  // 计算弹窗尺寸，居中显示
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;

  const popup = window.open('', 'alipay_payment', `width=${width},height=${height},left=${left},top=${top}`);

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
