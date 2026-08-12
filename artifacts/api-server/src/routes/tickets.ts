import { Router, type IRouter } from "express";
import { db, supportTickets } from "@workspace/db";
import { sql, eq, desc } from "drizzle-orm";
import { requireAuth, adminOnly } from "../middleware/auth";

const router: IRouter = Router();

// List tickets (admin only — all tickets)
router.get("/tickets", adminOnly, async (_req, res): Promise<void> => {
  const tickets = await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  const result = tickets.map(t => ({
    ...t,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
  }));
  res.json(result);
});

// Create ticket (authenticated user)
router.post("/tickets", requireAuth, async (req, res): Promise<void> => {
  const { subject, message } = req.body ?? {};
  if (!subject || !message) {
    res.status(400).json({ error: "subject and message are required" }); return;
  }
  const [ticket] = await db.insert(supportTickets)
    .values({
      userId: req.userId,
      subject: String(subject),
      message: String(message),
      userName: req.userName ?? "User",
    })
    .returning();
  res.status(201).json({
    ...ticket,
    createdAt: ticket.createdAt instanceof Date ? ticket.createdAt.toISOString() : String(ticket.createdAt),
    updatedAt: ticket.updatedAt instanceof Date ? ticket.updatedAt.toISOString() : String(ticket.updatedAt),
  });
});

// User: list own tickets
router.get("/tickets/mine", requireAuth, async (req, res): Promise<void> => {
  const tickets = await db.select().from(supportTickets)
    .where(eq(supportTickets.userId, req.userId!))
    .orderBy(desc(supportTickets.createdAt));
  const result = tickets.map(t => ({
    ...t,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
  }));
  res.json(result);
});

// Admin reply to ticket
router.put("/admin/tickets/:id/reply", adminOnly, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { adminReply } = req.body ?? {};
  if (!adminReply) { res.status(400).json({ error: "adminReply is required" }); return; }

  const [updated] = await db.update(supportTickets)
    .set({ adminReply: String(adminReply), status: "resolved", updatedAt: new Date() })
    .where(eq(supportTickets.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Ticket not found" }); return; }
  res.json({
    ...updated,
    createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : String(updated.createdAt),
    updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : String(updated.updatedAt),
  });
});

export default router;
