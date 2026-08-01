/**
 * AES-256-GCM encryption utility for sensitive fields at rest.
 *
 * Encrypted values are prefixed with "enc:" so the system can detect whether
 * a field is encrypted or still plaintext (safe to mix during migration).
 *
 * Format: enc:<base64(12-byte-IV || 16-byte-AuthTag || N-byte-ciphertext)>
 *
 * Requires env var: ENCRYPTION_KEY — exactly 64 hex characters (32 bytes).
 */

import crypto from "crypto";

const ENC_PREFIX = "enc:";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? "";
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt a plaintext string. Returns an "enc:…" base64 blob. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV — standard for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes
  // Pack: IV (12) || Tag (16) || Ciphertext (N)
  const packed = Buffer.concat([iv, tag, ciphertext]);
  return ENC_PREFIX + packed.toString("base64");
}

/** Decrypt an "enc:…" value. Returns the original plaintext. */
export function decrypt(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) {
    // Plaintext (pre-encryption migration) — return as-is
    return value;
  }
  const key = getKey();
  const packed = Buffer.from(value.slice(ENC_PREFIX.length), "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

/** Encrypt if value is non-null, otherwise return null. */
export function encryptNullable(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return encrypt(value);
}

/** Decrypt if value is non-null and encrypted, otherwise return as-is. */
export function decryptNullable(value: string | null | undefined): string | null {
  if (value == null) return null;
  return decrypt(value);
}
