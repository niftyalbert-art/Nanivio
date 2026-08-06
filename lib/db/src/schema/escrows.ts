import { pgTable, serial, text, numeric, integer, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Escrow-held payments created from a chat.
 * Funds are debited from the buyer's wallet at creation ("funded") and are held
 * by the platform — not spendable by either side — until released/refunded.
 *
 * Status transitions (strict):
 *   funded → released   (buyer, or admin resolving a dispute)
 *   funded → refunded   (seller, or admin resolving a dispute)
 *   funded → disputed   (buyer or seller) → released | refunded (admin only)
 */
export const escrowsTable = pgTable("escrows", {
  id: serial("id").primaryKey(),
  buyerUserId: integer("buyer_user_id").notNull(),
  sellerUserId: integer("seller_user_id").notNull(),
  buyerWalletId: integer("buyer_wallet_id").notNull(), // refunds return here
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(), // held amount in currencyCode
  currencyCode: text("currency_code").notNull(),
  amountUsd: numeric("amount_usd", { precision: 18, scale: 4 }),
  feeAmount: numeric("fee_amount", { precision: 18, scale: 4 }), // escrow fee taken on release
  description: text("description").notNull(), // encrypted at rest
  deadline: timestamp("deadline", { withTimezone: true }),
  deadlineReminded: boolean("deadline_reminded").notNull().default(false),
  status: text("status").notNull().default("funded"), // funded | released | refunded | disputed
  disputedBy: integer("disputed_by"), // user id who raised the dispute
  disputeReason: text("dispute_reason"), // encrypted at rest
  resolvedBy: text("resolved_by"), // 'buyer' | 'seller' | 'admin'
  chatId: text("chat_id").notNull(),
  messageId: text("message_id"), // Stream message id of the escrow bubble
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Append-only audit trail for every escrow action. */
export const escrowEventsTable = pgTable("escrow_events", {
  id: serial("id").primaryKey(),
  escrowId: integer("escrow_id").notNull(),
  actorType: text("actor_type").notNull(), // buyer | seller | admin | system
  actorId: integer("actor_id"), // user id when buyer/seller
  action: text("action").notNull(), // funded | released | refunded | disputed | deadline_reminder
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertEscrow = typeof escrowsTable.$inferInsert;
export type Escrow = typeof escrowsTable.$inferSelect;
export type InsertEscrowEvent = typeof escrowEventsTable.$inferInsert;
export type EscrowEvent = typeof escrowEventsTable.$inferSelect;
