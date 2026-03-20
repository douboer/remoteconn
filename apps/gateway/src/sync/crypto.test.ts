import { describe, expect, it } from "vitest";

process.env.MINIPROGRAM_APP_ID = "wx-test-app";
process.env.MINIPROGRAM_APP_SECRET = "wx-test-secret";
process.env.SYNC_SECRET_CURRENT = "sync-secret-for-test";

const { createSyncToken, decryptSecretPayload, encryptSecretPayload, verifySyncToken } = await import(
  "./crypto"
);

describe("sync crypto", () => {
  it("应能加解密敏感凭据", () => {
    const source = {
      password: "pw-123456",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
    };
    const encrypted = encryptSecretPayload(source);
    const decrypted = decryptSecretPayload(encrypted.secretBlob, encrypted.secretVersion);
    expect(decrypted).toEqual(source);
  });

  it("应能签发并校验同步 token", () => {
    const session = createSyncToken("user-1", "openid-1");
    const payload = verifySyncToken(session.token);
    expect(payload.uid).toBe("user-1");
    expect(payload.oid).toBe("openid-1");
    expect(payload.exp).toBeGreaterThan(Date.now());
  });
});
