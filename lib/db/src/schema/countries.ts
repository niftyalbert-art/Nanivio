import { pgTable, serial, text, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const countriesTable = pgTable("countries", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  currencyCode: text("currency_code").notNull(),
  currencyName: text("currency_name").notNull(),
  flag: text("flag").notNull(),
  transferFee: numeric("transfer_fee", { precision: 10, scale: 2 }).notNull().default("5"),
  estimatedTime: text("estimated_time").notNull().default("1-2 business days"),
  popular: boolean("popular").notNull().default(false),
});

export const insertCountrySchema = createInsertSchema(countriesTable).omit({ id: true });
export type InsertCountry = z.infer<typeof insertCountrySchema>;
export type Country = typeof countriesTable.$inferSelect;
