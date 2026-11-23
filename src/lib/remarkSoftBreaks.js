/**
 * remark 插件：把正文里的单个换行当硬换行（<br>）渲染。
 *
 * 标准 Markdown 里，段落内的单个换行只是「软换行」，渲染成 HTML 时会变成一个空格，
 * 所以公告正文写：
 *     **测试加粗**
 *     *测试斜体*
 * 预览会连成一行。这个插件把文本节点里的 "\n" 拆成 text + break 节点，
 * 效果等同每行结尾加了两个空格，但只作用于普通文本（代码块、行内代码不受影响），
 * 也不会像字符串替换那样在列表项里塞进多余的 <br>。
 *
 * 用法：<ReactMarkdown remarkPlugins={[remarkGfm, remarkSoftBreaks]}>
 */

// 递归替换 text 节点里的换行
function walk(node) {
  if (!Array.isArray(node.children)) return;
  const children = node.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (child.type === "text" && child.value.includes("\n")) {
      const parts = child.value.split("\n");
      const replacement = [];
      parts.forEach((part, idx) => {
        if (part) replacement.push({ type: "text", value: part });
        if (idx < parts.length - 1) replacement.push({ type: "break" });
      });
      children.splice(i, 1, ...replacement);
      i += replacement.length - 1;
      continue;
    }

    walk(child);
  }
}

export default function remarkSoftBreaks() {
  return (tree) => {
    walk(tree);
  };
}
