/**
 * 链接协议白名单：只允许 http(s)、mailto、站内绝对路径与锚点。
 * 阻断 javascript:、data:、vbscript: 等可执行伪协议。
 */
function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (url.startsWith("#")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:[^\s]+$/i.test(url)) return url;
  return null;
}

/**
 * 轻量 Markdown → HTML 渲染（零依赖，后台「关于本站」README / 更新日志展示用）。
 * 安全策略：先整体 HTML 转义再做标记转换，输出内容不含可执行标签。
 */
export function mdToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const inline = (s: string): string => {
    let out = esc(s);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (all, alt: string, url: string) => {
      const safe = safeUrl(url);
      return safe ? `<img alt="${alt}" src="${safe}" />` : all;
    });
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label: string, url: string) => {
      const safe = safeUrl(url);
      return safe
        ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : all;
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    return out;
  };

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inCode = false;
  let listMode: "ul" | "ol" | null = null;
  let tableRows: string[][] = [];

  const closeList = () => {
    if (listMode) {
      html.push(`</${listMode}>`);
      listMode = null;
    }
  };
  const flushTable = () => {
    if (tableRows.length >= 2) {
      const [head, ...body] = tableRows;
      html.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
      for (const row of body) html.push("<tr>" + row.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
      html.push("</tbody></table>");
    }
    tableRows = [];
  };
  const splitRow = (line: string) =>
    line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().startsWith("```")) {
      flushTable();
      closeList();
      html.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html.push(esc(raw) + "\n");
      continue;
    }

    // 表格
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = splitRow(line.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // 分隔行
      tableRows.push(cells);
      continue;
    }
    flushTable();

    if (/^#{1,6}\s/.test(line)) {
      closeList();
      const level = line.match(/^#+/)![0].length;
      html.push(`<h${level}>${inline(line.replace(/^#+\s*/, ""))}</h${level}>`);
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      closeList();
      html.push("<hr />");
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      closeList();
      html.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`);
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const mode = ul ? "ul" : "ol";
      if (listMode !== mode) {
        closeList();
        html.push(`<${mode}>`);
        listMode = mode;
      }
      html.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      continue;
    }
    closeList();

    if (line.trim() === "") continue;
    html.push(`<p>${inline(line)}</p>`);
  }
  if (inCode) html.push("</code></pre>");
  flushTable();
  closeList();
  return html.join("\n");
}
