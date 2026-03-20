export interface AssistTxnDeduperOptions {
  ttlMs: number;
  cacheLimit: number;
}

export function createAssistTxnDeduper(options: AssistTxnDeduperOptions): (source?: string, txnId?: string) => boolean {
  const seenAt = new Map<string, number>();

  return (source?: string, txnId?: string): boolean => {
    if (source !== "assist" || !txnId) {
      return false;
    }

    const now = Date.now();
    for (const [id, at] of seenAt.entries()) {
      if (now - at > options.ttlMs) {
        seenAt.delete(id);
      }
    }

    if (seenAt.has(txnId)) {
      return true;
    }

    seenAt.set(txnId, now);
    if (seenAt.size > options.cacheLimit) {
      const oldestId = seenAt.keys().next().value as string | undefined;
      if (oldestId) {
        seenAt.delete(oldestId);
      }
    }

    return false;
  };
}
