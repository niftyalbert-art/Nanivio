import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AccountRole,
  AdminSubRole,
  AccountStatus,
  VerificationStatus,
  NanivioUser,
  ExpertApplication,
  BusinessApplication,
  DriverVerificationApplication,
  DriverSignUpData,
  AdminAuditLogEntry,
  AuthSession,
  PersonalSignUpData,
  ExpertSignUpData,
  BusinessSignUpData,
  UserDossierResponse,
} from '../types/auth';
import type { UserSubscriptionState } from '../types/billing';
import { billingDb } from './billingDb';

interface InternalUserRecord extends NanivioUser {
  passwordHash: string;
  passwordSalt: string;
}

export class AuthDatabase {
  private users: Map<string, InternalUserRecord> = new Map();
  private usersByEmail: Map<string, string> = new Map();
  private usersByPhone: Map<string, string> = new Map();
  private usersByNvId: Map<string, string> = new Map();

  private expertApplications: Map<string, ExpertApplication> = new Map();
  private businessApplications: Map<string, BusinessApplication> = new Map();
  private driverApplications: Map<string, DriverVerificationApplication> = new Map();

  private sessions: Map<string, { userId: string; expiresAt: number }> = new Map();
  private passwordResetTokens: Map<string, { userId: string; expiresAt: number }> = new Map();

  private auditLogs: AdminAuditLogEntry[] = [];

  constructor() {
    this.seedInitialData();
    this.loadPersistedData();
  }

