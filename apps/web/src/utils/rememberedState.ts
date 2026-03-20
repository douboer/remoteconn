export function readRememberedEnum<T extends string>(
  storageKey: string,
  allowedValues: readonly T[]
): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return allowedValues.includes(raw as T) ? (raw as T) : null;
  } catch {
    return null;
  }
}

export function writeRememberedEnum(storageKey: string, value: string): void {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // 忽略本地存储不可用场景（如隐私模式限制）
  }
}
