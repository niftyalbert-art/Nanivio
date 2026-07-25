import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, walletsTable } from "@workspace/db";
import { signToken, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// POST /auth/signup
router.post("/auth/signup", async (req, res): Promise<void> => {
  const { name, email, password } = req.body ?? {};

  if (!name || !email || !password) {
    res.status(400).json({ error: "name, email, and password are required" });
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
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  const [user] = await db.insert(usersTable).values({
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash,
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
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(String(password), user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
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
  const { email, otp, password } = req.body ?? {};

  if (!email || !otp || !password) {
    res.status(400).json({ error: "email, otp, and password are required" });
    return;
  }
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
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

  const passwordHash = await bcrypt.hash(String(password), 10);

  await db.update(usersTable)
    .set({ passwordHash, resetOtp: null, resetOtpExpiresAt: null, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  res.json({ message: "Password updated successfully. You can now log in." });
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
