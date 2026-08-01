import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const fraudEventsTable = pgTable("fraud_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  // tx_cap_exceeded | daily_cap_exceeded | account_locked | lock_cleared | pin_failure
  eventType: text("event_type").notNull(),
  metadata: text("metadata"), // JSON string — amounts, thresholds, etc.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FraudEvent = typeof fraudEventsTable.$inferSelect;
export type InsertFraudEvent = typeof fraudEventsTable.$inferInsert;
