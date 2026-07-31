import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, contactsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// GET /contacts — list all saved contacts for the current user
router.get("/contacts", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const rows = await db
      .select({
        id: contactsTable.id,
        contactUserId: contactsTable.contactUserId,
        name: usersTable.name,
        createdAt: contactsTable.createdAt,
      })
      .from(contactsTable)
      .innerJoin(usersTable, eq(usersTable.id, contactsTable.contactUserId))
      .where(eq(contactsTable.userId, userId))
      .orderBy(usersTable.name);

    res.json({
      contacts: rows.map((r) => ({
        id: r.id,
        streamUserId: String(r.contactUserId),
        name: r.name,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /contacts — add a user to contacts
router.post("/contacts", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const { contactUserId } = req.body ?? {};

    if (!contactUserId) {
      res.status(400).json({ error: "contactUserId is required" });
      return;
    }

    const contactUserIdNum = parseInt(String(contactUserId), 10);
    if (isNaN(contactUserIdNum)) {
      res.status(400).json({ error: "Invalid contactUserId" });
      return;
    }
    if (contactUserIdNum === userId) {
      res.status(400).json({ error: "Cannot add yourself as a contact" });
      return;
    }

    const [contact] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, contactUserIdNum));

    if (!contact) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await db
      .insert(contactsTable)
      .values({ userId, contactUserId: contactUserIdNum })
      .onConflictDoNothing();

    res.json({
      success: true,
      contact: { streamUserId: String(contactUserIdNum), name: contact.name },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /contacts/:contactUserId — remove a contact
router.delete(
  "/contacts/:contactUserId",
  requireAuth,
  async (req, res): Promise<void> => {
    try {
      const userId = req.userId!;
      const contactUserIdNum = parseInt(String(req.params.contactUserId), 10);
      if (isNaN(contactUserIdNum)) {
        res.status(400).json({ error: "Invalid contactUserId" });
        return;
      }
      await db
        .delete(contactsTable)
        .where(
          and(
            eq(contactsTable.userId, userId),
            eq(contactsTable.contactUserId, contactUserIdNum),
          ),
        );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

export default router;
