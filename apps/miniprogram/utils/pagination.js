/**
 * 简单分页工具：统一日志与闪念的 15 条/页规则。
 */
function pageOf(list, page, pageSize) {
  const safeSize = Math.max(1, Number(pageSize) || 15);
  const total = Array.isArray(list) ? list.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * safeSize;
  const end = start + safeSize;
  const rows = Array.isArray(list) ? list.slice(start, end) : [];
  return { rows, total, totalPages, page: safePage, pageSize: safeSize };
}

module.exports = { pageOf };
