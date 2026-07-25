import { pgTable, serial, text, numeric, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const walletsTable = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  currencyCode: text("currency_code").notNull(),
  currencyName: text("currency_name").notNull(),
  balance: numeric("balance", { precision: 18, scale: 4 }).notNull().default("0"),
  flag: text("flag").notNull(),
  isCrypto: boolean("is_crypto").notNull().default(false),
  cryptoSymbol: text("crypto_symbol"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type InsertWallet = typeof walletsTable.$inferInsert;
export type Wallet = typeof walletsTable.$inferSelect;
