import { createHmac, timingSafeEqual } from "node:crypto";

export interface TtsTicketPayload {
  uid: string;
  cacheKey: string;
  exp: number;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const normalized = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function createTtsAudioTicket(secret: string, payload: TtsTicketPayload): string {
  const normalizedPayload = JSON.stringify({
    uid: String(payload.uid || ""),
    cacheKey: String(payload.cacheKey || ""),
    exp: Math.max(0, Math.round(Number(payload.exp) || 0))
  });
  const encodedPayload = base64UrlEncode(normalizedPayload);
  const signature = signPayload(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyTtsAudioTicket(secret: string, ticket: string): TtsTicketPayload {
  const [encodedPayload, signature] = String(ticket || "").split(".");
  if (!encodedPayload || !signature) {
    throw new Error("ticket malformed");
  }
  const expected = signPayload(secret, encodedPayload);
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error("ticket signature invalid");
  }
  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<TtsTicketPayload>;
  const exp = Math.max(0, Math.round(Number(payload.exp) || 0));
  if (!payload.uid || !payload.cacheKey || !exp) {
    throw new Error("ticket payload invalid");
  }
  if (Date.now() >= exp) {
    throw new Error("ticket expired");
  }
  return {
    uid: String(payload.uid),
    cacheKey: String(payload.cacheKey),
    exp
  };
}
