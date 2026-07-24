import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql, eq, desc } from "drizzle-orm";
import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

// Inline table definition since it's not in the shared schema package yet
const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  userName: text("user_name").notNull().default("Ken"),
  status: text("status").notNull().default("open"),
  adminReply: text("admin_reply"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

const ADMIN_KEY = "niftypay2024";

const router: IRouter = Router();

// List tickets (admin only)
router.get("/tickets", async (req, res): Promise<void> => {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  const tickets = await db.select().from(supportTicketsTable).orderBy(desc(supportTicketsTable.createdAt));
  const result = tickets.map(t => ({
    ...t,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
  }));
  res.json(result);
});

// Create ticket (any user)
router.post("/tickets", async (req, res): Promise<void> => {
  const { subject, message, userName } = req.body ?? {};
  if (!subject || !message) {
    res.status(400).json({ error: "subject and message are required" }); return;
  }
  const [ticket] = await db.insert(supportTicketsTable)
    .values({ subject: String(subject), message: String(message), userName: userName ? String(userName) : "Ken" })
    .returning();
  res.status(201).json({
    ...ticket,
    createdAt: ticket.createdAt instanceof Date ? ticket.createdAt.toISOString() : String(ticket.createdAt),
    updatedAt: ticket.updatedAt instanceof Date ? ticket.updatedAt.toISOString() : String(ticket.updatedAt),
  });
});

// Admin reply to ticket
router.put("/admin/tickets/:id/reply", async (req, res): Promise<void> => {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { adminReply } = req.body ?? {};
  if (!adminReply) { res.status(400).json({ error: "adminReply is required" }); return; }

  const [updated] = await db.update(supportTicketsTable)
    .set({ adminReply: String(adminReply), status: "resolved", updatedAt: new Date() })
    .where(eq(supportTicketsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Ticket not found" }); return; }
  res.json({
    ...updated,
    createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : String(updated.createdAt),
    updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : String(updated.updatedAt),
  });
});

export default router;
