import express, { type Express } from "express";
import cors from "cors";
import pinoHttp = require("pino-http");
import rateLimit = require("express-rate-limit");
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the first hop (Replit's reverse proxy) so rate-limit keys on the real
// client IP rather than the shared proxy address.
app.set("trust proxy", 1);

// ── Rate limiting ─────────────────────────────────────────────────────────────

/** Global fallback: 3000 requests per 15 minutes per IP.
 * The app polls several endpoints every few seconds per open tab, so a real
 * user easily exceeds a low ceiling; this guards against floods, not usage. */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  // Admin surface is exempt — admins must never be throttled or locked out.
  skip: (req) => req.path.startsWith("/admin") || req.path.startsWith("/api/admin"),
});

/** Auth routes (login, signup, password reset): 10 requests per 15 minutes per IP */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
});

/** Transaction & withdrawal routes: 20 requests per 15 minutes per IP */
const transactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many transfer requests, please slow down." },
});

// Admin routes are intentionally NOT rate limited: the dashboard polls many
// endpoints continuously and admins must never be locked out. Access is
// protected by the admin JWT plus per-section access keys instead.

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// KYC submit carries a base64-encoded document — 8 MB binary → ~10.7 MB base64 — so
// this route needs a larger body limit. Apply it BEFORE the global parser so Express
// honours the per-route limit (once a body parser runs, subsequent ones are skipped).
app.use("/api/kyc/submit", express.json({ limit: "25mb" }));
// Profile avatar (8 MB binary) and chat wallpaper (10 MB binary) arrive as
// base64 data-URLs (~+33% overhead), so these routes need larger JSON bodies.
app.use("/api/profile/avatar", express.json({ limit: "12mb" }));
app.use("/api/profile/chat-background", express.json({ limit: "15mb" }));
app.use("/api/admin/wallpapers", express.json({ limit: "15mb" })); // 8 MB image ≈ 10.7 MB base64
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Apply tiered rate limits before routing
app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/transactions", transactionLimiter);
app.use("/api/withdrawals", transactionLimiter);
app.use("/api/kyc", transactionLimiter);
app.use("/api/crypto", transactionLimiter);

app.use("/api", router);

export default app;
