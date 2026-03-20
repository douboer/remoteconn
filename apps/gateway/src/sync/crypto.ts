import { createCipheriv, createDecipheriv, createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { config } from "../config";

interface EncryptedSecretBlob {
  alg: "aes-256-gcm";
  keyVersion: number;
  iv: string;
  tag: string;
  ciphertext: string;
}

interface SyncTokenPayload {
  uid: string;
  oid: string;
  exp: number;
}

function toBase64Url(input: Buffer | string): string {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return source
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): Buffer {
  const normalized = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64");
}

function deriveKey(label: string): Buffer {
  return createHash("sha256")
    .update(`${config.sync.secretCurrent}:${label}`, "utf8")
    .digest();
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export function encryptSecretPayload(payload: unknown): { secretBlob: string; secretVersion: number } {
  const plaintext = Buffer.from(stableJson(payload), "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("sync-secret"), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob: EncryptedSecretBlob = {
    alg: "aes-256-gcm",
    keyVersion: config.sync.secretVersion,
    iv: toBase64Url(iv),
    tag: toBase64Url(tag),
    ciphertext: toBase64Url(ciphertext)
  };
  return {
    secretBlob: JSON.stringify(blob),
    secretVersion: config.sync.secretVersion
  };
}

export function decryptSecretPayload(secretBlob: string, secretVersion: number): Record<string, unknown> {
  if (!secretBlob) {
    return {};
  }
  if (secretVersion !== config.sync.secretVersion) {
    throw new Error("unsupported secret version");
  }
  const blob = JSON.parse(secretBlob) as EncryptedSecretBlob;
  const decipher = createDecipheriv("aes-256-gcm", deriveKey("sync-secret"), fromBase64Url(blob.iv));
  decipher.setAuthTag(fromBase64Url(blob.tag));
  const plaintext = Buffer.concat([
    decipher.update(fromBase64Url(blob.ciphertext)),
    decipher.final()
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as Record<string, unknown>;
  return parsed && typeof parsed === "object" ? parsed : {};
}

export function createSyncToken(userId: string, openid: string): { token: string; expiresAt: string } {
  const exp = Date.now() + config.sync.tokenTtlSec * 1000;
  const payload: SyncTokenPayload = {
    uid: userId,
    oid: openid,
    exp
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", deriveKey("sync-token"))
    .update(encodedPayload, "utf8")
    .digest();
  return {
    token: `v1.${encodedPayload}.${toBase64Url(signature)}`,
    expiresAt: new Date(exp).toISOString()
  };
}

export function verifySyncToken(token: string): SyncTokenPayload {
  const [version, encodedPayload, encodedSignature] = String(token || "").split(".");
  if (version !== "v1" || !encodedPayload || !encodedSignature) {
    throw new Error("invalid token format");
  }
  const expected = createHmac("sha256", deriveKey("sync-token"))
    .update(encodedPayload, "utf8")
    .digest();
  const actual = fromBase64Url(encodedSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("invalid token signature");
  }
  const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as SyncTokenPayload;
  if (!payload || typeof payload !== "object" || !payload.uid || !payload.oid || !Number.isFinite(payload.exp)) {
    throw new Error("invalid token payload");
  }
  if (Date.now() >= payload.exp) {
    throw new Error("token expired");
  }
  return payload;
}
