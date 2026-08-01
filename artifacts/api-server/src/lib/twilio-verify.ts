/**
 * Twilio Verify helper — sends and checks email OTP codes.
 *
 * Two modes:
 *  1. TWILIO mode  — TWILIO_VERIFY_SERVICE_SID is set. Twilio generates the code,
 *     delivers it, and verifies it. We never store the code ourselves.
 *  2. DEV mode     — no SID. We generate and store the code in the DB.
 *     Email is not sent; the code appears in server logs (dev / admin use only).
 *
 * The calling route decides which fields to read/write in the DB.
 */

import { ReplitConnectors } from "@replit/connectors-sdk";

const VERIFY_SID = () => process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

export function isTwilioConfigured(): boolean {
  return Boolean(VERIFY_SID());
}

/**
 * Send a verification code to the given email address.
 *
 * Returns `{ sent: true }` on success or `{ sent: false, fallbackCode: string }`
 * in dev mode so the caller can store the code and surface it in logs.
 */
export async function sendVerificationCode(email: string): Promise<
  { sent: true } | { sent: false; fallbackCode: string }
> {
  const sid = VERIFY_SID();
  if (sid) {
    try {
      const connectors = new ReplitConnectors();
      const body = new URLSearchParams({ To: email, Channel: "email" });
      const res = await connectors.proxy(
        "conn_twilio_01KYXPKFKQM0S1EEN1C31QF866",
        `/v2/Services/${sid}/Verifications`,
        {
          method: "POST",
          body: body.toString(),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Twilio Verify send failed: ${res.status} ${text}`);
      }
      return { sent: true };
    } catch (err) {
      console.error("[twilio-verify] send failed, falling back to dev mode:", err);
      // Fall through to dev-mode fallback
    }
  }

  // Dev / unconfigured mode — generate code, log it, let caller store it
  const fallbackCode = String(Math.floor(100000 + Math.random() * 900000));
  console.warn(
    `[twilio-verify] DEV MODE — email verification code for ${email}: ${fallbackCode}` +
    " (set TWILIO_VERIFY_SERVICE_SID to enable real email delivery)"
  );
  return { sent: false, fallbackCode };
}

/**
 * Check a code submitted by the user.
 *
 * `storedCode` / `storedExpiry` are only used in dev mode (Twilio not configured).
 *
 * Returns `{ valid: true }` if the code is correct, `{ valid: false, reason }` otherwise.
 */
export async function checkVerificationCode(
  email: string,
  code: string,
  storedCode?: string | null,
  storedExpiry?: Date | null
): Promise<{ valid: true } | { valid: false; reason: string }> {
  const sid = VERIFY_SID();
  if (sid) {
    try {
      const connectors = new ReplitConnectors();
      const body = new URLSearchParams({ To: email, Code: code });
      const res = await connectors.proxy(
        "conn_twilio_01KYXPKFKQM0S1EEN1C31QF866",
        `/v2/Services/${sid}/VerificationChecks`,
        {
          method: "POST",
          body: body.toString(),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
      const json = (await res.json()) as { status?: string };
      if (json.status === "approved") return { valid: true };
      return { valid: false, reason: "The code is incorrect or has expired. Please try again." };
    } catch (err) {
      console.error("[twilio-verify] check failed:", err);
      // Fall through to dev-mode check (in case Twilio is temporarily down)
    }
  }

  // Dev mode — check against stored code
  if (!storedCode) return { valid: false, reason: "No verification code was issued. Please request a new one." };
  if (storedExpiry && new Date() > new Date(storedExpiry)) {
    return { valid: false, reason: "Your verification code has expired. Please request a new one." };
  }
  if (storedCode.trim() !== code.trim()) {
    return { valid: false, reason: "Incorrect verification code. Please try again." };
  }
  return { valid: true };
}
