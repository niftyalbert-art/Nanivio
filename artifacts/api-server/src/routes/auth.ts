import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, walletsTable } from "@workspace/db";
import { signToken, requireAuth } from "../middleware/auth";
import { StreamChat } from "stream-chat";
import { sendVerificationCode, checkVerificationCode } from "../lib/twilio-verify";

/** Upsert a user into Stream Chat so they're immediately searchable (non-fatal). */
async function upsertToStream(userId: number, name: string, phone?: string | null) {
  try {
    const key = process.env.STREAM_API_KEY;
    const secret = process.env.STREAM_API_SECRET;
    if (!key || !secret) return;
    const client = StreamChat.getInstance(key, secret);
    await client.upsertUser({ id: String(userId), name, ...(phone ? { phone } : {}) });
  } catch { /* non-fatal */ }
}

const router: IRouter = Router();

const PIN_RE = /^\d{4}$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

// POST /auth/signup
router.post("/auth/signup", async (req, res): Promise<void> => {
  const { name, email, phone, pin } = req.body ?? {};

  if (!name || !email || !pin) {
    res.status(400).json({ error: "name, email, and pin are required" });
    return;
  }
  if (typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: "Name must be at least 2 characters" });
    return;
  }
  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }
  if (phone !== undefined && phone !== "" && !PHONE_RE.test(String(phone).trim())) {
    res.status(400).json({ error: "Phone number must be 7–15 digits (e.g. +971501234567)" });
    return;
  }
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const normalizedPhone = phone ? String(phone).trim() : null;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing) {
    // If the user exists but is unverified, allow re-sending the code
    if (!existing.emailVerified) {
      const result = await sendVerificationCode(normalizedEmail);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await db.update(usersTable)
        .set({
          emailVerificationCode: !result.sent ? result.fallbackCode : null,
          emailVerificationExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existing.id));
      const r2 = await sendVerificationCode(normalizedEmail);
      const expiresAt2 = new Date(Date.now() + 15 * 60 * 1000);
      await db.update(usersTable)
        .set({
          emailVerificationCode: !r2.sent ? r2.fallbackCode : null,
          emailVerificationExpiresAt: expiresAt2,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existing.id));
      res.status(200).json({
        requiresVerification: true,
        email: normalizedEmail,
        message: "A verification code has been sent to your email.",
        ...(!r2.sent && { devCode: r2.fallbackCode }),
      });
      return;
    }
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  if (normalizedPhone) {
    const [phoneExists] = await db.select().from(usersTable).where(eq(usersTable.phone, normalizedPhone));
    if (phoneExists) {
      res.status(409).json({ error: "An account with this phone number already exists" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(pin, 10);

  const [user] = await db.insert(usersTable).values({
    name: String(name).trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    passwordHash,
    plainPin: null,
    emailVerified: false,  // must verify before logging in
  }).returning();

  // Create default AED wallet
  await db.insert(walletsTable).values({
    userId: user.id,
    currencyCode: "AED",
    currencyName: "UAE Dirham",
    balance: "0",
    flag: "🇦🇪",
  });

  // Upsert into Stream (non-blocking)
  upsertToStream(user.id, user.name, user.phone);

  // Send verification code
  const result = await sendVerificationCode(normalizedEmail);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.update(usersTable)
    .set({
      emailVerificationCode: !result.sent ? result.fallbackCode : null,
      emailVerificationExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id));

  // Return verification required — no token yet.
  // In dev mode (Twilio not configured) surface the code so the user can complete sign-up.
  res.status(201).json({
    requiresVerification: true,
    email: normalizedEmail,
    message: "Account created. Please check your email for a verification code.",
    ...(!result.sent && { devCode: result.fallbackCode }),
  });
});

// POST /auth/verify-email
router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const { email, code } = req.body ?? {};

  if (!email || !code) {
    res.status(400).json({ error: "email and code are required" });
    return;
  }
  if (!/^\d{6}$/.test(String(code).trim())) {
    res.status(400).json({ error: "Code must be 6 digits" });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  if (!user) {
    res.status(404).json({ error: "No account found with this email." });
    return;
  }
  if (user.emailVerified) {
    // Already verified — just log them in
    const token = signToken({ userId: user.id, email: user.email, name: user.name });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    return;
  }

  const check = await checkVerificationCode(
    normalizedEmail,
    String(code).trim(),
    user.emailVerificationCode,
    user.emailVerificationExpiresAt ? new Date(user.emailVerificationExpiresAt) : null,
  );

  if (!check.valid) {
    res.status(400).json({ error: check.reason });
    return;
  }

  // Mark verified, clear code
  await db.update(usersTable)
    .set({
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id));

  const token = signToken({ userId: user.id, email: user.email, name: user.name });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// POST /auth/resend-verification
router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email) { res.status(400).json({ error: "email is required" }); return; }

  const normalizedEmail = String(email).toLowerCase().trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  // Always return success to prevent user enumeration
  if (!user || user.emailVerified) {
    res.json({ message: "If this account exists and is unverified, a new code has been sent." });
    return;
  }

  // Rate-limit: don't resend more than once per minute
  if (user.emailVerificationExpiresAt) {
    const issuedAt = new Date(user.emailVerificationExpiresAt).getTime() - 15 * 60 * 1000;
    const elapsed = Date.now() - issuedAt;
    if (elapsed < 60_000) {
      res.status(429).json({ error: "Please wait a moment before requesting another code." });
      return;
    }
  }

  const result = await sendVerificationCode(normalizedEmail);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.update(usersTable)
    .set({
      emailVerificationCode: !result.sent ? result.fallbackCode : null,
      emailVerificationExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id));

  res.json({
    message: "A new verification code has been sent to your email.",
    ...(!result.sent && { devCode: result.fallbackCode }),
  });
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, pin } = req.body ?? {};

  if (!email || !pin) {
    res.status(400).json({ error: "email and pin are required" });
    return;
  }
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  if (!user) {
    res.status(401).json({ error: "Invalid email or PIN" });
    return;
  }

  const valid = await bcrypt.compare(pin, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or PIN" });
    return;
  }

  // Block login if email not verified
  if (!user.emailVerified) {
    // Silently resend a fresh code so they can verify immediately
    const result = await sendVerificationCode(normalizedEmail);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.update(usersTable)
      .set({
        emailVerificationCode: !result.sent ? result.fallbackCode : null,
        emailVerificationExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    const loginResult = await sendVerificationCode(normalizedEmail);
    const loginExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await db.update(usersTable)
      .set({
        emailVerificationCode: !loginResult.sent ? loginResult.fallbackCode : null,
        emailVerificationExpiresAt: loginExpiry,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    res.status(403).json({
      error: "EMAIL_NOT_VERIFIED",
      message: "Please verify your email address before signing in. We've sent a new code.",
      email: normalizedEmail,
      ...(!loginResult.sent && { devCode: loginResult.fallbackCode }),
    });
    return;
  }

  upsertToStream(user.id, user.name, user.phone);

  const token = signToken({ userId: user.id, email: user.email, name: user.name });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// POST /auth/forgot-password
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email) { res.status(400).json({ error: "email is required" }); return; }

  const normalizedEmail = String(email).toLowerCase().trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  if (!user) {
    res.json({ message: "If this email is registered, a reset code has been sent." });
    return;
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await db.update(usersTable)
    .set({ resetOtp: otp, resetOtpExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  res.json({ message: "If this email is registered, a reset code has been sent." });
});

// POST /auth/reset-password
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { email, otp, pin } = req.body ?? {};

  if (!email || !otp || !pin) {
    res.status(400).json({ error: "email, otp, and pin are required" });
    return;
  }
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  if (!user || !user.resetOtp || !user.resetOtpExpiresAt) {
    res.status(400).json({ error: "Invalid or expired reset code" });
    return;
  }
  if (user.resetOtp !== String(otp).trim()) {
    res.status(400).json({ error: "Invalid or expired reset code" });
    return;
  }
  if (new Date() > new Date(user.resetOtpExpiresAt)) {
    res.status(400).json({ error: "Reset code has expired. Please request a new one." });
    return;
  }

  const passwordHash = await bcrypt.hash(pin, 10);

  await db.update(usersTable)
    .set({ passwordHash, plainPin: null, resetOtp: null, resetOtpExpiresAt: null, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  res.json({ message: "PIN updated successfully. You can now log in." });
});

// POST /auth/change-pin (protected)
router.post("/auth/change-pin", requireAuth, async (req, res): Promise<void> => {
  const { currentPin, newPin } = req.body ?? {};

  if (!currentPin || !newPin) {
    res.status(400).json({ error: "currentPin and newPin are required" });
    return;
  }
  if (typeof newPin !== "string" || !PIN_RE.test(newPin)) {
    res.status(400).json({ error: "New PIN must be exactly 4 digits" });
    return;
  }
  if (typeof currentPin !== "string" || !PIN_RE.test(currentPin)) {
    res.status(400).json({ error: "Current PIN must be exactly 4 digits" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const valid = await bcrypt.compare(currentPin, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "Current PIN is incorrect" }); return; }
  if (currentPin === newPin) { res.status(400).json({ error: "New PIN must be different from current PIN" }); return; }

  const passwordHash = await bcrypt.hash(newPin, 10);
  await db.update(usersTable).set({ passwordHash, plainPin: null, updatedAt: new Date() }).where(eq(usersTable.id, req.userId!));

  res.json({ message: "PIN changed successfully" });
});

// GET /auth/me (protected)
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const initials = user.name.split(" ").map((p: string) => p[0] ?? "").join("").toUpperCase().slice(0, 2) || "U";
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarInitials: initials,
    memberSince: user.createdAt instanceof Date ? user.createdAt.toISOString().split("T")[0] : String(user.createdAt).split("T")[0],
  });
});

export default router;
