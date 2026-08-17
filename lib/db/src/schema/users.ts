import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  nanivioNumber: text("nanivio_number").unique(),
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
  // KYC identity verification
  kycStatus: text("kyc_status").notNull().default("unverified"),  // unverified | pending | verified | rejected
  kycDocumentPath: text("kyc_document_path"),
  kycSelfiePath: text("kyc_selfie_path"),
  kycRejectionReason: text("kyc_rejection_reason"),
  kycSubmittedAt: timestamp("kyc_submitted_at", { withTimezone: true }),
  kycReviewedAt: timestamp("kyc_reviewed_at", { withTimezone: true }),
  // Fraud / velocity limits
  sendLockedUntil: timestamp("send_locked_until", { withTimezone: true }),          // null = not locked
  failedTransferAttempts: text("failed_transfer_attempts").notNull().default("0"),  // stored as text for compat
  lastFailedTransferAt: timestamp("last_failed_transfer_at", { withTimezone: true }),
  // Profile & chat personalization
  avatarPath: text("avatar_path"),                       // uploaded profile photo
  chatBackground: text("chat_background"),               // preset id (e.g. "aurora") or "custom"
  chatBackgroundPath: text("chat_background_path"),      // uploaded wallpaper file
  // Paid per-minute calls (experts)
  paidCallsEnabled: boolean("paid_calls_enabled").notNull().default(false),
  paidCallRate: text("paid_call_rate"),         // numeric(18,4) in DB; drizzle numeric maps to string anyway
  paidCallCurrency: text("paid_call_currency"), // rate currency e.g. "USD"
  // Email verification (added post-launch; existing users default to true via migration)
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationCode: text("email_verification_code"),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),
  // Live translation preferences
  preferredLanguage: text("preferred_language").notNull().default("en"),
  translationEnabled: boolean("translation_enabled").notNull().default(false),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
