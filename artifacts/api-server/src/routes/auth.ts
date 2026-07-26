import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, walletsTable } from "@workspace/db";
import { signToken, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const PIN_RE = /^\d{4}$/;

// POST /auth/signup
router.post("/auth/signup", async (req, res): Promise<void> => {
  const { name, email, pin } = req.body ?? {};

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
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(pin, 10);

  const [user] = await db.insert(usersTable).values({
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash,
    plainPin: pin,
  }).returning();

  // Create default AED wallet for new user
  await db.insert(walletsTable).values({
    userId: user.id,
    currencyCode: "AED",
    currencyName: "UAE Dirham",
    balance: "0",
    flag: "🇦🇪",
  });

  const token = signToken({ userId: user.id, email: user.email, name: user.name });

  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
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

  const token = signToken({ userId: user.id, email: user.email, name: user.name });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// POST /auth/forgot-password
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  // Always return success to prevent user enumeration
  if (!user) {
    res.json({ message: "If this email is registered, a reset code has been generated." });
    return;
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  await db.update(usersTable)
    .set({ resetOtp: otp, resetOtpExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  // In production: send email. For now OTP is visible in admin panel.
  res.json({ message: "If this email is registered, a reset code has been generated." });
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
    .set({ passwordHash, plainPin: pin, resetOtp: null, resetOtpExpiresAt: null, updatedAt: new Date() })
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
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await bcrypt.compare(currentPin, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current PIN is incorrect" });
    return;
  }

  if (currentPin === newPin) {
    res.status(400).json({ error: "New PIN must be different from current PIN" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPin, 10);
  await db.update(usersTable).set({ passwordHash, plainPin: newPin, updatedAt: new Date() }).where(eq(usersTable.id, req.userId!));

  res.json({ message: "PIN changed successfully" });
});

// GET /auth/me (protected)
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
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
