import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentMethodsTable = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'botim' | 'emoney' | 'bank_transfer'
  name: text("name").notNull(),           // Display name e.g. "Botim Pay"
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  instructions: text("instructions").notNull(),
  logoEmoji: text("logo_emoji").notNull().default("💳"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentMethodSchema = createInsertSchema(paymentMethodsTable).omit({ id: true, createdAt: true });
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;
export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;
