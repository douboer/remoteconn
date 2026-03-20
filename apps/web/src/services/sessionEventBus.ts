type EventName = "connected" | "disconnected" | "stdout" | "stderr" | "latency";

type Handler = (payload: unknown) => void;

const listeners = new Map<EventName, Set<Handler>>();

export function onSessionEvent(eventName: EventName, handler: Handler): () => void {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }
  listeners.get(eventName)!.add(handler);
  return () => listeners.get(eventName)?.delete(handler);
}

export function emitSessionEvent(eventName: EventName, payload: unknown): void {
  const set = listeners.get(eventName);
  if (!set) return;
  for (const handler of set) {
    handler(payload);
  }
}
