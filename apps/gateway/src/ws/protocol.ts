import { z } from "zod";

const initPayloadSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().max(65535),
  username: z.string().min(1),
  clientSessionKey: z.string().min(1).max(128).optional(),
  /**
   * 续接驻留窗口（毫秒）：
   * - 允许客户端按连接声明“离开页面后保留 SSH 会话多久”；
   * - 服务器侧仍会做最小/最大值裁剪。
   */
  resumeGraceMs: z
    .number()
    .int()
    .positive()
    .max(24 * 60 * 60 * 1000)
    .optional(),
  credential: z.union([
    z.object({ type: z.literal("password"), password: z.string().min(1) }),
    z.object({
      type: z.literal("privateKey"),
      privateKey: z.string().min(1),
      passphrase: z.string().optional()
    }),
    z.object({
      type: z.literal("certificate"),
      privateKey: z.string().min(1),
      passphrase: z.string().optional(),
      certificate: z.string().min(1)
    })
  ]),
  jumpHost: z
    .object({
      host: z.string().min(1),
      port: z.number().int().positive().max(65535),
      username: z.string().min(1),
      credential: z.union([
        z.object({ type: z.literal("password"), password: z.string().min(1) }),
        z.object({
          type: z.literal("privateKey"),
          privateKey: z.string().min(1),
          passphrase: z.string().optional()
        }),
        z.object({
          type: z.literal("certificate"),
          privateKey: z.string().min(1),
          passphrase: z.string().optional(),
          certificate: z.string().min(1)
        })
      ]),
      knownHostFingerprint: z.string().optional()
    })
    .optional(),
  knownHostFingerprint: z.string().optional(),
  pty: z.object({ cols: z.number().int().positive(), rows: z.number().int().positive() })
});

const stdinMetaSchema = z.object({
  source: z.enum(["keyboard", "assist"]),
  txnId: z.string().min(1).max(128).optional()
});

const inboundFrameSchema = z.union([
  z.object({ type: z.literal("init"), payload: initPayloadSchema }),
  z.object({
    type: z.literal("stdin"),
    payload: z.object({
      data: z.string(),
      meta: stdinMetaSchema.optional()
    })
  }),
  z.object({
    type: z.literal("resize"),
    payload: z.object({ cols: z.number().int().positive(), rows: z.number().int().positive() })
  }),
  z.object({
    type: z.literal("control"),
    payload: z.object({
      action: z.enum(["ping", "pong", "disconnect"]),
      reason: z.string().min(1).max(128).optional()
    })
  })
]);

export type InboundFrame = z.infer<typeof inboundFrameSchema>;

export function parseInboundFrame(raw: string): InboundFrame {
  return inboundFrameSchema.parse(JSON.parse(raw));
}

export function safeSend(socket: { send: (data: string) => void }, frame: unknown): void {
  socket.send(JSON.stringify(frame));
}
