import { SyncRepository } from "./repository";
import { createSyncToken } from "./crypto";
import { config } from "../config";

interface Code2SessionResult {
  openid: string;
  unionid?: string;
}

async function fetchCode2Session(code: string): Promise<Code2SessionResult> {
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", config.sync.miniprogramAppId);
  url.searchParams.set("secret", config.sync.miniprogramAppSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`wechat code2Session failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    openid?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  };
  if (!payload.openid) {
    throw new Error(payload.errmsg || `wechat code2Session failed: ${payload.errcode || "unknown"}`);
  }
  return {
    openid: payload.openid,
    unionid: payload.unionid
  };
}

export async function loginMiniprogramUser(code: string, repository = new SyncRepository()) {
  const result = await fetchCode2Session(code);
  const user = repository.getOrCreateUser(result.openid, result.unionid || null);
  const session = createSyncToken(user.id, user.openid);
  return {
    user,
    ...session
  };
}
