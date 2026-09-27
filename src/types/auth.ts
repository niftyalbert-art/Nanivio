import { SupportedLanguageCode } from './index';

export type AccountRole = 'PERSONAL' | 'EXPERT' | 'BUSINESS' | 'ADMIN' | 'DRIVER';

export type AdminSubRole =
  | 'SUPER_ADMIN'
  | 'USER_ADMIN'
  | 'EXPERT_ADMIN'
  | 'BUSINESS_ADMIN'
  | 'BILLING_ADMIN'
  | 'FINTECH_ADMIN'
  | 'CONTENT_ADMIN'
  | 'SECURITY_ADMIN'
  | 'DRIVER_ADMIN';

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'PENDING';

export type VerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUSPENDED';

export interface NanivioUser {
  id: string;
  nvId: string; // Permanent Unique Nanivio User ID: 0486 + 6 digits e.g. 0486782914
  role: AccountRole;
  adminSubRole?: AdminSubRole;
  firstName: string;
  lastName: string;
  displayName: string;
  username?: string; // e.g. @kwame_asante
  statusMessage?: string; // e.g. "Available", "Working with Nanivio"
  email: string;
  phoneNumber: string;
  country: string;
  state?: string; // State / Region / Province
  city?: string; // City / Town
  constituency?: string; // Constituency / Electoral Area
  districtOrMunicipality?: string; // District or Municipality
  callingCode: string;
  preferredLanguage: SupportedLanguageCode;
  avatar: string;
  onlineVisibility?: 'everyone' | 'contacts' | 'nobody';
  profilePhotoVisibility?: 'everyone' | 'contacts' | 'nobody';
  lastSeenVisibility?: 'everyone' | 'contacts' | 'nobody';
  readReceiptsEnabled?: boolean;
  accountStatus: AccountStatus;
  verificationStatus: VerificationStatus;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  // Security
  securityQuestion?: string;
  // Account links
  expertProfileId?: string;
  businessProfileId?: string;
  driverProfileId?: string;
  // Financial references
  communicationAccountId?: string;
  fintechAccountId?: string;
}

export interface ExpertApplication {
  id: string;
  userId: string;
  nvId: string; // Permanent NV User ID
  fullName: string;
  email: string;
  phone: string;
  country: string;
  location: string;
  avatar: string;
  languages: SupportedLanguageCode[];
  title: string;
  category: string;
  specialties: string[];
  bio: string;
  experienceYears: number;
  services: string[];
  consultationTypes: ('audio' | 'video' | 'chat')[];
  ratePerMinGHS: number;
  ratePerMinUSD: number;
  workingHours: string;
  qualifications: string[];
  licenses: string;
  documentNames: string[];
  payoutMethod: 'MOMO' | 'BANK';
  payoutAccount: string; // Encrypted / masked for public
  status: VerificationStatus;
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  featured?: boolean;
  isOnline?: boolean;
  submittedAt: number;
}

export interface DriverDetailsData {
  driverFullName: string;
  licenseNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  plateNumber: string;
  serviceType: 'standard' | 'comfort' | 'xl' | 'executive' | 'rental' | 'delivery';
  seats: number;
  hasAC: boolean;
  offersCarRental: boolean;
  rentalRatePerDayGHS?: number;
  country: string;
  state: string;
  city: string;
  constituency: string;
  districtOrMunicipality: string;
  spokenLanguages: SupportedLanguageCode[];
  isOnline: boolean;
}

export interface BusinessApplication {
  id: string;
  userId: string;
  businessNvId: string; // Permanent Business NV ID e.g. NV-BIZ-7A91CD
  businessName: string;
  businessLogo: string;
  businessType: string;
  category: string;
  country: string;
  state?: string;
  city?: string;
  constituency?: string;
  districtOrMunicipality?: string;
  location: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  website?: string;
  services: string[];
  operatingHours: string;
  authorizedRepresentative: {
    name: string;
    title: string;
    email: string;
    phone: string;
  };
  verificationDocuments: string[];
  payoutAccount: string;
  status: VerificationStatus;
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  submittedAt: number;
  // Nanivio Drive Specific
  isNanivioDrive?: boolean;
  driverDetails?: DriverDetailsData;
}

