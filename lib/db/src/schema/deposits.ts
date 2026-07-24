import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const depositsTable = pgTable("deposits", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull(),
  paymentMethodId: integer("payment_method_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currencyCode: text("currency_code").notNull(),
  externalTransactionId: text("external_transaction_id").notNull(), // user-provided tx ID from Botim/eMoney
  receiptImage: text("receipt_image").notNull(),                     // base64 or URL
  status: text("status").notNull().default("pending"),               // pending | approved | rejected
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDepositSchema = createInsertSchema(depositsTable).omit({ id: true, createdAt: true, status: true });
export type InsertDeposit = z.infer<typeof insertDepositSchema>;
export type Deposit = typeof depositsTable.$inferSelect;
