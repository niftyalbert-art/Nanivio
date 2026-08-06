import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

/** "Request money" records created from a chat. */
export const moneyRequestsTable = pgTable("money_requests", {
  id: serial("id").primaryKey(),
  requesterUserId: integer("requester_user_id").notNull(),
  payerUserId: integer("payer_user_id").notNull(),
  chatId: text("chat_id").notNull(), // Stream channel id
  messageId: text("message_id"), // Stream message id of the request bubble
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  note: text("note"), // encrypted at rest
  status: text("status").notNull().default("pending"), // pending | paid | declined
  transferId: integer("transfer_id"), // p2p_transfers.id once paid
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type InsertMoneyRequest = typeof moneyRequestsTable.$inferInsert;
export type MoneyRequest = typeof moneyRequestsTable.$inferSelect;
