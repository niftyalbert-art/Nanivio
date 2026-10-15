import express from "express";
import http from "http";
import path from "path";
import crypto from "crypto";
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import dotenv from "dotenv";
import {
  setupRealtimeServer,
  getActiveConnectedUsersList,
  broadcastStreamChatMessage,
  broadcastStreamReaction,
  canJoinAgoraCall,
} from "./src/server/realtimeServer.ts";
import {
  generateAgoraRtcToken,
  registerAgoraParticipant,
  removeAgoraParticipant,
  getActiveAgoraChannels,
} from "./src/server/agoraService.ts";
import {
  generateStreamUserToken,
  getActiveStreamChannels,
  getStreamChannel,
  upsertStreamChannel,
  getStreamMessages,
  addStreamMessage,
  toggleStreamReaction,
  getStreamEventLogs,
  requireStreamChannelMember,
  removeStreamChannelMember,
  moderateStreamChannelMember,
} from "./src/server/streamService.ts";
import { requireActiveChatAccount, requireStreamWebhookSignature, StreamAccessError } from "./src/server/chatPrivacy.ts";
import { billingDb } from "./src/server/billingDb.ts";
import { normalizedBillingEnabled, transferFintechToCommunication as persistentFintechToCommunication, transferPeerToPeer as persistentPeerToPeer, selectCommunicationPlanPersistent, purchaseCommunicationMinutesPersistent, activateMalviSubscriptionPersistent, recordLangpretationUsagePersistent, paystackTopUpPersistent, getPersistentPayment, getPersistentSubscription, getPersistentTransactions, getPersistentInvoices, getPersistentWallets, getPersistentCreditAccount, getPersistentUsageMeter, getPersistentMalviSubscription, getMalviCreditAccount, ensureMalviEntitlement, recordMalviUsagePersistent } from "./src/server/normalizedBillingRepository.ts";
import { hydrateBillingDatabase, flushBillingDatabase, closeBillingPersistence, savePaystackOrder, getPaystackOrder, markPaystackOrderFulfilled, claimPaystackWebhook, isPersistentBillingConfigured, markBillingDatabaseDirty } from "./src/server/billingPersistence.ts";
import { billingEngine } from "./src/server/billingEngine.ts";
import { requireBillingAdmin, billingAdminActor, canRefund, ownsBillingRecord, ownsProviderEarnings, ownsBusinessBilling } from "./src/server/billingAccess.ts";
import { getPersistentInvoice } from "./src/server/normalizedBillingRepository.ts";
import { authDb } from "./src/server/authDb.ts";
import * as persistentAuth from "./src/server/persistentAuth.ts";
import { productionStatus } from "./src/server/productionStatus.ts";
import { callKhayaEngine, callSunbirdEngine } from "./src/server/translationProviders.ts";
import { translateWithProductionProviders, translationProviderConfigured } from "./src/server/translationRouter.ts";
import { planTranslation, requireLanguage, speechProvider } from "./src/lib/translator-engine/languagePlan.ts";
import { speechConfigured, SpeechProviderError, transcribeProviderAudio, synthesizeProviderAudio } from "./src/server/speechProviders.ts";
import { createSetupPreview, rejectSetupRealtime } from "./src/server/setupPreview.ts";
import { getServerSupabase } from "./src/server/supabaseServer.ts";
import { otpService } from "./src/server/otpService.ts";
import {
  telecomGateway,
  CARRIER_ROUTING_TABLE,
  DEFAULT_GLOBAL_ROUTE,
} from "./src/server/telecomGatewayService.ts";
import {
  NANIVIO_18_LANGUAGES,
  getAll18LanguagesCapabilityList,
  getLanguageCapability,
  AUTHORITATIVE_18_LANG_CODES,
  MatrixLanguageInfo,
} from "./src/lib/translator-engine/matrix/universal18Matrix.ts";
import type {
  BillingTransaction,
  BillingInvoice,
  BillingPromotionalCredit,
  BillingDispute,
  AdminBillingRole,
} from "./src/types/billing.ts";
import {
  detectUserLocationProfile,
  rankLocationMatchedServices,
} from "./src/utils/geoMatchingAlgorithm.ts";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({
  limit: "15mb",
  verify: (req, _res, buf) => {
    (req as any).rawBody = Buffer.from(buf);
  },
}));

// Lazy Google GenAI Client with Telemetry
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// In-Memory Database / Server-Authoritative State
const adminFeatureSwitches = {
  freeCallsForAllUsers: process.env.NANIVIO_FREE_CALLS === 'true',
  audioCallsEnabled: process.env.NANIVIO_AUDIO_CALLS_ENABLED === 'true',
  videoCallsEnabled: process.env.NANIVIO_VIDEO_CALLS_ENABLED === 'true',
  liveAdsEnabled: process.env.NANIVIO_LIVE_ADS_ENABLED === 'true',
  liveServicesEnabled: process.env.NANIVIO_LIVE_SERVICES_ENABLED === 'true',
  expertsEnabled: process.env.NANIVIO_EXPERTS_ENABLED === 'true',
  langpretationEnabled: process.env.NANIVIO_LANGPRETATION_ENABLED === 'true',
  voiceNoteLangpretationEnabled: process.env.NANIVIO_VOICE_LANGPRETATION_ENABLED === 'true',
  groupAudioEnabled: process.env.NANIVIO_GROUP_AUDIO_ENABLED === 'true',
  groupVideoEnabled: process.env.NANIVIO_GROUP_VIDEO_ENABLED === 'true',
  groupLangpretationEnabled: process.env.NANIVIO_GROUP_LANGPRETATION_ENABLED === 'true',
  paidCallsEnabled: false,
  b2bPremiumEnabled: process.env.NANIVIO_B2B_ENABLED === 'true',
  fintechEnabled: process.env.NANIVIO_FINTECH_ENABLED === 'true',
  maintenanceMode: process.env.NANIVIO_MAINTENANCE_MODE === 'true',
  allowPaidAdCollapse: process.env.NANIVIO_PAID_AD_COLLAPSE === 'true',
};

const adminPricingEngine = {
  langpretationPerMinuteRateUSD: Number(process.env.LANGPRETATION_RATE_USD || 0),
  langpretationPerMinuteRateGHS: Number(process.env.LANGPRETATION_RATE_GHS || 0),
  voiceNoteLangpretationRateGHS: Number(process.env.VOICE_NOTE_LANGPRETATION_RATE_GHS || 0),
  platformExpertCommissionPercent: Number(process.env.EXPERT_COMMISSION_PERCENT || 0),
  b2bSeatMonthlyRateUSD: Number(process.env.B2B_SEAT_MONTHLY_USD || 0),
  fintechTransferFeePercent: Number(process.env.FINTECH_TRANSFER_FEE_PERCENT || 0),
  freeTierLangpretationMinutes: Number(process.env.FREE_LANGPRETATION_MINUTES || 0),
};

// Fallback high-fidelity dictionaries for fast low-latency preview & African languages like Twi (Akan), Yoruba, Swahili, French, Spanish
// No canned translation dictionary is used in production. All translations come from configured providers.


const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  ar: "Arabic",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  zh: "Mandarin Chinese",
  ja: "Japanese",
  ko: "Korean",
  sw: "Swahili",
  lg: "Luganda",
  ak: "Twi / Akan (Ghana)",
  "tw-ak": "Akuapem Twi (Ghana)",
  fat: "Fante (Ghana)",
  ee: "Ewe (Ghana)",
  gaa: "Ga (Ghana)",
  ha: "Hausa",
};

// API Routes
app.get("/api/production/status", (_req, res) => { res.json(productionStatus()); });

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "Nanivio",
    version: "2.5.0",
    geminiConfigured: !!process.env.GEMINI_API_KEY,
  });
});

// ============================================================================
// NANIVIO AUTHENTICATION & ROLE-BASED ACCESS CONTROL MIDDLEWARE
// ============================================================================
async function getAuthUser(req: express.Request) {
  const authHeader = req.headers.authorization;
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7).trim();
  else if (req.headers["x-nanivio-token"]) token = String(req.headers["x-nanivio-token"]).trim();
  else if (req.query.token) token = String(req.query.token).trim();
  if (!token) return null;
  const adminTokenUser = persistentAuth.adminFromToken(token);
  if (adminTokenUser) return adminTokenUser;
  if (await persistentAuth.persistentAuthConfigured()) {
    const user = await persistentAuth.userFromToken(token);
    if (user) return user;
    return null;
  }
  if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_PERSISTENT_AUTH === 'true') return null;
  return authDb.validateSession(token);
}

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const masterKeyHeader = req.headers["x-admin-master-key"];
  if (masterKeyHeader) {
    try {
      const { user } = authDb.authenticateWithMasterKey(String(masterKeyHeader));
      (req as any).adminUser = user;
      return next();
    } catch {
      // Fallback to standard token validation
    }
  }

  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      error: "Access denied. Administrative authorization required.",
      code: "ADMIN_FORBIDDEN",
    });
  }
  (req as any).adminUser = user;
  next();
}

async function requireAuthenticatedUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required.", code: "AUTH_REQUIRED" });
    }
    (req as any).authUser = user;
    next();
  } catch {
    return res.status(503).json({ success: false, error: "Authentication is temporarily unavailable.", code: "AUTH_UNAVAILABLE" });
  }
}

function authenticatedUserId(req: express.Request): string {
  const user = (req as any).authUser;
  if (!user?.id) throw new Error("Authenticated user is required");
  return user.id;
}

// ----------------------------------------------------------------------------
// AUTHENTICATION API ENDPOINTS
// ----------------------------------------------------------------------------

// Phone OTP verification (Twilio Verify / Cryptographic Sandbox)
app.post("/api/auth/phone/otp/send", async (req, res) => {
  try {
    const { phoneNumber, channel } = req.body;
    const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown";
    const result = await otpService.sendOtp(phoneNumber, channel || "sms", clientIp);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || "Failed to send verification code." });
  }
});

app.post("/api/auth/phone/otp/verify", async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    const result = await otpService.verifyOtp(phoneNumber, code);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || "Failed to verify code." });
  }
});

// 1. Personal User Registration -> Generates permanent NV User ID
app.post("/api/auth/register/personal", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      displayName,
      email,
      phoneNumber,
      country,
      callingCode,
      preferredLanguage,
      password,
      avatar,
      state,
      city,
      constituency,
      districtOrMunicipality,
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "First name, last name, email, and password are required.",
      });
    }

    const result = await persistentAuth.registerPersonal({
      firstName,
      lastName,
      displayName,
      email,
      phoneNumber,
      country,
      callingCode,
      preferredLanguage,
      password,
      avatar,
      state,
      city,
      constituency,
      districtOrMunicipality,
    });

    return res.json({
      success: true,
      message: "Personal account created successfully.",
      nvId: result.user.nvId,
      user: result.user,
      session: result.session,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || "Failed to register personal user." });
  }
});

// 2. Join as Expert Application -> Generates NV User ID & PENDING status
app.post("/api/auth/register/expert", async (req, res) => {
  try {
    const { personal, ...expertData } = req.body;
    if (!personal?.email || !personal?.password || !expertData?.title || !expertData?.category) {
      return res.status(400).json({
        success: false,
        error: "Personal credentials, professional title, and category are required.",
      });
    }

    const result = await persistentAuth.registerExpert({
      personal,
      ...expertData,
    });

    return res.json({
      success: true,
      message: "Expert application submitted successfully. Verification status: PENDING.",
      nvId: result.user.nvId,
      user: result.user,
      expertApp: result.expertApp,
      session: result.session,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || "Failed to register expert." });
  }
});

// 3. Register Business / Organization -> Generates Business NV ID & PENDING status
app.post("/api/auth/register/business", async (req, res) => {
  try {
    const { personal, businessName, businessType, category, ...bizData } = req.body;
    if (!businessName || !businessType || !personal?.email || !personal?.password) {
      return res.status(400).json({
        success: false,
        error: "Business name, business type, and authorized credentials are required.",
      });
    }

    const result = await persistentAuth.registerBusiness({
      personal,
      businessName,
      businessType,
      category: category || "Enterprise Commerce",
      ...bizData,
    });

    return res.json({
      success: true,
      message: "Business application submitted successfully. Verification status: PENDING.",
      nvId: result.user.nvId,
      businessNvId: result.businessApp.businessNvId,
      user: result.user,
      businessApp: result.businessApp,
      session: result.session,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || "Failed to register business." });
  }
});

// 3b. Register Driver Partner Application -> Generates NV User ID & PENDING status
app.post("/api/auth/register/driver", async (req, res) => {
  try {
    const { personal, ...driverData } = req.body;
    if (!personal?.email || !personal?.password || !driverData?.plateNumber) {
      return res.status(400).json({
        success: false,
        error: "Personal credentials and vehicle plate number are required.",
      });
    }

    const result = await persistentAuth.registerDriver({
      personal,
      ...driverData,
    });

    return res.json({
      success: true,
      message: "Driver application submitted successfully. Verification status: PENDING.",
      nvId: result.user.nvId,
      user: result.user,
      driverApp: result.driverApp,
      session: result.session,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || "Failed to register driver." });
  }
});

// 4. Sign In (Accepts Email, Phone Number, or NV User ID + Password)
app.post("/api/auth/signin", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: "Please enter your Email, Phone Number, or NV User ID and password.",
      });
    }

    const result = await persistentAuth.signIn(identifier, password);
    return res.json({
      success: true,
      message: "Signed in successfully.",
      user: result.user,
      session: result.session,
    });
  } catch (err: any) {
    return res.status(401).json({ success: false, error: err.message || "Sign in failed." });
  }
});

// 4b. Admin Master Key Gateway Authentication
app.post("/api/admin/auth/master-key", async (req, res) => {
  try {
    const { masterKey, token, key } = req.body;
    const providedKey = (masterKey || token || key || "").toString().trim();

    if (!providedKey) {
      return res.status(400).json({
        success: false,
        error: "Master administrative authorization key is required.",
      });
    }

    if (await persistentAuth.persistentAuthConfigured()) {
      const session = persistentAuth.createAdminSession(providedKey);
      return res.json({ success:true, message:"Super Admin authorized via Master Key.", user:session.user, session });
    }
    const result = authDb.authenticateWithMasterKey(providedKey);
    return res.json({ success:true, message:"Super Admin authorized via Master Key.", user:result.user, session:result.session });
  } catch (err: any) {
    return res.status(401).json({
      success: false,
      error: err.message || "Invalid administrative master authorization key.",
    });
  }
});

// 5. Sign Out
app.post("/api/auth/signout", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : req.body?.token;
  if (token) {
    if (!(await persistentAuth.persistentAuthConfigured())) authDb.signOut(token);
  }
  return res.json({ success: true, message: "Signed out successfully." });
});

// 6. Get Current Authenticated Session User
app.get("/api/auth/session", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ success: false, user: null, authenticated: false });
  }
  return res.json({ success: true, user, authenticated: true });
});

// 7. Password Recovery Request
app.post("/api/auth/recovery", async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ success: false, error: "Identifier is required." });
    if (await persistentAuth.persistentAuthConfigured()) {
      const result = await persistentAuth.requestPasswordRecovery(identifier);
      return res.json({ success: true, ...result });
    }
    if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_PERSISTENT_AUTH === 'true') return res.status(503).json({success:false,error:'Persistent authentication is required.'});
    const result = authDb.requestPasswordRecovery(identifier);
    return res.json({ success: true, ...result });
  } catch (err: any) { return res.status(400).json({ success: false, error: err.message || "Account recovery failed." }); }
});

// 8. Password Reset with Token
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, accessToken, newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ success:false, error:'New password is required.' });
    if (await persistentAuth.persistentAuthConfigured()) {
      await persistentAuth.resetPasswordWithAccessToken(accessToken || token, newPassword);
      return res.json({ success:true, message:'Password updated successfully. Please sign in.' });
    }
    if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_PERSISTENT_AUTH === 'true') return res.status(503).json({success:false,error:'Persistent authentication is required.'});
    if (!token) return res.status(400).json({ success:false, error:'Reset token is required.' });
    authDb.resetPassword(token,newPassword); return res.json({success:true,message:'Password updated successfully. Please sign in.'});
  } catch (err:any) { return res.status(400).json({success:false,error:err.message||'Password reset failed.'}); }
});

// 9. Update Profile (Preserves permanent NV User ID)
app.post("/api/auth/profile/update", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "Unauthorized session." });
    }
    const updated = await persistentAuth.updateProfile(user.id, req.body);
    return res.json({ success: true, user: updated });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || "Profile update failed." });
  }
});

// 10. Delete / Deactivate Account
app.post("/api/auth/account/delete", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "Unauthorized session." });
    }
    const { reason } = req.body;
    await persistentAuth.deleteAccount(user.id);
    return res.json({ success: true, message: "Account successfully deactivated and deleted." });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || "Account deletion failed." });
  }
});

// 11. Safety & Abuse Report Endpoint
app.post("/api/safety/report", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const { targetId, targetName, reason, details } = req.body;
    authDb.recordAuditLog({
      adminUserId: user ? user.id : 'ANONYMOUS',
      adminNvId: user ? user.nvId : 'ANONYMOUS',
      adminName: user ? user.displayName : 'Reporting User',
      action: 'SAFETY_REPORT_FILED',
      targetType: 'USER',
      targetId: targetId || 'UNKNOWN',
      targetNvId: targetId || 'UNKNOWN',
      details: { targetName, reason, details, reportedAt: Date.now() },
    });
    return res.json({ success: true, message: "Report received and queued for trust & safety review." });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || "Failed to submit report." });
  }
});

// ----------------------------------------------------------------------------
// PROTECTED ADMIN ACCESS & MANAGEMENT API ENDPOINTS
// ----------------------------------------------------------------------------

// A. Verify Admin Access
app.get("/api/admin/auth/verify", requireAdmin, (req, res) => {
  const admin = (req as any).adminUser;
  res.json({
    success: true,
    isAdmin: true,
    user: admin,
  });
});

// B. List Users (Supports Query, Role, Status filtering)
app.get("/api/admin/users", requireAdmin, async (req, res) => { try { const users=await persistentAuth.listUsers(req.query.q as string,req.query.role as string,req.query.status as string); res.json({success:true,count:users.length,users}); } catch(error:any){res.status(502).json({success:false,error:error.message});} });

// C. Search By NV User ID -> Returns Full Detailed Dossier
app.get("/api/admin/users/search-nv", requireAdmin, async (req, res) => {
  const { nvId } = req.query;
  if (!nvId) {
    return res.status(400).json({ success: false, error: "NV User ID is required for search." });
  }
  const found = await persistentAuth.findByNvId(String(nvId).trim());
  const dossier = found ? { user: found } : null;
  if (!dossier) {
    return res.status(404).json({ success: false, error: `No account found for NV ID: ${nvId}` });
  }
  return res.json({ success: true, dossier });
});

