/**
 * 主机指纹策略。
 */
export type HostKeyPolicy = "strict" | "trustFirstUse" | "manualEachTime";

export interface KnownHostsRecord {
  [hostPort: string]: string;
}

export interface VerifyHostKeyParams {
  hostPort: string;
  incomingFingerprint: string;
  policy: HostKeyPolicy;
  knownHosts: KnownHostsRecord;
  /**
   * 当策略需要用户确认时由上层注入。
   */
  onConfirm: (payload: { hostPort: string; fingerprint: string; reason: string }) => Promise<boolean>;
}

export async function verifyHostKey(params: VerifyHostKeyParams): Promise<{ accepted: boolean; updated: KnownHostsRecord }> {
  const { hostPort, incomingFingerprint, policy, onConfirm } = params;
  const knownHosts = { ...params.knownHosts };
  const stored = knownHosts[hostPort];

  if (stored && stored !== incomingFingerprint) {
    return { accepted: false, updated: knownHosts };
  }

  if (policy === "trustFirstUse") {
    if (!stored) {
      knownHosts[hostPort] = incomingFingerprint;
    }
    return { accepted: true, updated: knownHosts };
  }

  if (policy === "strict") {
    if (stored) {
      return { accepted: true, updated: knownHosts };
    }
    const accepted = await onConfirm({
      hostPort,
      fingerprint: incomingFingerprint,
      reason: "首次连接，严格模式要求确认"
    });
    if (accepted) {
      knownHosts[hostPort] = incomingFingerprint;
    }
    return { accepted, updated: knownHosts };
  }

  const accepted = await onConfirm({
    hostPort,
    fingerprint: incomingFingerprint,
    reason: "手动确认模式"
  });
  if (accepted) {
    knownHosts[hostPort] = incomingFingerprint;
  }
  return { accepted, updated: knownHosts };
}
