import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the first hop (Replit's reverse proxy) so rate-limit keys on the real
// client IP rather than the shared proxy address.
app.set("trust proxy", 1);

// ── Rate limiting ─────────────────────────────────────────────────────────────

/** Global fallback: 100 requests per 15 minutes per IP */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
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

/** Admin routes: 30 requests per 15 minutes per IP */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many admin requests, please try again later." },
});

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
app.use("/api/kyc/submit", express.json({ limit: "12mb" }));
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
app.use("/api/admin", adminLimiter);
app.use("/api/kyc", transactionLimiter);
app.use("/api/crypto", transactionLimiter);
app.use("/api/admin/crypto", adminLimiter);

app.use("/api", router);

export default app;
