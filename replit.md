# Nivio — Global Money Transfer PWA

Nivio is a UAE-based global money transfer web app (Wise/Revolut-style), built as a mobile-first PWA.

## Project overview

- **Frontend** (`artifacts/nifty-pay`) — React + Vite + Tailwind + shadcn/ui. Registered at path `/`.
- **API server** (`artifacts/api-server`) — Express 5 + Drizzle ORM, listens on `PORT` (default 8080).
- **Database** (`lib/db`) — Shared Drizzle schema + Postgres client.
- **Monorepo** — pnpm workspace at root.

## Architecture

### Authentication
- JWT (30-day) stored in `localStorage` under `nivio_token`.
- Signed with `SESSION_SECRET` env var using `jsonwebtoken`.
- Passwords hashed with `bcryptjs`.
- `setAuthTokenGetter` (from `lib/api-client-react`) is called in `contexts/auth.tsx` so every generated API client call auto-attaches the `Authorization: Bearer` header.

### User flow
- Unauthenticated users see: Login → Signup → Forgot Password → Reset Password.
- Authenticated users see the full app (Dashboard, Send, Wallets, Transactions, Deposit, Withdraw, Account).
- `/admin` and `/install` are always accessible (no user auth required on the page itself — admin logs in with a password form).

### Admin authentication
- Admin panel uses a server-side JWT login: operator visits `/admin`, enters the `ADMIN_PASSWORD` env var value, gets an 8-hour JWT stored in `sessionStorage`.
- `POST /api/admin/login` validates the password and issues the token. No static key is embedded in client code.
- All `/admin/*` API routes are protected by `adminOnly` middleware (verifies the admin Bearer JWT).

### Data isolation
- All user-facing API routes require `requireAuth` middleware and filter by `req.userId`.
- Admin routes require `adminOnly` middleware (separate admin JWT, role: "admin").

### Settings (admin-configurable)
- `send_fee_percent` — global send fee override (blank = use per-currency fee from exchange_rates).
- `whatsapp_link`, `telegram_link`, `support_hours` — shown on the user's Account → Support tab.

### Forgot-password flow
- `POST /api/auth/forgot-password` generates a 6-digit OTP stored in the `users` table.
- Admin Settings → "Pending Resets" shows active OTPs so support can relay them manually until email is wired up.
- `POST /api/auth/reset-password` validates OTP + sets new password.

## User preferences
- Keep the existing mobile-first, dark-theme Nivio design.
- No Zod in `api-server` — esbuild can't resolve `zod/v4`; validation is manual.
- Admin password is set via the `ADMIN_PASSWORD` environment variable (configure via Replit Secrets).
