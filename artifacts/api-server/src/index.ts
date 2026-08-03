import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable, pool } from "@workspace/db";
import { isNotNull } from "drizzle-orm";
import { StreamChat } from "stream-chat";
import { startTronMonitor } from "./services/tron-monitor";

/** Idempotent migration: crypto_deposits table (auto-detected USDT TRC20). */
async function runCryptoDepositsMigration() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crypto_deposits (
        id                     SERIAL PRIMARY KEY,
        user_id                INTEGER NOT NULL,
        amount                 NUMERIC(18,6) NOT NULL,
        received_amount        NUMERIC(18,6),
        currency               TEXT NOT NULL DEFAULT 'USDT',
        network                TEXT NOT NULL DEFAULT 'TRC20',
        deposit_address        TEXT NOT NULL,
        transaction_hash       TEXT,
        from_address           TEXT,
        status                 TEXT NOT NULL DEFAULT 'waiting',
        confirmations          INTEGER NOT NULL DEFAULT 0,
        required_confirmations INTEGER NOT NULL DEFAULT 20,
        wallet_id              INTEGER,
        note                   TEXT,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        confirmed_at           TIMESTAMPTZ,
        expires_at             TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS crypto_deposits_tx_hash_unique
        ON crypto_deposits(transaction_hash) WHERE transaction_hash IS NOT NULL;
    `);
    logger.info("Crypto deposits schema migration complete");
  } catch (err) {
    logger.error({ err }, "Crypto deposits migration FAILED");
  }
}

/** Idempotent migration: crypto_payments table. */
async function runCryptoSchemaMigration() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crypto_payments (
        id                     SERIAL PRIMARY KEY,
        sender_id              INTEGER NOT NULL,
        receiver_address       TEXT NOT NULL,
        sender_wallet_address  TEXT,
        wallet_type            TEXT,
        amount                 NUMERIC(18,8) NOT NULL,
        currency               TEXT NOT NULL DEFAULT 'USDT',
        network                TEXT NOT NULL DEFAULT 'TRC20',
        payment_method         TEXT NOT NULL,
        transaction_hash       TEXT,
        status                 TEXT NOT NULL DEFAULT 'waiting_for_payment',
        confirmations          INTEGER NOT NULL DEFAULT 0,
        required_confirmations INTEGER NOT NULL DEFAULT 20,
        note                   TEXT,
        admin_note             TEXT,
        payment_method_id      INTEGER,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at           TIMESTAMPTZ,
        expires_at             TIMESTAMPTZ
      );
    `);
    // Duplicate-credit prevention: one on-chain tx can only ever complete one payment
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS crypto_payments_tx_hash_unique
        ON crypto_payments (transaction_hash)
        WHERE transaction_hash IS NOT NULL;
    `);
    logger.info("Crypto payments schema migration complete");
  } catch (err) {
    logger.error({ err }, "Crypto schema migration FAILED");
  }
}

/** Idempotent migration: add KYC columns that were introduced in this release. */
async function runKycSchemaMigration() {
  try {
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'unverified',
        ADD COLUMN IF NOT EXISTS kyc_document_path TEXT,
        ADD COLUMN IF NOT EXISTS kyc_selfie_path TEXT,
        ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT,
        ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS kyc_reviewed_at TIMESTAMPTZ;
    `);
    logger.info("KYC schema migration complete (IF NOT EXISTS — safe to run repeatedly)");
  } catch (err) {
    logger.error({ err }, "KYC schema migration FAILED — KYC routes will not work correctly");
  }
}

/** Idempotent migration: email verification columns (existing users defaulted to verified). */
async function runEmailVerificationMigration() {
  try {
    await pool.query(`
      -- Add with DEFAULT TRUE so all existing users stay verified (not locked out)
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS email_verification_code TEXT,
        ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;
    `);
    logger.info("Email verification schema migration complete");
  } catch (err) {
    logger.error({ err }, "Email verification schema migration FAILED");
  }
}

/** Idempotent migration: fraud_events table, user lockout columns, tx USD amount column. */
async function runFraudSchemaMigration() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fraud_events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        event_type TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS send_locked_until TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS failed_transfer_attempts TEXT NOT NULL DEFAULT '0',
        ADD COLUMN IF NOT EXISTS last_failed_transfer_at TIMESTAMPTZ;

      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS from_amount_usd NUMERIC(18,4);
    `);
    logger.info("Fraud schema migration complete (IF NOT EXISTS — safe to run repeatedly)");
  } catch (err) {
    logger.error({ err }, "Fraud schema migration FAILED — velocity limits will not work correctly");
  }
}

/** One-time migration: clear legacy plain-text PINs (passwordHash already holds the bcrypt hash). */
async function clearLegacyPlainPins() {
  try {
    const result = await db
      .update(usersTable)
      .set({ plainPin: null })
      .where(isNotNull(usersTable.plainPin));
    logger.info("Cleared legacy plain-text PINs");
  } catch (err) {
    logger.warn({ err }, "plainPin migration failed (non-fatal)");
  }
}

/** One-time startup sync: push all DB users into Stream so everyone is searchable. */
async function syncUsersToStream() {
  try {
    const key = process.env.STREAM_API_KEY;
    const secret = process.env.STREAM_API_SECRET;
    if (!key || !secret) return;
    const client = StreamChat.getInstance(key, secret);
    const users = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone }).from(usersTable);
    if (users.length === 0) return;
    // Stream upsertUsers accepts up to 100 at a time
    for (let i = 0; i < users.length; i += 100) {
      const batch = users.slice(i, i + 100).map(u => ({
        id: String(u.id),
        name: u.name,
        ...(u.phone ? { phone: u.phone } : {}),
      }));
      await client.upsertUsers(batch);
    }
    logger.info({ count: users.length }, "Synced users to Stream Chat");
  } catch (err) {
    logger.warn({ err }, "Stream user sync failed (non-fatal)");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  logger.info({ port }, "Server listening");

  // Fire-and-forget async startup tasks
  (async () => {
    // Run idempotent schema migrations first — safe on every boot (IF NOT EXISTS)
    await runCryptoDepositsMigration();
    await runCryptoSchemaMigration();
    await runKycSchemaMigration();
    await runEmailVerificationMigration();
    await runFraudSchemaMigration();
    // Clear any legacy plain-text PINs (bcrypt hash is in passwordHash)
    clearLegacyPlainPins();
    // Sync all existing DB users into Stream so they're searchable
    syncUsersToStream();
    // Start TRON blockchain monitor for automatic USDT TRC20 deposit detection
    startTronMonitor();
  })();
});
