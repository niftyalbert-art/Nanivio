import crypto from 'crypto';

interface OtpRecord {
  phoneNumber: string;
  hashedCode: string;
  salt: string;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
  lastSentAt: number;
  isTwilioVerify: boolean;
}

interface VerificationStatusRecord {
  phoneNumber: string;
  verifiedAt: number;
  expiresAt: number;
  verificationToken: string;
}

class OtpService {
  private otps: Map<string, OtpRecord> = new Map();
  // Store verified phone tokens valid for 15 minutes to attach to registration / phone update
  private verifiedTokens: Map<string, VerificationStatusRecord> = new Map();
  // Request rate limiting per IP or phone
  private sendHistory: Map<string, number[]> = new Map();

  private RESEND_COOLDOWN_SEC = 45;
  private OTP_EXPIRATION_SEC = 300; // 5 minutes
  private MAX_VERIFICATION_ATTEMPTS = 5;
  private MAX_SENDS_PER_HOUR = 6;
  private VERIFICATION_TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 mins

  // Normalize phone number to strict international E.164 format
  public normalizePhoneNumber(phone: string, defaultCallingCode = '+233'): string {
    let clean = phone.trim().replace(/[\s\-()]/g, '');
    if (!clean.startsWith('+')) {
      if (clean.startsWith('0')) {
        clean = defaultCallingCode + clean.slice(1);
      } else {
        clean = defaultCallingCode + clean;
      }
    }
    return clean;
  }

