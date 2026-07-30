import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash").notNull(),
  plainPin: text("plain_pin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resetOtp: text("reset_otp"),
  resetOtpExpiresAt: timestamp("reset_otp_expires_at", { withTimezone: true }),
  callsEnabled: boolean("calls_enabled").notNull().default(true),
  videoCallsEnabled: boolean("video_calls_enabled").notNull().default(true),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
