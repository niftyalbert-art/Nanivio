import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Paid per-minute call sessions. The server-side session record is the billing
 * source of truth: created when a paid call connects, kept alive by caller
 * heartbeats, and settled exactly once on end (or by the stale-session sweep).
 *
 * Status transitions (strict, guarded by conditional UPDATE):
 *   active → settled  (normal end or sweep; a p2p_transfers settlement row is created)
 *   active → failed   (settlement could not move any money, e.g. rate unavailable)
 */
export const callSessionsTable = pgTable("call_sessions", {
  id: serial("id").primaryKey(),
  callerUserId: integer("caller_user_id").notNull(),
  expertUserId: integer("expert_user_id").notNull(),
  chatId: text("chat_id").notNull(),
  channel: text("channel").notNull(), // Agora channel (unique per call attempt)
  kind: text("kind").notNull().default("video"), // audio | video
  ratePerMinute: numeric("rate_per_minute", { precision: 18, scale: 4 }).notNull(), // snapshot at call time
  currencyCode: text("currency_code").notNull(), // rate currency (expert's setting)
  status: text("status").notNull().default("active"), // active | settled | failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  billedMinutes: integer("billed_minutes"),
  totalAmount: numeric("total_amount", { precision: 18, scale: 4 }), // in currencyCode
  feeAmount: numeric("fee_amount", { precision: 18, scale: 4 }), // platform fee in currencyCode
  settlementTransferId: integer("settlement_transfer_id"), // p2p_transfers.id
  endReason: text("end_reason"), // ended | balance_exhausted | stale_sweep
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CallSession = typeof callSessionsTable.$inferSelect;
export type InsertCallSession = typeof callSessionsTable.$inferInsert;