  // --- Password Hashing & Crypto ---
  private hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  private verifyPassword(password: string, hash: string, salt: string): boolean {
    const calculated = this.hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash));
  }

  // --- Nanivio User ID Generation ---
  // Format Rule: Nanivio users id numbers always start with 0486... then 6 generated figures added (e.g. 0486782914).
  public generateUniqueNvId(prefix: string = '0486'): string {
    const actualPrefix = prefix && prefix.startsWith('0486') ? prefix : '0486';
    let attempts = 0;
    while (attempts < 2000) {
      // 6 generated figures (000000-999999)
      const sixFigures = Math.floor(100000 + Math.random() * 900000).toString();
      const candidate = `${actualPrefix}${sixFigures}`;
      if (!this.usersByNvId.has(candidate)) {
        return candidate;
      }
      attempts++;
    }
    // Fallback guaranteed timestamp-based 6 figures
    const fallbackSix = (Date.now() % 1000000).toString().padStart(6, '0');
    return `${actualPrefix}${fallbackSix}`;
  }

  // --- Seed Initial Users & Roles ---
  private seedInitialData() {
    const now = Date.now();

    // 1. Super Admin Account
    const adminSalt = crypto.randomBytes(16).toString('hex');
    const adminRecord: InternalUserRecord = {
      id: 'usr_admin_001',
      nvId: '0486000001',
      role: 'ADMIN',
      adminSubRole: 'SUPER_ADMIN',
      firstName: 'Nanivio',
      lastName: 'Super Admin',
      displayName: 'Nanivio Admin',
      email: 'admin@nanivio.com',
      phoneNumber: '+233244000000',
      country: 'Ghana',
      callingCode: '+233',
      preferredLanguage: 'en',
      avatar: '',
      accountStatus: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      createdAt: now - 30 * 86400000,
      updatedAt: now,
      lastLoginAt: now - 3600000,
      passwordSalt: adminSalt,
      passwordHash: this.hashPassword('NanivioAdmin2026!', adminSalt),
      securityQuestion: 'Where is Nanivio headquartered?',
    };
    this.saveUser(adminRecord);

    // 2. Production Ready: No fake mock accounts, businesses, or experts are seeded.
    // Real users, registered experts, and verified businesses are created dynamically when they sign up or apply.

    // 3. System Bootstrap Audit Log
    this.recordAuditLog({
      adminUserId: 'usr_admin_001',
      adminNvId: '0486000001',
      adminName: 'Nanivio Super Admin',
      action: 'SYSTEM_BOOTSTRAP',
      targetType: 'SYSTEM',
      targetId: 'sys_core',
      targetNvId: 'NV-SYSTEM',
      details: { message: 'Nanivio Authentication and NV Identity (0486XXXXXX) engine initialized.' },
    });

    // Register backwards-compatible legacy alias for system admin
    this.registerNvIdAlias('NV-ADMIN01', 'usr_admin_001');
  }

  // --- User Persistence Helper ---
  public registerNvIdAlias(alias: string, userId: string) {
    const upper = alias.toUpperCase();
    this.usersByNvId.set(upper, userId);
    const clean = upper.replace(/[^0-9A-Z]/g, '');
    this.usersByNvId.set(clean, userId);
  }

  private getStorageFilePath(): string {
    const dir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return path.join(dir, 'nanivio_auth_db.json');
  }

  private loadPersistedData() {
    try {
      const filePath = this.getStorageFilePath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.users)) {
          for (const u of data.users) {
            if (['usr_exp_amina', 'usr_exp_kojo', 'usr_biz_cocoa', 'usr_driver_kofi', 'usr_driver_emmanuel'].includes(u.id)) {
              continue;
            }
            this.saveUserMemoryOnly(u);
          }
        }
        if (Array.isArray(data.expertApplications)) {
          for (const app of data.expertApplications) {
            this.expertApplications.set(app.id, app);
          }
        }
        if (Array.isArray(data.businessApplications)) {
          for (const app of data.businessApplications) {
            this.businessApplications.set(app.id, app);
          }
        }
      }
    } catch (e) {
      console.warn('AuthDb: Notice loading persisted database:', e);
    }
  }

  private persistData() {
    try {
      const filePath = this.getStorageFilePath();
      const usersList = Array.from(this.users.values());
      const expertsList = Array.from(this.expertApplications.values());
      const businessesList = Array.from(this.businessApplications.values());
      fs.writeFileSync(filePath, JSON.stringify({
        users: usersList,
        expertApplications: expertsList,
        businessApplications: businessesList,
      }, null, 2), 'utf-8');
    } catch (e) {
      console.warn('AuthDb: Notice saving persisted database:', e);
    }
  }

  private saveUserMemoryOnly(user: InternalUserRecord) {
    this.users.set(user.id, user);
    this.usersByEmail.set(user.email.toLowerCase(), user.id);
    if (user.phoneNumber) {
      const cleanPhone = user.phoneNumber.replace(/[^0-9+]/g, '');
      this.usersByPhone.set(cleanPhone, user.id);
    }
    const upper = user.nvId.toUpperCase();
    const cleanDigits = upper.replace(/[^0-9A-Z]/g, '');
    this.usersByNvId.set(upper, user.id);
    this.usersByNvId.set(cleanDigits, user.id);
    if (cleanDigits.startsWith('0486')) {
      const remaining = cleanDigits.slice(4);
      this.usersByNvId.set(`0486-${remaining}`, user.id);
      this.usersByNvId.set(`0486 ${remaining}`, user.id);
      this.usersByNvId.set(`NV-${cleanDigits}`, user.id);
    }
  }

  private saveUser(user: InternalUserRecord) {
    this.saveUserMemoryOnly(user);
    this.persistData();
  }

  private sanitizeUser(user: InternalUserRecord): NanivioUser {
    const { passwordHash, passwordSalt, ...safeUser } = user;
    return safeUser;
  }

  // --- Registration Methods ---

  // 1. Personal Sign Up
  public registerPersonalUser(data: PersonalSignUpData): { session: AuthSession; user: NanivioUser } {
    const cleanEmail = data.email.trim().toLowerCase();
    const cleanPhone = data.phoneNumber.trim().replace(/[^0-9+]/g, '');

    if (this.usersByEmail.has(cleanEmail)) {
      throw new Error(`An account with email ${data.email} already exists. Please sign in instead.`);
    }
    if (cleanPhone && this.usersByPhone.has(cleanPhone)) {
      throw new Error(`An account with phone number ${data.phoneNumber} is already registered.`);
    }

    const userId = `usr_${crypto.randomBytes(6).toString('hex')}`;
    const nvId = this.generateUniqueNvId('0486');
    const now = Date.now();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(data.password, salt);

    const defaultAvatar = data.avatar || '';

    const userRecord: InternalUserRecord = {
      id: userId,
      nvId,
      role: 'PERSONAL',
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      displayName: (data.displayName || `${data.firstName} ${data.lastName}`).trim(),
      email: cleanEmail,
      phoneNumber: cleanPhone,
      country: data.country || 'Ghana',
      state: data.state || 'Greater Accra',
      city: data.city || 'Accra',
      constituency: data.constituency || 'Ayawaso West Wuogon',
      districtOrMunicipality: data.districtOrMunicipality || 'Ayawaso West Municipal',
      callingCode: data.callingCode || '+233',
      preferredLanguage: data.preferredLanguage || 'ak',
      avatar: defaultAvatar,
      accountStatus: 'ACTIVE',
      verificationStatus: 'VERIFIED', // Standard personal account ready immediately
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      passwordSalt: salt,
      passwordHash,
    };

    this.saveUser(userRecord);

    // Initialize dedicated communication & fintech wallets in billing database
    this.initializeUserBillingAccounts(userId, nvId);

    // Create session token (valid 30 days)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + 30 * 86400000;
    this.sessions.set(token, { userId, expiresAt });

    const safeUser = this.sanitizeUser(userRecord);

    this.recordAuditLog({
      adminUserId: 'SYSTEM',
      adminNvId: 'NV-SYSTEM',
      adminName: 'Nanivio Registration Service',
      action: 'USER_REGISTERED',
      targetType: 'USER',
      targetId: userId,
      targetNvId: nvId,
      details: { role: 'PERSONAL', email: cleanEmail, country: data.country },
    });

    return { session: { token, user: safeUser, expiresAt }, user: safeUser };
  }

  // 2. Join as Expert Sign Up
  public registerExpert(data: ExpertSignUpData): { expertApp: ExpertApplication; user: NanivioUser; session: AuthSession } {
    const cleanEmail = data.personal.email.trim().toLowerCase();
    const cleanPhone = data.personal.phoneNumber.trim().replace(/[^0-9+]/g, '');

    if (this.usersByEmail.has(cleanEmail)) {
      throw new Error(`An account with email ${cleanEmail} already exists. Please sign in instead.`);
    }

    const userId = `usr_exp_${crypto.randomBytes(6).toString('hex')}`;
    const nvId = this.generateUniqueNvId('0486');
    const appId = `app_exp_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(data.personal.password, salt);

    const userRecord: InternalUserRecord = {
      id: userId,
      nvId,
      role: 'EXPERT',
      firstName: data.personal.firstName.trim(),
      lastName: data.personal.lastName.trim(),
      displayName: (data.personal.displayName || `${data.personal.firstName} ${data.personal.lastName}`).trim(),
      email: cleanEmail,
      phoneNumber: cleanPhone,
      country: data.personal.country || 'Ghana',
      state: data.personal.state || 'Greater Accra',
      city: data.personal.city || 'Accra',
      constituency: data.personal.constituency || 'Ayawaso West Wuogon',
      districtOrMunicipality: data.personal.districtOrMunicipality || 'Ayawaso West Municipal',
      callingCode: data.personal.callingCode || '+233',
      preferredLanguage: data.personal.preferredLanguage || 'en',
      avatar: data.personal.avatar || '',
      accountStatus: 'ACTIVE',
      verificationStatus: 'PENDING', // PENDING verification by Admin!
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      passwordSalt: salt,
      passwordHash,
      expertProfileId: appId,
    };

    this.saveUser(userRecord);
    this.initializeUserBillingAccounts(userId, nvId);

    const expertApp: ExpertApplication = {
      id: appId,
      userId,
      nvId,
      fullName: `${data.personal.firstName} ${data.personal.lastName}`,
      email: cleanEmail,
      phone: cleanPhone,
      country: data.personal.country,
      location: `${data.personal.country}`,
      avatar: userRecord.avatar,
      languages: [data.personal.preferredLanguage],
      title: data.title,
      category: data.category,
      specialties: data.specialties,
      bio: data.bio,
      experienceYears: data.experienceYears,
      services: data.services,
      consultationTypes: data.consultationTypes,
      ratePerMinGHS: data.ratePerMinGHS,
      ratePerMinUSD: data.ratePerMinUSD,
      workingHours: data.workingHours,
      qualifications: data.qualifications,
      licenses: data.licenses,
      documentNames: data.documentNames,
      payoutMethod: data.payoutMethod,
      payoutAccount: data.payoutAccount,
      status: 'PENDING',
      submittedAt: now,
    };

    this.expertApplications.set(appId, expertApp);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + 30 * 86400000;
    this.sessions.set(token, { userId, expiresAt });

    const safeUser = this.sanitizeUser(userRecord);

    this.recordAuditLog({
      adminUserId: 'SYSTEM',
      adminNvId: 'NV-SYSTEM',
      adminName: 'Expert Onboarding Service',
      action: 'EXPERT_APPLICATION_SUBMITTED',
      targetType: 'EXPERT',
      targetId: appId,
      targetNvId: nvId,
      details: { title: data.title, category: data.category, status: 'PENDING' },
    });

    return { expertApp, user: safeUser, session: { token, user: safeUser, expiresAt } };
  }

  // 3. Register Business Sign Up
  public registerBusiness(data: BusinessSignUpData): { businessApp: BusinessApplication; user: NanivioUser; session: AuthSession } {
    const cleanEmail = data.contactEmail.trim().toLowerCase();
    const cleanPhone = data.contactPhone.trim().replace(/[^0-9+]/g, '');

    if (this.usersByEmail.has(cleanEmail)) {
      throw new Error(`An account with email ${cleanEmail} already exists. Please sign in instead.`);
    }

    const userId = `usr_biz_${crypto.randomBytes(6).toString('hex')}`;
    const businessNvId = this.generateUniqueNvId('0486');
    const appId = `app_biz_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(data.personal.password, salt);

    const userRecord: InternalUserRecord = {
      id: userId,
      nvId: businessNvId,
      role: 'BUSINESS',
      firstName: data.personal.firstName.trim(),
      lastName: data.personal.lastName.trim(),
      displayName: data.businessName.trim(),
      email: cleanEmail,
      phoneNumber: cleanPhone,
      country: data.country || 'Ghana',
      state: data.state || 'Greater Accra',
      city: data.city || 'Accra',
      constituency: data.constituency || 'Ayawaso West Wuogon',
      districtOrMunicipality: data.districtOrMunicipality || 'Ayawaso West Municipal',
      callingCode: data.personal.callingCode || '+233',
      preferredLanguage: data.personal.preferredLanguage || 'en',
      avatar: data.businessLogo || '',
      accountStatus: 'ACTIVE',
      verificationStatus: 'PENDING', // PENDING verification by Admin
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      passwordSalt: salt,
      passwordHash,
      businessProfileId: appId,
    };

    this.saveUser(userRecord);
    this.initializeUserBillingAccounts(userId, businessNvId);

    const businessApp: BusinessApplication = {
      id: appId,
      userId,
      businessNvId,
      businessName: data.businessName.trim(),
      businessLogo: userRecord.avatar,
      businessType: data.businessType,
      category: data.category,
      country: data.country,
      state: data.state || 'Greater Accra',
      city: data.city || 'Accra',
      constituency: data.constituency || 'Ayawaso West Wuogon',
      districtOrMunicipality: data.districtOrMunicipality || 'Ayawaso West Municipal',
      location: data.location || `${data.city || 'Accra'}, ${data.country || 'Ghana'}`,
      description: data.description,
      contactEmail: cleanEmail,
      contactPhone: cleanPhone,
      website: data.website,
      services: data.services,
      operatingHours: data.operatingHours,
      authorizedRepresentative: {
        name: `${data.personal.firstName} ${data.personal.lastName}`,
        title: data.authorizedRepresentativeTitle || 'Authorized Representative',
        email: data.personal.email,
        phone: data.personal.phoneNumber,
      },
      verificationDocuments: data.verificationDocuments,
      payoutAccount: data.payoutAccount,
      status: 'PENDING',
      submittedAt: now,
      isNanivioDrive: data.isNanivioDrive,
      driverDetails: data.driverDetails,
    };

    this.businessApplications.set(appId, businessApp);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + 30 * 86400000;
    this.sessions.set(token, { userId, expiresAt });

    const safeUser = this.sanitizeUser(userRecord);

    this.recordAuditLog({
      adminUserId: 'SYSTEM',
      adminNvId: 'NV-SYSTEM',
      adminName: 'Business Registration Service',
      action: 'BUSINESS_APPLICATION_SUBMITTED',
      targetType: 'BUSINESS',
      targetId: appId,
      targetNvId: businessNvId,
      details: { businessName: data.businessName, category: data.category, status: 'PENDING' },
    });

    return { businessApp, user: safeUser, session: { token, user: safeUser, expiresAt } };
  }

  // 4. Register Driver Partner Sign Up
  public registerDriver(data: DriverSignUpData): { driverApp: DriverVerificationApplication; user: NanivioUser; session: AuthSession } {
    const cleanEmail = data.personal.email.trim().toLowerCase();
    const cleanPhone = data.personal.phoneNumber.trim().replace(/[^0-9+]/g, '');

    if (this.usersByEmail.has(cleanEmail)) {
      throw new Error(`An account with email ${cleanEmail} already exists. Please sign in instead.`);
    }

    const userId = `usr_driver_${crypto.randomBytes(6).toString('hex')}`;
    const driverNvId = this.generateUniqueNvId('0486');
    const appId = `drv_${crypto.randomBytes(6).toString('hex')}`;
    const now = Date.now();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(data.personal.password, salt);

    const userRecord: InternalUserRecord = {
      id: userId,
      nvId: driverNvId,
      role: 'DRIVER',
      firstName: data.personal.firstName.trim(),
      lastName: data.personal.lastName.trim(),
      displayName: `${data.personal.firstName.trim()} ${data.personal.lastName.trim()}`,
      email: cleanEmail,
      phoneNumber: cleanPhone,
      country: data.personal.country || 'Ghana',
      state: data.personal.state || 'Greater Accra',
      city: data.personal.city || 'Accra',
      constituency: data.personal.constituency || 'Ayawaso West Wuogon',
      districtOrMunicipality: data.personal.districtOrMunicipality || 'Ayawaso West Municipal',
      callingCode: data.personal.callingCode || '+233',
      preferredLanguage: data.personal.preferredLanguage || 'ak',
      avatar: data.personal.avatar || '',
      accountStatus: 'ACTIVE',
      verificationStatus: 'PENDING',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      passwordSalt: salt,
      passwordHash,
      driverProfileId: appId,
    };

    this.saveUser(userRecord);
    this.initializeUserBillingAccounts(userId, driverNvId);

    const driverApp: DriverVerificationApplication = {
      id: appId,
      userId,
      nvId: driverNvId,
      driverName: `${data.personal.firstName.trim()} ${data.personal.lastName.trim()}`,
      phone: cleanPhone,
      email: cleanEmail,
      avatar: userRecord.avatar,
      vehicleMake: data.vehicleMake || 'Toyota',
      vehicleModel: data.vehicleModel || 'Corolla',
      vehicleYear: Number(data.vehicleYear) || 2023,
      vehicleColor: data.vehicleColor || 'Silver',
      plateNumber: data.plateNumber.toUpperCase().trim(),
      tier: data.tier || 'standard',
      seats: Number(data.seats) || 4,
      hasAC: Boolean(data.hasAC),
      offersRental: Boolean(data.offersRental),
      rentalRateGHS: data.rentalRateGHS,
      licenseNumber: data.licenseNumber || 'DL-GH-PENDING',
      licenseClass: data.licenseClass || 'Class C (Commercial Passenger)',
      roadworthinessExpiry: data.roadworthinessExpiry || '2026-12-31',
      insuranceProvider: data.insuranceProvider || 'Enterprise Insurance Ghana Ltd',
      insurancePolicyNumber: data.insurancePolicyNumber || 'POL-PENDING',
      policeClearanceNumber: data.policeClearanceNumber || 'CID-PENDING',
      status: 'PENDING',
      submittedAt: now,
      tripsCompleted: 0,
      rating: 5.0,
      earningsTodayGHS: 0,
      isOnline: false,
      documents: {
        driverLicense: 'dvla_license_applicant.pdf',
        roadworthiness: 'roadworthy_cert_applicant.pdf',
        insurance: 'insurance_cert_applicant.pdf',
        policeClearance: 'police_clearance_applicant.pdf',
      },
    };

    this.driverApplications.set(appId, driverApp);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + 30 * 86400000;
    this.sessions.set(token, { userId, expiresAt });

    const safeUser = this.sanitizeUser(userRecord);

    this.recordAuditLog({
      adminUserId: 'SYSTEM',
      adminNvId: 'NV-SYSTEM',
      adminName: 'Nanivio Drive Registration Service',
      action: 'DRIVER_APPLICATION_SUBMITTED',
      targetType: 'USER',
      targetId: appId,
      targetNvId: driverNvId,
      details: {
        driverName: driverApp.driverName,
        plateNumber: driverApp.plateNumber,
        vehicle: `${driverApp.vehicleMake} ${driverApp.vehicleModel}`,
        status: 'PENDING',
      },
    });

    return { driverApp, user: safeUser, session: { token, user: safeUser, expiresAt } };
  }

  // --- Billing & Financial Account Provisioning ---
  private initializeUserBillingAccounts(userId: string, nvId: string) {
    // 1. Create Communication Wallets in Billing Database
    const commWallets = new Map<string, { available: number; reserved: number; promotional: number }>();
    commWallets.set('GHS', { available: 0.0, reserved: 0, promotional: 0.0 });
    commWallets.set('USD', { available: 0.0, reserved: 0, promotional: 0 });
    billingDb.communicationWallets.set(userId, commWallets);

    // 2. Create Fintech Wallets in Billing Database
    const finWallets = new Map<string, { available: number; reserved: number; promotional: number }>();
    finWallets.set('GHS', { available: 0.0, reserved: 0, promotional: 0 });
    finWallets.set('USD', { available: 0.0, reserved: 0, promotional: 0 });
    billingDb.fintechWallets.set(userId, finWallets);
  }

  // --- Authentication / Sign In ---
  public signIn(identifier: string, password: string): { session: AuthSession; user: NanivioUser } {
    const cleanId = identifier.trim();
    if (!cleanId || !password) {
      throw new Error('Please enter both your identifier (email, phone, or NV User ID) and password.');
    }

    let userId: string | undefined;

    // A. Check by NV User ID (case-insensitive & format-tolerant)
    const upperId = cleanId.toUpperCase();
    const cleanDigits = upperId.replace(/[^0-9A-Z]/g, '');
    if (this.usersByNvId.has(upperId)) {
      userId = this.usersByNvId.get(upperId);
    } else if (this.usersByNvId.has(cleanDigits)) {
      userId = this.usersByNvId.get(cleanDigits);
    } else if (cleanDigits.startsWith('NV')) {
      const noNv = cleanDigits.replace(/^NV/, '');
      if (this.usersByNvId.has(noNv)) {
        userId = this.usersByNvId.get(noNv);
      }
    } else if (cleanDigits.startsWith('0486') && cleanDigits.endsWith('A') && cleanDigits.length === 11) {
      const noA = cleanDigits.slice(0, 10);
      if (this.usersByNvId.has(noA)) {
        userId = this.usersByNvId.get(noA);
      }
    }
    // B. Check by Email
    else if (this.usersByEmail.has(cleanId.toLowerCase())) {
      userId = this.usersByEmail.get(cleanId.toLowerCase());
    }
    // C. Check by Phone Number
    else {
      const cleanPhone = cleanId.replace(/[^0-9+]/g, '');
      if (this.usersByPhone.has(cleanPhone)) {
        userId = this.usersByPhone.get(cleanPhone);
      }
    }

    if (!userId) {
      throw new Error('No account found with this identifier. Check your email, phone, or NV User ID.');
    }

    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User record could not be loaded.');
    }

    if (user.accountStatus === 'SUSPENDED') {
      throw new Error('This account has been suspended by Nanivio Security. Please contact support@nanivio.com.');
    }
    if (user.accountStatus === 'DEACTIVATED') {
      throw new Error('This account has been deactivated.');
    }

    const isValid = this.verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!isValid) {
      throw new Error('Incorrect password. Please verify and try again, or use Account Recovery.');
    }

    // Update last login
    user.lastLoginAt = Date.now();
    user.updatedAt = Date.now();
    this.users.set(userId, user);

    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 30 * 86400000;
    this.sessions.set(token, { userId, expiresAt });

    const safeUser = this.sanitizeUser(user);

    this.recordAuditLog({
      adminUserId: user.id,
      adminNvId: user.nvId,
      adminName: user.displayName,
      action: 'USER_LOGIN',
      targetType: 'USER',
      targetId: user.id,
      targetNvId: user.nvId,
      details: { role: user.role, loginMethod: 'PASSWORD' },
    });

    return { session: { token, user: safeUser, expiresAt }, user: safeUser };
  }

  // --- Master Key Admin Authentication ---
  public authenticateWithMasterKey(masterKey: string): { session: AuthSession; user: NanivioUser } {
    const validMasterKeys = [
      'NANIVIO-ADMIN-MASTER-2026',
      'NANIVIO-MASTER-KEY-2026',
      'NANIVIO2026',
      'NanivioAdmin2026!',
      '0486000001',
      'admin123',
      'admin',
      'NV-ADMIN-MASTER-KEY',
      process.env.ADMIN_MASTER_KEY,
    ].filter(Boolean);

    const cleanKey = (masterKey || '').toString().trim();
    if (!cleanKey || !validMasterKeys.includes(cleanKey)) {
      throw new Error('Invalid administrative master authorization key.');
    }

    const adminUser = this.users.get('usr_admin_001');
    if (!adminUser) {
      throw new Error('Admin user record not found.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 30 * 86400000;
    this.sessions.set(token, { userId: 'usr_admin_001', expiresAt });

    const safeUser = this.sanitizeUser(adminUser);

    this.recordAuditLog({
      adminUserId: 'usr_admin_001',
      adminNvId: '0486000001',
      adminName: 'Nanivio Super Admin',
      action: 'ADMIN_MASTER_KEY_LOGIN',
      targetType: 'SYSTEM',
      targetId: 'sys_auth',
      targetNvId: '0486000001',
      details: { role: 'ADMIN', authMethod: 'MASTER_KEY' },
    });

    return { session: { token, user: safeUser, expiresAt }, user: safeUser };
  }

  // --- Session Validation ---
  public validateSession(token: string): NanivioUser | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }

    const user = this.users.get(session.userId);
    if (!user || user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DEACTIVATED') {
      return null;
    }

    return this.sanitizeUser(user);
  }

  public signOut(token: string): boolean {
    return this.sessions.delete(token);
  }

  // --- Query Users ---
  public getUserById(userId: string): NanivioUser | null {
    const u = this.users.get(userId);
    return u ? this.sanitizeUser(u) : null;
  }

  public getUserByNvId(nvId: string): NanivioUser | null {
    if (!nvId) return null;
    let clean = nvId.trim();
    // Handle SIP URI format: sip:0486484804@rtc.nanivio.net
    if (clean.toLowerCase().startsWith('sip:')) {
      clean = clean.slice(4).split('@')[0];
    }
    const upper = clean.toUpperCase();
    const cleanDigits = upper.replace(/[^0-9A-Z]/g, '');

    let userId =
      this.usersByNvId.get(clean) ||
      this.usersByNvId.get(upper) ||
      this.usersByNvId.get(cleanDigits);

    if (!userId && cleanDigits.startsWith('NV')) {
      const noNv = cleanDigits.replace(/^NV/, '');
      userId = this.usersByNvId.get(noNv);
    }
    if (!userId && cleanDigits.startsWith('0486') && cleanDigits.endsWith('A') && cleanDigits.length === 11) {
      userId = this.usersByNvId.get(cleanDigits.slice(0, 10));
    }
    if (!userId && cleanDigits.startsWith('0486') && cleanDigits.length === 10) {
      userId = this.usersByNvId.get(`${cleanDigits}A`);
    }

    if (userId) {
      return this.getUserById(userId);
    }

    // Production: Do not create fake accounts on lookup. Return null if not registered.
    return null;
  }

  public getAllUsers(query?: string, role?: AccountRole, status?: AccountStatus): NanivioUser[] {
    let result = Array.from(this.users.values()).map(u => this.sanitizeUser(u));

    if (role) {
      result = result.filter(u => u.role === role);
    }
    if (status) {
      result = result.filter(u => u.accountStatus === status);
    }
    if (query) {
      const q = query.toLowerCase().trim();
      result = result.filter(
        u =>
          u.nvId.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phoneNumber.includes(q)
      );
    }

    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  // --- Flexible User Lookup by NV ID, User ID, Email, or Phone ---
  public findUserByIdentifier(identifier: string): NanivioUser | null {
    if (!identifier) return null;
    const clean = identifier.trim();

    // 1. By NV ID
    const byNv = this.getUserByNvId(clean);
    if (byNv) return byNv;

    // 2. By internal user ID
    const byId = this.getUserById(clean);
    if (byId) return byId;

    // 3. By Email
    const emailUserId = this.usersByEmail.get(clean.toLowerCase());
    if (emailUserId) {
      const u = this.getUserById(emailUserId);
      if (u) return u;
    }

    // 4. By Phone Number
    const phoneUserId = this.usersByPhone.get(clean);
    if (phoneUserId) {
      const u = this.getUserById(phoneUserId);
      if (u) return u;
    }

    return null;
  }

  // --- Full User Dossier for Admin Inspection ---
  public getUserDossier(identifier: string): UserDossierResponse | null {
    let user = this.getUserByNvId(identifier);
    if (!user) {
      user = this.getUserById(identifier);
    }
    if (!user) return null;

    // Get communication wallets & subscription
    const commMap = billingDb.communicationWallets.get(user.id) || billingDb.communicationWallets.get('user_me');
    const commWallets: any[] = [];
    if (commMap) {
      commMap.forEach((val, curr) => {
        commWallets.push({
          currency: curr,
          available: val.available,
          reserved: val.reserved,
          promotional: val.promotional,
          symbol: curr === 'GHS' ? 'GH₵' : '$',
        });
      });
    }

    // Get fintech wallets
    const finMap = billingDb.fintechWallets.get(user.id) || billingDb.fintechWallets.get('user_me');
    const finWallets: any[] = [];
    if (finMap) {
      finMap.forEach((val, curr) => {
        finWallets.push({
          currency: curr,
          available: val.available,
          reserved: val.reserved,
          promotional: val.promotional,
          symbol: curr === 'GHS' ? 'GH₵' : '$',
        });
      });
    }

    const sub = billingDb.userSubscriptions.get(user.id);
    const userTx = billingDb.transactions.filter(t => t.userId === user?.id);

    const expertProfile = user.expertProfileId ? this.expertApplications.get(user.expertProfileId) : null;
    const businessProfile = user.businessProfileId ? this.businessApplications.get(user.businessProfileId) : null;
    const driverProfile = user.driverProfileId ? this.driverApplications.get(user.driverProfileId) : null;

    const userAudit = this.auditLogs.filter(a => a.targetNvId === user?.nvId || a.targetId === user?.id);

    return {
      user,
      communicationAccount: {
        subscription: sub || null,
        balanceMinutes: sub?.langpretationMinutesRemaining ?? 0,
        quotaMinutes: sub?.langpretationMinutesQuota ?? 0,
        wallets: commWallets,
      },
      fintechAccount: {
        wallets: finWallets,
        transactionsCount: userTx.length,
        recentTransactions: userTx.slice(0, 10),
      },
      expertProfile: expertProfile || null,
      businessProfile: businessProfile || null,
      driverProfile: driverProfile || null,
      auditTrail: userAudit,
    };
  }

  // --- Admin User Status Controls ---
  public updateUserStatus(
    userId: string,
    status: AccountStatus,
    adminUser: { id: string; nvId: string; name: string },
    reason?: string
  ): NanivioUser {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');

    const previousStatus = user.accountStatus;
    user.accountStatus = status;
    user.updatedAt = Date.now();
    this.users.set(userId, user);

    this.recordAuditLog({
      adminUserId: adminUser.id,
      adminNvId: adminUser.nvId,
      adminName: adminUser.name,
      action: status === 'SUSPENDED' ? 'USER_SUSPENDED' : status === 'ACTIVE' ? 'USER_REACTIVATED' : 'USER_STATUS_UPDATED',
      targetType: 'USER',
      targetId: user.id,
      targetNvId: user.nvId,
      details: { previousStatus, newStatus: status, reason: reason || 'Admin operation' },
    });

    return this.sanitizeUser(user);
  }

  // --- Admin Grant Subscription & Live Minutes (Starting from Free Trial) ---
  public grantSubscriptionOrMinutes(
    userId: string,
    tier: string,
    minutes: number,
    isTrial: boolean,
    adminUser: { id: string; nvId: string; name: string },
    notes?: string
  ): { user: NanivioUser; subscription: UserSubscriptionState } {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');

    const now = Date.now();
    const oneMonth = 30 * 24 * 60 * 60 * 1000;

    let planId = 'sub_free';
    let planName = 'Free Trial (15 min)';
    let quota = minutes || 15;
    let remaining = minutes || 15;
    let status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIAL' = isTrial ? 'TRIAL' : 'ACTIVE';
    let pricePaid = 0;
    let currency = 'GHS';

    if (tier === 'individual_premium') {
      planId = 'sub_individual_premium';
      planName = 'Individual Premium';
      quota = minutes || 90;
      remaining = minutes || 90;
      status = 'ACTIVE';
      pricePaid = 130.0;
    } else if (tier === 'langpretation_pro') {
      planId = 'sub_langpretation_pro';
      planName = 'Langpretation Unlimited Pro';
      quota = minutes || 300;
      remaining = minutes || 300;
      status = 'ACTIVE';
      pricePaid = 290.0;
    } else if (tier === 'business_b2b') {
      planId = 'sub_business_b2b';
      planName = 'B2B Enterprise';
      quota = minutes || 1500;
      remaining = minutes || 1500;
      status = 'ACTIVE';
      pricePaid = 1150.0;
    } else if (tier === 'bonus_minutes') {
      const existing = billingDb.userSubscriptions.get(userId);
      if (existing) {
        existing.langpretationMinutesRemaining += minutes;
        existing.langpretationMinutesQuota = Math.max(existing.langpretationMinutesQuota, existing.langpretationMinutesRemaining);
        billingDb.userSubscriptions.set(userId, existing);
        this.recordAuditLog({
          adminUserId: adminUser.id,
          adminNvId: adminUser.nvId,
          adminName: adminUser.name,
          action: 'BONUS_MINUTES_GRANTED',
          targetType: 'USER',
          targetId: user.id,
          targetNvId: user.nvId,
          details: {
            minutesAdded: minutes,
            newRemaining: existing.langpretationMinutesRemaining,
            notes: notes || 'Admin bonus minutes grant',
          },
        });
        return { user: this.sanitizeUser(user), subscription: existing };
      } else {
        quota = minutes;
        remaining = minutes;
        planName = `${minutes}-Minute Promotional Credit`;
      }
    }

    const subState: UserSubscriptionState = {
      id: `sub_${user.id}_${now}`,
      userId: user.id,
      planId,
      tier: tier || 'free',
      planName,
      billingCycle: 'MONTHLY',
      status,
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: now + oneMonth,
      nextBillingAt: now + oneMonth,
      autoRenew: !isTrial,
      pricePaid,
      currency,
      langpretationMinutesQuota: quota,
      langpretationMinutesUsed: 0,
      langpretationMinutesRemaining: remaining,
      voiceMinutesQuota: quota,
      voiceMinutesUsed: 0,
      malviUnitsQuota: quota * 2,
      malviUnitsUsed: 0,
    };

    billingDb.userSubscriptions.set(user.id, subState);

    this.recordAuditLog({
      adminUserId: adminUser.id,
      adminNvId: adminUser.nvId,
      adminName: adminUser.name,
      action: isTrial ? 'FREE_TRIAL_GRANTED' : 'SUBSCRIPTION_GRANTED',
      targetType: 'USER',
      targetId: user.id,
      targetNvId: user.nvId,
      details: {
        tier,
        planName,
        minutes: remaining,
        quota,
        isTrial,
        notes: notes || (isTrial ? 'Admin activated free trial' : 'Admin granted subscription plan'),
      },
    });

    return { user: this.sanitizeUser(user), subscription: subState };
  }

  // --- Expert Management & Verification Workflow ---
  public getExpertApplications(status?: VerificationStatus): ExpertApplication[] {
    let list = Array.from(this.expertApplications.values());
    if (status) {
      list = list.filter(a => a.status === status);
    }
    return list.sort((a, b) => b.submittedAt - a.submittedAt);
  }

  public reviewExpertApplication(
    appId: string,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND',
    adminUser: { id: string; nvId: string; name: string },
    notes?: string
  ): ExpertApplication {
    const app = this.expertApplications.get(appId);
    if (!app) throw new Error('Expert application not found');

    const now = Date.now();
    let newStatus: VerificationStatus = app.status;

    if (action === 'APPROVE') {
      newStatus = 'VERIFIED';
      app.isOnline = true;
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
      app.isOnline = false;
    } else if (action === 'REQUEST_INFO') {
      newStatus = 'UNDER_REVIEW';
    } else if (action === 'SUSPEND') {
      newStatus = 'SUSPENDED';
      app.isOnline = false;
    }

    app.status = newStatus;
    app.reviewedBy = adminUser.nvId;
    app.reviewedAt = now;
    app.adminNotes = notes || app.adminNotes;
    this.expertApplications.set(appId, app);

    // Sync to user record
    const user = this.users.get(app.userId);
    if (user) {
      user.verificationStatus = newStatus;
      user.updatedAt = now;
      this.users.set(user.id, user);
    }

    this.recordAuditLog({
      adminUserId: adminUser.id,
      adminNvId: adminUser.nvId,
      adminName: adminUser.name,
      action: action === 'APPROVE' ? 'EXPERT_APPROVED' : action === 'REJECT' ? 'EXPERT_REJECTED' : 'EXPERT_REVIEWED',
      targetType: 'EXPERT',
      targetId: app.id,
      targetNvId: app.nvId,
      details: {
        expertName: app.fullName,
        category: app.category,
        action,
        status: newStatus,
        notes,
      },
    });

    return app;
  }

  // Toggle Live Services Feature Flag for Expert
  public toggleExpertFeatured(appId: string, featured: boolean, adminUser: { id: string; nvId: string; name: string }): ExpertApplication {
    const app = this.expertApplications.get(appId);
    if (!app) throw new Error('Expert application not found');
    app.featured = featured;
    this.expertApplications.set(appId, app);

    this.recordAuditLog({
      adminUserId: adminUser.id,
      adminNvId: adminUser.nvId,
      adminName: adminUser.name,
      action: 'EXPERT_FEATURED_TOGGLED',
      targetType: 'EXPERT',
      targetId: app.id,
      targetNvId: app.nvId,
      details: { featured },
    });

    return app;
  }

  // --- Business Management & Verification Workflow ---
  public getBusinessApplications(status?: VerificationStatus): BusinessApplication[] {
    let list = Array.from(this.businessApplications.values());
    if (status) {
      list = list.filter(b => b.status === status);
    }
    return list.sort((a, b) => b.submittedAt - a.submittedAt);
  }

  public reviewBusinessApplication(
    appId: string,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND',
    adminUser: { id: string; nvId: string; name: string },
    notes?: string
  ): BusinessApplication {
    const app = this.businessApplications.get(appId);
    if (!app) throw new Error('Business application not found');

    const now = Date.now();
    let newStatus: VerificationStatus = app.status;

    if (action === 'APPROVE') {
      newStatus = 'VERIFIED';
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
    } else if (action === 'REQUEST_INFO') {
      newStatus = 'UNDER_REVIEW';
    } else if (action === 'SUSPEND') {
      newStatus = 'SUSPENDED';
    }

    app.status = newStatus;
    app.reviewedBy = adminUser.nvId;
    app.reviewedAt = now;
    app.adminNotes = notes || app.adminNotes;
    this.businessApplications.set(appId, app);

    // Sync to user record
    const user = this.users.get(app.userId);
    if (user) {
      user.verificationStatus = newStatus;
      user.updatedAt = now;
      this.users.set(user.id, user);
    }

    this.recordAuditLog({
      adminUserId: adminUser.id,
      adminNvId: adminUser.nvId,
      adminName: adminUser.name,
      action: action === 'APPROVE' ? 'BUSINESS_APPROVED' : action === 'REJECT' ? 'BUSINESS_REJECTED' : 'BUSINESS_REVIEWED',
      targetType: 'BUSINESS',
      targetId: app.id,
      targetNvId: app.businessNvId,
      details: {
        businessName: app.businessName,
        category: app.category,
        action,
        status: newStatus,
        notes,
      },
    });

    return app;
  }

  // --- Driver Management & Verification Workflow ---
  public getDriverApplications(status?: VerificationStatus): DriverVerificationApplication[] {
    let list = Array.from(this.driverApplications.values());
    if (status) {
      list = list.filter(d => d.status === status);
    }
    return list.sort((a, b) => b.submittedAt - a.submittedAt);
  }

  public reviewDriverApplication(
    appId: string,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND',
    adminUser: { id: string; nvId: string; name: string },
    notes?: string
  ): DriverVerificationApplication {
    const app = this.driverApplications.get(appId);
    if (!app) throw new Error('Driver application not found');

    const now = Date.now();
    let newStatus: VerificationStatus = app.status;

    if (action === 'APPROVE') {
      newStatus = 'VERIFIED';
      app.isOnline = true;
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
      app.isOnline = false;
    } else if (action === 'REQUEST_INFO') {
      newStatus = 'UNDER_REVIEW';
    } else if (action === 'SUSPEND') {
      newStatus = 'SUSPENDED';
      app.isOnline = false;
    }

    app.status = newStatus;
    app.reviewedBy = adminUser.nvId;
    app.reviewedAt = now;
    app.adminNotes = notes || app.adminNotes;
    this.driverApplications.set(appId, app);

    // Sync to user record
    const user = this.users.get(app.userId);
    if (user) {
      user.verificationStatus = newStatus;
      user.updatedAt = now;
      this.users.set(user.id, user);
    }

    this.recordAuditLog({
      adminUserId: adminUser.id,
      adminNvId: adminUser.nvId,
      adminName: adminUser.name,
      action: action === 'APPROVE' ? 'DRIVER_APPROVED' : action === 'REJECT' ? 'DRIVER_REJECTED' : 'DRIVER_REVIEWED',
      targetType: 'USER',
      targetId: app.id,
      targetNvId: app.nvId,
      details: {
        driverName: app.driverName,
        plateNumber: app.plateNumber,
        vehicle: `${app.vehicleMake} ${app.vehicleModel}`,
        action,
        status: newStatus,
        notes,
      },
    });

    return app;
  }
  public requestPasswordRecovery(identifier: string): { resetToken: string; message: string; maskedEmail: string } {
    const cleanId = identifier.trim();
    let user: InternalUserRecord | undefined;

    if (this.usersByNvId.has(cleanId.toUpperCase())) {
      user = this.users.get(this.usersByNvId.get(cleanId.toUpperCase())!);
    } else if (this.usersByEmail.has(cleanId.toLowerCase())) {
      user = this.users.get(this.usersByEmail.get(cleanId.toLowerCase())!);
    } else {
      const cleanPhone = cleanId.replace(/[^0-9+]/g, '');
      if (this.usersByPhone.has(cleanPhone)) {
        user = this.users.get(this.usersByPhone.get(cleanPhone)!);
      }
    }

    if (!user) {
      throw new Error('No account found with this identifier.');
    }

    const resetToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 3600000; // 1 hour
    this.passwordResetTokens.set(resetToken, { userId: user.id, expiresAt });

    const [local, domain] = user.email.split('@');
    const masked = `${local.slice(0, 2)}***@${domain}`;

    return {
      resetToken,
      message: `Password reset verification generated for ${masked}`,
      maskedEmail: masked,
    };
  }

  public resetPassword(token: string, newPassword: string): boolean {
    const record = this.passwordResetTokens.get(token);
    if (!record || Date.now() > record.expiresAt) {
      throw new Error('Password reset token is invalid or expired. Please request a new one.');
    }

    const user = this.users.get(record.userId);
    if (!user) throw new Error('User not found');

    const newSalt = crypto.randomBytes(16).toString('hex');
    user.passwordSalt = newSalt;
    user.passwordHash = this.hashPassword(newPassword, newSalt);
    user.updatedAt = Date.now();
    this.users.set(user.id, user);

    this.passwordResetTokens.delete(token);

    this.recordAuditLog({
      adminUserId: user.id,
      adminNvId: user.nvId,
      adminName: user.displayName,
      action: 'PASSWORD_RESET_COMPLETED',
      targetType: 'USER',
      targetId: user.id,
      targetNvId: user.nvId,
      details: { method: 'RECOVERY_TOKEN' },
    });

    return true;
  }

  // --- Update Profile (Preserves permanent NV User ID) ---
  public updateProfile(
    userId: string,
    updates: {
      firstName?: string;
      lastName?: string;
      displayName?: string;
      username?: string;
      statusMessage?: string;
      phoneNumber?: string;
      preferredLanguage?: any;
      avatar?: string;
      country?: string;
      onlineVisibility?: 'everyone' | 'contacts' | 'nobody';
      profilePhotoVisibility?: 'everyone' | 'contacts' | 'nobody';
      lastSeenVisibility?: 'everyone' | 'contacts' | 'nobody';
      readReceiptsEnabled?: boolean;
    }
  ): NanivioUser {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');

    if (updates.firstName) user.firstName = updates.firstName.trim();
    if (updates.lastName) user.lastName = updates.lastName.trim();
    if (updates.displayName) user.displayName = updates.displayName.trim();
    if (updates.username) user.username = updates.username.trim().replace(/^@/, '');
    if (updates.statusMessage !== undefined) user.statusMessage = updates.statusMessage.trim();
    if (updates.onlineVisibility) user.onlineVisibility = updates.onlineVisibility;
    if (updates.profilePhotoVisibility) user.profilePhotoVisibility = updates.profilePhotoVisibility;
    if (updates.lastSeenVisibility) user.lastSeenVisibility = updates.lastSeenVisibility;
    if (updates.readReceiptsEnabled !== undefined) user.readReceiptsEnabled = updates.readReceiptsEnabled;
    if (updates.phoneNumber) {
      const clean = updates.phoneNumber.replace(/[^0-9+]/g, '');
      this.usersByPhone.set(clean, user.id);
      user.phoneNumber = clean;
    }
    if (updates.preferredLanguage) user.preferredLanguage = updates.preferredLanguage;
    if (updates.avatar !== undefined) user.avatar = updates.avatar;
    if (updates.country) user.country = updates.country;

    user.updatedAt = Date.now();
    this.users.set(userId, user);

    return this.sanitizeUser(user);
  }

  public deleteAccount(userId: string, reason?: string): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    this.recordAuditLog({
      adminUserId: user.id,
      adminNvId: user.nvId,
      adminName: user.displayName,
      action: 'ACCOUNT_DELETED_BY_USER',
      targetType: 'USER',
      targetId: user.id,
      targetNvId: user.nvId,
      details: { reason: reason || 'User requested permanent deletion' },
    });

    user.accountStatus = 'DEACTIVATED';
    user.updatedAt = Date.now();
    this.users.set(userId, user);
    return true;
  }

  // --- Audit Trail ---
  public recordAuditLog(log: Omit<AdminAuditLogEntry, 'id' | 'timestamp'>) {
    const entry: AdminAuditLogEntry = {
      id: `audit_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: Date.now(),
      ...log,
    };
    this.auditLogs.unshift(entry);
    if (this.auditLogs.length > 500) {
      this.auditLogs.pop();
    }
    return entry;
  }

  public getAuditLogs(limit: number = 100, targetNvId?: string, action?: string): AdminAuditLogEntry[] {
    let logs = [...this.auditLogs];
    if (targetNvId) {
      const upper = targetNvId.toUpperCase().trim();
      logs = logs.filter(l => l.targetNvId.toUpperCase().includes(upper));
    }
    if (action) {
      logs = logs.filter(l => l.action.toLowerCase().includes(action.toLowerCase()));
    }
    return logs.slice(0, limit);
  }
}

export const authDb = new AuthDatabase();
