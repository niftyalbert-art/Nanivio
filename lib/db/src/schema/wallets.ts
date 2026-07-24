import { pgTable, serial, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  currencyCode: text("currency_code").notNull(),
  currencyName: text("currency_name").notNull(),
  balance: numeric("balance", { precision: 18, scale: 4 }).notNull().default("0"),
  flag: text("flag").notNull(),
  isCrypto: boolean("is_crypto").notNull().default(false),
  cryptoSymbol: text("crypto_symbol"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWalletSchema = createInsertSchema(walletsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;
