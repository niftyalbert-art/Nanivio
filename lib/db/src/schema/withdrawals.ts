import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const withdrawalsTable = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  withdrawalType: text("withdrawal_type").notNull(), // 'mobile_money' | 'bank'
  // Mobile money fields
  mobileNumber: text("mobile_number"),
  mobileNetwork: text("mobile_network"), // e.g. MTN, Vodafone, Airtel
  // Bank fields
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  // Common
  recipientCountry: text("recipient_country").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWithdrawalSchema = createInsertSchema(withdrawalsTable).omit({ id: true, createdAt: true, status: true });
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
export type Withdrawal = typeof withdrawalsTable.$inferSelect;