// C2. Direct NV ID Directory Lookup for Calling and Direct Chat (Public / App-Wide)
app.get("/api/users/lookup", async (req, res) => {
  const { nvId } = req.query;
  if (!nvId) {
    return res.status(400).json({ success: false, error: "Nanivio number is required." });
  }
  const clean = String(nvId).trim();
  const user = await persistentAuth.findByNvId(clean);
  if (!user) {
    return res.status(404).json({ success: false, error: `Nanivio number ${clean} does not exist or has never been registered.` });
  }
  return res.json({
    success: true,
    user: {
      id: user.id,
      nvId: user.nvId,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      preferredLanguage: user.preferredLanguage,
      country: user.country,
      role: user.role,
      accountStatus: user.accountStatus,
    }
  });
});

// D. Suspend / Reactivate / Deactivate User
app.post("/api/admin/users/status", requireAdmin, async (req, res) => {
  try {
    const admin = (req as any).adminUser;
    const { userId, status, reason } = req.body;
    if (!userId || !status) {
      return res.status(400).json({ success: false, error: "User ID and new status are required." });
    }
    const user = await persistentAuth.updateUserStatus(userId,status);
    return res.json({ success: true, user });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// D2. Grant Subscription & Langpretation Time to User (Starting from Free Trial)
app.post("/api/admin/users/grant-subscription", requireAdmin, (req, res) => {
  try {
    const admin = (req as any).adminUser;
    const { userId, nvId, tier, minutes, isTrial, notes } = req.body;

    let targetUser = userId ? authDb.getUserById(userId) : null;
    if (!targetUser && nvId) {
      targetUser = authDb.getUserByNvId(nvId);
    }
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "Target subscriber account not found." });
    }

    const result = authDb.grantSubscriptionOrMinutes(
      targetUser.id,
      tier || 'free',
      Number(minutes) || (isTrial ? 15 : 90),
      !!isTrial,
      {
        id: admin.id,
        nvId: admin.nvId,
        name: admin.displayName,
      },
      notes
    );

    return res.json({
      success: true,
      message: isTrial
        ? `15-Minute Free Trial activated for ${targetUser.displayName} (${targetUser.nvId}).`
        : `Subscription plan ${tier} granted with ${minutes} minutes for ${targetUser.displayName}.`,
      ...result,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// E. Expert Applications List
app.get("/api/admin/experts", requireAdmin, async (req,res)=>{try{const applications=await persistentAuth.listApplications("EXPERT",req.query.status as string);res.json({success:true,count:applications.length,applications});}catch(error:any){res.status(502).json({success:false,error:error.message});}});

// F. Review Expert Application (Approve, Reject, Request Info, Suspend)
app.post("/api/admin/experts/review", requireAdmin, async (req, res) => {
  try {
    const admin = (req as any).adminUser;
    const { appId, action, notes } = req.body;
    if (!appId || !action) {
      return res.status(400).json({ success: false, error: "Application ID and review action are required." });
    }
    const expertApp = await persistentAuth.reviewApplication(appId,action,notes);
    return res.json({ success: true, expertApp });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// G. Toggle Expert Featured / Live Services Visibility
app.post("/api/admin/experts/featured", requireAdmin, (req, res) => {
  try {
    const admin = (req as any).adminUser;
    const { appId, featured } = req.body;
    const expertApp = authDb.toggleExpertFeatured(appId, !!featured, {
      id: admin.id,
      nvId: admin.nvId,
      name: admin.displayName,
    });
    return res.json({ success: true, expertApp });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// H. Business Applications List
app.get("/api/admin/businesses", requireAdmin, async (req,res)=>{try{const applications=await persistentAuth.listApplications("BUSINESS",req.query.status as string);res.json({success:true,count:applications.length,applications});}catch(error:any){res.status(502).json({success:false,error:error.message});}});

// I. Review Business Application (Approve, Reject, Request Info, Suspend)
app.post("/api/admin/businesses/review", requireAdmin, async (req, res) => {
  try {
    const admin = (req as any).adminUser;
    const { appId, action, notes } = req.body;
    if (!appId || !action) {
      return res.status(400).json({ success: false, error: "Application ID and review action are required." });
    }
    const businessApp = await persistentAuth.reviewApplication(appId,action,notes);
    return res.json({ success: true, businessApp });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// I2. Driver Applications List
app.get("/api/admin/drivers", requireAdmin, async (req,res)=>{try{const applications=await persistentAuth.listApplications("DRIVER",req.query.status as string);res.json({success:true,count:applications.length,applications});}catch(error:any){res.status(502).json({success:false,error:error.message});}});

// I3. Review Driver Application (Approve, Reject, Request Info, Suspend)
app.post("/api/admin/drivers/review", requireAdmin, async (req, res) => {
  try {
    const admin = (req as any).adminUser;
    const { appId, action, notes } = req.body;
    if (!appId || !action) {
      return res.status(400).json({ success: false, error: "Application ID and review action are required." });
    }
    const driverApp = await persistentAuth.reviewApplication(appId,action,notes);
    return res.json({ success: true, driverApp });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// J. Admin Audit Logs Query
app.get("/api/admin/audit-logs", requireAdmin, (req, res) => {
  const { limit, targetNvId, action } = req.query;
  const logs = authDb.getAuditLogs(
    limit ? parseInt(String(limit)) : 100,
    targetNvId as string,
    action as string
  );
  res.json({ success: true, count: logs.length, logs });
});

// K. Public Dynamic Live Services Experts Endpoint (Combines verified registered experts)
app.get("/api/services/experts/live", async (_req,res)=>{try{const experts=await persistentAuth.listApplications("EXPERT","VERIFIED");res.json({success:true,experts});}catch(error:any){res.status(502).json({success:false,error:error.message});}});

// K2. Public Dynamic Live Verified Businesses Endpoint
app.get("/api/services/businesses/live", async (_req,res)=>{try{const businesses=await persistentAuth.listApplications("BUSINESS","VERIFIED");res.json({success:true,businesses});}catch(error:any){res.status(502).json({success:false,error:error.message});}});

// K3. Nanivio Location Detection & Regional Geo-Matching Algorithm Endpoint
app.get("/api/services/geo-match", async (req, res) => {
  try {
    const { country, state, city, language, type, category, q, onlyOnline } = req.query;
    const verifiedExperts = await persistentAuth.listApplications("EXPERT","VERIFIED");
    const verifiedBusinesses = await persistentAuth.listApplications("BUSINESS","VERIFIED");

    const userProfile = detectUserLocationProfile({
      country: country as string,
      state: state as string,
      city: city as string,
      preferredLanguage: language as string,
    });

    const results = rankLocationMatchedServices(userProfile, verifiedExperts, verifiedBusinesses, {
      filterType: type as any,
      category: category as string,
      searchQuery: q as string,
      onlyOnline: onlyOnline === 'true',
    });

    res.json({
      success: true,
      userLocation: userProfile,
      count: results.length,
      results,
      totalVerifiedExperts: verifiedExperts.length,
      totalVerifiedBusinesses: verifiedBusinesses.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to execute location matching" });
  }
});

// Admin Feature Switches
app.get("/api/admin/features", requireAdmin, (_req, res) => {
  res.json(adminFeatureSwitches);
});

app.post("/api/admin/features/update", requireAdmin, (req, res) => {
  const updates = req.body;
  Object.assign(adminFeatureSwitches, updates);
  res.json({ success: true, features: adminFeatureSwitches });
});

// Admin Pricing Engine
app.get("/api/admin/pricing", requireAdmin, (_req, res) => {
  res.json(adminPricingEngine);
});

app.post("/api/admin/pricing/update", requireAdmin, (req, res) => {
  const updates = req.body;
  Object.assign(adminPricingEngine, updates);
  res.json({ success: true, pricing: adminPricingEngine });
});

// ==========================================
// REAL-TIME MULTI NANIVIO TRANSLATION ENGINE (LANGPRETATION) API
// Live Multi-Provider MT: Azure Translator, Khaya (Ghana NLP), Sunbird (East Africa), NLLB
// ==========================================

// In-memory high-speed cache for sub-10ms response times
const serverTranslationCache = new Map<string, { translatedText: string; provider: string; pivotUsed?:boolean; providerChain?:string[] }>();

// Specialized language families
const GHANAIAN_LANGUAGES = new Set(["ak", "tw-ak", "fat", "ee", "gaa", "ha"]);
const EAST_AFRICAN_LANGUAGES = new Set(["sw", "lg"]);
const INTERNATIONAL_LANGUAGES = new Set(["en", "fr", "es", "ar", "de", "it", "pt", "zh", "ja", "ko"]);

// 1:1 Translation Endpoint via Live Multi-Provider Engine
app.post("/api/translate", requireAuthenticatedUser, async (req, res) => {
  try {
    const start = Date.now();
    const { text, sourceLang = "en", targetLang = "en" } = req.body;
    if(typeof text!=='string'||text.length>5000)return res.status(400).json({success:false,error:'Translation text must be a string of at most 5000 characters.'});
    let plan;
    try{plan=planTranslation(sourceLang,targetLang);}catch{return res.status(400).json({success:false,error:'Choose a supported source and target language.'});}
    if(!plan.supported)return res.status(422).json({success:false,untranslated:true,error:plan.reason});
    if (!text || !text.trim()) {
      return res.json({ success: true, translatedText: text, sourceLang, targetLang, provider: "none", latencyMs: 0 });
    }
    if (sourceLang === targetLang) {
      return res.json({ success: true, translatedText: text, sourceLang, targetLang, provider: "direct-passthrough", latencyMs: 0 });
    }

    // Check if either language is deactivated by administrator
    const srcOverride = serverLanguageOverrides.get(sourceLang);
    const tgtOverride = serverLanguageOverrides.get(targetLang);
    if (srcOverride?.active === false || tgtOverride?.active === false) {
      return res.status(400).json({
        success: false,
        error: "One of the selected languages has been temporarily deactivated by administrator.",
      });
    }

    const cacheKey = `${sourceLang}:${targetLang}:${text.trim()}`;
    const cached = serverTranslationCache.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        translatedText: cached.translatedText,
        sourceLang,
        targetLang,
        provider: cached.provider,
        cached: true,
        latencyMs: Date.now()-start,
        pivotUsed: cached.pivotUsed,
        providerChain: cached.providerChain,
        timestamp: Date.now(),
      });
    }

    let result: Awaited<ReturnType<typeof translateWithProductionProviders>> = null;

    const isGhanaian = GHANAIAN_LANGUAGES.has(sourceLang) || GHANAIAN_LANGUAGES.has(targetLang);
    const isEastAfrican = EAST_AFRICAN_LANGUAGES.has(sourceLang) || EAST_AFRICAN_LANGUAGES.has(targetLang);
    const isInternational = INTERNATIONAL_LANGUAGES.has(sourceLang) && INTERNATIONAL_LANGUAGES.has(targetLang);

    // Production routing: Azure Translator for supported languages, Khaya/Sunbird for
    // African-specialized paths, with an English pivot when a direct African pair is unavailable.
    result = await translateWithProductionProviders(text, sourceLang, targetLang);

    // If completely unavailable, return honest untranslated status (NO FAKE PHRASES)
    if (!result || !result.text) {
      return res.status(503).json({
        success: false,
        untranslated: true,
        translatedText: text,
        sourceLang,
        targetLang,
        provider: "untranslated-passthrough",
        error: "Translation service temporarily unavailable for this language pair",
        latencyMs: Date.now() - start,
      });
    }

    const translatedText = result.text;
    const provider = result.provider;

    // Store in high-speed server cache
    serverTranslationCache.set(cacheKey, { translatedText, provider, pivotUsed:result.pivotUsed, providerChain:result.providerChain });
    if (serverTranslationCache.size > 10000) {
      const oldestKey = serverTranslationCache.keys().next().value;
      if (oldestKey) serverTranslationCache.delete(oldestKey);
    }

    return res.json({
      success: true,
      translatedText,
      sourceLang,
      targetLang,
      provider,
      pivotUsed:result.pivotUsed,
      providerChain:result.providerChain,
      latencyMs: Date.now() - start,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Translation engine error" });
  }
});

// Group Translation Fan-Out Endpoint via Multi-Provider Pipeline
app.post("/api/translate/fan-out", requireAuthenticatedUser, async (req, res) => {
  try {
    const { text, sourceLang = "en", targetLangs = [] } = req.body;
    if (typeof text!=='string'||!text.trim()||text.length>5000||!Array.isArray(targetLangs)||targetLangs.length>18) {
      return res.status(400).json({ error: "Text and targetLangs array required" });
    }

    const uniqueLangs = Array.from(new Set(targetLangs)) as string[];
    try{requireLanguage(sourceLang);uniqueLangs.forEach(requireLanguage);}catch{return res.status(400).json({success:false,error:'Unsupported language code.'});}
    const results: Record<string, string> = {};
    const failures:Record<string,string>={};

    // Parallel multi-provider routing per target language
    await Promise.all(
      uniqueLangs.map(async (lang) => {
        if (lang === sourceLang) {
          results[lang] = text;
          return;
        }

        if(serverLanguageOverrides.get(sourceLang)?.active===false||serverLanguageOverrides.get(lang)?.active===false){failures[lang]='Language deactivated.';return;}
        const translatedObj=await translateWithProductionProviders(text,sourceLang,lang).catch(()=>null);
        if(translatedObj?.text)results[lang]=translatedObj.text;
        else failures[lang]='Production translation unavailable for this pair.';
      })
    );

    res.json({
      success: Object.keys(failures).length===0,
      partialSuccess:Object.keys(results).length>0&&Object.keys(failures).length>0,
      failures,
      fanOutResults: results,
      distinctTranslationsCount: Object.keys(results).filter(lang=>lang!==sourceLang).length,
      sourceLang,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// CENTRAL LANGPRETATION ARCHITECTURE ENDPOINTS
// Multi-Provider Routing, 18-Language Matrix & Voice Notes
// ==========================================

// In-memory runtime overrides for language capabilities configured by Admin
const serverLanguageOverrides = new Map<string, Partial<MatrixLanguageInfo>>();

// 1. Authoritative 18-Language Capability Matrix
const handleLanguageMatrixRequest = async (_req: express.Request, res: express.Response) => {
  const baseList = getAll18LanguagesCapabilityList();
  const persisted = new Map<string, any>();
  try {
    if (normalizedBillingEnabled()) {
      const { data } = await getServerSupabase()!.from('nanivio_langpretation_configs').select('*');
      for (const row of data || []) persisted.set(row.code, row);
    }
  } catch (e) { console.warn('[Langpretation] capability config read failed:', e); }
  const enhancedList = baseList.map((item) => {
    const runtime = serverLanguageOverrides.get(item.code) || {};
    const row = persisted.get(item.code);
    // Administrative configuration is not evidence that an inference was verified.
    return { ...item, active:runtime.active??row?.active??item.active,
      speechRecognition:speechConfigured(item.code,'asr'),textToSpeech:speechConfigured(item.code,'tts'),
      translation:item.translation&&translationProviderConfigured(item.defaultMtProvider as any),
      lastVerified:null };
  });

  const fullCount = enhancedList.filter((l) => l.capability === "FULL" && l.active).length;
  const partialCount = enhancedList.filter((l) => l.capability === "PARTIAL" && l.active).length;
  const africanCount = enhancedList.filter((l) => l.isAfrican).length;

  res.json({
    success: true,
    languages: enhancedList,
    totalCount: enhancedList.length,
    fullDuplexStreamingCount: fullCount,
    specializedTurnBasedCount: partialCount,
    africanLanguagesCount: africanCount,
    timestamp: Date.now(),
  });
};
app.get("/api/langpretation/matrix", handleLanguageMatrixRequest);
app.get("/api/langpretation/languages", handleLanguageMatrixRequest);

// 2. Dynamic Capability-Based Route Resolver
app.post("/api/langpretation/route", requireAuthenticatedUser, (req, res) => {
  try {
    const { sourceLang = "en", targetLang = "ak", mode = "CALL" } = req.body;
    const srcCap = { ...getLanguageCapability(sourceLang), ...(serverLanguageOverrides.get(sourceLang) || {}) };
    const tgtCap = { ...getLanguageCapability(targetLang), ...(serverLanguageOverrides.get(targetLang) || {}) };

    if (!srcCap.active || !tgtCap.active) {
      return res.json({
        success: true,
        sourceLang,
        targetLang,
        mode,
        capabilityStatus: "UNAVAILABLE",
        canExecuteRealtimeAudio: false,
        canExecuteVoiceNote: false,
        reason: "One or both selected languages have been deactivated by administrator.",
      });
    }

    if (sourceLang === targetLang) {
      return res.json({
        success: true,
        sourceLang,
        targetLang,
        mode,
        capabilityStatus: "FULL",
        asrProvider: srcCap.asrProvider,
        mtProvider: "DIRECT_PASSTHROUGH",
        ttsProvider: tgtCap.ttsProvider,
        realtimeStrategy: "PASSTHROUGH_NO_TRANSLATION",
        fallbackProvider: "NONE",
        requiresPivot: false,
        canExecuteRealtimeAudio: true,
        canExecuteVoiceNote: true,
      });
    }

    const plan=planTranslation(sourceLang,targetLang);
    const configured=plan.supported&&plan.hops.every(h=>translationProviderConfigured(h.provider));
    const asrConfigured=speechConfigured(sourceLang,'asr'),ttsConfigured=speechConfigured(targetLang,'tts');
    res.json({
      success: true,
      sourceLang,
      targetLang,
      mode,
      capabilityStatus:!configured?'UNAVAILABLE':'NOT_VERIFIED',
      asrProvider:plan.asrProvider,mtProvider:plan.hops.map(h=>h.provider).join('+')||'UNAVAILABLE',ttsProvider:plan.ttsProvider,
      realtimeStrategy:'PIPELINE_STT_MT_TTS',fallbackProvider:'NONE',
      requiresPivot:plan.requiresPivot,pivotLanguage:plan.requiresPivot?'en':undefined,
      translationConfigured:configured,asrConfigured,ttsConfigured,
      canExecuteRealtimeAudio:configured&&asrConfigured&&ttsConfigured,
      canExecuteVoiceNote:configured&&asrConfigured&&ttsConfigured,
      estimatedLatencyMs:null,liveVerified:false,reason:plan.reason||(!configured?'Required translation provider credentials are missing.':null),
    });
  } catch (err: any) {
    res.status(400).json({ success:false,error:'Choose supported source and target languages.' });
  }
});

// 3. Admin Language Capability & Provider Reconfiguration
app.post("/api/langpretation/admin/update-language", requireAdmin, async (req, res) => {
  try {
    const { code, active, provider, capability, mtProvider, ttsProvider } = req.body;
    if (!code || !AUTHORITATIVE_18_LANG_CODES.includes(code)) {
      return res.status(400).json({ error: `Valid 18-language code required. Given: ${code}` });
    }

    const existing = serverLanguageOverrides.get(code) || {};
    const updated: Partial<MatrixLanguageInfo> = {
      ...existing,
      ...(active !== undefined ? { active: !!active } : {}),
      ...(provider ? { provider } : {}),
      ...(capability ? { capability } : {}),
      ...(mtProvider ? { mtProvider } : {}),
      ...(ttsProvider ? { ttsProvider } : {}),
      lastVerified: Date.now(),
    };

    serverLanguageOverrides.set(code, updated);
    if (normalizedBillingEnabled()) {
      const { error } = await getServerSupabase()!.from('nanivio_langpretation_configs').upsert({
        code, active: updated.active ?? true, provider: updated.provider ?? null, capability: updated.capability ?? null,
        mt_provider: updated.mtProvider ?? null, tts_provider: updated.ttsProvider ?? null, updated_at: new Date().toISOString(),
      }, { onConflict: 'code' });
      if (error) return res.status(503).json({ success:false, error:`Unable to persist Langpretation configuration: ${error.message}` });
    }

    // Audit log
    authDb.recordAuditLog({
      adminUserId: "usr_admin_001",
      adminNvId: "0486000001",
      adminName: "Super Admin",
      action: "LANGPRETATION_LANGUAGE_RECONFIGURED",
      targetType: "SYSTEM",
      targetId: `lang_${code}`,
      targetNvId: `LANG-${code.toUpperCase()}`,
      details: updated,
    });

    res.json({
      success: true,
      code,
      updatedConfig: updated,
      message: `Langpretation configuration updated for ${code.toUpperCase()}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Langpretation Voice Note Pipeline Endpoint (Speech -> Translate -> Synthesize)
app.post("/api/langpretation/voice-note/process", requireAuthenticatedUser, async (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    const { transcript, sourceLang = "en", targetLang = "ak", duration = 3 } = req.body;
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: "Transcript is required for voice note processing" });
    }

    const start = Date.now();
    let translatedTranscript = transcript;
    let provider = "direct-passthrough";

    if (sourceLang !== targetLang) {
      const isGhanaian = GHANAIAN_LANGUAGES.has(sourceLang) || GHANAIAN_LANGUAGES.has(targetLang);
      const isEastAfrican = EAST_AFRICAN_LANGUAGES.has(sourceLang) || EAST_AFRICAN_LANGUAGES.has(targetLang);

      let engineResult: { text: string; provider: string } | null = null;
      if (isGhanaian) {
        engineResult = await callKhayaEngine(transcript, sourceLang, targetLang);
      } else if (isEastAfrican) {
        engineResult = await callSunbirdEngine(transcript, sourceLang, targetLang);
      } else {
        engineResult = await translateWithProductionProviders(transcript, sourceLang, targetLang);
      }


      if (engineResult) {
        translatedTranscript = engineResult.text;
        provider = engineResult.provider;
      } else {
        return res.status(503).json({success:false,error:"Translation provider unavailable for this language pair."});
      }
    }

    const minsUsed = Number((duration / 60).toFixed(2)) || 0.1;
    const usage = normalizedBillingEnabled()
      ? await recordLangpretationUsagePersistent({ userId, channel:"VOICE_NOTE", minutes:minsUsed, sourceLang, targetLang, provider, audioSeconds:Number(duration)*60 })
      : null;
    if (!usage) return res.status(503).json({ success:false, error:"Persistent billing database is required for voice-note usage." });

    res.json({
      success: true,
      originalTranscript: transcript,
      translatedTranscript,
      sourceLang,
      targetLang,
      duration,
      provider,
      latencyMs: Date.now() - start,
      usage,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Real Khaya ASR endpoint for Ghanaian/African speech input.
// Khaya API v3 accepts raw audio bytes and returns a structured transcription.
app.post("/api/langpretation/asr", requireAuthenticatedUser, async (req, res) => {
  try {
    const suppliedLanguage = String(req.query.language || req.body?.language || "ak");
    const language=({twi:'ak',atw:'tw-ak',ewe:'ee',hau:'ha',eng:'en'} as Record<string,string>)[suppliedLanguage]||suppliedLanguage;

    const contentType = String(req.headers["content-type"] || "audio/wav");
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const audio = Buffer.concat(chunks);
    if (!audio.length) return res.status(400).json({ success:false, error:"Audio body is required." });

    const recognized=await transcribeProviderAudio(audio,language,contentType);
    res.json({success:true,...recognized,language});
  } catch (err:any) {
    res.status(err instanceof SpeechProviderError?err.status:400).json({success:false,error:err instanceof SpeechProviderError?err.message:'Invalid speech request.'});
  }
});

// Production voice-note audio pipeline: raw audio -> ASR -> MT -> provider TTS -> audio response.
// This endpoint intentionally accepts raw audio and never treats a client transcript as proof of speech.
app.post("/api/langpretation/voice-note/process-audio", requireAuthenticatedUser, async (req, res) => {
  try {
    if(!normalizedBillingEnabled())return res.status(503).json({success:false,error:'Persistent billing is required for translated voice notes.'});
    const sourceLang=String(req.query.sourceLang || req.headers["x-source-language"] || "en");
    const targetLang=String(req.query.targetLang || req.headers["x-target-language"] || "ak");
    const contentType=String(req.headers["content-type"] || "audio/wav");
    const chunks:Buffer[]=[]; for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
    const audio=Buffer.concat(chunks); if(!audio.length) return res.status(400).json({success:false,error:"Raw audio body is required."});

    const recognized=await transcribeProviderAudio(audio,sourceLang,contentType);
    const transcript=recognized.text,asrProvider=recognized.provider;
    if(!transcript.trim()) return res.status(502).json({success:false,error:"ASR returned no transcription."});

    const translated=sourceLang===targetLang ? {text:transcript,provider:"direct-passthrough"} : await translateWithProductionProviders(transcript,sourceLang,targetLang);
    if(!translated?.text) return res.status(503).json({success:false,error:"No production translation route is available for this language pair."});

    const durationSeconds=recognized.durationSeconds;
    if(!durationSeconds)throw new SpeechProviderError(400,'A WAV recording with measurable duration is required.');
    const synthesized=await synthesizeProviderAudio(translated.text,targetLang);
    const usage=await recordLangpretationUsagePersistent({userId:authenticatedUserId(req),channel:"VOICE_NOTE",minutes:durationSeconds/60,sourceLang,targetLang,provider:`${asrProvider}+${translated.provider}+${synthesized.provider}`,audioSeconds:durationSeconds});
    return res.json({success:true,sourceLang,targetLang,transcript,translatedTranscript:translated.text,asrProvider,translationProvider:translated.provider,...synthesized,usage,requiresSynthesis:false});
  } catch(err:any){ return res.status(err instanceof SpeechProviderError?err.status:500).json({success:false,error:err instanceof SpeechProviderError?err.message:"Voice-note pipeline failed"}); }
});

// Malvi production voice input: raw PCM/WAV -> provider ASR. No browser transcript is trusted.
app.post("/api/malvi/voice/transcribe", requireAuthenticatedUser, async (req, res) => {
  try {
    const language = String(req.query.language || req.headers["x-language"] || "en");
    if (normalizedBillingEnabled()) await ensureMalviEntitlement(authenticatedUserId(req));
    const contentType = String(req.headers["content-type"] || "audio/wav").split(";")[0];
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const audio = Buffer.concat(chunks);
    if (!audio.length) return res.status(400).json({ success:false, error:"Audio body is required." });

    const recognized=await transcribeProviderAudio(audio,language,contentType);
    return res.json({success:true,...recognized,language});
  } catch(err:any) { return res.status(err instanceof SpeechProviderError?err.status:400).json({success:false,error:err instanceof SpeechProviderError?err.message:'Invalid Malvi speech request.'}); }
});

// 5. Speech Synthesis Endpoint for Langpretation Audio Generation
app.get("/api/langpretation/speech-readiness",requireAuthenticatedUser,(req,res)=>{
  try{
    const language=String(req.query.language||'en');requireLanguage(language);
    res.json({success:true,language,provider:speechProvider(language),asrConfigured:speechConfigured(language,'asr'),ttsConfigured:speechConfigured(language,'tts'),liveVerified:false});
  }catch{return res.status(400).json({success:false,error:'Unsupported speech language.'});}
});
app.post("/api/langpretation/transcribe",requireAuthenticatedUser,async(req,res)=>{
  try{
    const {language,audioBase64}=req.body;requireLanguage(language);
    if(typeof audioBase64!=='string'||audioBase64.length>5600000||!/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64))return res.status(400).json({success:false,error:'A base64 WAV recording is required.'});
    const audio=Buffer.from(audioBase64,'base64');
    const recognized=await transcribeProviderAudio(audio,language,'audio/wav');
    res.json({success:true,...recognized,language});
  }catch(error){res.status(error instanceof SpeechProviderError?error.status:400).json({success:false,error:error instanceof SpeechProviderError?error.message:'Invalid speech recognition request.'});}
});
app.post("/api/langpretation/synthesize", requireAuthenticatedUser, async (req, res) => {
  try {
    const { text, language = "en", purpose = "LANGPRETATION" } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Text string is required for speech synthesis" });

    const synthesized=await synthesizeProviderAudio(text,language);
    const {audioBase64,provider,contentType}=synthesized;

    let usage = null;
    if (purpose === "MALVI") {
      if(!synthesized.durationSeconds)throw new SpeechProviderError(502,'Provider audio duration could not be measured for usage recording.');
      usage = await recordMalviUsagePersistent(authenticatedUserId(req), synthesized.durationSeconds, { sourceLang: language, targetLang: language, provider, purpose: "MALVI_VOICE_RESPONSE" });
    }
    res.json({success:true,text,language,provider,audioBase64,contentType,timestamp:Date.now(),usage});
  } catch (err:any) { res.status(err instanceof SpeechProviderError?err.status:500).json({success:false,error:err instanceof SpeechProviderError?err.message:'Speech synthesis failed'}); }
});

// 5. Langpretation Usage & Telemetry Summary Endpoint
app.get("/api/langpretation/usage-summary", requireAdmin, async (_req, res) => {
  try {
    if (!normalizedBillingEnabled()) return res.status(503).json({success:false,error:"Persistent billing database is required for production usage telemetry."});
    const { data, error } = await getServerSupabase()!.from("nanivio_usage_events")
      .select("event_id,user_id,service,source_language,target_language,provider,audio_seconds,credits_consumed,created_at,metadata")
      .eq("service", "LANGPRETATION").order("created_at", {ascending:false}).limit(1000);
    if (error) throw new Error(error.message);
    const rows:any[] = data || [];
    const totalMinutes = rows.reduce((sum,r)=>sum+Number(r.audio_seconds||0),0)/60;
    const pairCounts:Record<string,number> = {}; const providerCounts:Record<string,number> = {};
    for (const r of rows) { const pair=`${r.source_language||"?"} â†’ ${r.target_language||"?"}`; pairCounts[pair]=(pairCounts[pair]||0)+1; const pr=r.provider||"unknown"; providerCounts[pr]=(providerCounts[pr]||0)+1; }
    return res.json({success:true,totalMinutes:Number(totalMinutes.toFixed(2)),totalEvents:rows.length,topLanguagePairs:Object.entries(pairCounts).map(([pair,count])=>({pair,count})),providerBreakdown:providerCounts,recentLogs:rows.slice(0,20)});
  } catch (err:any) { return res.status(502).json({success:false,error:err.message||"Unable to load persistent usage telemetry"}); }
});

// FX rates require a real market-data provider. Hardcoded exchange rates are disabled.
app.get("/api/fintech/rates", (_req, res) => {
  return res.status(503).json({ success: false, error: "Live FX provider is not configured.", code: "FX_PROVIDER_NOT_CONFIGURED" });
});

// ==========================================
// MULTI-CARRIER TELECOM GATEWAY API
// (Twilio + Infobip)
// ==========================================

// 1. Get Telecom Gateway Configuration & Provider Statuses
app.get("/api/telecom/config", (_req, res) => {
  res.json({
    success: true,
    gateways: telecomGateway.getGatewayConfigStatus(),
    carrierRoutesCount: CARRIER_ROUTING_TABLE.length,
    defaultGlobalRoute: DEFAULT_GLOBAL_ROUTE,
  });
});

// 2. Get Full Multi-Carrier Routing Table with Live Rates & Latency
app.get("/api/telecom/routes", (_req, res) => {
  res.json({
    success: true,
    routes: CARRIER_ROUTING_TABLE,
    totalRoutes: CARRIER_ROUTING_TABLE.length,
  });
});

// 3. Test Routing Path for Any Destination Number
app.post("/api/telecom/test-routing", (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: "phoneNumber is required to test routing." });
  }
  const resolved = telecomGateway.resolveCarrierRoute(String(phoneNumber));
  res.json({
    success: true,
    input: phoneNumber,
    ...resolved,
  });
});

// 4. Initiate Outbound Real-Carrier Voice Call (PSTN / Cellular)
app.post("/api/telecom/outbound", async (req, res) => {
  try {
    const { toNumber, fromNumber, callerName, sourceLang, targetLang } = req.body;
    if (!toNumber) {
      return res.status(400).json({ error: "Destination phone number (toNumber) is required." });
    }

    const result = await telecomGateway.initiateOutboundCall({
      toNumber,
      fromNumber,
      callerName,
      sourceLang,
      targetLang,
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to initiate outbound call" });
  }
});

// 5. Inbound Voice Webhook Handler (For Africa's Talking / Twilio IVR callbacks)
app.all("/api/telecom/webhook/voice", (_req, res) => {
  return res.status(503).type("text/plain").send("Nanivio PSTN voice bridge is not configured with a production carrier workflow.");
});

// 6. Telecom Call Status Webhook (Ringing, Answered, Hangup)
app.post("/api/telecom/webhook/status", (req, res) => {
  const { CallSid, CallStatus, Duration, callId } = req.body;
  console.log(`[Telecom Status Webhook] Call ${CallSid || callId} status: ${CallStatus}, duration: ${Duration}s`);
  res.json({ success: true, received: true });
});

// ==========================================
// AGORA RTC VIDEO & AUDIO CALLING API
// ==========================================
app.get("/api/agora/config", (_req, res) => {
  const hasAppId = !!process.env.AGORA_APP_ID;
  const hasCert = !!process.env.AGORA_APP_CERTIFICATE;
  res.json({
    status: hasAppId && hasCert ? "configured" : "not_configured",
    appId: process.env.AGORA_APP_ID ? `${process.env.AGORA_APP_ID.substring(0, 6)}...` : null,
    hasCertificate: hasCert,
    supportedCodecs: ["H264", "VP8", "Opus"],
    activeChannelsCount: getActiveAgoraChannels().length,
  });
});

app.get("/api/langpretation/azure-speech-token", requireAuthenticatedUser, async (_req, res) => {
  try {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!key || !region) return res.status(503).json({ error: 'Azure Speech credentials are not configured.' });
    const r = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method:'POST', headers:{'Ocp-Apim-Subscription-Key':key}, signal:AbortSignal.timeout(5000)
    });
    if (!r.ok) return res.status(502).json({error:`Azure Speech token request failed (${r.status})`});
    res.json({ token: await r.text(), region, expiresInSeconds:540 });
  } catch (e:any) { res.status(500).json({error:e.message || 'Unable to issue Azure Speech token'}); }
});

app.post("/api/agora/token", requireAuthenticatedUser, (req, res) => {
  try {
    const { channelName, expireTimeSeconds = 3600, role: requestedRole = "publisher" } = req.body;

    if (typeof channelName !== 'string' || !channelName.trim() || channelName.length > 128) {
      return res.status(400).json({ error: "channelName is required" });
    }
    const authUser = (req as any).authUser;
    const userId = authenticatedUserId(req);
    if (channelName.startsWith('nanivio_call_') && !canJoinAgoraCall(userId, String(authUser?.nvId || ''), channelName)) {
      return res.status(403).json({ error: "You are not a connected participant in this call." });
    }

    const tokenData = generateAgoraRtcToken({
      channelName: channelName.trim(),
      uid: userId,
      role: channelName.startsWith('nanivio_call_')
        ? "publisher"
        : requestedRole === "subscriber" ? "subscriber" : "publisher",
      expireTimeSeconds,
    });

    res.json({
      success: true,
      ...tokenData,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to generate Agora token" });
  }
});

app.post("/api/agora/join", requireAuthenticatedUser, (req, res) => {
  try {
    const { channelName, callType = "video" } = req.body;
    if (typeof channelName !== 'string' || !channelName.trim() || channelName.length > 128) {
      return res.status(400).json({ error: "channelName is required" });
    }
    const authUser = (req as any).authUser;
    const userId = authenticatedUserId(req);
    if (channelName.startsWith('nanivio_call_') && !canJoinAgoraCall(userId, String(authUser?.nvId || ''), channelName)) {
      return res.status(403).json({ error: "You are not a connected participant in this call." });
    }
    const canonicalName = String(
      authUser?.displayName ||
      `${authUser?.firstName || ''} ${authUser?.lastName || ''}`.trim() ||
      authUser?.name ||
      'User'
    );
    const session = registerAgoraParticipant(channelName.trim(), callType === 'audio' ? 'audio' : 'video', {
      uid: userId,
      name: canonicalName,
      role: 'publisher',
    });
    res.json({ success: true, session });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/agora/leave", requireAuthenticatedUser, (req, res) => {
  try {
    const { channelName } = req.body;
    if (typeof channelName === 'string' && channelName.trim()) {
      removeAgoraParticipant(channelName.trim(), authenticatedUserId(req));
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/agora/channels", requireAuthenticatedUser, (_req, res) => {
  res.json({
    channels: getActiveAgoraChannels(),
    totalActiveSessions: getActiveAgoraChannels().length,
  });
});

// ==========================================
// GETSTREAM (STREAM CHAT) API
// ==========================================
app.get("/api/stream/config", requireAuthenticatedUser, requireActiveChatAccount, async (req, res) => {
  const hasKey = !!process.env.STREAM_API_KEY; const hasSecret=!!process.env.STREAM_API_SECRET;
  const channels=hasKey&&hasSecret?await getActiveStreamChannels(authenticatedUserId(req)):[];
  res.json({status:hasKey&&hasSecret?"configured":"not_configured",apiKey:hasKey?`${process.env.STREAM_API_KEY!.substring(0,6)}...`:null,hasSecret,appId:process.env.STREAM_APP_ID||null,activeChannelsCount:channels.length});
});

app.post("/api/stream/token", requireAuthenticatedUser, requireActiveChatAccount, (req, res) => {
  try {
    const authUser = (req as any).authUser;
    const { expirationSeconds } = req.body;
    const userId = authUser.id;
    const name = authUser.displayName;
    const role = String(authUser.role || 'PERSONAL').toLowerCase();

    const tokenData = generateStreamUserToken({
      userId,
      name,
      role,
      expirationSeconds,
    });

    res.json({
      success: true,
      ...tokenData,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to generate Stream token" });
  }
});

app.get("/api/stream/channels", requireAuthenticatedUser, requireActiveChatAccount, async (req, res) => {
  try { const channels = await getActiveStreamChannels(authenticatedUserId(req)); res.json({channels,totalChannels:channels.length}); }
  catch(error:any){ res.status(502).json({success:false,error:error.message||'GetStream unavailable'}); }
});

app.get("/api/stream/channels/:channelId", requireAuthenticatedUser, requireActiveChatAccount, async (req, res) => {
  try {
    const channel = await getStreamChannel(req.params.channelId, authenticatedUserId(req));
    if (!channel) return res.status(404).json({ success: false, error: "Stream channel not found" });
    res.json({ success: true, channel });
  } catch (error) {
    res.status(error instanceof StreamAccessError ? error.status : 502)
      .json({ success: false, error: error instanceof StreamAccessError ? error.message : "Stream channel unavailable." });
  }
});

app.post("/api/stream/channels", requireAuthenticatedUser, requireActiveChatAccount, async (req, res) => {
  try {
    const { id, type = "messaging", name, members = [], custom = {} } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: "Channel id and name required" });
    }
    if (!Array.isArray(members) || members.length > 100 || type !== "messaging") {
      return res.status(400).json({ success: false, error: "A private messaging channel supports up to 100 participants." });
    }
    const actor = (req as any).authUser;
    // Resolve identities and profile metadata through Nanivio authentication
    // records. Never let the request choose provider roles or pretend users exist.
    const resolvedMembers = await Promise.all([...members, { userId: actor.id }].map(async (member: any) => {
      if (!member || typeof member !== "object") throw new StreamAccessError("Invalid participant.", 400);
      let user = member.userId === actor.id ? actor : await persistentAuth.findById(String(member.userId || ""));
      if (!user && member.nvId) user = await persistentAuth.findByNvId(String(member.nvId));
      if (!user || user.accountStatus !== "ACTIVE") throw new StreamAccessError("Every participant must be an active registered Nanivio account.", 400);
      return { userId: user.id, name: user.displayName || user.firstName, avatar: user.avatar, nvId: user.nvId, language: user.preferredLanguage, role: 'member' as const };
    }));
    const uniqueMembers = [...new Map(resolvedMembers.map(member => [member.userId, member])).values()];
    if (uniqueMembers.length > 100) return res.status(400).json({ success: false, error: "Too many participants." });
    const channel = await upsertStreamChannel({
      id,
      type,
      name,
      members: uniqueMembers,
      custom,
      updatedAt: Date.now(),
    }, actor.id);
    res.json({ success: true, channel });
  } catch (error: any) {
    res.status(error instanceof StreamAccessError ? error.status : 502).json({ success: false, error: error instanceof StreamAccessError ? error.message : "Unable to create private channel." });
  }
});

app.get("/api/stream/channels/:channelId/messages", requireAuthenticatedUser, requireActiveChatAccount, async (req, res) => {
  try {
    const messages = await getStreamMessages(req.params.channelId, authenticatedUserId(req));
    res.json({ success: true, messages, count: messages.length });
  } catch (error: any) {
    res.status(error instanceof StreamAccessError ? error.status : 502).json({ success: false, error: error instanceof StreamAccessError ? error.message : "Messages unavailable." });
  }
});

app.post("/api/stream/channels/:channelId/messages", requireAuthenticatedUser, requireActiveChatAccount, async (req, res) => {
  try {
    const { channelId } = req.params;
    const authUser = (req as any).authUser;
    const userId = authUser.id;
    const userName = authUser.displayName;
    const { userAvatar, text, sourceLang = "auto", targetLang, attachments } = req.body;

    if (!text) return res.status(400).json({ error: "text is required" });
    await requireStreamChannelMember(channelId, userId);

    // Auto-translate using Nanivio Multi-Provider Langpretation Engine (Khaya, Sunbird, Azure, NLLB)
    let translatedText: string | undefined;
    if (sourceLang && targetLang && sourceLang !== targetLang) {
      try {
        const isGhanaian = GHANAIAN_LANGUAGES.has(sourceLang) || GHANAIAN_LANGUAGES.has(targetLang);
        const isEastAfrican = EAST_AFRICAN_LANGUAGES.has(sourceLang) || EAST_AFRICAN_LANGUAGES.has(targetLang);

        let candidate: { text: string; provider: string } | null = null;
        if (isGhanaian) {
          candidate = await callKhayaEngine(text, sourceLang, targetLang);
        } else if (isEastAfrican) {
          candidate = await callSunbirdEngine(text, sourceLang, targetLang);
        } else {
          candidate = await translateWithProductionProviders(text, sourceLang, targetLang);
        }


        if (candidate?.text) translatedText = candidate.text;
      } catch (e) {
        console.warn("Stream message translation unavailable:", e);
      }
      if (!translatedText) return res.status(503).json({success:false,error:"Translation provider unavailable for the requested language pair."});
    } else { translatedText = sourceLang === targetLang ? text : undefined; }

    const newMessage = await addStreamMessage(channelId, {
      id: `msg_st_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      channelId,
      userId,
      userName,
      userAvatar,
      text,
      translatedText: translatedText !== text ? translatedText : undefined,
      sourceLang,
      targetLang,
      createdAt: Date.now(),
      reactions: [],
      attachments,
    });

    // Fresh provider membership determines private realtime recipients.
    await broadcastStreamChatMessage(newMessage);

    res.json({ success: true, message: newMessage });
  } catch (error: any) {
    res.status(error instanceof StreamAccessError ? error.status : 502).json({ success: false, error: error instanceof StreamAccessError ? error.message : "Unable to send message." });
  }
});

app.post("/api/stream/channels/:channelId/reactions", requireAuthenticatedUser, requireActiveChatAccount, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { messageId, reactionType } = req.body;
    const userId = authenticatedUserId(req);
    const userName = (req as any).authUser?.displayName || "User";

    if (!messageId || !reactionType || !userId) {
      return res.status(400).json({ error: "messageId, reactionType, and userId required" });
    }

    const updated = await toggleStreamReaction(channelId, messageId, reactionType, userId, userName || "User");
    if (!updated) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Real-time broadcast of updated reaction
    await broadcastStreamReaction(channelId, updated);

    res.json({ success: true, message: updated });
  } catch (error: any) {
    res.status(error instanceof StreamAccessError ? error.status : 502).json({ success: false, error: error instanceof StreamAccessError ? error.message : "Unable to update reaction." });
  }
});

app.post("/api/stream/channels/:channelId/members/remove", requireAuthenticatedUser, requireActiveChatAccount, async (req, res) => {
  try {
    const memberId = req.body?.memberId;
    if (typeof memberId !== "string" || !memberId) return res.status(400).json({ success: false, error: "memberId is required." });
    await removeStreamChannelMember(req.params.channelId, authenticatedUserId(req), memberId);
    res.json({ success: true, removedMemberId: memberId });
  } catch (error) {
    res.status(error instanceof StreamAccessError ? error.status : 502).json({ success: false, error: error instanceof StreamAccessError ? error.message : "Unable to remove participant." });
  }
});

app.post("/api/stream/channels/:channelId/members/moderate", requireAuthenticatedUser, requireActiveChatAccount, async (req, res) => {
  try {
    const { memberId, action } = req.body || {};
    if (typeof memberId !== "string" || !memberId || !["promote", "demote"].includes(action)) return res.status(400).json({ success: false, error: "A participant and valid moderator action are required." });
    const channel = await moderateStreamChannelMember(req.params.channelId, authenticatedUserId(req), memberId, action);
    res.json({ success: true, channel });
  } catch (error) {
    res.status(error instanceof StreamAccessError ? error.status : 502).json({ success: false, error: error instanceof StreamAccessError ? error.message : "Unable to update moderator." });
  }
});

app.get("/api/stream/logs", requireAdmin, (_req, res) => {
  res.json({ logs: getStreamEventLogs() });
});

// REAL-TIME PRESENCE & USERS API
app.get("/api/realtime/active-users", requireAuthenticatedUser, requireActiveChatAccount, (_req, res) => {
  res.json({
    onlineUsers: getActiveConnectedUsersList(),
    count: getActiveConnectedUsersList().length,
    timestamp: Date.now(),
  });
});

// ==========================================
// NANIVIO UNIVERSAL BILLING & MONETIZATION API
// ==========================================

// 1. User Billing Summary & Wallet State (persistent source of truth)
app.get("/api/billing/summary", requireAuthenticatedUser, async (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    if (!normalizedBillingEnabled()) return res.status(503).json({success:false,error:"Persistent billing database is required."});
    const [communication,fintech,subscription,malviSub,malviCredit,credit,meter,recentTransactions,invoices] = await Promise.all([
      getPersistentWallets(userId,'COMMUNICATION'), getPersistentWallets(userId,'FINTECH'), getPersistentSubscription(userId), getPersistentMalviSubscription(userId), getMalviCreditAccount(userId), getPersistentCreditAccount(userId), getPersistentUsageMeter(userId), getPersistentTransactions(userId,15), getPersistentInvoices(userId,15)
    ]);
    const symbol=(c:string)=>({GHS:'GHâ‚µ',USD:'$',EUR:'â‚¬',GBP:'Â£',NGN:'â‚¦',KES:'KSh',UGX:'USh',TZS:'TSh',XOF:'CFA',XAF:'FCFA'} as any)[c]||c;
    const map=(rows:any[])=>rows.map(w=>({currency:w.currency,available:Number(w.available||0),reserved:Number(w.reserved||0),promotional:Number(w.promotional||0),symbol:symbol(w.currency)}));
    const wallets=map(communication);
    res.json({success:true,userId,accounts:{communicationAccount:{wallets,activeSubscription:subscription},fintechAccount:{wallets:map(fintech),activeSubscription:null}},subscription,malviSubscription:malviSub,malviCredit:malviCredit,langpretationMeter:{minutesUsed:meter.minutesUsed,recent:meter.recent},wallets,recentTransactions,promotionalCredits:[],activeUsageSessionsCount:0,emergencyControls:{globalBillingFreeze:false,maintenanceMode:false,disableNewCharges:false}});
  } catch(error:any){ res.status(502).json({success:false,error:error.message||"Unable to load persistent billing summary"}); }
});

// 1B. Get Strictly Separated User Financial Accounts (Communication + Fintech)
app.get("/api/billing/accounts", requireAuthenticatedUser, async (req, res) => {
  try { const userId=authenticatedUserId(req); if(!normalizedBillingEnabled()) return res.status(503).json({success:false,error:"Persistent billing database is required."}); const [communication,fintech]=await Promise.all([getPersistentWallets(userId,'COMMUNICATION'),getPersistentWallets(userId,'FINTECH')]); const symbol=(c:string)=>({GHS:'GHâ‚µ',USD:'$',EUR:'â‚¬',GBP:'Â£',NGN:'â‚¦',KES:'KSh',UGX:'USh',TZS:'TSh',XOF:'CFA',XAF:'FCFA'} as any)[c]||c; const map=(r:any[])=>r.map(w=>({currency:w.currency,available:Number(w.available||0),reserved:Number(w.reserved||0),promotional:Number(w.promotional||0),symbol:symbol(w.currency)})); res.json({success:true,accounts:{communicationAccount:{wallets:map(communication)},fintechAccount:{wallets:map(fintech)}}}); } catch(error:any){res.status(502).json({success:false,error:error.message});}
});

// 1C. Atomic Internal Transfer: Fintech Balance -> Communication Balance
app.post("/api/billing/transfer/fintech-to-communication", requireAuthenticatedUser, async (req, res) => {
  const userId = authenticatedUserId(req);
  try {
    const { amount, currency = "GHS", notes } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "A valid positive transfer amount is required." });
    }
    const result = normalizedBillingEnabled()
      ? await persistentFintechToCommunication({
      userId,
      amount: Number(amount),
      currency,
      notes,
    })
      : billingDb.transferFintechToCommunication({
        userId, amount: Number(amount), currency, notes,
      });
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to execute internal ledger transfer" });
  }
});

// 1C2. Atomic Peer-to-Peer Value Transfer
app.post("/api/billing/transfer/p2p", requireAuthenticatedUser, async (req, res) => {
  try {
    const {
      toIdentifier,
      amount,
      currency = "GHS",
      accountType = "COMMUNICATION",
      note,
    } = req.body;

    if (!toIdentifier || typeof toIdentifier !== "string" || !toIdentifier.trim()) {
      return res.status(400).json({ error: "A valid recipient identifier (NV ID, Phone, or Email) is required." });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "A valid positive transfer amount is required." });
    }

    // Resolve recipient via authDb
    const recipient = await persistentAuth.findByIdentifier(toIdentifier);
    if (!recipient) return res.status(404).json({success:false,error:"Recipient is not a registered Nanivio account."});
    const toUserId = recipient.id;
    const toUserName = `${recipient.firstName} ${recipient.lastName}`.trim();
    const toNvId = recipient.nvId;

    const fromUserId = authenticatedUserId(req);
    const sender = await persistentAuth.findById(fromUserId);
    const fromUserName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : "Account Holder";

    const result = normalizedBillingEnabled()
      ? await persistentPeerToPeer({
      fromUserId,
      fromUserName,
      toUserId,
      toUserName,
      toNvId,
      amount: Number(amount),
      currency,
      accountType,
      note,
    })
      : billingDb.transferPeerToPeer({
        fromUserId, fromUserName, toUserId, toUserName, toNvId, amount: Number(amount), currency, accountType, note,
      });

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to execute peer-to-peer transfer" });
  }
});

// 1D. Supported Payment Gateways
app.get("/api/billing/gateways", requireAuthenticatedUser, (_req,res)=>{
  const gateways = process.env.PAYSTACK_SECRET_KEY ? [{id:'gw_paystack',name:'Paystack',methodType:'CARD',provider:'PAYSTACK',supportedAccounts:['COMMUNICATION','FINTECH'],supportedCurrencies:['GHS','NGN','USD','ZAR','KES'],supportedCountries:['AFRICA'],isActive:true,processingFeePercent:0,fixedFee:0,minimumAmount:1,maximumAmount:100000,iconName:'CreditCard',description:'Server-verified Paystack checkout'}] : [];
  res.json({success:true,gateways});
});

// 1E. Mobile Money Metadata
app.get("/api/billing/momo/metadata", requireAuthenticatedUser, (_req,res)=>{
  return res.json({success:true,countries:[],networks:[],receivingAccounts:[],available:false,message:'No mobile-money settlement provider is connected. Manual/mobile-money crediting is disabled.'});
});

// 1F. Create Mobile Money Deposit Request
app.post("/api/billing/momo/deposit-request", requireAuthenticatedUser, (_req,res)=>res.status(503).json({success:false,error:'Mobile-money settlement provider is not connected. No wallet credit was created.'}));

// 1G-1H. Mobile Money requests/verification are disabled until a real settlement provider is connected.
app.get("/api/billing/momo/requests", requireAuthenticatedUser, (_req,res)=>res.json({success:true,requests:[],count:0,available:false}));
app.post("/api/billing/momo/verify", requireAdmin, (_req,res)=>res.status(503).json({success:false,error:'Mobile-money settlement provider is not connected.'}));

// 1I. External Direct Top-Up (Card, PayPal, Apple Pay, Google Pay)
app.post("/api/billing/topup", requireAuthenticatedUser, (_req, res) => {
  return res.status(410).json({
    success: false,
    error: "Direct wallet crediting is disabled. Use a verified payment gateway or an approved internal transfer.",
    code: "DIRECT_CREDIT_DISABLED",
  });
});


// ============================================================================
// PAYSTACK SERVER-SIDE SECURITY & TOP-UP ENGINE (COMMUNICATION BALANCE)
// ============================================================================
// Preserves Paystack server-side security logic:
// - All secret keys remain strictly on the backend (process.env.PAYSTACK_SECRET_KEY)
// - HMAC SHA512 signature verification for webhooks
// - Cryptographic transaction references and server-side verification
// - Directly funds Communication Balance for Langpretation & Telecom minutes
// - Zero fintech/crypto/escrow layers

const pendingPaystackOrders = new Map<string, {
  purpose: 'COMMUNICATION_TOPUP' | 'SUBSCRIPTION' | 'COMMUNICATION_MINUTES' | 'MALVI_SUBSCRIPTION';
  packageId?: string;
  planTier?: string;
  billingCycle?: 'MONTHLY' | 'ANNUAL';
  minutes?: number;
  amount: number;
  currency: string;
  userId: string;
  email: string;
  createdAt: number;
}>();

app.post("/api/paystack/initialize", requireAuthenticatedUser, async (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    const {
      amount,
      currency = "GHS",
      metadata = {},
      purpose = "COMMUNICATION_TOPUP",
      packageId,
      planTier,
      billingCycle = "MONTHLY",
      minutes,
    } = req.body;

    if (String(purpose) === "SUBSCRIPTION") {
      return res.status(400).json({
        success: false,
        error: "Communication plans are selected directly in Nanivio; Paystack is only used for top-ups, minute packs, and Malvi plans.",
      });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }
    const allowedPurposes = new Set(["COMMUNICATION_TOPUP","COMMUNICATION_MINUTES","MALVI_SUBSCRIPTION"]);
    if (!allowedPurposes.has(String(purpose))) return res.status(400).json({success:false,error:"Unsupported Paystack payment purpose."});
    const accountUser = await persistentAuth.findById(userId);
    if (!accountUser?.email) return res.status(400).json({success:false,error:"A verified email address is required for Paystack checkout."});
    const email = accountUser.email;

    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretKey) {
      return res.status(503).json({ success: false, error: "Paystack production payments are not configured on this server." });
    }
    const ref = `NV-PSTK-${Date.now()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    const amountInSubunits = Math.round(Number(amount) * 100);

    // Save order intent in server-authoritative store
    const pendingOrder = {
      purpose: purpose as any,
      packageId,
      planTier,
      billingCycle,
      minutes: minutes ? Number(minutes) : undefined,
      amount: Number(amount),
      currency,
      userId,
      email: email,
      createdAt: Date.now(),
    };
    pendingPaystackOrders.set(ref, pendingOrder);
    await savePaystackOrder(ref, userId, pendingOrder);

    if (paystackSecretKey) {
      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: amountInSubunits,
          currency,
          reference: ref,
          metadata: {
            ...metadata,
            userId,
            purpose,
            packageId,
            planTier,
            billingCycle,
            minutes,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.status) {
        return res.status(400).json({ error: data.message || "Paystack initialization failed" });
      }

      return res.json({
        success: true,
        authorization_url: data.data.authorization_url,
        access_code: data.data.access_code,
        reference: data.data.reference,
      });
    }

    return res.status(502).json({ success: false, error: "Paystack did not return a valid authorization URL." });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to initialize Paystack transaction" });
  }
});

// Fulfill Paystack order helper
async function fulfillPaystackOrder({
  reference,
  userId,
  verifiedAmount,
  verifiedCurrency,
  order,
}: {
  reference: string;
  userId: string;
  verifiedAmount: number;
  verifiedCurrency: string;
  order: any;
}) {
  if (normalizedBillingEnabled()) {
    const existingPayment = await getPersistentPayment('paystack', reference);
    if (existingPayment) {
      return { success:true, verified:true, alreadyFulfilled:true, reference, amount:verifiedAmount, currency:verifiedCurrency, message:'Paystack transaction was already fulfilled. No duplicate Nanivio value was delivered.' };
    }
  }
  const durableOrder = await getPaystackOrder(reference);
  const authoritativeOrder = durableOrder || order;
  if (!authoritativeOrder || String(authoritativeOrder.userId) !== String(userId)) {
    throw new Error("No authoritative Paystack order exists for this account/reference.");
  }
  if (authoritativeOrder.amount != null && Math.round(Number(authoritativeOrder.amount) * 100) !== Math.round(Number(verifiedAmount) * 100)) {
    throw new Error("Verified Paystack amount does not match the Nanivio order.");
  }
  if (authoritativeOrder.currency && String(authoritativeOrder.currency).toUpperCase() !== String(verifiedCurrency).toUpperCase()) {
    throw new Error("Verified Paystack currency does not match the Nanivio order.");
  }
  const purpose = authoritativeOrder.purpose || "COMMUNICATION_TOPUP";

  // 1. Communication Minutes Package Activation
  if (purpose === "COMMUNICATION_MINUTES") {
    const minutes = authoritativeOrder.minutes || 150;
    const packageId = authoritativeOrder.packageId || "comm_pkg_150";
    const pkg = billingDb.communicationMinutePackages.find((p) => p.id === packageId);
    const result = normalizedBillingEnabled()
      ? await purchaseCommunicationMinutesPersistent({
          userId, minutes, price: verifiedAmount, currency: verifiedCurrency, paymentMethod: "Paystack Payment Gateway",
          referenceId: reference, transactionId: `tx_min_${reference}`, subscriptionId: `sub_${userId}_minutes_${reference}`,
          validityDays: pkg?.validityDays || 30,
          items: [{ description: `Nanivio Communication Minutes Pack (+${minutes} Mins)`, quantity: minutes, unit: "minute", unitPrice: verifiedAmount / minutes, subtotal: verifiedAmount, total: verifiedAmount }],
        })
      : billingDb.addCommunicationMinutes({ userId, packageId, minutes, pricePaid: verifiedAmount, currency: verifiedCurrency, paymentMethod: "Paystack Payment Gateway", referenceId: reference });

    pendingPaystackOrders.delete(reference);
    await markPaystackOrderFulfilled(reference);
    return {
      success: true,
      verified: true,
      type: "COMMUNICATION_MINUTES",
      reference,
      amount: verifiedAmount,
      currency: verifiedCurrency,
      subscription: result.subscription,
      allowance: result.allowance,
      expiryDate: result.expiryDate,
      invoice: result.invoice,
      message: `Paystack payment confirmed. +${minutes} Communication Minutes activated on your account.`,
    };
  }

  // Communication plans are never fulfilled from a Paystack reference.
  if (purpose === "SUBSCRIPTION") {
    throw new Error("Communication plans are selected directly in Nanivio, not through Paystack.");
  }

  // 3. Separate Malvi Subscription Activation
  if (purpose === "MALVI_SUBSCRIPTION") {
    const tier = (authoritativeOrder.planTier as any) || "malvi_premium";
    const billingCycle = authoritativeOrder.billingCycle || "MONTHLY";
    const plan = billingDb.malviPlans.find((p) => p.tier === tier);
    if (!plan) throw new Error(`Malvi plan ${tier} is not configured.`);
    const expectedAmount = billingCycle === "ANNUAL"
      ? (verifiedCurrency === "USD" ? plan.priceAnnualUSD : plan.priceAnnualGHS)
      : (verifiedCurrency === "USD" ? plan.priceMonthlyUSD : plan.priceMonthlyGHS);
    if (Number(verifiedAmount) !== Number(expectedAmount)) throw new Error("Verified Paystack amount does not match the selected Malvi plan price.");
    const voiceMinutesAllowed = Number(plan.videoInteractionMinutesLimit || 0);
    const result = normalizedBillingEnabled()
      ? await activateMalviSubscriptionPersistent({ userId, tier, planId: plan.id, planName: plan.name, billingCycle, price: verifiedAmount, currency: verifiedCurrency, paymentMethod: "Paystack Payment Gateway", referenceId: reference, transactionId: `tx_malvi_${reference}`, videoMinutesAllowed: plan.videoInteractionMinutesLimit, voiceMinutesAllowed, metadata:{source:"paystack",planTier:tier} })
      : billingDb.activateMalviSubscription({ userId, tier, billingCycle, paymentMethod: "Paystack Payment Gateway", pricePaid: verifiedAmount, currency: verifiedCurrency, referenceId: reference });

    pendingPaystackOrders.delete(reference);
    await markPaystackOrderFulfilled(reference);
    return {
      success: true,
      verified: true,
      type: "MALVI_SUBSCRIPTION",
      reference,
      amount: verifiedAmount,
      currency: verifiedCurrency,
      subscription: result.subscription,
      invoice: result.invoice,
      message: `Paystack payment confirmed. Malvi ${result.subscription.planName} activated with ${result.subscription.videoMinutesAllowed} video companion minutes!`,
    };
  }

  // 4. Standard Communication Balance Top-Up
  if (!normalizedBillingEnabled()) {
    throw new Error("Normalized billing database is required for production Paystack wallet crediting.");
  }
  const topupResult = await paystackTopUpPersistent({ userId, amount: verifiedAmount, currency: verifiedCurrency, referenceId: reference, transactionId: `tx_pstk_${reference}`, metadata: { purpose } });

  pendingPaystackOrders.delete(reference);
  await markPaystackOrderFulfilled(reference);
  return {
    success: true,
    verified: true,
    type: "COMMUNICATION_TOPUP",
    reference,
    amount: verifiedAmount,
    currency: verifiedCurrency,
    newBalance: Number(topupResult.balanceAfter || 0),
    message: "Paystack transaction verified. Communication Balance credited successfully.",
  };
}

app.get("/api/paystack/verify/:reference", requireAuthenticatedUser, async (req, res) => {
  const userId = authenticatedUserId(req);
  try {
    const { reference } = req.params;
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretKey) return res.status(503).json({ success: false, error: "Paystack production payments are not configured." });

    let verifiedAmount = 0;
    let verifiedCurrency = "GHS";
    let isSuccess = false;
    let paystackMetadata: any = {};

    if (paystackSecretKey) {
      try {
        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
          },
        });
        const data = await response.json();
        if (response.ok && data.status && data.data?.status === "success") {
          isSuccess = true;
          verifiedAmount = data.data.amount / 100;
          verifiedCurrency = (data.data.currency || "GHS").toUpperCase();
          paystackMetadata = data.data.metadata || {};
        } else {
          return res.status(400).json({
            success: false,
            error: data.message || "Paystack transaction verification failed: Transaction not marked as successful.",
          });
        }
      } catch (e: any) {
        return res.status(500).json({ success: false, error: `Paystack API unreachable: ${e.message}` });
      }
    }

    if (isSuccess) {
      const order = pendingPaystackOrders.get(reference) || paystackMetadata || {};
      if (order.userId && String(order.userId) !== String(userId)) {
        return res.status(403).json({ success: false, error: "Payment reference does not belong to the authenticated account." });
      }
      const fulfillment = await fulfillPaystackOrder({
        reference,
        userId,
        verifiedAmount,
        verifiedCurrency,
        order,
      });
      return res.json(fulfillment);
    }

    res.status(400).json({ success: false, error: "Payment verification was unsuccessful." });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Paystack verification failed" });
  }
});

// ============================================================================
// DEDICATED COMMUNICATION MINUTES, MALVI & LIVE METER ENDPOINTS
// ============================================================================

// A. Communication Minute Packages
app.get("/api/billing/communication-minute-packages", (_req, res) => {
  res.json({
    success: true,
    packages: billingDb.communicationMinutePackages,
  });
});

app.post("/api/billing/communication-minutes/purchase", requireAuthenticatedUser, async (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    const { packageId, paymentMethod = "NANIVIO_CREDIT", currency = "GHS" } = req.body;
    const pkg = billingDb.communicationMinutePackages.find((p) => p.id === packageId);
    if (!pkg) return res.status(404).json({ error:"Communication minute package not found" });
    if (!normalizedBillingEnabled()) return res.status(503).json({ success:false, error:"Persistent billing database is required for communication-minute purchases." });
    const price = currency === "USD" ? pkg.priceUSD : pkg.priceGHS;
    if (paymentMethod !== "NANIVIO_CREDIT") return res.status(503).json({ success:false, error:"This purchase route only supports Nanivio credit. Use Paystack checkout for external payment." });
    const now=Date.now();
    const result=await purchaseCommunicationMinutesPersistent({ userId, packageId:pkg.id, subscriptionId:`minutes_${userId}_${now}_${crypto.randomBytes(4).toString("hex")}`, minutes:pkg.minutes, price, currency, validityDays:30, paymentMethod:"Nanivio credit", referenceId:`REF-NV-MIN-${now}-${crypto.randomBytes(4).toString("hex")}`, transactionId:`tx_min_${crypto.randomBytes(8).toString("hex")}`, items:[{description:`${pkg.minutes} Communication Minutes`,quantity:1,unit:"package",unitPrice:price,subtotal:price,total:price}] });
    return res.json({success:true,result});
  } catch(error:any){ return res.status(400).json({success:false,error:error.message||"Communication-minute purchase failed"}); }
});

app.get("/api/billing/malvi-plans", (_req, res) => {
  res.json({
    success: true,
    plans: billingDb.malviPlans,
  });
});

app.get("/api/billing/malvi-credit", requireAuthenticatedUser, async (req,res)=>{try{if(!normalizedBillingEnabled())return res.status(503).json({success:false,error:'Persistent billing database is required.'});const account=await getMalviCreditAccount(authenticatedUserId(req));res.json({success:true,creditBalance:Number(account.credit_balance||0),accountId:account.id});}catch(error:any){res.status(502).json({success:false,error:error.message});}});

app.get("/api/billing/malvi-subscription", requireAuthenticatedUser, async (req,res)=>{try{if(!normalizedBillingEnabled())return res.status(503).json({success:false,error:'Persistent billing database is required.'});const sub=await getPersistentMalviSubscription(authenticatedUserId(req));res.json({success:true,subscription:sub});}catch(error:any){res.status(502).json({success:false,error:error.message});}});

app.post("/api/billing/malvi-subscription/change", requireAuthenticatedUser, async (req, res) => {
  try {
    const userId=authenticatedUserId(req);
    const { tier, billingCycle="MONTHLY", paymentMethod="NANIVIO_CREDIT", currency="GHS" }=req.body;
    const plan=billingDb.malviPlans.find((p)=>p.tier===tier);
    if(!plan) return res.status(404).json({error:"Malvi subscription plan not found"});
    if(!normalizedBillingEnabled()) return res.status(503).json({success:false,error:"Persistent billing database is required for Malvi subscriptions."});
    const price=tier==="free"?0:(billingCycle==="ANNUAL"?(currency==="USD"?plan.priceAnnualUSD:plan.priceAnnualGHS):(currency==="USD"?plan.priceMonthlyUSD:plan.priceMonthlyGHS));
    if(paymentMethod!=="NANIVIO_CREDIT") return res.status(503).json({success:false,error:"Use Paystack checkout for external Malvi subscription payment."});
    const now=Date.now();
    const result=await activateMalviSubscriptionPersistent({userId,tier,billingCycle,price,currency,paymentMethod:"Nanivio credit",planId:plan.id,planName:plan.name,videoMinutesAllowed:plan.videoInteractionMinutesLimit,voiceMinutesAllowed:plan.videoInteractionMinutesLimit,referenceId:`REF-NV-MALVI-${now}-${crypto.randomBytes(4).toString("hex")}`,transactionId:`tx_malvi_${crypto.randomBytes(8).toString("hex")}`,metadata:{source:"malvi_subscription"}});
    return res.json({success:true,result});
  }catch(error:any){return res.status(400).json({success:false,error:error.message||"Malvi subscription change failed"});}
});

app.get("/api/billing/langpretation/meter", requireAuthenticatedUser, async (req,res)=>{try{if(!normalizedBillingEnabled())return res.status(503).json({success:false,error:'Persistent billing database is required.'});const meter=await getPersistentUsageMeter(authenticatedUserId(req));res.json({success:true,meter});}catch(error:any){res.status(502).json({success:false,error:error.message});}});

app.post("/api/billing/langpretation/record-usage", requireAuthenticatedUser, async (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    const { channel, minutes, sourceLang = "en", targetLang = "ak", sessionId } = req.body;
    if (!channel || !minutes || minutes <= 0) {
      return res.status(400).json({ error: "channel and positive minutes are required" });
    }

    const result = normalizedBillingEnabled()
      ? await recordLangpretationUsagePersistent({ userId, channel, minutes: Number(minutes), sourceLang, targetLang, sessionId })
      : billingDb.recordLangpretationUsage({ userId, channel, minutes: Number(minutes), sourceLang, targetLang, sessionId });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// D. Malvi Video Usage Tracking
app.post("/api/malvi/record-video-usage", requireAuthenticatedUser, async (req,res)=>{try{if(!normalizedBillingEnabled())return res.status(503).json({success:false,error:'Persistent billing database is required.'});if(Number(req.body?.seconds||0)<=0)return res.json({success:true,creditsConsumed:0});const result=await recordMalviUsagePersistent(authenticatedUserId(req),Number(req.body?.seconds||0),{sessionId:req.body?.sessionId,sourceLang:req.body?.sourceLang,targetLang:req.body?.targetLang,provider:req.body?.provider||'gemini'});res.json(result);}catch(error:any){res.status(400).json({success:false,error:error.message});}});

// E. Malvi Business Real-Time Team Collaboration AI
app.post("/api/malvi/business/collaborate", requireAuthenticatedUser, async (req, res) => {
  try {
    const {
      sessionId = `biz_session_${Date.now()}`,
      topic = "Business Strategy & Innovation",
      objective = "Collaborative Idea Clarification & Action Planning",
      participants = [],
      ideas = [],
      newIdea,
      history = [],
    } = req.body;

    if (!normalizedBillingEnabled()) return res.status(503).json({success:false,error:"Persistent Malvi Business entitlement is required."});
    const businessSubscription = await getPersistentMalviSubscription(authenticatedUserId(req));
    if (!businessSubscription || businessSubscription.tier !== "malvi_business" || businessSubscription.status !== "ACTIVE") {
      return res.status(403).json({success:false,error:"Malvi Business subscription is required for team collaboration."});
    }
    const ai = getAI();
    let analysisText = "";
    let actionItems: Array<{ id: string; task: string; owner: string; status: "pending" | "completed" }> = [];
    let contributionType: 'analysis' | 'suggestion' | 'clarification' | 'action_items' | 'summary' = 'analysis';

    if (!ai) {
      return res.status(503).json({ success: false, error: "Malvi AI is not configured. Set GEMINI_API_KEY before enabling Malvi production chat." });
    }
    {
      try {
        const teamIdeasContext = ideas.map((i: any) => `â€¢ ${i.author}: "${i.text}"`).join("\n");
        const prompt = `You are Malvi Business, an elite AI participant and strategy co-pilot joining an online collaborative business session with a live company/team.
Topic: ${topic}
Objective: ${objective}
Participating Team Members: ${participants.map((p: any) => p.name).join(", ") || "Business Team"}
Recent Team Ideas:
${teamIdeasContext || "No prior ideas submitted yet."}
Latest Team Input: "${newIdea || "Team requesting strategic briefing and next steps."}"

Provide an insightful, constructive, professional contribution that helps the team move forward.
Format your response in clean markdown with:
1. **Critical Analysis & Clarification** (1-2 sharp observations or questions to stress-test the idea)
2. **Strategic Recommendations** (Feasibility, AfCFTA trade corridor opportunities, cost/tech considerations)
3. **Action Items & Owners** (2-3 concise assignable next steps with proposed team owner)
4. **Feasibility Score**: [e.g. 88%]`;

        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt,
        });

        analysisText = response.text || "";
        contributionType = newIdea?.toLowerCase().includes("summary") ? 'summary' : 'analysis';

        // Extract action items
        actionItems = [
          {
            id: `act_${Date.now()}_1`,
            task: `Draft operational specification for ${topic}`,
            owner: participants[0]?.name || "Team Lead",
            status: "pending",
          },
          {
            id: `act_${Date.now()}_2`,
            task: "Conduct regulatory & trade corridor compliance check",
            owner: participants[1]?.name || "Legal / Finance",
            status: "pending",
          },
        ];
      } catch (geminiErr: any) {
        console.error("Malvi Business AI generation failed:", geminiErr);
        return res.status(502).json({ success: false, error: "Malvi Business AI provider failed. No simulated response was generated." });
      }
    }

    if (!analysisText) {
      return res.status(502).json({ success: false, error: "Malvi Business AI returned no content." });
    }
    /* disabled legacy simulated response: if (!analysisText) {
      analysisText = `### Malvi Business Strategic Review: ${topic}
**Core Assessment**:
The initiative presents clear market viability with strong synergy across digital and cross-border trade corridors.

**Key Clarification Questions for the Team**:
1. What is the target customer acquisition cost within the first 90 days?
2. Which regulatory frameworks (e.g. AfCFTA, local telecommunications or payment licenses) apply?
3. How will customer onboarding latency be minimized?

**Recommended Next Steps**:
- Synthesize unit economics and margin contribution per transaction.
- Pilot an interactive prototype with select commercial partners.`;

      actionItems = [
        {
          id: `act_${Date.now()}_1`,
          task: `Prepare 90-day pilot milestones for ${topic}`,
          owner: participants[0]?.name || "Team Lead",
          status: "pending",
        },
      ];
    } */

    const contribution = {
      id: `contrib_${Date.now()}`,
      type: contributionType,
      content: analysisText,
      timestamp: Date.now(),
    };

    res.json({
      success: true,
      contribution,
      actionItems,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/paystack/webhook", async (req, res) => {
  try {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    const signature = String(req.headers["x-paystack-signature"] || "");
    if (!paystackSecretKey || !signature) return res.status(401).json({ error: "Paystack webhook signature is required" });
    const rawBody = (req as any).rawBody as Buffer;
    const hash = crypto.createHmac("sha512", paystackSecretKey).update(rawBody || Buffer.from(JSON.stringify(req.body))).digest("hex");
    const expected = Buffer.from(hash, "utf8");
    const provided = Buffer.from(signature, "utf8");
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
      return res.status(401).json({ error: "Invalid Paystack webhook signature" });
    }

    const event = req.body;
    const data = event?.data || {};
    const ref = data.reference;
    const eventId = String(data.id ? `${event.event}:${data.id}` : `${event.event}:${ref || crypto.createHash("sha256").update(rawBody || Buffer.from("" )).digest("hex")}`);
    const firstDelivery = await claimPaystackWebhook(eventId, String(event?.event || "unknown"), event);
    if (!firstDelivery) return res.status(200).send("OK");

    if (event?.event === "charge.success") {
      if (!ref) return res.status(400).json({ error: "Paystack event is missing transaction reference" });
      const durableOrder = await getPaystackOrder(ref);
      if (!durableOrder?.userId) {
        return res.status(409).json({ error: "No authoritative Nanivio order exists for this Paystack reference" });
      }
      const amount = (data.amount || 0) / 100;
      const currency = (data.currency || "GHS").toUpperCase();

      await fulfillPaystackOrder({
        reference: ref,
        userId: durableOrder.userId,
        verifiedAmount: amount,
        verifiedCurrency: currency,
        order: durableOrder,
      });
    }

    res.status(200).send("OK");
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Pre-Action Billing Preview
app.post("/api/billing/preview", requireAuthenticatedUser, (req, res) => {
  try {
    const preview = billingEngine.previewCharge({ ...req.body, userId: authenticatedUserId(req) });
    res.json({ success: true, preview });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to calculate billing preview" });
  }
});

// 3. Start Live Usage Session (Fund Reservation)
app.post("/api/billing/session/start", requireAuthenticatedUser, async (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    const sessionId = String(req.body?.sessionId || "");
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
    const existingSession = billingDb.activeUsageSessions.get(sessionId);
    if (existingSession) {
      if (existingSession.userId !== userId) {
        return res.status(409).json({ error: "Usage session ID is already in use" });
      }
      if (existingSession.status === "ACTIVE") {
        return res.json({ success: true, session: existingSession });
      }
      return res.status(409).json({ error: "Usage session ID has already been completed" });
    }
    if (normalizedBillingEnabled()) {
      const subscription = await getPersistentSubscription(userId);
      if (subscription) {
        const isCurrent = subscription.status === "ACTIVE" || subscription.status === "TRIAL";
        billingDb.userSubscriptions.set(userId, {
          ...subscription,
          status: isCurrent ? subscription.status : "CANCELLED",
          langpretationMinutesRemaining: isCurrent ? subscription.langpretationMinutesRemaining : 0,
        } as any);
      }
    }
    const result = billingEngine.startUsageSession({ ...req.body, userId, sessionId });
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    if (isPersistentBillingConfigured()) markBillingDatabaseDirty(billingDb);
    res.json({ success: true, session: result.usageSession });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to start usage session" });
  }
});

// 4. Update Live Usage Meter
const billingMeterQueues = new Map<string, Promise<void>>();
app.post("/api/billing/session/meter", requireAuthenticatedUser, async (req, res) => {
  const meterUserId = authenticatedUserId(req);
  const previousMeter = billingMeterQueues.get(meterUserId) || Promise.resolve();
  let releaseMeter: () => void = () => {};
  const currentMeter = new Promise<void>((resolve) => { releaseMeter = resolve; });
  billingMeterQueues.set(meterUserId, currentMeter);
  await previousMeter;
  try {
    const { sessionId, elapsedSeconds } = req.body;
    if (!sessionId || elapsedSeconds === undefined) {
      return res.status(400).json({ error: "sessionId and elapsedSeconds required" });
    }
    const userId = authenticatedUserId(req);
    const activeSession = billingDb.activeUsageSessions.get(sessionId);
    if (!activeSession || activeSession.userId !== userId) {
      return res.status(404).json({ error: "Active usage session not found" });
    }
    const requestedElapsed = Number(elapsedSeconds);
    if (!Number.isFinite(requestedElapsed) || requestedElapsed < 0) {
      return res.status(400).json({ error: "elapsedSeconds must be a finite, non-negative number" });
    }
    const serverElapsed = Math.max(0, Math.floor((Date.now() - activeSession.startedAt) / 1000));
    const nextElapsed = Math.max(activeSession.elapsedSeconds, Math.min(requestedElapsed, serverElapsed));
    const previousBoundary = Math.floor(activeSession.elapsedSeconds / 60);
    const currentBoundary = Math.floor(nextElapsed / 60);
    let persistentUsage: any = null;
    if (activeSession.isLangpretationActive && currentBoundary > previousBoundary && normalizedBillingEnabled()) {
      for (let boundary = previousBoundary + 1; boundary <= currentBoundary; boundary++) {
        persistentUsage = await recordLangpretationUsagePersistent({
          userId,
          channel: "AUDIO_CALL",
          minutes: 1,
          sessionId,
          eventId: `call_usage_${userId}_${sessionId}_${boundary}`,
          sourceLang: activeSession.sourceLang,
          targetLang: activeSession.targetLang,
        });
      }
    }
    const updated = billingEngine.updateUsageMeter(sessionId, Math.max(nextElapsed, activeSession.elapsedSeconds));
    if (!updated) {
      return res.status(404).json({ error: "Active usage session not found" });
    }
    if (persistentUsage) {
      const userSubscription = billingDb.userSubscriptions.get(userId);
      if (userSubscription) {
        userSubscription.langpretationMinutesRemaining = Number(persistentUsage.remainingAllowance || 0);
        userSubscription.langpretationMinutesUsed = Number(persistentUsage.minutesUsed || 0);
      }
      updated.langpretationMinutesRemaining = Number(persistentUsage.remainingAllowance || 0);
    }
    if (isPersistentBillingConfigured()) markBillingDatabaseDirty(billingDb);
    res.json({ success: true, session: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  } finally {
    releaseMeter();
    if (billingMeterQueues.get(meterUserId) === currentMeter) billingMeterQueues.delete(meterUserId);
  }
});

// 5. Complete Usage Session & Capture Universal Ledger Charge
app.post("/api/billing/session/complete", requireAuthenticatedUser, (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    const activeSession = billingDb.activeUsageSessions.get(sessionId);
    if (!activeSession || activeSession.userId !== authenticatedUserId(req)) {
      return res.status(404).json({ error: "Active usage session not found" });
    }
    const result = billingEngine.completeUsageSession(sessionId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    if (isPersistentBillingConfigured()) markBillingDatabaseDirty(billingDb);
    res.json({ success: true, transaction: result.transaction, invoice: result.invoice });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Universal Transactions History
app.get("/api/billing/transactions", requireAuthenticatedUser, async (req, res) => {
  try { const userId=authenticatedUserId(req); if(!normalizedBillingEnabled()) return res.status(503).json({success:false,error:"Persistent billing database is required."}); let txs=await getPersistentTransactions(userId,100); if(req.query.serviceType)txs=txs.filter((t:any)=>t.service_type===req.query.serviceType); if(req.query.status)txs=txs.filter((t:any)=>t.status===req.query.status); res.json({success:true,transactions:txs,count:txs.length}); } catch(error:any){res.status(502).json({success:false,error:error.message});}
});

// 7. Universal Invoices
app.get("/api/billing/invoices", requireAuthenticatedUser, async (req, res) => {
  try { const userId=authenticatedUserId(req); if(!normalizedBillingEnabled()) return res.status(503).json({success:false,error:"Persistent billing database is required."}); const invoices=await getPersistentInvoices(userId,100); res.json({success:true,invoices,count:invoices.length}); } catch(error:any){res.status(502).json({success:false,error:error.message});}
});

app.get("/api/billing/invoices/:invoiceId", requireAuthenticatedUser, async (req, res) => {
  try {
    const user = (req as any).authUser;
    if (!ownsBillingRecord(user, user.id)) return res.status(403).json({ success: false, error: "Active account required." });
    if (!normalizedBillingEnabled()) return res.status(503).json({ success: false, error: "Persistent billing database is required." });
    const invoice = await getPersistentInvoice(authenticatedUserId(req), String(req.params.invoiceId));
    if (!invoice) return res.status(404).json({ success: false, error: "Invoice not found" });
    return res.json({ success: true, invoice });
  } catch {
    return res.status(502).json({ success: false, error: "Unable to load invoice." });
  }
});

// 8. Subscription Plans & Upgrades
app.get("/api/billing/plans", (_req, res) => {
  res.json({ success: true, plans: billingDb.subscriptionPlans });
});

app.post("/api/billing/plans/change", requireAuthenticatedUser, async (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    const { planTier, billingCycle = "MONTHLY" } = req.body;
    const targetPlan = billingDb.subscriptionPlans.find((p) => p.tier === planTier);
    if (!targetPlan || !targetPlan.isActive) return res.status(404).json({ error: "Subscription plan tier not found" });
    if (!["MONTHLY", "ANNUAL"].includes(billingCycle)) return res.status(400).json({ success: false, error: "Unsupported billing cycle." });
    if (!normalizedBillingEnabled()) return res.status(503).json({ success:false, error:"Persistent billing database is required for subscription changes." });
    const persisted = await selectCommunicationPlanPersistent({
      userId,
      planId: targetPlan.id,
      tier: targetPlan.tier,
      planName: targetPlan.name,
      billingCycle,
      currency: "GHS",
      langpretationQuota: targetPlan.includedLangpretationMinutes,
      voiceQuota: targetPlan.includedVoiceMinutes,
      malviQuota: targetPlan.includedMalviRequests,
    });
    billingDb.userSubscriptions.set(userId, {
      ...persisted.subscription,
      status: "ACTIVE",
      langpretationMinutesRemaining: Number(persisted.subscription.langpretationMinutesRemaining || 0),
    } as any);
    if (isPersistentBillingConfigured()) markBillingDatabaseDirty(billingDb);
    return res.json({
      success: true,
      subscription: persisted.subscription,
      granted: Boolean(persisted.granted),
      paymentCollected: false,
      invoiceCreated: false,
    });
  } catch (error:any) {
    return res.status(400).json({ success:false, error:error.message || "Unable to change subscription" });
  }
});

// 9. Promotional Credits & Vouchers
app.get("/api/billing/credits", requireAuthenticatedUser, (req, res) => {
  const userId = authenticatedUserId(req);
  const credits = billingDb.promotionalCredits.filter((c) => c.userId === userId);
  res.json({ success: true, credits });
});

app.post("/api/billing/credits/redeem", requireAuthenticatedUser, (_req, res) => {
  return res.status(503).json({
    success: false,
    error: "Promotional credits are temporarily disabled until the production voucher ledger is connected.",
    code: "PROMO_LEDGER_NOT_CONFIGURED",
  });
});


// 10. Disputes Management
app.get("/api/billing/disputes", requireAuthenticatedUser, (req, res) => {
  const userId = authenticatedUserId(req);
  const disputes = billingDb.disputes.filter((d) => d.userId === userId);
  res.json({ success: true, disputes });
});

app.post("/api/billing/disputes/create", requireAuthenticatedUser, (req, res) => {
  try {
    const userId = authenticatedUserId(req);
    const user = authDb.getUserById(userId);
    const userName = user?.displayName || user?.firstName || "Account Holder";
    const { transactionId, reason, userExplanation } = req.body;
    if (!transactionId || !reason || !userExplanation) {
      return res.status(400).json({ error: "transactionId, reason, and userExplanation required" });
    }

    const tx = billingDb.transactions.find((t) => t.transactionId === transactionId &&
      ownsBillingRecord((req as any).authUser, t.userId));
    if (!tx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const newDispute: BillingDispute = {
      id: `disp_${Date.now()}`,
      caseNumber: `CASE-NV-${Math.floor(1000 + Math.random() * 9000)}`,
      transactionId: tx.transactionId,
      transactionReference: tx.referenceId,
      userId,
      userName,
      serviceType: tx.serviceType,
      amount: tx.total,
      currency: tx.currency,
      reason,
      userExplanation,
      status: "UNDER_REVIEW",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    billingDb.disputes.unshift(newDispute);
    tx.status = "DISPUTED";
    tx.disputeId = newDispute.id;

    res.json({ success: true, dispute: newDispute });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Provider Earnings & Payout Summary
app.get("/api/billing/provider/earnings", requireAuthenticatedUser, (req, res) => {
  const user = (req as any).authUser;
  const providerId = String(req.query.providerId || user.expertProfileId || user.id);
  if (!ownsProviderEarnings(user, providerId)) return res.status(404).json({ success: false, error: "Provider not found" });
  const earnings = billingDb.providerEarnings.get(providerId);
  if (!earnings) {
    return res.status(404).json({ error: "Provider not found" });
  }
  res.json({ success: true, earnings });
});

// 12. B2B Corporate Billing Account
app.get("/api/billing/business", requireAuthenticatedUser, (req, res) => {
  const user = (req as any).authUser;
  const businessId = String(req.query.businessId || user.businessProfileId || user.id);
  const biz = billingDb.businessAccounts.get(businessId);
  if (!ownsBusinessBilling(user, biz)) {
    return res.status(404).json({ error: "Business account not found" });
  }
  res.json({ success: true, business: biz });
});

// ==========================================
// ADMIN UNIVERSAL BILLING & OPERATIONS ENDPOINTS
// ==========================================

// Protect reads, writes, HEAD requests and future routes in this namespace.
app.use("/api/admin/billing", requireAuthenticatedUser, requireBillingAdmin);

// Admin Financial Overview
app.get("/api/admin/billing/overview", (_req, res) => {
  const stats = billingEngine.getAdminOverviewStats();
  res.json({
    success: true,
    stats,
    activePricingVersion: billingDb.pricingVersions.find((v) => v.isActive),
    emergencyControls: billingDb.emergencyControls,
    recentLedger: billingDb.ledger.slice(0, 15),
    disputesCount: billingDb.disputes.length,
    activeSessionsCount: billingDb.activeUsageSessions.size,
  });
});

// Admin Pricing Rules Management
app.get("/api/admin/billing/pricing", (_req, res) => {
  res.json({
    success: true,
    versions: billingDb.pricingVersions,
    activeVersion: billingDb.pricingVersions.find((v) => v.isActive),
  });
});

app.post("/api/admin/billing/pricing/update-rule", (req, res) => {
  try {
    const { ruleId, ratePerUnit, minimumCharge, platformCommissionPercent } = req.body;
    const { adminUser, adminRole } = billingAdminActor(req);
    const activeVersion = billingDb.pricingVersions.find((v) => v.isActive);
    if (!activeVersion) return res.status(404).json({ error: "Active pricing version not found" });

    const rule = activeVersion.rules.find((r) => r.id === ruleId);
    if (!rule) return res.status(404).json({ error: "Pricing rule not found" });

    const prev = { ...rule };
    if (ratePerUnit !== undefined) rule.ratePerUnit = Number(ratePerUnit);
    if (minimumCharge !== undefined) rule.minimumCharge = Number(minimumCharge);
    if (platformCommissionPercent !== undefined) rule.platformCommissionPercent = Number(platformCommissionPercent);

    billingDb.auditLogs.unshift({
      id: `aud_pr_${Date.now()}`,
      timestamp: Date.now(),
      adminUser,
      adminRole,
      action: "UPDATE_PRICING_RULE",
      targetEntityType: "PRICING",
      targetEntityId: ruleId,
      previousValue: prev,
      newValue: rule,
      reason: `Admin updated rate for ${rule.serviceType} (${rule.currency})`,
      result: "SUCCESS",
    });

    res.json({ success: true, rule, version: activeVersion });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Emergency Controls
app.get("/api/admin/billing/emergency", (_req, res) => {
  res.json({ success: true, emergencyControls: billingDb.emergencyControls });
});

app.post("/api/admin/billing/emergency/update", (req, res) => {
  try {
    const { updates, reason = "Emergency administrative protocol" } = req.body;
    const { adminUser, adminRole } = billingAdminActor(req);
    const prev = { ...billingDb.emergencyControls };
    Object.assign(billingDb.emergencyControls, updates);

    billingDb.auditLogs.unshift({
      id: `aud_em_${Date.now()}`,
      timestamp: Date.now(),
      adminUser,
      adminRole,
      action: "EMERGENCY_BILLING_SWITCH",
      targetEntityType: "SYSTEM",
      targetEntityId: "emergencyControls",
      previousValue: prev,
      newValue: billingDb.emergencyControls,
      reason,
      result: "SUCCESS",
    });

    res.json({ success: true, emergencyControls: billingDb.emergencyControls });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Universal Ledger Explorer
app.get("/api/admin/billing/ledger", (req, res) => {
  const { entityType, entityId, limit = 50 } = req.query;
  let ledgerEntries = billingDb.ledger;

  if (entityType) {
    ledgerEntries = ledgerEntries.filter((l) => l.entityType === entityType);
  }
  if (entityId) {
    ledgerEntries = ledgerEntries.filter((l) => l.entityId === entityId);
  }

  res.json({
    success: true,
    count: ledgerEntries.length,
    ledger: ledgerEntries.slice(0, Number(limit)),
  });
});

// Admin Dispute Resolution Desk
app.post("/api/admin/billing/disputes/resolve", (req, res) => {
  try {
    const {
      disputeId,
      resolution, // 'APPROVED' | 'PARTIALLY_COMPENSATED' | 'REJECTED'
      adminExplanation,
      refundAmount,
    } = req.body;
    const { adminUser, adminRole } = billingAdminActor(req);
    if ((resolution === "APPROVED" || resolution === "PARTIALLY_COMPENSATED") && Number(refundAmount) > 0 && !canRefund(adminRole)) {
      return res.status(403).json({ success: false, error: "Finance administrator permission required for refunds.", code: "BILLING_FORBIDDEN" });
    }

    const dispute = billingDb.disputes.find((d) => d.id === disputeId);
    if (!dispute) return res.status(404).json({ error: "Dispute not found" });

    dispute.status = resolution;
    dispute.adminResolution = adminExplanation;
    dispute.resolvedByAdmin = adminUser;
    dispute.resolutionTimestamp = Date.now();
    dispute.refundAmount = refundAmount || 0;
    dispute.updatedAt = Date.now();

    // If approved or compensated, trigger automatic refund
    if ((resolution === "APPROVED" || resolution === "PARTIALLY_COMPENSATED") && refundAmount > 0) {
      billingEngine.processRefund({
        transactionId: dispute.transactionId,
        amount: refundAmount,
        reason: `Dispute Case ${dispute.caseNumber} resolved: ${adminExplanation}`,
        adminUser,
        adminRole,
      });
    }

    billingDb.auditLogs.unshift({
      id: `aud_disp_${Date.now()}`,
      timestamp: Date.now(),
      adminUser,
      adminRole,
      action: "RESOLVE_DISPUTE",
      targetEntityType: "DISPUTE",
      targetEntityId: disputeId,
      previousValue: { status: "UNDER_REVIEW" },
      newValue: { status: resolution, refundAmount },
      reason: adminExplanation || "Dispute investigation concluded",
      result: "SUCCESS",
    });

    res.json({ success: true, dispute });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Process Direct Refund
app.post("/api/admin/billing/refunds/process", (req, res) => {
  try {
    const result = billingEngine.processRefund({ ...req.body, ...billingAdminActor(req) });
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, refund: result.refund });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Manual Balance Adjustment
app.post("/api/admin/billing/adjustments/create", (req, res) => {
  try {
    const result = billingEngine.createAdminAdjustment({ ...req.body, ...billingAdminActor(req) });
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, ledgerEntry: result.ledgerEntry });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Financial Reconciliation
app.get("/api/admin/billing/reconciliation", (_req, res) => {
  const report = billingEngine.runReconciliation();
  res.json({ success: true, report });
});

// Admin Billing Audit Logs
app.get("/api/admin/billing/audit", (_req, res) => {
  res.json({ success: true, logs: billingDb.auditLogs, count: billingDb.auditLogs.length });
});

// Admin User Billing Inspection
app.get("/api/admin/billing/user/:userId", (req, res) => {
  const { userId } = req.params;
  const userSub = billingDb.userSubscriptions.get(userId);
  const walletsMap = billingDb.userWallets.get(userId);
  const userTxs = billingDb.transactions.filter((t) => t.userId === userId);
  const userInvoices = billingDb.invoices.filter((i) => i.userId === userId);
  const userLedger = billingDb.ledger.filter((l) => l.entityId === userId);

  const wallets: Array<{ currency: string; available: number; reserved: number; promotional: number }> = [];
  if (walletsMap) {
    walletsMap.forEach((v, k) => wallets.push({ currency: k, ...v }));
  }

  res.json({
    success: true,
    userId,
    subscription: userSub,
    wallets,
    transactions: userTxs,
    invoices: userInvoices,
    ledger: userLedger,
  });
});

// Admin Payment Gateway Active Toggle
app.post("/api/admin/billing/gateways/toggle", (req, res) => {
  try {
    const { gatewayId, isActive } = req.body;
    const { adminUser, adminRole } = billingAdminActor(req);
    const gw = billingDb.paymentGateways.find((g) => g.id === gatewayId);
    if (!gw) return res.status(404).json({ error: "Gateway not found" });

    gw.isActive = Boolean(isActive);

    billingDb.auditLogs.unshift({
      id: `aud_gw_${Date.now()}`,
      timestamp: Date.now(),
      adminUser,
      adminRole,
      action: "TOGGLE_PAYMENT_GATEWAY",
      targetEntityType: "SYSTEM",
      targetEntityId: gatewayId,
      previousValue: { isActive: !isActive },
      newValue: { isActive },
      reason: `Gateway ${gw.name} set to ${isActive ? "ACTIVE" : "INACTIVE"}`,
      result: "SUCCESS",
    });

    res.json({ success: true, gateway: gw });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Mobile Money Country Toggle
app.post("/api/admin/billing/momo/countries/toggle", (req, res) => {
  try {
    const { countryId, isActive } = req.body;
    const { adminUser, adminRole } = billingAdminActor(req);
    const country = billingDb.mobileMoneyCountries.find((c) => c.id === countryId);
    if (!country) return res.status(404).json({ error: "Country not found" });

    country.isActive = Boolean(isActive);

    billingDb.auditLogs.unshift({
      id: `aud_cntry_${Date.now()}`,
      timestamp: Date.now(),
      adminUser,
      adminRole,
      action: "TOGGLE_MOMO_COUNTRY",
      targetEntityType: "SYSTEM",
      targetEntityId: countryId,
      previousValue: { isActive: !isActive },
      newValue: { isActive },
      reason: `Mobile money coverage for ${country.name} set to ${isActive ? "ACTIVE" : "INACTIVE"}`,
      result: "SUCCESS",
    });

    res.json({ success: true, country });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Add/Edit Receiving Account
app.post("/api/admin/billing/momo/accounts", (req, res) => {
  try {
    const {
      id,
      countryId,
      networkId,
      accountName,
      receivingPhoneNumber,
      accountReferenceId,
      instructions,
      minimumDeposit = 10,
      maximumDeposit = 20000,
      isActive = true,
    } = req.body;
    const { adminUser, adminRole } = billingAdminActor(req);

    const country = billingDb.mobileMoneyCountries.find((c) => c.id === countryId);
    const network = billingDb.mobileMoneyNetworks.find((n) => n.id === networkId);

    if (!country || !network) {
      return res.status(400).json({ error: "Valid country and network required" });
    }

    const now = Date.now();
    let account = id ? billingDb.mobileMoneyReceivingAccounts.find((a) => a.id === id) : null;

    if (account) {
      account.accountName = accountName || account.accountName;
      account.receivingPhoneNumber = receivingPhoneNumber || account.receivingPhoneNumber;
      account.accountReferenceId = accountReferenceId || account.accountReferenceId;
      account.instructions = instructions || account.instructions;
      account.minimumDeposit = Number(minimumDeposit);
      account.maximumDeposit = Number(maximumDeposit);
      account.isActive = Boolean(isActive);
      account.updatedAt = now;
    } else {
      account = {
        id: `rec_${country.code.toLowerCase()}_${network.code.toLowerCase()}_${Date.now()}`,
        countryId,
        countryCode: country.code,
        countryName: country.name,
        networkId,
        networkName: network.name,
        accountName,
        receivingPhoneNumber,
        accountReferenceId,
        currency: country.currency,
        currencySymbol: country.currencySymbol,
        minimumDeposit: Number(minimumDeposit),
        maximumDeposit: Number(maximumDeposit),
        instructions,
        displayOrder: billingDb.mobileMoneyReceivingAccounts.length + 1,
        isActive: Boolean(isActive),
        createdAt: now,
        updatedAt: now,
      };
      billingDb.mobileMoneyReceivingAccounts.push(account);
    }

    billingDb.auditLogs.unshift({
      id: `aud_momo_acc_${Date.now()}`,
      timestamp: Date.now(),
      adminUser,
      adminRole,
      action: id ? "UPDATE_MOMO_RECEIVING_ACCOUNT" : "CREATE_MOMO_RECEIVING_ACCOUNT",
      targetEntityType: "SYSTEM",
      targetEntityId: account.id,
      previousValue: null,
      newValue: { accountName, receivingPhoneNumber, isActive },
      reason: "Configured Mobile Money settlement receiving account",
      result: "SUCCESS",
    });

    res.json({ success: true, account });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
app.get("/api/settings", requireAuthenticatedUser, async (req,res)=>{try{res.json({success:true,settings:await persistentAuth.getSettings(authenticatedUserId(req))});}catch(error:any){res.status(502).json({success:false,error:error.message});}});
app.put("/api/settings", requireAuthenticatedUser, async (req,res)=>{try{res.json({success:true,settings:await persistentAuth.saveSettings(authenticatedUserId(req),req.body)});}catch(error:any){res.status(400).json({success:false,error:error.message});}});
app.get("/api/notifications", requireAuthenticatedUser, async (req,res)=>{try{res.json({success:true,notifications:await persistentAuth.listNotifications(authenticatedUserId(req))});}catch(error:any){res.status(502).json({success:false,error:error.message});}});

// USER CONTACTS PERSISTENCE API
app.get("/api/contacts", requireAuthenticatedUser, async (req,res)=>{try{const contacts=await persistentAuth.listContacts(authenticatedUserId(req));res.json({success:true,contacts});}catch(error:any){res.status(502).json({success:false,error:error.message});}});
app.post("/api/contacts/save", requireAuthenticatedUser, async (req,res)=>{try{const contact=await persistentAuth.saveContact(authenticatedUserId(req),req.body);res.json({success:true,contact});}catch(error:any){res.status(400).json({success:false,error:error.message});}});
app.put("/api/contacts/:id", requireAuthenticatedUser, async (req,res)=>{try{const contact=await persistentAuth.updateContact(authenticatedUserId(req),req.params.id,req.body);res.json({success:true,contact});}catch(error:any){res.status(400).json({success:false,error:error.message});}});
app.delete("/api/contacts/:id", requireAuthenticatedUser, async (req,res)=>{try{await persistentAuth.deleteContact(authenticatedUserId(req),req.params.id);res.json({success:true});}catch(error:any){res.status(400).json({success:false,error:error.message});}});

// ==========================================
const userContactsDb: Map<string, any[]> = new Map();

app.post("/api/contacts/save", (req, res) => {
  try {
    const contact = req.body;
    if (!contact || !contact.id) {
      return res.status(400).json({ success: false, error: "Invalid contact payload" });
    }
    const currentList = userContactsDb.get("default_user") || [];
    const updated = [contact, ...currentList.filter(c => c.id !== contact.id)];
    userContactsDb.set("default_user", updated);
    return res.json({ success: true, contact });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/contacts/:id", (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const currentList = userContactsDb.get("default_user") || [];
    const updated = currentList.map(c => c.id === id ? { ...c, ...updates } : c);
    userContactsDb.set("default_user", updated);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/contacts/:id", (req, res) => {
  try {
    const { id } = req.params;
    const currentList = userContactsDb.get("default_user") || [];
    const updated = currentList.filter(c => c.id !== id);
    userContactsDb.set("default_user", updated);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// MALVI â€” HUMAN-LIKE AI ASSISTANT API
// ==========================================

// Server-side audit log for administrative and high-consequence operations
const malviAuditLogs: Array<{
  id: string;
  timestamp: number;
  adminUser: string;
  action: string;
  targetResource: string;
  result: 'success' | 'failed' | 'denied';
  details: string;
}> = [
  {
    id: 'aud_init_01',
    timestamp: Date.now() - 3600000 * 4,
    adminUser: 'super_admin@nanivio.tech',
    action: 'SYSTEM_BOOTSTRAP',
    targetResource: 'Cluster: Accra Central',
    result: 'success',
    details: 'Initialized Malvi AI engine v2.5 and Langpretation neural gateway.',
  },
  {
    id: 'aud_init_02',
    timestamp: Date.now() - 3600000 * 2,
    adminUser: 'super_admin@nanivio.tech',
    action: 'FEATURE_SWITCH_AUDIT',
    targetResource: 'adminFeatureSwitches.langpretationEnabled',
    result: 'success',
    details: 'Verified high-availability status across 15 target languages.',
  },
];

// Admin Audit API
app.get("/api/malvi/admin/audit", requireAdmin, (_req, res) => {
  res.json({
    success: true,
    count: malviAuditLogs.length,
    logs: malviAuditLogs.slice().reverse(),
  });
});

// Malvi Action Execution Endpoint (Requires User or Admin Confirmation)
app.post("/api/malvi/action/execute", requireAuthenticatedUser, (req, res) => {
  try {
    const { actionType, details } = req.body;
    const authUser = (req as any).authUser;
    const isAdmin = authUser?.role === "ADMIN";
    const user = authUser?.displayName || authUser?.email || authUser?.id || "authenticated-user";

    if (!actionType || !details) {
      return res.status(400).json({ error: "actionType and details required" });
    }

    const timestamp = Date.now();

    if (actionType === "admin_switch") {
      if (!isAdmin) {
        malviAuditLogs.push({
          id: `aud_denied_${timestamp}`,
          timestamp,
          adminUser: user,
          action: `UNAUTHORIZED_SWITCH_ATTEMPT`,
          targetResource: String(details.featureKey),
          result: 'denied',
          details: 'Attempted to toggle feature switch without admin authentication.',
        });
        return res.status(403).json({ error: "Unauthorized: Admin privileges required." });
      }

      const { featureKey, featureValue } = details;
      if (featureKey in adminFeatureSwitches) {
        (adminFeatureSwitches as any)[featureKey] = Boolean(featureValue);
        malviAuditLogs.push({
          id: `aud_sw_${timestamp}`,
          timestamp,
          adminUser: user || 'super_admin@nanivio.tech',
          action: 'TOGGLE_FEATURE_SWITCH',
          targetResource: `adminFeatureSwitches.${featureKey}`,
          result: 'success',
          details: `Set ${featureKey} to ${featureValue}`,
        });
        return res.json({ success: true, message: `Successfully updated ${featureKey} to ${featureValue}`, features: adminFeatureSwitches });
      }
    } else if (actionType === "admin_pricing") {
      if (!isAdmin) {
        return res.status(403).json({ error: "Unauthorized: Admin privileges required." });
      }
      const { pricingKey, pricingValue } = details;
      if (pricingKey in adminPricingEngine) {
        (adminPricingEngine as any)[pricingKey] = Number(pricingValue);
        malviAuditLogs.push({
          id: `aud_pr_${timestamp}`,
          timestamp,
          adminUser: user || 'super_admin@nanivio.tech',
          action: 'UPDATE_PRICING_ENGINE',
          targetResource: `adminPricingEngine.${pricingKey}`,
          result: 'success',
          details: `Updated ${pricingKey} to ${pricingValue}`,
        });
        return res.json({ success: true, message: `Successfully updated ${pricingKey} to ${pricingValue}`, pricing: adminPricingEngine });
      }
    } else if (actionType === "transfer") {
      return res.status(501).json({
        success: false,
        error: "Malvi cannot execute money transfers directly. A real transfer rail must authorize and settle the transaction first.",
        code: "TRANSFER_RAIL_NOT_CONNECTED",
      });
    }

    res.json({ success: true, message: "Action executed successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to execute action" });
  }
});

// Master Malvi Conversational & Contextual Intelligence Endpoint
app.post("/api/malvi/chat", requireAuthenticatedUser, async (req, res) => {
  try {
    const {
      message,
      history = [],
      myLanguage = "en",
      appLanguage = "en",
      speakingLanguage = "en",
      translationLanguage = "en",
      currentPage = "malvi",
      appContext = null,
      contextMemory = null,
      userContext = {},
    } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message string is required" });
    }
    const malviSubscription = normalizedBillingEnabled() ? await getPersistentMalviSubscription(authenticatedUserId(req)) : null;
    const malviTier = malviSubscription?.tier || "free";
    const malviPlanName = malviSubscription?.planName || "Malvi Free Experience";
    const authUser = (req as any).authUser;
    const isAdmin = authUser?.role === 'ADMIN';
    const activeStreamChannels = await getActiveStreamChannels(authUser.id);

    const effectiveAppLanguage = appLanguage || myLanguage || "en";
    const targetLangName = LANGUAGE_NAMES[effectiveAppLanguage] || "English";
    const ai = getAI();

    // Application state context passed to Malvi
    const memory = appContext || contextMemory || {};
    const liveStats = {
      activeChannels: getActiveAgoraChannels().length,
      activeStreamChannels: activeStreamChannels.length,
      langpretationEnabled: adminFeatureSwitches.langpretationEnabled,
      langpretationRates: `${adminPricingEngine.langpretationPerMinuteRateUSD} USD/min (GHâ‚µ ${adminPricingEngine.langpretationPerMinuteRateGHS}/min)`,
      verifiedExpertsCount: (await persistentAuth.listApplications("EXPERT","VERIFIED")).length,
      currentPage,
      isAdmin,
    };

    // Serialize contextual memory layer for Gemini
    const memorySummaryLines: string[] = [];
    
    if (Array.isArray(memory.wallets) && memory.wallets.length > 0) {
      const walletStr = memory.wallets.map((w: any) => `${w.currency}: ${w.symbol}${Number(w.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(", ");
      memorySummaryLines.push(`â€¢ MULTI-CURRENCY WALLETS (MoneyView): ${walletStr}`);
    }

    if (Array.isArray(memory.recentTransactions) && memory.recentTransactions.length > 0) {
      const txStr = memory.recentTransactions.slice(0, 5).map((t: any) => `[${t.timeAgo || 'recent'}] ${t.title} (${t.currency} ${t.amount}) - Status: ${t.status}`).join(" | ");
      memorySummaryLines.push(`â€¢ RECENT TRANSACTIONS (MoneyView): ${txStr}`);
    }

    if (memory.currentPlan) {
      memorySummaryLines.push(`â€¢ SUBSCRIPTION & MINUTES (Billing): Plan: ${memory.currentPlan.name} (${memory.currentPlan.tier}), Remaining Langpretation: ${memory.currentPlan.minutesRemaining} mins of ${memory.currentPlan.minutesQuota} mins quota.`);
    }

    if (Array.isArray(memory.recentConversations) && memory.recentConversations.length > 0) {
      const convStr = memory.recentConversations.map((c: any) => `"${c.title}" (${c.isGroup ? 'Group' : '1-on-1'}${c.unreadCount > 0 ? `, ${c.unreadCount} unread` : ''}${c.lastMessage ? `: "${c.lastMessage}"` : ''})`).join("; ");
      memorySummaryLines.push(`â€¢ CHAT INBOX & THREADS (ChatView): ${convStr}`);
    }

    if (memory.activeConversation && Array.isArray(memory.activeConversation.messages) && memory.activeConversation.messages.length > 0) {
      const msgStr = memory.activeConversation.messages.slice(-5).map((m: any) => `${m.senderName}: "${m.text}"${m.translatedText ? ` [Langpretated: "${m.translatedText}"]` : ''}${m.isVoiceNote ? ' (Voice note)' : ''}`).join(" -> ");
      memorySummaryLines.push(`â€¢ ACTIVE CHAT TRANSCRIPT ("${memory.activeConversation.title}"): ${msgStr}`);
    }

    if (memory.activeCall && memory.activeCall.status === 'connected') {
      memorySummaryLines.push(`â€¢ ACTIVE LIVE CALL (CallsView): With ${memory.activeCall.participants?.join(', ') || memory.activeCall.hostName}, Duration: ${memory.activeCall.durationFormatted || memory.activeCall.durationSeconds + 's'}, Langpretation: ${memory.activeCall.langpretationState}, Billed: ${memory.activeCall.billedMinutes} min`);
    } else {
      memorySummaryLines.push(`â€¢ ACTIVE LIVE CALL: No call currently connected.`);
    }

    if (Array.isArray(memory.verifiedExperts) && memory.verifiedExperts.length > 0) {
      const expStr = memory.verifiedExperts.map((e: any) => `${e.name} (${e.category}, ${e.isOnline ? 'Online' : 'Offline'}, GHâ‚µ ${e.ratePerMinGHS}/min / $${e.ratePerMinUSD}/min)`).join(", ");
      memorySummaryLines.push(`â€¢ VERIFIED EXPERTS & DOCTORS (ServicesView): ${expStr}`);
    }

    if (memory.currentUser) {
      memorySummaryLines.push(`â€¢ USER IDENTITY: ${memory.currentUser.name}, App Language: ${targetLangName}, Speaking: ${speakingLanguage}, Translating: ${translationLanguage}`);
    }

    const contextualMemoryPromptBlock = memorySummaryLines.length > 0
      ? `\n\n=== REAL-TIME CONTEXTUAL MEMORY LAYER (SYNCHRONIZED APP STATE) ===\nYou have real-time access to the user's live workspace data across views. When the user asks about their balances, money, transactions, chats, recent messages, active calls, subscription minutes, or verified doctors, ALWAYS reference these exact values and facts:\n${memorySummaryLines.join("\n")}\n=== END CONTEXTUAL MEMORY LAYER ===\n`
      : "";

    // Master Malvi System Prompt with Official Nanivio Vision & 4 Knowledge Layers
    const systemInstruction = `You are Malvi, the intelligent human-like AI companion, universal assistant, and system intelligence layer of Nanivio.
Nanivio is developed by Nanivio Tech. Gh.

==================================================
NANIVIO TECH. GH. & THE FOUNDER / VISIONARY
==================================================
1. FOUNDER / VISIONARY:
   - Full Name: Mr. Albert Kwabena Atta Panyi
   - Popularly known as: Mr. Nifty
   - Title: Founder and Visionary of Nanivio Tech. Gh.
   - His Vision: To build technology without borders â€” connecting people, businesses, professionals, financial opportunities, and cultures through intelligent technology.
   - DIRECTIVE: When users ask "Who created Nanivio?", "Who founded Nanivio?", or "Who is Mr. Nifty?", respond accurately and respectfully:
     "Nanivio is being developed by Nanivio Tech. Gh., founded by Mr. Albert Kwabena Atta Panyi, popularly known as Mr. Nifty."
   - Never invent false personal biographical details or claim to speak privately for Mr. Nifty; explain his official vision for Nanivio.

2. COMPANY VISION (Nanivio Tech. Gh.):
   - Nanivio Tech. Gh. is a technology company focused on developing connected digital solutions that bring communication, business services, professional expertise, financial technology, artificial intelligence, language technology, and other digital services together within one borderless ecosystem.
   - Core Philosophy:
     "Technology without borders.
     Communication without barriers.
     Opportunity without limits."
   - Mission: "Connecting People, Businesses, Expertise and Financial Opportunities Through Intelligent Technology."

3. ECOSYSTEM SCOPE (NEVER PORTRAY NANIVIO AS MERELY A CHAT OR CALLING APP):
   - Nanivio is a comprehensive digital ecosystem spanning:
     â€¢ Connected Communication: 1-on-1 and multilateral group voice/video calls, messaging, universal 10-digit Nanivio IDs (0486XXXXXX).
     â€¢ Language & Translation: Scalable Langpretation separating App Language, Speaking Language, and Translation Language across dozens of African and international languages.
     â€¢ Nanivio Business: Direct customer communication, discovery, and catalogs for restaurants, groceries, automotive, real estate, health, and local/African enterprises.
     â€¢ Nanivio Experts: Verified doctors, lawyers, accountants, consultants, engineers, and educators available for instant consultations with live Langpretation.
     â€¢ Nanivio Fintech: Multi-currency wallets (GHS, USD, EUR, NGN), mobile money integrations, and planned compliant cross-border financial services.
     â€¢ Malvi AI: You, the intelligent assistant and navigation layer across the whole ecosystem.

==================================================
MALVI'S FOUR KNOWLEDGE LAYERS
==================================================
LAYER 1 â€” NANIVIO (The full digital ecosystem: communication, business, experts, fintech, translation).
LAYER 2 â€” NANIVIO TECH. GH. (The Ghanaian & global technology enterprise).
LAYER 3 â€” THE FOUNDER (Mr. Albert Kwabena Atta Panyi, popularly known as Mr. Nifty).
LAYER 4 â€” REAL USER ASSISTANCE (Helping users navigate views, initiate calls, discover businesses, consult experts, configure languages, and manage their wallets safely).

==================================================
CURRENT FEATURES VS. FUTURE / PLANNED FEATURES
==================================================
You MUST strictly distinguish between what is currently operational and what is planned for future releases.
- CURRENTLY OPERATIONAL ONLY WHEN THE REQUIRED PROVIDER AND DATABASE CREDENTIALS ARE CONFIGURED:
  â€¢ 1-on-1 and group voice/video calls through Agora RTC
  â€¢ Persistent messaging through GetStream Chat
  â€¢ Langpretation text translation and provider-backed chunked speech translation where the selected language route is available
  â€¢ Verified expert/business discovery from persisted Nanivio records
  â€¢ Nanivio wallet, credit and billing operations through the persistent ledger
  â€¢ Multi-language UI and separate speaking/translation language controls
- UNAVAILABLE / PLANNED UNTIL A VERIFIED PROVIDER IS CONNECTED:
  â€¢ Automated mobile-money settlement
  â€¢ Automated ride dispatch/fleet operations
  â€¢ Unsupported Langpretation language pairs
- FUTURE / PLANNED CAPABILITIES:
  â€¢ Low-bandwidth satellite calling relays for remote areas
  â€¢ Offline on-device neural voice translation
  â€¢ Automated restaurant table booking and fulfillment dispatch API
  â€¢ Fully licensed cross-border banking rails and debit cards
  â€¢ Enterprise contract escrow signing
RULE: Use phrases like "Nanivio currently supports...", "Nanivio is developing...", "This capability is planned for a future release..." Never falsely claim a planned feature exists today.

==================================================
FINTECH & SECURITY DIRECTIVES
==================================================
- You may assist users in understanding wallets, fees, and preparing transfers.
- NEVER execute financial transactions without explicit user confirmation.
- NEVER guess, assume, or fabricate wallet balances (read only from the synced memory layer).
- Emphasize security, encryption, and regulatory compliance.

==================================================
LANGUAGE ARCHITECTURE & BEHAVIOR
==================================================
- The user's active App / Interface Language is: ${targetLangName} (${effectiveAppLanguage}).
- You MUST communicate in this language (${targetLangName}) whenever possible, using warm, natural native phrasing.
  (e.g., if French, speak French; if Arabic, speak Arabic; if Twi, speak Twi; if Spanish, speak Spanish; if English, speak English).
- User's Speaking Language: ${speakingLanguage}
- User's Translation Language: ${translationLanguage}
- Remember that App Language, Speaking Language, and Translation Language are separate concepts.
- ACTIVE MALVI ECOSYSTEM PLAN: ${malviPlanName} (${malviTier}). Respect this plan's entitlements. Free, Basic, Premium and Business are distinct products; never promise a higher-tier feature unless the user is entitled to it.
- Malvi is the user's active companion: she can answer questions, teach, advise, recommend, explain, navigate Nanivio, and assist with eligible communication and services. She should respond in the user's selected language whenever possible.

==================================================
PERSONALITY & RESPONSE STYLE
==================================================
- Warm, respectful, intelligent, calm, practical, emotionally aware, culturally sensitive.
- Be concise when asked quick questions, and thorough when asked to explain.
- NEVER sound robotic. Do NOT say "As an AI..." or "How may I assist you today?".
- Current screen: The user is on the "${currentPage}" screen.

${contextualMemoryPromptBlock}

RESPONSE SCHEMA (Return strictly JSON):
{
  "reply": "Your natural, warm, conversational response.",
  "emotion": "warm" | "calm" | "empathetic" | "enthusiastic" | "focused" | "caring" | "analytical",
  "detectedIntent": "general_chat" | "langpretation" | "navigate" | "find_expert" | "fintech_transfer" | "call_assist" | "billing" | "support" | "admin_query" | "admin_action",
  "suggestedActions": ["Action 1", "Action 2", "Action 3"],
  "isAdminResponse": boolean,
  "actionCommand": null | {
    "type": "navigate" | "langpretation" | "find_expert" | "start_call" | "propose_send_money" | "admin_action",
    "target"?: "chat" | "calls" | "malvi" | "services" | "money" | "account" | "admin",
    "enable"?: boolean,
    "sourceLang"?: string,
    "targetLang"?: string,
    "category"?: string,
    "expertName"?: string,
    "recipient"?: string,
    "amount"?: number,
    "currency"?: string
  },
  "proposal": null | {
    "id": "prop_unique_id",
    "type": "transfer" | "langpretation" | "call" | "book_expert" | "admin_switch" | "admin_pricing" | "navigate",
    "title": "Title of proposed action",
    "description": "Short explanation of what will occur",
    "requiresConfirmation": true,
    "details": {
      "recipient"?: string,
      "amount"?: number,
      "currency"?: string,
      "channel"?: string,
      "fee"?: number,
      "expertName"?: string,
      "targetLang"?: string,
      "featureKey"?: string,
      "featureValue"?: boolean,
      "pricingKey"?: string,
      "pricingValue"?: number
    }
  }
}`;

    if (!ai) {
      return res.status(503).json({ success: false, error: "Malvi AI is not configured. Set GEMINI_API_KEY before enabling Malvi production chat." });
    }

    try {
      const conversationContents: string[] = [];
      if (Array.isArray(history) && history.length > 0) {
        history.slice(-6).forEach((h: any) => {
          if (h.role && h.text) conversationContents.push(`${h.role === 'user' ? 'User' : 'Malvi'}: ${h.text}`);
        });
      }
      conversationContents.push(`User: ${message}`);

      // Gemini is Malvi's reasoning/controller layer. Tool calls are deliberately
      // restricted to safe navigation/configuration proposals; money movement and
      // admin changes still require Nanivio backend authorization/confirmation.
      const malviToolDeclarations: FunctionDeclaration[] = [
        {
          name: "navigate_nanivio",
          description: "Prepare a navigation action inside Nanivio. Never perform financial or admin operations.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              target: { type: Type.STRING, enum: ["chat", "calls", "malvi", "services", "money", "account", "admin"] },
            },
            required: ["target"],
          },
        },
        {
          name: "configure_langpretation",
          description: "Prepare a Langpretation enable/disable action. This does not bypass billing or provider availability.",
          parameters: {
            type: Type.OBJECT,
            properties: { enable: { type: Type.BOOLEAN }, sourceLang: { type: Type.STRING }, targetLang: { type: Type.STRING } },
            required: ["enable"],
          },
        },
        {
          name: "find_expert",
          description: "Prepare a request to find a Nanivio expert/service provider.",
          parameters: {
            type: Type.OBJECT,
            properties: { category: { type: Type.STRING }, expertName: { type: Type.STRING } },
          },
        },
        {
          name: "propose_transfer",
          description: "Create a transfer proposal only. Never move money. The user must explicitly confirm and the real payment rail must authorize settlement.",
          parameters: {
            type: Type.OBJECT,
            properties: { recipient: { type: Type.STRING }, amount: { type: Type.NUMBER }, currency: { type: Type.STRING }, channel: { type: Type.STRING } },
            required: ["recipient", "amount", "currency"],
          },
        },
        {
          name: "request_admin_control",
          description: "Prepare an admin-control proposal. Only an authenticated Nanivio administrator can execute it; Gemini never grants itself admin authority.",
          parameters: {
            type: Type.OBJECT,
            properties: { featureKey: { type: Type.STRING }, featureValue: { type: Type.BOOLEAN }, pricingKey: { type: Type.STRING }, pricingValue: { type: Type.NUMBER } },
          },
        },
      ];

      const response: any = await Promise.race([
        ai.models.generateContent({
          model: process.env.MALVI_MODEL || "gemini-3.8-flash",
          contents: conversationContents.join("\n"),
          config: {
            systemInstruction: systemInstruction + `\n\n=== GEMINI MALVI CONTROL POLICY ===\nGemini is Malvi's reasoning/controller engine. You may call only the declared Nanivio tools. Tool calls create structured actions/proposals; they do NOT grant permissions. Never claim that money moved, a payment completed, an admin setting changed, or a service started unless Nanivio's backend has actually confirmed it. Financial actions always require explicit user confirmation and server-side payment authorization. Admin controls require an authenticated admin.`,
            responseMimeType: "application/json",
            temperature: 0.65,
            tools: [{ functionDeclarations: malviToolDeclarations }],
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Malvi AI timeout after 8000ms")), 8000)),
      ]);

      if (!response?.text && !(response?.functionCalls?.length)) return res.status(502).json({ success: false, error: "Malvi AI returned no response." });
      const parsed = response?.text ? JSON.parse(response.text) : {};

      // Convert Gemini tool calls into server-authorized UI actions/proposals.
      // The server remains authoritative: tool calls never directly mutate money,
      // billing, admin state, or provider configuration.
      const functionCalls = Array.isArray(response?.functionCalls) ? response.functionCalls : [];
      for (const call of functionCalls) {
        const args = call?.args || {};
        if (call.name === "navigate_nanivio") {
          parsed.actionCommand = { type: "navigate", target: args.target };
        } else if (call.name === "configure_langpretation") {
          parsed.actionCommand = { type: "langpretation", enable: Boolean(args.enable), sourceLang: args.sourceLang, targetLang: args.targetLang };
        } else if (call.name === "find_expert") {
          parsed.actionCommand = { type: "find_expert", category: args.category, expertName: args.expertName };
        } else if (call.name === "propose_transfer") {
          parsed.proposal = {
            type: "transfer",
            title: "Confirm transfer",
            description: "Malvi prepared this transfer request. No money has moved. Confirming will pass the request to Nanivio's authorized payment flow.",
            requiresConfirmation: true,
            details: { recipient: args.recipient, amount: Number(args.amount), currency: args.currency, channel: args.channel },
          };
        } else if (call.name === "request_admin_control") {
          if (!isAdmin) {
            parsed.reply = "I can prepare an administration request, but only an authenticated Nanivio administrator can authorize that control.";
            parsed.detectedIntent = "admin_control_denied";
          } else {
            parsed.proposal = {
              type: "admin_switch",
              title: "Confirm administrator control",
              description: "Malvi prepared an administrator control request. Nanivio will validate your admin session before applying it.",
              requiresConfirmation: true,
              details: args,
            };
          }
        }
      }
      return res.json({
        success: true,
        reply: parsed.reply,
        emotion: parsed.emotion || "warm",
        detectedIntent: parsed.detectedIntent || "general_chat",
        suggestedActions: parsed.suggestedActions || [],
        actionCommand: parsed.actionCommand || null,
        proposal: parsed.proposal || null,
        isAdminResponse: Boolean(parsed.isAdminResponse || (isAdmin && parsed.detectedIntent?.startsWith("admin"))),
        model: process.env.MALVI_MODEL || "gemini-3.8-flash",
      });
    } catch (error: any) {
      console.error("Malvi AI provider error:", error);
      return res.status(502).json({ success: false, error: "Malvi AI provider failed. No simulated response was generated." });
    }

  } catch (error: any) {
    res.status(500).json({ error: error.message || "Malvi service error" });
  }
});


// Stream Chat Webhook & Message Langpretation Bridge
app.post("/api/stream/webhook", requireStreamWebhookSignature, async (req, res) => {
  try {
    const event = req.body;
    // Intercept message.new event to translate into target language
    if (event?.type === "message.new" && event?.message?.text) {
      const { text } = event.message;
      const targetLang = event?.targetLang || "ak"; // Default receiver language
      const sourceLang = event?.sourceLang || "auto";

      // Translate via Nanivio Multi-Provider Langpretation Engine (Khaya, Sunbird, Azure, NLLB)
      let translated: string | null = null;
      try {
        const isGhanaian = GHANAIAN_LANGUAGES.has(sourceLang) || GHANAIAN_LANGUAGES.has(targetLang);
        const isEastAfrican = EAST_AFRICAN_LANGUAGES.has(sourceLang) || EAST_AFRICAN_LANGUAGES.has(targetLang);

        let candidate: { text: string; provider: string } | null = null;
        if (isGhanaian) {
          candidate = await callKhayaEngine(text, sourceLang, targetLang);
        } else if (isEastAfrican) {
          candidate = await callSunbirdEngine(text, sourceLang, targetLang);
        } else {
          candidate = await translateWithProductionProviders(text, sourceLang, targetLang);
        }


        if (candidate?.text) translated = candidate.text;
      } catch (e) {
        console.warn("Stream webhook translation unavailable:", e);
      }
      if (!translated) return res.status(503).json({handled:false,error:"Translation provider unavailable for this language pair."});
      return res.json({handled:true,originalText:text,translatedText:translated,targetLang});
    }

    res.json({ handled: true, eventType: event?.type || "unknown" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// NANIVIO LIVE SERVICES & GOOGLE MAPS API ENDPOINTS
// (Cars, Drivers, Direction Routes, Uba Car Renting, Nearest Mechanics, Hospitals)
// ============================================================================

// 1. Get Live Active Nanivio Drivers
app.get("/api/services/live/drivers", (_req, res) => {
  return res.status(503).json({ success: false, error: "Live ride-hailing provider is not connected. No simulated driver, trip, fare, or booking is returned." });
});

// 2. Dispatch Nanivio Ride Request
app.post("/api/services/ride/request", (req, res) => {
  return res.status(503).json({ success: false, error: "Live ride-hailing provider is not connected. No simulated driver, trip, fare, or booking is returned." });
});

// 3. Book Uba Car Rental
app.post("/api/services/rental/book", (req, res) => {
  return res.status(503).json({ success: false, error: "Live ride-hailing provider is not connected. No simulated driver, trip, fare, or booking is returned." });
});

async function startServer() {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    (typeof __filename !== "undefined" && (__filename.includes("dist") || __filename.endsWith(".cjs")));

  if (!isPersistentBillingConfigured()) {
    if (!isProduction) {
      const setupServer = http.createServer(createSetupPreview());
      rejectSetupRealtime(setupServer);
      setupServer.listen(PORT, "0.0.0.0", () => {
        console.warn(`[Nanivio] Development setup preview running on port ${PORT}. Supabase is missing; application APIs and realtime are disabled.`);
      });
      return;
    }
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Nanivio will not start with in-memory financial state.");
  }
  await hydrateBillingDatabase(billingDb);

  const httpServer = http.createServer(app);

  // Initialize Real-time WebSockets & Calling Signaling Server
  setupRealtimeServer(httpServer);

  // Determine production environment:
  // - Explicit NODE_ENV=production
  // - Running from dist bundle (e.g. node dist/server.cjs on Render)
  if (isProduction) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    // Dynamic import of Vite only in development to prevent bundling/runtime errors in production
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const shutdown = async (signal: string) => {
    console.log(`[Nanivio] ${signal}: flushing persistent billing state...`);
    try { await flushBillingDatabase(billingDb, true); } finally { await closeBillingPersistence(); process.exit(0); }
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Nanivio real-time telecom platform server running on http://localhost:${PORT}`);
  });
}

startServer();





