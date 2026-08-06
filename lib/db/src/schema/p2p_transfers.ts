import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * In-chat wallet-to-wallet transfers between two Nanivio users.
 * Double-entry style: one row links both users; sender debited, recipient credited atomically.
 */
export const p2pTransfersTable = pgTable("p2p_transfers", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  fromWalletId: integer("from_wallet_id").notNull(),
  toWalletId: integer("to_wallet_id").notNull(),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  fromAmount: numeric("from_amount", { precision: 18, scale: 4 }).notNull(),
  toAmount: numeric("to_amount", { precision: 18, scale: 4 }).notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }).notNull(),
  fee: numeric("fee", { precision: 18, scale: 4 }).notNull().default("0"),
  fromAmountUsd: numeric("from_amount_usd", { precision: 18, scale: 4 }),
  status: text("status").notNull().default("completed"), // completed | failed
  note: text("note"), // encrypted at rest
  chatId: text("chat_id"), // Stream channel id the transfer was initiated from
  requestId: integer("request_id"), // money_requests.id when paying a request
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertP2pTransfer = typeof p2pTransfersTable.$inferInsert;
export type P2pTransfer = typeof p2pTransfersTable.$inferSelect;
