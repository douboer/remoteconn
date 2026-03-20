export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDateTime(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
}
