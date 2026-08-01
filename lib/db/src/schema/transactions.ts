import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  fromAmount: numeric("from_amount", { precision: 18, scale: 4 }).notNull(),
  toAmount: numeric("to_amount", { precision: 18, scale: 4 }).notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }).notNull(),
  fee: numeric("fee", { precision: 18, scale: 4 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  recipientName: text("recipient_name").notNull(),
  recipientCountry: text("recipient_country").notNull(),
  recipientFlag: text("recipient_flag").notNull(),
  note: text("note"),
  fromAmountUsd: numeric("from_amount_usd", { precision: 18, scale: 4 }), // USD equivalent at time of tx — used for velocity checks
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertTransaction = typeof transactionsTable.$inferInsert;
export type Transaction = typeof transactionsTable.$inferSelect;
