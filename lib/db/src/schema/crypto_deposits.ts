import { pgTable, serial, integer, text, timestamp, numeric, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * crypto_deposits — tracks automatic USDT TRC20 deposit requests.
 *
 * Lifecycle: waiting → detecting → completed | expired
 *
 * transaction_hash has a UNIQUE index — the database enforces that
 * the same on-chain transaction can never credit a wallet twice.
 */
export const cryptoDepositsTable = pgTable(
  "crypto_deposits",
  {
    id: serial("id").primaryKey(),

    // Who initiated the deposit
    userId: integer("user_id").notNull(),

    // Expected amount the user said they'd send
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),

    // Actual amount received on-chain (set by the monitor)
    receivedAmount: numeric("received_amount", { precision: 18, scale: 6 }),

    currency: text("currency").notNull().default("USDT"),
    network: text("network").notNull().default("TRC20"),

    // Nanivio's business wallet address the user sends to
    depositAddress: text("deposit_address").notNull(),

    // On-chain tx hash — UNIQUE; prevents double-crediting
    transactionHash: text("transaction_hash"),

    // Sender's on-chain address (filled by monitor)
    fromAddress: text("from_address"),

    // Lifecycle status
    status: text("status").notNull().default("waiting"), // waiting | detecting | completed | expired

    // Blockchain confirmations
    confirmations: integer("confirmations").notNull().default(0),
    requiredConfirmations: integer("required_confirmations").notNull().default(20),

    // Which user wallet was credited (set on completion)
    walletId: integer("wallet_id"),

    // Optional note from user
    note: text("note"),

    // Timestamps
    createdAt:   timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp("updated_at",   { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    expiresAt:   timestamp("expires_at",   { withTimezone: true }),
  },
  (table) => ({
    txHashUnique: uniqueIndex("crypto_deposits_tx_hash_unique").on(table.transactionHash),
  })
);

export type CryptoDeposit = typeof cryptoDepositsTable.$inferSelect;
export type InsertCryptoDeposit = typeof cryptoDepositsTable.$inferInsert;