export interface DriverVerificationApplication {
  id: string;
  userId: string;
  nvId: string;
  driverName: string;
  phone: string;
  email: string;
  avatar: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  plateNumber: string;
  tier: 'standard' | 'comfort' | 'executive' | 'xl' | 'delivery';
  seats: number;
  hasAC: boolean;
  offersRental: boolean;
  rentalRateGHS?: number;
  licenseNumber: string;
  licenseClass: string;
  roadworthinessExpiry: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  policeClearanceNumber: string;
  status: VerificationStatus;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  adminNotes?: string;
  tripsCompleted: number;
  rating: number;
  earningsTodayGHS: number;
  isOnline: boolean;
  documents: {
    driverLicense: string;
    roadworthiness: string;
    insurance: string;
    policeClearance: string;
  };
}

export interface AdminAuditLogEntry {
  id: string;
  adminUserId: string;
  adminNvId: string;
  adminName: string;
  action: string; // 'ADMIN_LOGIN' | 'USER_SUSPENDED' | 'USER_REACTIVATED' | 'EXPERT_APPROVED' | 'EXPERT_REJECTED' | etc.
  targetType: 'USER' | 'EXPERT' | 'BUSINESS' | 'SYSTEM';
  targetId: string;
  targetNvId: string;
  timestamp: number;
  details: Record<string, any>;
}

export type AuditLogEntry = AdminAuditLogEntry;

export interface AuthSession {
  token: string;
  user: NanivioUser;
  expiresAt: number;
}

export interface SignInCredentials {
  identifier: string; // Email, Phone Number, or NV User ID
  password: string;
}

export interface PersonalSignUpData {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phoneNumber: string;
  country: string;
  state?: string; // State / Region / Province
  city?: string; // City / Town
  constituency?: string; // Constituency / Electoral Area
  districtOrMunicipality?: string; // District or Municipality
  callingCode: string;
  preferredLanguage: SupportedLanguageCode;
  password: string;
  avatar?: string;
}

export interface ExpertSignUpData {
  personal: PersonalSignUpData;
  title: string;
  category: string;
  specialties: string[];
  bio: string;
  experienceYears: number;
  services: string[];
  consultationTypes: ('audio' | 'video' | 'chat')[];
  ratePerMinGHS: number;
  ratePerMinUSD: number;
  workingHours: string;
  qualifications: string[];
  licenses: string;
  documentNames: string[];
  payoutMethod: 'MOMO' | 'BANK';
  payoutAccount: string;
}

export interface BusinessSignUpData {
  personal: PersonalSignUpData;
  businessName: string;
  businessLogo?: string;
  businessType: string;
  category: string;
  country: string;
  state?: string;
  city?: string;
  constituency?: string;
  districtOrMunicipality?: string;
  location: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  website?: string;
  services: string[];
  operatingHours: string;
  authorizedRepresentativeTitle: string;
  verificationDocuments: string[];
  payoutAccount: string;
  isNanivioDrive?: boolean;
  driverDetails?: DriverDetailsData;
}

export interface DriverSignUpData {
  personal: PersonalSignUpData;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  plateNumber: string;
  tier: 'standard' | 'comfort' | 'executive' | 'xl' | 'delivery';
  seats: number;
  hasAC: boolean;
  offersRental: boolean;
  rentalRateGHS?: number;
  licenseNumber: string;
  licenseClass: string;
  roadworthinessExpiry: string;
  insuranceProvider: string;
  insurancePolicyNumber: string;
  policeClearanceNumber: string;
}

export interface UserDossierResponse {
  user: NanivioUser;
  communicationAccount: {
    subscription: any;
    balanceMinutes: number;
    quotaMinutes: number;
    wallets: Array<{ currency: string; available: number; reserved: number; promotional: number; symbol: string }>;
  };
  fintechAccount: {
    wallets: Array<{ currency: string; available: number; reserved: number; promotional: number; symbol: string }>;
    transactionsCount: number;
    recentTransactions: any[];
  };
  expertProfile?: ExpertApplication | null;
  businessProfile?: BusinessApplication | null;
  driverProfile?: DriverVerificationApplication | null;
  auditTrail: AdminAuditLogEntry[];
}
