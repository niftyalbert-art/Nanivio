import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

export const withdrawalsTable = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  walletId: integer("wallet_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  withdrawalType: text("withdrawal_type").notNull(), // 'mobile_money' | 'bank'
  // Mobile money fields
  mobileNumber: text("mobile_number"),
  mobileNetwork: text("mobile_network"),
  // Bank fields
  bankName: text("bank_name"),
  iban: text("iban"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  // Common
  recipientCountry: text("recipient_country").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | rejected
  note: text("note"),
  // Admin fields
  adminReceiptImage: text("admin_receipt_image"),
  adminNoteInternal: text("admin_note_internal"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Withdrawal = typeof withdrawalsTable.$inferSelect;
export type InsertWithdrawal = typeof withdrawalsTable.$inferInsert;
