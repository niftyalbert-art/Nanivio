import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

export const depositsTable = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  walletId: integer("wallet_id").notNull(),
  paymentMethodId: integer("payment_method_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  externalTransactionId: text("external_transaction_id").notNull(),
  receiptImage: text("receipt_image").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  note: text("note"),
  // Admin fields
  adminNoteInternal: text("admin_note_internal"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Deposit = typeof depositsTable.$inferSelect;
export type InsertDeposit = typeof depositsTable.$inferInsert;
