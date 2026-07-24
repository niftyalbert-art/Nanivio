import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const exchangeRatesTable = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  currencyCode: text("currency_code").notNull().unique(),
  rateToUsd: numeric("rate_to_usd", { precision: 20, scale: 8 }).notNull(),
  feePercent: numeric("fee_percent", { precision: 6, scale: 2 }).notNull().default("3"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ExchangeRate = typeof exchangeRatesTable.$inferSelect;
