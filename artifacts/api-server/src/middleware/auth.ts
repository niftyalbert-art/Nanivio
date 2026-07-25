import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Fail hard on missing SESSION_SECRET — never fall back to a predictable value
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required but not set");
}
const JWT_SECRET = process.env.SESSION_SECRET;

export interface AuthPayload {
  userId: number;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userEmail?: string;
      userName?: string;
    }
  }
}

// ── User auth ─────────────────────────────────────────────────────────────
export function signToken(payload: AuthPayload): string {
  return (jwt as any).sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return (jwt as any).verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const payload = verifyToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.userId = payload.userId;
  req.userEmail = payload.email;
  req.userName = payload.name;
  next();
}

// ── Admin auth ────────────────────────────────────────────────────────────
// Admin tokens carry { role: "admin" } and never expose user credentials.
export function signAdminToken(): string {
  return (jwt as any).sign({ role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
}

export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = (jwt as any).verify(header.slice(7), JWT_SECRET) as any;
    if (payload?.role !== "admin") throw new Error("not admin");
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
