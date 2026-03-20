import type { SessionState } from "../types/models";

/**
 * 会话状态机，确保连接生命周期可预测。
 */
const transitions: Record<SessionState, SessionState[]> = {
  idle: ["connecting", "disconnected"],
  connecting: ["auth_pending", "error", "disconnected"],
  auth_pending: ["connected", "error", "disconnected"],
  connected: ["reconnecting", "disconnected", "error"],
  reconnecting: ["connected", "error", "disconnected"],
  disconnected: ["connecting", "idle"],
  error: ["connecting", "disconnected"]
};

export function canTransition(from: SessionState, to: SessionState): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: SessionState, to: SessionState): void {
  if (!canTransition(from, to)) {
    throw new Error(`非法状态跳转: ${from} -> ${to}`);
  }
}

export function allStates(): SessionState[] {
  return Object.keys(transitions) as SessionState[];
}
