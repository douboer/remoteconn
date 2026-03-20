import { randomUUID } from "node:crypto";

export interface ArmedTerminalCaptureRule {
  id: string;
  createdAt: number;
  expiresAt: number;
  captureDir: string;
  ip?: string;
  clientSessionKey?: string;
  host?: string;
  port?: number;
  username?: string;
}

export interface TerminalCaptureArmInput {
  captureDir: string;
  ttlMs: number;
  ip?: string;
  clientSessionKey?: string;
  host?: string;
  port?: number;
  username?: string;
}

export interface TerminalCaptureMatchTarget {
  ip: string;
  clientSessionKey?: string;
  host: string;
  port: number;
  username: string;
}

export interface TerminalCaptureArmStore {
  arm(input: TerminalCaptureArmInput): ArmedTerminalCaptureRule;
  take(target: TerminalCaptureMatchTarget): ArmedTerminalCaptureRule | null;
  list(): ArmedTerminalCaptureRule[];
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_TTL_MS = 60 * 60 * 1000;

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeOptionalString(value: unknown): string | undefined {
  const next = normalizeString(value);
  return next ? next : undefined;
}

function normalizePort(value: unknown): number | undefined {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) {
    return undefined;
  }
  return Math.round(next);
}

function normalizeTtlMs(value: unknown): number {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) {
    return DEFAULT_TTL_MS;
  }
  return Math.min(Math.max(Math.round(next), 1_000), MAX_TTL_MS);
}

function hasMatchConstraint(rule: Omit<ArmedTerminalCaptureRule, "id" | "createdAt" | "expiresAt">): boolean {
  return Boolean(rule.ip || rule.clientSessionKey || rule.host || rule.port || rule.username);
}

function matchesRule(rule: ArmedTerminalCaptureRule, target: TerminalCaptureMatchTarget): boolean {
  if (rule.ip && rule.ip !== target.ip) {
    return false;
  }
  if (rule.clientSessionKey && rule.clientSessionKey !== normalizeString(target.clientSessionKey)) {
    return false;
  }
  if (rule.host && rule.host !== target.host) {
    return false;
  }
  if (rule.port && rule.port !== target.port) {
    return false;
  }
  if (rule.username && rule.username !== target.username) {
    return false;
  }
  return true;
}

export function createTerminalCaptureArmStore(): TerminalCaptureArmStore {
  const rules = new Map<string, ArmedTerminalCaptureRule>();

  const cleanupExpired = (): void => {
    const now = Date.now();
    for (const [id, rule] of rules.entries()) {
      if (rule.expiresAt <= now) {
        rules.delete(id);
      }
    }
  };

  return {
    arm(input) {
      cleanupExpired();
      const captureDir = normalizeString(input.captureDir);
      if (!captureDir) {
        throw new Error("captureDir 不能为空");
      }

      const normalizedRule = {
        captureDir,
        ip: normalizeOptionalString(input.ip),
        clientSessionKey: normalizeOptionalString(input.clientSessionKey),
        host: normalizeOptionalString(input.host),
        port: normalizePort(input.port),
        username: normalizeOptionalString(input.username)
      };
      if (!hasMatchConstraint(normalizedRule)) {
        throw new Error("至少需要提供一个匹配条件：ip/clientSessionKey/host/port/username");
      }

      const now = Date.now();
      const rule: ArmedTerminalCaptureRule = {
        id: randomUUID(),
        createdAt: now,
        expiresAt: now + normalizeTtlMs(input.ttlMs),
        ...normalizedRule
      };
      rules.set(rule.id, rule);
      return rule;
    },
    take(target) {
      cleanupExpired();
      for (const [id, rule] of rules.entries()) {
        if (!matchesRule(rule, target)) {
          continue;
        }
        rules.delete(id);
        return rule;
      }
      return null;
    },
    list() {
      cleanupExpired();
      return Array.from(rules.values()).sort((left, right) => left.createdAt - right.createdAt);
    }
  };
}
