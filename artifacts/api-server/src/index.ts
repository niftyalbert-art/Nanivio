import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable } from "@workspace/db";
import { isNotNull } from "drizzle-orm";
import { StreamChat } from "stream-chat";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Clear any legacy plain-text PINs left in the DB (bcrypt hash is in passwordHash)
  clearLegacyPlainPins();
  // Fire-and-forget: sync all existing DB users into Stream so they're searchable
  syncUsersToStream();
});
