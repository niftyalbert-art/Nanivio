import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, contactsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const NANIVIO_NUMBER_RE = /^0\d{9}$/;

// GET /contacts — list all saved contacts for the current user
router.get("/contacts", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.userId!;

    const rows = await db
      .select({
        id: contactsTable.id,
        contactUserId: contactsTable.contactUserId,
        nanivioNumber: usersTable.nanivioNumber,
        accountName: usersTable.name,
        contactName: contactsTable.contactName,
        createdAt: contactsTable.createdAt,
      })
      .from(contactsTable)
      .innerJoin(usersTable, eq(usersTable.id, contactsTable.contactUserId))
      .where(eq(contactsTable.userId, userId))
      .orderBy(contactsTable.createdAt);

    res.json({
      contacts: rows.map((r) => ({
        id: r.id,
        streamUserId: String(r.contactUserId),
        name: r.contactName || r.accountName,
        accountName: r.accountName,
        nanivioNumber: r.nanivioNumber,
        createdAt: r.createdAt,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /contacts — save a Nanivio user using their User NV number
router.post("/contacts", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const { nanivioNumber, contactName } = req.body ?? {};

    const normalizedNumber = String(nanivioNumber ?? "").replace(/\s/g, "");
    const normalizedName = String(contactName ?? "").trim();

    if (!NANIVIO_NUMBER_RE.test(normalizedNumber)) {
      res.status(400).json({
        error: "User NV must be exactly 10 digits and start with 0",
      });
      return;
    }

    if (!normalizedName || normalizedName.length < 1) {
      res.status(400).json({
        error: "Contact name is required",
      });
      return;
    }

    const [contact] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        nanivioNumber: usersTable.nanivioNumber,
      })
      .from(usersTable)
      .where(eq(usersTable.nanivioNumber, normalizedNumber));

    if (!contact) {
      res.status(404).json({
        error: "No Nanivio user was found with that User NV number",
      });
      return;
    }

    if (contact.id === userId) {
      res.status(400).json({
        error: "You cannot save your own User NV as a contact",
      });
      return;
    }

    const [saved] = await db
      .insert(contactsTable)
      .values({
        userId,
        contactUserId: contact.id,
        contactName: normalizedName,
      })
      .onConflictDoNothing()
      .returning();

    if (!saved) {
      res.status(409).json({
        error: "This user is already in your contacts",
      });
      return;
    }

    res.status(201).json({
      success: true,
      contact: {
        id: saved.id,
        streamUserId: String(contact.id),
        name: normalizedName,
        accountName: contact.name,
        nanivioNumber: contact.nanivioNumber,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /contacts/:contactUserId — remove a saved contact
router.delete(
  "/contacts/:contactUserId",
  requireAuth,
  async (req, res): Promise<void> => {
    try {
      const userId = req.userId!;
      const contactUserIdNum = parseInt(String(req.params.contactUserId), 10);

      if (isNaN(contactUserIdNum)) {
        res.status(400).json({ error: "Invalid contact" });
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
