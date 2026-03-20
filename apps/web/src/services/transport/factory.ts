import type { TerminalTransport } from "./terminalTransport";
import { GatewayTransport } from "./gatewayTransport";
import { IosNativeTransport } from "./iosNativeTransport";

/**
 * 统一传输工厂，屏蔽底层差异。
 */
export function createTransport(
  mode: "gateway" | "ios-native",
  options: { gatewayUrl: string; gatewayToken: string }
): TerminalTransport {
  if (mode === "ios-native") {
    return new IosNativeTransport();
  }
  return new GatewayTransport(options.gatewayUrl, options.gatewayToken);
}
