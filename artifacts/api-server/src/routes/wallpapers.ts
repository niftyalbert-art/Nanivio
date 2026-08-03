import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { db, chatWallpapersTable, usersTable } from "@workspace/db";
import { adminOnly } from "../middleware/auth";

const router: IRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "wallpapers");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

function parseImageBase64(base64Data: string, maxBytes: number): { buffer: Buffer; ext: string } {
  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/s);
  if (!matches) throw new Error("Invalid image format. Expected a base64 data-URL.");
  const mime = matches[1].toLowerCase();
  const ext = ALLOWED_MIME[mime];
  if (!ext) throw new Error(`Unsupported file type: ${mime}. Please upload a JPEG, PNG, or WEBP image.`);
  const buffer = Buffer.from(matches[2].replace(/\s/g, ""), "base64");
  if (buffer.length > maxBytes) throw new Error(`Image is too large. Maximum ${(maxBytes / (1024 * 1024)).toFixed(0)} MB.`);
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50;
  const webp = buffer.slice(8, 12).toString("ascii") === "WEBP";
  if ((mime === "image/jpeg" && !jpeg) || (mime === "image/png" && !png) || (mime === "image/webp" && !webp)) {
    throw new Error("File content does not match declared type.");
  }
  return { buffer, ext };
}

function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "wallpaper";
}

function toClient(w: typeof chatWallpapersTable.$inferSelect) {
  return {
    id: w.slug,
    label: w.label,
    official: w.official,
    css: w.css,
    imageFile: w.imageFile,        // built-in file under the web app's /wallpapers/
    hasUpload: !!w.imagePath,      // admin-uploaded → served via /api/wallpapers/:slug/image
  };
}

// ── Public ───────────────────────────────────────────────────────────────────

// GET /wallpapers — full catalog (no auth: non-sensitive, needed before login too)
router.get("/wallpapers", async (_req, res): Promise<void> => {
  const rows = await db.select().from(chatWallpapersTable).orderBy(asc(chatWallpapersTable.sort), asc(chatWallpapersTable.createdAt));
  res.json({ wallpapers: rows.map(toClient) });
});

// GET /wallpapers/:slug/image — serve an admin-uploaded wallpaper image.
// Public: loaded via CSS url() which cannot attach Authorization headers.
router.get("/wallpapers/:slug/image", async (req, res): Promise<void> => {
  const [w] = await db.select().from(chatWallpapersTable).where(eq(chatWallpapersTable.slug, req.params.slug as string));
  if (!w?.imagePath || !fs.existsSync(w.imagePath)) { res.status(404).json({ error: "Not found" }); return; }
  const ext = w.imagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  res.setHeader("Content-Type", EXT_MIME[ext] ?? "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=300");
  fs.createReadStream(w.imagePath).pipe(res);
});

// ── Admin ────────────────────────────────────────────────────────────────────

// POST /admin/wallpapers — add a new wallpaper (image upload)
router.post("/admin/wallpapers", adminOnly, async (req, res): Promise<void> => {
  const { label, imageBase64, official } = req.body ?? {};
  if (!label || typeof label !== "string" || label.trim().length < 2) {
    res.status(400).json({ error: "label (min 2 chars) is required" });
    return;
  }
  if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.length > 12 * 1024 * 1024) {
    res.status(400).json({ error: "imageBase64 (data-URL, max 8 MB) is required" });
    return;
  }
  let parsed: { buffer: Buffer; ext: string };
  try { parsed = parseImageBase64(imageBase64, 8 * 1024 * 1024); }
  catch (err: any) { res.status(400).json({ error: err.message }); return; }

  // Unique slug
  let slug = slugify(label);
  const existing = await db.select({ slug: chatWallpapersTable.slug }).from(chatWallpapersTable);
  const taken = new Set(existing.map((r: { slug: string }) => r.slug));
  if (taken.has(slug)) {
    let i = 2;
    while (taken.has(`${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }

  const filePath = path.join(UPLOAD_DIR, `${slug}_${Date.now()}.${parsed.ext}`);
  fs.writeFileSync(filePath, parsed.buffer);

  const [row] = await db.insert(chatWallpapersTable).values({
    slug,
    label: label.trim(),
    css: "#0b0d1a", // base color shown while the image loads
    imagePath: filePath,
    official: official !== false,
    sort: 50, // new admin wallpapers appear after built-in officials
  }).returning();
  res.json({ ok: true, wallpaper: toClient(row) });
});

// PUT /admin/wallpapers/:slug — rename / toggle official / replace image
router.put("/admin/wallpapers/:slug", adminOnly, async (req, res): Promise<void> => {
  const slug = req.params.slug as string;
  const [w] = await db.select().from(chatWallpapersTable).where(eq(chatWallpapersTable.slug, slug));
  if (!w) { res.status(404).json({ error: "Wallpaper not found" }); return; }

  const { label, official, imageBase64 } = req.body ?? {};
  const updates: Partial<typeof chatWallpapersTable.$inferInsert> = {};
  if (typeof label === "string" && label.trim().length >= 2) updates.label = label.trim();
  if (typeof official === "boolean") updates.official = official;
  if (typeof imageBase64 === "string" && imageBase64.length > 0) {
    let parsed: { buffer: Buffer; ext: string };
    try { parsed = parseImageBase64(imageBase64, 8 * 1024 * 1024); }
    catch (err: any) { res.status(400).json({ error: err.message }); return; }
    if (w.imagePath) { try { fs.unlinkSync(w.imagePath); } catch { /* gone */ } }
    const filePath = path.join(UPLOAD_DIR, `${slug}_${Date.now()}.${parsed.ext}`);
    fs.writeFileSync(filePath, parsed.buffer);
    updates.imagePath = filePath;
    updates.imageFile = null; // uploaded image replaces any built-in file
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  const [row] = await db.update(chatWallpapersTable).set(updates).where(eq(chatWallpapersTable.slug, slug)).returning();
  res.json({ ok: true, wallpaper: toClient(row) });
});

// DELETE /admin/wallpapers/:slug — remove a wallpaper; users who had it fall
// back to the default (chat_background reset to NULL).
router.delete("/admin/wallpapers/:slug", adminOnly, async (req, res): Promise<void> => {
  const slug = req.params.slug as string;
  if (slug === "royal-classic") {
    res.status(400).json({ error: "Royal Classic is the app default wallpaper and cannot be deleted." });
    return;
  }
  const [w] = await db.select().from(chatWallpapersTable).where(eq(chatWallpapersTable.slug, slug));
  if (!w) { res.status(404).json({ error: "Wallpaper not found" }); return; }

  if (w.imagePath) { try { fs.unlinkSync(w.imagePath); } catch { /* gone */ } }
  await db.delete(chatWallpapersTable).where(eq(chatWallpapersTable.slug, slug));
  // Reset any users using this wallpaper to the app default
  await db.update(usersTable).set({ chatBackground: null }).where(eq(usersTable.chatBackground, slug));
  res.json({ ok: true });
});

export default router;
