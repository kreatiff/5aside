import { z } from "zod";

export const SourceSchema = z.enum(["facebook", "bank", "manual", "system"]);
export type Source = z.infer<typeof SourceSchema>;

export const GameStatusSchema = z.enum(["scheduled", "pending", "synced", "cancelled"]);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const BatchFrequencySchema = z.enum(["weekly", "fortnightly", "monthly"]);
export type BatchFrequency = z.infer<typeof BatchFrequencySchema>;

export const RoleSchema = z.enum(["owner", "admin"]);
export type Role = z.infer<typeof RoleSchema>;

export const PlayerSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1),
  active: z.boolean(),
  currentBalanceCents: z.number().int(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Player = z.infer<typeof PlayerSchema>;

export const PlayerCreateSchema = z.object({
  displayName: z.string().min(1),
  notes: z.string().optional(),
  active: z.boolean().optional()
});
export type PlayerCreateInput = z.infer<typeof PlayerCreateSchema>;

export const PlayerUpdateSchema = z.object({
  displayName: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional()
});
export type PlayerUpdateInput = z.infer<typeof PlayerUpdateSchema>;

export const PlayerAliasCreateSchema = z.object({
  source: SourceSchema,
  aliasRaw: z.string().min(1)
});
export type PlayerAliasCreateInput = z.infer<typeof PlayerAliasCreateSchema>;

export const GameSchema = z.object({
  id: z.string().uuid(),
  externalEventId: z.string().nullable(),
  facebookEventUrl: z.string().nullable(),
  gameDate: z.string(),
  kickoffAtUtc: z.string().datetime().nullable(),
  feeCents: z.number().int().positive(),
  source: SourceSchema,
  status: GameStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Game = z.infer<typeof GameSchema>;

export const GameCreateSchema = z.object({
  externalEventId: z.string().optional(),
  facebookEventUrl: z.string().url().optional(),
  gameDate: z.string(),
  kickoffAtUtc: z.string().datetime().optional(),
  source: SourceSchema.default("manual"),
  status: GameStatusSchema.default("scheduled")
});
export type GameCreateInput = z.infer<typeof GameCreateSchema>;

export const GameUpdateSchema = z.object({
  feeCents: z.number().int().positive().optional(),
  status: GameStatusSchema.optional()
});
export type GameUpdateInput = z.infer<typeof GameUpdateSchema>;

export const GameBatchCreateSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  frequency: BatchFrequencySchema,
  facebookEventUrls: z.array(z.string().url()).min(1).max(52)
});
export type GameBatchCreateInput = z.infer<typeof GameBatchCreateSchema>;

export const GameBatchUpdateSchema = z.object({
  gameIds: z.array(z.string().uuid()).min(1),
  feeCents: z.number().int().positive()
});
export type GameBatchUpdateInput = z.infer<typeof GameBatchUpdateSchema>;

export const AttendanceImportRowSchema = z.object({
  playerName: z.string().min(1),
  sourceStatus: z.string(),
  sourceRef: z.string().optional()
});
export type AttendanceImportRow = z.infer<typeof AttendanceImportRowSchema>;

export const AttendanceImportSchema = z.object({
  rows: z.array(AttendanceImportRowSchema).min(1),
  source: SourceSchema.default("facebook")
});
export type AttendanceImportInput = z.infer<typeof AttendanceImportSchema>;

export const BankImportRowSchema = z.object({
  externalTxnId: z.string().optional(),
  postedAtUtc: z.string().datetime(),
  amountCents: z.number().int().positive(),
  descriptionRaw: z.string().min(1),
  sourceRef: z.string().optional()
});
export type BankImportRow = z.infer<typeof BankImportRowSchema>;

export const BankImportSchema = z.object({
  rows: z.array(BankImportRowSchema).min(1),
  mode: z.enum(["csv", "webhook"])
});
export type BankImportInput = z.infer<typeof BankImportSchema>;

export const AdjustmentCreateSchema = z.object({
  playerId: z.string().uuid(),
  amountCents: z.number().int(),
  reason: z.string().optional()
});
export type AdjustmentCreateInput = z.infer<typeof AdjustmentCreateSchema>;

export const ReconcileResolveSchema = z.object({
  playerId: z.string().uuid()
});
export type ReconcileResolveInput = z.infer<typeof ReconcileResolveSchema>;

export const AttendanceManualAddSchema = z.object({
  playerId: z.string().uuid(),
  chargeable: z.boolean()
});
export type AttendanceManualAddInput = z.infer<typeof AttendanceManualAddSchema>;

export const FeeUpdateSchema = z.object({
  newFeeCents: z.number().int().positive()
});
export type FeeUpdateInput = z.infer<typeof FeeUpdateSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const MfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/)
});
export type MfaVerifyInput = z.infer<typeof MfaVerifySchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1).optional()
});
export type RefreshInput = z.infer<typeof RefreshSchema>;

export const CsvBankUploadSchema = z.object({
  csv: z.string().min(1)
});
export type CsvBankUploadInput = z.infer<typeof CsvBankUploadSchema>;

export const WebhookAttendanceSchema = z.object({
  gameId: z.string().uuid(),
  rows: z.array(AttendanceImportRowSchema).min(1)
});
export type WebhookAttendanceInput = z.infer<typeof WebhookAttendanceSchema>;

export const WebhookBankSchema = z.object({
  rows: z.array(BankImportRowSchema).min(1)
});
export type WebhookBankInput = z.infer<typeof WebhookBankSchema>;
