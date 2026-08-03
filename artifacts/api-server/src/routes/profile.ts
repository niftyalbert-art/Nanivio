import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { StreamChat } from "stream-chat";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "profile");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Wallpaper presets the client may select (validated server-side)
export const CHAT_BG_PRESETS = new Set([
  "default", "aurora", "midnight", "sunset", "ocean", "forest", "royal", "blush",
  "dots", "graphite", "slate", "noir",
  "nano-glow", "wave-flow", "hexa-tech", "luxe-marble", "cosmic-orbit", "aurora-mesh",
  "royal-classic",
]);

function parseImageBase64(base64Data: string, maxBytes: number): { buffer: Buffer; ext: string } {
  const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/s);
  if (!matches) throw new Error("Invalid image format. Expected a base64 data-URL.");
  const mime = matches[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) throw new Error(`Unsupported file type: ${mime}. Please upload a JPEG, PNG, or WEBP image.`);
  const buffer = Buffer.from(matches[2].replace(/\s/g, ""), "base64");
  if (buffer.length > maxBytes) throw new Error(`Image is too large. Maximum ${(maxBytes / (1024 * 1024)).toFixed(0)} MB.`);
  // Magic-byte validation
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50;
  const webp = buffer.slice(8, 12).toString("ascii") === "WEBP";
  if (mime === "image/jpeg" && !jpeg) throw new Error("File content does not match declared type (expected JPEG).");
  if (mime === "image/png" && !png) throw new Error("File content does not match declared type (expected PNG).");
  if (mime === "image/webp" && !webp) throw new Error("File content does not match declared type (expected WEBP).");
  return { buffer, ext: MIME_EXT[mime] ?? "jpg" };
}

function saveFile(userId: number, suffix: string, buffer: Buffer, ext: string, previousPath?: string | null): string {
  if (previousPath) {
    try { fs.unlinkSync(previousPath); } catch { /* already gone */ }
  }
  const filename = `user_${userId}_${suffix}_${Date.now()}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

function serveImage(res: any, filePath: string, cacheable = false): void {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "jpg";
  res.setHeader("Content-Type", EXT_MIME[ext] ?? "application/octet-stream");
  res.setHeader("Cache-Control", cacheable ? "public, max-age=300" : "private, no-store");
  fs.createReadStream(filePath).pipe(res);
}

// ── Profile avatar ───────────────────────────────────────────────────────────

// POST /profile/avatar — upload a profile photo
router.post("/profile/avatar", requireAuth, async (req, res): Promise<void> => {
  const { imageBase64 } = req.body ?? {};
  if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.length > 12 * 1024 * 1024) {
    res.status(400).json({ error: "imageBase64 (data-URL, max 8 MB) is required" });
    return;
  }
  let parsed: { buffer: Buffer; ext: string };
  try {
    parsed = parseImageBase64(imageBase64, 8 * 1024 * 1024);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }
  const [user] = await db.select({ avatarPath: usersTable.avatarPath, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const avatarPath = saveFile(req.userId!, "avatar", parsed.buffer, parsed.ext, user.avatarPath);
  await db.update(usersTable).set({ avatarPath, updatedAt: new Date() }).where(eq(usersTable.id, req.userId!));

  // Update Stream user image so chat partners see the new photo.
  // Store a relative URL with cache-buster; the client prefixes its API base.
  const imageUrl = `avatars/${req.userId}?v=${Date.now()}`;
  try {
    const key = process.env.STREAM_API_KEY;
    const secret = process.env.STREAM_API_SECRET;
    if (key && secret) {
      await StreamChat.getInstance(key, secret).upsertUser({ id: String(req.userId!), name: user.name, image: imageUrl });
    }
  } catch (err) {
    console.error("[profile] Stream avatar upsert failed:", err);
  }

  res.json({ ok: true, avatarUrl: `/${imageUrl}` });
});

// DELETE /profile/avatar — remove the profile photo
router.delete("/profile/avatar", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select({ avatarPath: usersTable.avatarPath, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.avatarPath) { try { fs.unlinkSync(user.avatarPath); } catch { /* gone */ } }
  await db.update(usersTable).set({ avatarPath: null, updatedAt: new Date() }).where(eq(usersTable.id, req.userId!));
  try {
    const key = process.env.STREAM_API_KEY;
    const secret = process.env.STREAM_API_SECRET;
    if (key && secret) {
      await StreamChat.getInstance(key, secret).upsertUser({ id: String(req.userId!), name: user.name, image: "" });
    }
  } catch { /* non-fatal */ }
  res.json({ ok: true });
});

// GET /avatars/:userId — serve a user's profile photo.
// Intentionally public (no auth): rendered via <img> tags by chat partners,
// which cannot attach Authorization headers. Avatars are low-sensitivity.
router.get("/avatars/:userId", async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const [user] = await db.select({ avatarPath: usersTable.avatarPath }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.avatarPath || !fs.existsSync(user.avatarPath)) {
    res.status(404).json({ error: "No avatar" });
    return;
  }
  serveImage(res, user.avatarPath, true);
});

// ── Chat wallpaper ───────────────────────────────────────────────────────────

// GET /profile/chat-background — current wallpaper choice
router.get("/profile/chat-background", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select({ chatBackground: usersTable.chatBackground, chatBackgroundPath: usersTable.chatBackgroundPath }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({
    background: user.chatBackground ?? "default",
    hasCustomImage: !!user.chatBackgroundPath,
  });
});

// POST /profile/chat-background — set a preset or upload a custom wallpaper
router.post("/profile/chat-background", requireAuth, async (req, res): Promise<void> => {
  const { preset, imageBase64 } = req.body ?? {};
  const [user] = await db.select({ chatBackgroundPath: usersTable.chatBackgroundPath }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (typeof imageBase64 === "string" && imageBase64.length > 0) {
    if (imageBase64.length > 16 * 1024 * 1024) {
      res.status(400).json({ error: "Image is too large. Maximum 10 MB." });
      return;
    }
    let parsed: { buffer: Buffer; ext: string };
    try {
      parsed = parseImageBase64(imageBase64, 10 * 1024 * 1024);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }
    const bgPath = saveFile(req.userId!, "chatbg", parsed.buffer, parsed.ext, user.chatBackgroundPath);
    await db.update(usersTable).set({ chatBackground: "custom", chatBackgroundPath: bgPath, updatedAt: new Date() }).where(eq(usersTable.id, req.userId!));
    res.json({ ok: true, background: "custom" });
    return;
  }

  if (typeof preset === "string" && CHAT_BG_PRESETS.has(preset)) {
    await db.update(usersTable).set({ chatBackground: preset, updatedAt: new Date() }).where(eq(usersTable.id, req.userId!));
    res.json({ ok: true, background: preset });
    return;
  }

  res.status(400).json({ error: "Provide either a valid preset or an imageBase64 upload" });
});

// GET /profile/chat-background/image — serve the user's own uploaded wallpaper
router.get("/profile/chat-background/image", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select({ chatBackgroundPath: usersTable.chatBackgroundPath }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user?.chatBackgroundPath || !fs.existsSync(user.chatBackgroundPath)) {
    res.status(404).json({ error: "No custom wallpaper" });
    return;
  }
  serveImage(res, user.chatBackgroundPath);
});

export default router;