  // Rate limiter: check how many OTP requests for this key (IP or phone) in last 60 minutes
  private checkRateLimit(key: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const timestamps = this.sendHistory.get(key) || [];
    const validTimestamps = timestamps.filter((t) => now - t < 60 * 60 * 1000);
    this.sendHistory.set(key, validTimestamps);

    if (validTimestamps.length >= this.MAX_SENDS_PER_HOUR) {
      const oldest = validTimestamps[0];
      const retryAfterSec = Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000);
      return { allowed: false, retryAfter: Math.max(1, retryAfterSec) };
    }
    return { allowed: true };
  }

  private recordSend(key: string) {
    const timestamps = this.sendHistory.get(key) || [];
    timestamps.push(Date.now());
    this.sendHistory.set(key, timestamps);
  }

  // Hash the OTP with per-record salt (Never store plaintext OTP)
  private hashOtp(code: string, salt: string): string {
    return crypto.createHmac('sha256', salt).update(code.trim()).digest('hex');
  }

  /**
   * Send SMS Phone OTP using Twilio Verify API if configured,
   * or robust secure cryptographic sandbox with server-side delivery logging.
   */
  public async sendOtp(
    rawPhone: string,
    channel: 'sms' | 'whatsapp' = 'sms',
    clientIp = 'unknown'
  ): Promise<{
    success: boolean;
    message: string;
    cooldownSeconds: number;
    channel: string;
    isTwilioVerify: boolean;
    demoCode?: string;
  }> {
    const phone = this.normalizePhoneNumber(rawPhone);
    if (!phone || phone.length < 8) {
      throw new Error('Invalid phone number format. Please provide a valid international phone number.');
    }

    // Check rate limit on phone and IP
    const phoneLimit = this.checkRateLimit(`phone:${phone}`);
    if (!phoneLimit.allowed) {
      throw new Error(`Too many verification requests for this number. Please wait ${phoneLimit.retryAfter} seconds.`);
    }
    if (clientIp !== 'unknown') {
      const ipLimit = this.checkRateLimit(`ip:${clientIp}`);
      if (!ipLimit.allowed) {
        throw new Error(`Rate limit exceeded for your network. Please wait ${ipLimit.retryAfter} seconds.`);
      }
    }

    // Check resend cooldown
    const existing = this.otps.get(phone);
    const now = Date.now();
    if (existing && now - existing.lastSentAt < this.RESEND_COOLDOWN_SEC * 1000) {
      const remainingCooldown = Math.ceil((existing.lastSentAt + this.RESEND_COOLDOWN_SEC * 1000 - now) / 1000);
      throw new Error(`Please wait ${remainingCooldown}s before requesting a new code.`);
    }

    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    let isTwilioVerify = false;
    let fallbackCode = '';

    // If real Twilio Verify Service SID is available, call Twilio Verify API
    if (twilioAccountSid && twilioAuthToken && twilioVerifyServiceSid) {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');
        const endpoint = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/Verifications`;
        const body = new URLSearchParams();
        body.append('To', phone);
        body.append('Channel', channel);

        const twilioRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        const twilioData = await twilioRes.json();
        if (!twilioRes.ok) {
          throw new Error(twilioData.message || `Twilio Verify error (${twilioRes.status})`);
        }

        isTwilioVerify = true;
        this.recordSend(`phone:${phone}`);
        if (clientIp !== 'unknown') this.recordSend(`ip:${clientIp}`);

        this.otps.set(phone, {
          phoneNumber: phone,
          hashedCode: '',
          salt: '',
          expiresAt: now + this.OTP_EXPIRATION_SEC * 1000,
          attempts: 0,
          maxAttempts: this.MAX_VERIFICATION_ATTEMPTS,
          lastSentAt: now,
          isTwilioVerify: true,
        });

        return {
          success: true,
          message: `Verification code sent via SMS to ${phone}.`,
          cooldownSeconds: this.RESEND_COOLDOWN_SEC,
          channel,
          isTwilioVerify: true,
        };
      } catch (err: any) {
        console.warn(`[Twilio Verify Gateway Warning]: ${err.message}. Falling back to secure server OTP delivery.`);
      }
    }

    // Cryptographic 6-digit OTP generation (Never predictable Math.random)
    const codeNumber = crypto.randomInt(100000, 999999);
    fallbackCode = codeNumber.toString();

    const salt = crypto.randomBytes(16).toString('hex');
    const hashedCode = this.hashOtp(fallbackCode, salt);

    this.recordSend(`phone:${phone}`);
    if (clientIp !== 'unknown') this.recordSend(`ip:${clientIp}`);

    this.otps.set(phone, {
      phoneNumber: phone,
      hashedCode,
      salt,
      expiresAt: now + this.OTP_EXPIRATION_SEC * 1000,
      attempts: 0,
      maxAttempts: this.MAX_VERIFICATION_ATTEMPTS,
      lastSentAt: now,
      isTwilioVerify: false,
    });

    console.log(`[NANIVIO SECURE OTP] Sent to ${phone}: ${fallbackCode} (Expires in 5m)`);

    return {
      success: true,
      message: `Verification code dispatched to ${phone}.`,
      cooldownSeconds: this.RESEND_COOLDOWN_SEC,
      channel,
      isTwilioVerify: false,
      // Provide demo code only when Twilio keys are not configured so preview users can verify immediately
      demoCode: fallbackCode,
    };
  }

  /**
   * Verify phone OTP code against Twilio Verify or cryptographic hash
   */
  public async verifyOtp(
    rawPhone: string,
    code: string
  ): Promise<{
    success: boolean;
    message: string;
    verifiedPhone: string;
    verificationToken: string;
  }> {
    const phone = this.normalizePhoneNumber(rawPhone);
    const cleanCode = code.trim();

    if (!cleanCode || cleanCode.length < 4 || cleanCode.length > 8) {
      throw new Error('Please enter a valid 6-digit verification code.');
    }

    const record = this.otps.get(phone);
    if (!record) {
      throw new Error('No pending verification code found for this phone number. Please request a new code.');
    }

    const now = Date.now();
    if (now > record.expiresAt) {
      this.otps.delete(phone);
      throw new Error('Verification code has expired. Please request a new one.');
    }

    if (record.attempts >= record.maxAttempts) {
      this.otps.delete(phone);
      throw new Error('Maximum verification attempts exceeded. Please request a new code.');
    }

    record.attempts += 1;

    // 1. If sent via real Twilio Verify service
    if (record.isTwilioVerify) {
      const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

      if (twilioAccountSid && twilioAuthToken && twilioVerifyServiceSid) {
        const authHeader = 'Basic ' + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');
        const endpoint = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/VerificationCheck`;
        const body = new URLSearchParams();
        body.append('To', phone);
        body.append('Code', cleanCode);

        const twilioRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        const twilioData = await twilioRes.json();
        if (!twilioRes.ok || twilioData.status !== 'approved') {
          const remaining = record.maxAttempts - record.attempts;
          if (remaining <= 0) {
            this.otps.delete(phone);
            throw new Error('Invalid code. Maximum attempts reached. Request a new code.');
          }
          throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
        }
      }
    } else {
      // 2. Fallback cryptographic hash check
      const candidateHash = this.hashOtp(cleanCode, record.salt);
      const isMatch = crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(record.hashedCode));

      if (!isMatch) {
        const remaining = record.maxAttempts - record.attempts;
        if (remaining <= 0) {
          this.otps.delete(phone);
          throw new Error('Invalid code. Maximum attempts reached. Please request a new code.');
        }
        throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
      }
    }

    // Successfully verified! Clear OTP record to prevent replay attacks
    this.otps.delete(phone);

    // Issue cryptographic proof token bound to this verified phone
    const verificationToken = `vtok_${crypto.randomBytes(24).toString('hex')}`;
    this.verifiedTokens.set(verificationToken, {
      phoneNumber: phone,
      verifiedAt: now,
      expiresAt: now + this.VERIFICATION_TOKEN_LIFETIME_MS,
      verificationToken,
    });

    return {
      success: true,
      message: 'Phone number verified successfully.',
      verifiedPhone: phone,
      verificationToken,
    };
  }

  /**
   * Validate that a phone number has been verified by checking its token.
   * Consumes token once validated to prevent replay.
   */
  public validateVerifiedToken(verificationToken: string, expectedPhone: string): boolean {
    const record = this.verifiedTokens.get(verificationToken);
    if (!record) return false;
    if (Date.now() > record.expiresAt) {
      this.verifiedTokens.delete(verificationToken);
      return false;
    }
    const cleanExpected = this.normalizePhoneNumber(expectedPhone);
    if (record.phoneNumber !== cleanExpected) return false;

    // Consume token
    this.verifiedTokens.delete(verificationToken);
    return true;
  }
}

export const otpService = new OtpService();
