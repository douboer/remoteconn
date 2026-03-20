import { z } from "zod";

/**
 * 小程序同步公共 schema：
 * 1. 第一阶段只约束必要字段，避免把本地对象完全写死；
 * 2. 服务器普通字段与敏感字段拆开，便于单独加密存储。
 */
export const syncLoginBodySchema = z.object({
  code: z.string().trim().min(1)
});

export const syncSettingsPayloadSchema = z.object({
  updatedAt: z.string().trim().min(1),
  data: z.record(z.string(), z.unknown())
});

export const syncJumpHostSchema = z.object({
  enabled: z.boolean().optional().default(false),
  host: z.string().optional().default(""),
  port: z.number().int().min(1).max(65535).optional().default(22),
  username: z.string().optional().default(""),
  authType: z.enum(["password", "privateKey", "certificate"]).optional().default("password")
});

export const syncServerSecretSchema = z.object({
  password: z.string().optional().default(""),
  privateKey: z.string().optional().default(""),
  passphrase: z.string().optional().default(""),
  certificate: z.string().optional().default(""),
  jumpPassword: z.string().optional().default(""),
  jumpPrivateKey: z.string().optional().default(""),
  jumpPassphrase: z.string().optional().default(""),
  jumpCertificate: z.string().optional().default("")
});

export const syncServerCommonSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  host: z.string().optional().default(""),
  port: z.number().int().min(1).max(65535).optional().default(22),
  username: z.string().optional().default(""),
  authType: z.enum(["password", "privateKey", "certificate"]).optional().default("password"),
  projectPath: z.string().optional().default(""),
  timeoutSeconds: z.number().int().min(1).max(3600).optional().default(15),
  heartbeatSeconds: z.number().int().min(1).max(3600).optional().default(10),
  transportMode: z.string().optional().default("gateway"),
  jumpHost: syncJumpHostSchema.optional().default({ enabled: false, host: "", port: 22, username: "", authType: "password" }),
  sortOrder: z.number().int().optional().default(0),
  lastConnectedAt: z.string().optional().default(""),
  updatedAt: z.string().trim().min(1),
  deletedAt: z.string().trim().min(1).nullable().optional().default(null)
});

export const syncServerSchema = syncServerCommonSchema.merge(syncServerSecretSchema);

export const syncServersPayloadSchema = z.object({
  servers: z.array(syncServerSchema)
});

export const syncRecordSchema = z.object({
  id: z.string().trim().min(1),
  content: z.string().optional().default(""),
  serverId: z.string().optional().default(""),
  category: z.string().optional().default("未分类"),
  contextLabel: z.string().optional().default(""),
  processed: z.boolean().optional().default(false),
  discarded: z.boolean().optional().default(false),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  deletedAt: z.string().trim().min(1).nullable().optional().default(null)
});

export const syncRecordsPayloadSchema = z.object({
  records: z.array(syncRecordSchema)
});

export type SyncSettingsPayload = z.infer<typeof syncSettingsPayloadSchema>;
export type SyncServer = z.infer<typeof syncServerSchema>;
export type SyncServerCommon = z.infer<typeof syncServerCommonSchema>;
export type SyncServerSecret = z.infer<typeof syncServerSecretSchema>;
export type SyncRecord = z.infer<typeof syncRecordSchema>;
