import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// Upload directory — relative to process cwd (artifacts/api-server/)
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "kyc");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Allowed MIME types for government ID documents
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/**
 * Parse and validate a data-URL, returning the mime type, extension and raw buffer.
 * Throws a descriptive error string if the input is malformed or the mime type is not allowed.
 */
function parseDocumentBase64(base64Data: string): { buffer: Buffer; ext: string; mime: string } {
  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/s);
  if (!matches) {
    throw new Error("Invalid document format. Expected a base64 data-URL (data:<mime>;base64,<data>).");
  }
  const mime = matches[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error(`Unsupported file type: ${mime}. Please upload a JPEG, PNG, or WEBP image.`);
  }
  const rawBase64 = matches[2].replace(/\s/g, ""); // strip any whitespace
  const buffer = Buffer.from(rawBase64, "base64");

  // Validate magic bytes to detect content-type spoofing
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const png  = buffer[0] === 0x89 && buffer[1] === 0x50; // \x89P
  const webp = buffer.slice(8, 12).toString("ascii") === "WEBP";
  if (mime === "image/jpeg" && !jpeg) throw new Error("File content does not match declared type (expected JPEG).");
  if (mime === "image/png"  && !png)  throw new Error("File content does not match declared type (expected PNG).");
  if (mime === "image/webp" && !webp) throw new Error("File content does not match declared type (expected WEBP).");

  const extMap: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  };
  return { buffer, ext: extMap[mime] ?? "jpg", mime };
}

/**
 * Write the document buffer to disk. Returns the full file path.
 * Deletes the previous document for this user (if any) to avoid accumulation.
 */
function saveDocument(userId: number, buffer: Buffer, ext: string, previousPath?: string | null): string {
  // Delete stale file before writing the new one
  if (previousPath) {
    try { fs.unlinkSync(previousPath); } catch { /* file may already be gone */ }
  }
  const filename = `${userId}_${Date.now()}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

// GET /api/kyc/status — current user's KYC status
router.get("/kyc/status", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [user] = await db
    .select({
      kycStatus: usersTable.kycStatus,
      kycRejectionReason: usersTable.kycRejectionReason,
      kycSubmittedAt: usersTable.kycSubmittedAt,
      kycReviewedAt: usersTable.kycReviewedAt,
      kycDocumentPath: usersTable.kycDocumentPath,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json({
    kycStatus: user.kycStatus,
    kycRejectionReason: user.kycRejectionReason ?? null,
    kycSubmittedAt: user.kycSubmittedAt ? user.kycSubmittedAt.toISOString() : null,
    kycReviewedAt: user.kycReviewedAt ? user.kycReviewedAt.toISOString() : null,
    hasDocument: !!user.kycDocumentPath,
  });
});

// POST /api/kyc/submit — upload government ID document
router.post("/kyc/submit", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { documentBase64, idType } = req.body ?? {};

  if (!documentBase64 || typeof documentBase64 !== "string") {
    res.status(400).json({ error: "documentBase64 is required" });
    return;
  }
  if (!idType || !["passport", "national_id", "drivers_licence"].includes(idType)) {
    res.status(400).json({ error: "idType must be passport, national_id, or drivers_licence" });
    return;
  }

  // Size guard before parsing (base64 overhead ~33%)
  if (documentBase64.length > 12 * 1024 * 1024) {
    res.status(400).json({ error: "Document image is too large. Maximum 8 MB." });
    return;
  }

  // Validate MIME type and magic bytes
  let parsed: ReturnType<typeof parseDocumentBase64>;
  try {
    parsed = parseDocumentBase64(documentBase64);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Enforce 8 MB limit on actual decoded bytes
  if (parsed.buffer.length > 8 * 1024 * 1024) {
    res.status(400).json({ error: "Document image is too large. Maximum 8 MB." });
    return;
  }

  // Check current status — cannot resubmit if already verified or pending
  const [user] = await db
    .select({ kycStatus: usersTable.kycStatus, kycDocumentPath: usersTable.kycDocumentPath })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.kycStatus === "verified") {
    res.status(400).json({ error: "Your identity is already verified." });
    return;
  }
  if (user.kycStatus === "pending") {
    res.status(400).json({ error: "Your submission is already under review." });
    return;
  }

  // Save new file; delete the previous one if it exists (file replacement policy)
  const filePath = saveDocument(userId, parsed.buffer, parsed.ext, user.kycDocumentPath);

  await db
    .update(usersTable)
    .set({
      kycStatus: "pending",
      kycDocumentPath: filePath,
      kycSubmittedAt: new Date(),
      kycRejectionReason: null,
      kycReviewedAt: null,
    })
    .where(eq(usersTable.id, userId));

  res.status(201).json({ kycStatus: "pending" });
});

export default router;
