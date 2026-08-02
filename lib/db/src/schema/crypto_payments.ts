import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";

/**
 * crypto_payments — tracks all crypto payment requests.
 * Each record represents one payment lifecycle from creation to completion.
 * Linked to the users table via sender_id (no duplicate user data).
 */
export const cryptoPaymentsTable = pgTable("crypto_payments", {
  id: serial("id").primaryKey(),

  // Who is initiating the payment
  senderId: integer("sender_id").notNull(),

  // Nanivio's receiving wallet address (fetched from payment_methods at creation time)
  receiverAddress: text("receiver_address").notNull(),

  // Optional: the user's own wallet address (recorded when they choose "Connect Wallet")
  senderWalletAddress: text("sender_wallet_address"),

  // Wallet type the user chose (trust_wallet, metamask, coinbase, manual, etc.)
  walletType: text("wallet_type"),

  // Payment amount and asset
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  currency: text("currency").notNull().default("USDT"),  // e.g. USDT, BTC, ETH
  network: text("network").notNull().default("TRC20"),   // e.g. TRC20, ERC20, BEP20

  // How the user is paying: 'wallet_address' | 'connect_wallet'
  paymentMethod: text("payment_method").notNull(),

  // On-chain transaction hash — filled in by user or system
  transactionHash: text("transaction_hash"),

  // Status lifecycle: pending → waiting_for_payment → confirming → completed | failed | expired
  status: text("status").notNull().default("waiting_for_payment"),

  // Blockchain confirmations received vs required
  confirmations: integer("confirmations").notNull().default(0),
  requiredConfirmations: integer("required_confirmations").notNull().default(20),

  // Optional note from the user
  note: text("note"),

  // Internal admin note
  adminNote: text("admin_note"),

  // Links to the payment_methods record that holds Nanivio's wallet config for this network
  paymentMethodId: integer("payment_method_id"),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // Auto-expires 30 minutes after creation if still waiting
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export type CryptoPayment = typeof cryptoPaymentsTable.$inferSelect;
export type InsertCryptoPayment = typeof cryptoPaymentsTable.$inferInsert;
