import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const paymentMethodsTable = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'botim' | 'emoney' | 'bank_transfer'
  name: text("name").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  instructions: text("instructions").notNull(),
  logoEmoji: text("logo_emoji").notNull().default("💳"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;
export type InsertPaymentMethod = typeof paymentMethodsTable.$inferInsert;
