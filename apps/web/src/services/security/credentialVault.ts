import type { EncryptedCredentialPayload } from "@/types/app";
import { getSettings } from "@/services/storage/db";

const SESSION_KEY_STORAGE = "remoteconn_crypto_key_session_v2";
const PERSIST_KEY_STORAGE = "remoteconn_crypto_key_persist_v2";
const LEGACY_SESSION_KEY_STORAGE = "remoteconn_crypto_key_v1";

/**
 * Web 端无法达到系统 Keychain 等级，这里采用会话密钥 + AES-GCM 做“受限存储”。
 * 重点是避免明文直接落盘，并在 UI 中持续提示风险。
 */
async function getOrCreateSessionKey(): Promise<CryptoKey> {
  const remember = await shouldRememberCredentialKey();
  const encoded = readEncodedKey();

  if (encoded) {
    // 统一迁移到新 key 名，并按策略决定是否持久化。
    sessionStorage.setItem(SESSION_KEY_STORAGE, encoded);
    if (remember) {
      localStorage.setItem(PERSIST_KEY_STORAGE, encoded);
    } else {
      localStorage.removeItem(PERSIST_KEY_STORAGE);
    }

    const raw = Uint8Array.from(atob(encoded), (s) => s.charCodeAt(0));
    return await crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
  }

  const raw = crypto.getRandomValues(new Uint8Array(32));
  const nextEncoded = btoa(String.fromCharCode(...raw));
  sessionStorage.setItem(SESSION_KEY_STORAGE, nextEncoded);
  if (remember) {
    localStorage.setItem(PERSIST_KEY_STORAGE, nextEncoded);
  }
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
}

/**
 * 读取当前凭据密钥保存策略：remember 时允许跨刷新/重开保留密钥。
 * 若读取设置失败，默认走 remember，避免凭据“看似丢失”。
 */
async function shouldRememberCredentialKey(): Promise<boolean> {
  try {
    const settings = await getSettings();
    return (settings?.credentialMemoryPolicy ?? "remember") === "remember";
  } catch {
    return true;
  }
}

function readEncodedKey(): string | null {
  return (
    sessionStorage.getItem(SESSION_KEY_STORAGE) ??
    sessionStorage.getItem(LEGACY_SESSION_KEY_STORAGE) ??
    localStorage.getItem(PERSIST_KEY_STORAGE)
  );
}

function encodeBase64(source: Uint8Array): string {
  return btoa(String.fromCharCode(...source));
}

function decodeBase64ToArrayBuffer(source: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(source), (s) => s.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export async function encryptCredential(refId: string, value: unknown): Promise<EncryptedCredentialPayload> {
  const key = await getOrCreateSessionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(JSON.stringify(value));

  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload));

  const now = new Date().toISOString();
  return {
    id: `cred-${crypto.randomUUID()}`,
    refId,
    encrypted: encodeBase64(encrypted),
    iv: encodeBase64(iv),
    createdAt: now,
    updatedAt: now
  };
}

export async function decryptCredential<T>(payload: EncryptedCredentialPayload): Promise<T> {
  const key = await getOrCreateSessionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64ToArrayBuffer(payload.iv) },
    key,
    decodeBase64ToArrayBuffer(payload.encrypted)
  );
  return JSON.parse(new TextDecoder().decode(new Uint8Array(decrypted))) as T;
}
