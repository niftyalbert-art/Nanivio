import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  User,
  Sparkles,
  CheckCircle2,
  Lock,
  Mail,
  Phone,
  ArrowRight,
  Briefcase,
  Building2,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  Globe,
  Radio,
  FileText,
  KeyRound,
  DollarSign,
  Award,
  HelpCircle,
  Fingerprint,
  MapPin,
  Navigation,
  Car,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { NanivioLogo } from '../common/NanivioLogo';
import { SUPPORTED_LANGUAGES, RideServiceTier } from '../../types';
import { SupportedLanguageCode } from '../../types';
import { CountryCallingCodeSelector } from '../common/CountryCallingCodeSelector';
import { getAllLanguages } from '../../i18n/languages';
import { NANIVIO_COMPANY } from '../../lib/nanivioVision';
import { getAuthText } from '../../i18n/authTranslations';
import { authClient } from '../../lib/authClient';

interface NanivioAuthScreenProps {
  onSuccess?: () => void;
}

export const NanivioAuthScreen: React.FC<NanivioAuthScreenProps> = ({ onSuccess }) => {
  const {
    signIn,
    signUpPersonal,
    signUpExpert,
    signUpBusiness,
    quickSwitchDemoUser,
    signInWithAdminToken,
    authMode,
    setAuthMode,
    appLanguage,
    setAppLanguage,
    myLanguage,
    setMyLanguage,
  } = useNanivio();

  // Active translation dictionary based on currently selected language
  const authTxt = getAuthText(appLanguage);

  // Active Tab: 'signin' | 'personal' | 'expert' | 'business' | 'admin'
  const [activeTab, setActiveTab] = useState<'signin' | 'personal' | 'expert' | 'business' | 'admin'>(
  typeof window !== 'undefined' && window.location.pathname === '/admin'
    ? 'admin'
    : (authMode || 'signin')
);

  // Common UI State
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedNvId, setCopiedNvId] = useState(false);

  // Sign In Form State
  const [signInIdentifier, setSignInIdentifier] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Personal Sign Up Form State
  const [personalFirst, setPersonalFirst] = useState('');
  const [personalLast, setPersonalLast] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [personalPhone, setPersonalPhone] = useState('');
  const [personalCountry, setPersonalCountry] = useState('Ghana');
  const [personalState, setPersonalState] = useState('Greater Accra');
  const [personalCity, setPersonalCity] = useState('Accra');
  const [personalConstituency, setPersonalConstituency] = useState('Ayawaso West Wuogon');
  const [personalDistrict, setPersonalDistrict] = useState('Ayawaso West Municipal');
  const [personalCallingCode, setPersonalCallingCode] = useState('+233');
  const [personalLang, setPersonalLang] = useState<SupportedLanguageCode>('ak');
  const [personalPassword, setPersonalPassword] = useState('');
  const [personalConfirmPassword, setPersonalConfirmPassword] = useState('');

  // Phone OTP Verification State (Twilio Verify & Carrier Switch)
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const [otpSandboxCode, setOtpSandboxCode] = useState<string | null>(null);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  // Phone OTP countdown
  React.useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setInterval(() => setOtpCooldown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [otpCooldown]);

  const handleSendPhoneOtp = async (phone: string, callingCode: string) => {
    if (!phone || phone.trim().length < 5) {
      setErrorMessage('Please provide a valid phone number to verify.');
      return;
    }
    const cleanNumber = phone.trim().replace(/^0+/, '');
    const fullPhone = phone.startsWith('+') ? phone.trim() : `${callingCode}${cleanNumber}`;
    try {
      setIsSendingOtp(true);
      setErrorMessage(null);
      setOtpNotice(null);
      const res = await authClient.sendPhoneOtp(fullPhone, 'sms');
      setOtpSent(true);
      setOtpCooldown(res.cooldownSeconds || 45);
      if (res.demoCode) {
        setOtpSandboxCode(res.demoCode);
      }
      setOtpNotice(res.message);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dispatch verification code.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async (phone: string, callingCode: string) => {
    if (!phoneOtpCode.trim()) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }
    const cleanNumber = phone.trim().replace(/^0+/, '');
    const fullPhone = phone.startsWith('+') ? phone.trim() : `${callingCode}${cleanNumber}`;
    try {
      setIsVerifyingOtp(true);
      setErrorMessage(null);
      const res = await authClient.verifyPhoneOtp(fullPhone, phoneOtpCode);
      setPhoneVerified(true);
      setVerifiedToken(res.verificationToken);
      setOtpNotice('Phone number verified successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid or expired verification code.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Expert Sign Up Form State
  const [expertStep, setExpertStep] = useState<1 | 2 | 3>(1);
  const [expertFirst, setExpertFirst] = useState('');
  const [expertLast, setExpertLast] = useState('');
  const [expertEmail, setExpertEmail] = useState('');
  const [expertPhone, setExpertPhone] = useState('');
  const [expertCountry, setExpertCountry] = useState('Ghana');
  const [expertState, setExpertState] = useState('Greater Accra');
  const [expertCity, setExpertCity] = useState('Accra');
  const [expertConstituency, setExpertConstituency] = useState('Ayawaso West Wuogon');
  const [expertDistrict, setExpertDistrict] = useState('Ayawaso West Municipal');
  const [expertCallingCode, setExpertCallingCode] = useState('+233');
  const [expertLang, setExpertLang] = useState<SupportedLanguageCode>('en');
  const [expertPassword, setExpertPassword] = useState('');
  const [expertTitle, setExpertTitle] = useState('');
  const [expertCategory, setExpertCategory] = useState('Healthcare & Medicine');
  const [expertBio, setExpertBio] = useState('');
  const [expertExperience, setExpertExperience] = useState(8);
  const [expertLicense, setExpertLicense] = useState('');
  const [expertRateGHS, setExpertRateGHS] = useState(12.0);
  const [expertRateUSD, setExpertRateUSD] = useState(0.85);
  const [expertPayoutMethod, setExpertPayoutMethod] = useState<'MOMO' | 'BANK'>('MOMO');
  const [expertPayoutAccount, setExpertPayoutAccount] = useState('');

  // Business Sign Up Form State
  const [bizCategoryType, setBizCategoryType] = useState<'standard' | 'nanivio_drive'>('standard');
  const [bizStep, setBizStep] = useState<1 | 2>(1);
  const [bizName, setBizName] = useState('');
  const [bizType, setBizType] = useState('Private Limited Company (LTD)');
  const [bizCategory, setBizCategory] = useState('Agri-Business & Export Logistics');
  const [bizEmail, setBizEmail] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizCountry, setBizCountry] = useState('Ghana');
  const [bizState, setBizState] = useState('Greater Accra');
  const [bizCity, setBizCity] = useState('Accra');
  const [bizConstituency, setBizConstituency] = useState('Ayawaso West Wuogon');
  const [bizDistrict, setBizDistrict] = useState('Ayawaso West Municipal');
  const [bizCallingCode, setBizCallingCode] = useState('+233');
  const [bizLocation, setBizLocation] = useState('Accra, Ghana');
  const [bizDesc, setBizDesc] = useState('');
  const [bizRepName, setBizRepName] = useState('');
  const [bizRepTitle, setBizRepTitle] = useState('Managing Director');
  const [bizPassword, setBizPassword] = useState('');
  const [bizPayoutAccount, setBizPayoutAccount] = useState('');

  // Nanivio Drive Specifics (Uba Driver)
  const [driverLicenseNumber, setDriverLicenseNumber] = useState('');
  const [driverVehicleMake, setDriverVehicleMake] = useState('Toyota');
  const [driverVehicleModel, setDriverVehicleModel] = useState('Corolla Sedan');
  const [driverVehicleYear, setDriverVehicleYear] = useState(2023);
  const [driverVehicleColor, setDriverVehicleColor] = useState('Silver Metallic');
  const [driverPlateNumber, setDriverPlateNumber] = useState('GN 4821-24');
  const [driverServiceTier, setDriverServiceTier] = useState<RideServiceTier>('standard');
  const [driverSeats, setDriverSeats] = useState(4);
  const [driverHasAC, setDriverHasAC] = useState(true);
  const [driverOffersRental, setDriverOffersRental] = useState(true);
  const [driverRentalRatePerDay, setDriverRentalRatePerDay] = useState(380);
  const [driverSpokenLangs, setDriverSpokenLangs] = useState<SupportedLanguageCode[]>(['ak', 'en']);

  // Admin Gateway State
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Password Recovery Drawer State
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [recoveryId, setRecoveryId] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  const clearMessages = () => {
    setErrorMessage(null);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNvId(true);
    setTimeout(() => setCopiedNvId(false), 2000);
  };

  // 1. Submit Sign In
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!signInIdentifier.trim() || !signInPassword) {
      setErrorMessage('Please enter your Email, Phone Number, or NV User ID and password.');
      return;
    }

    try {
      setIsLoading(true);
      await signIn(signInIdentifier.trim(), signInPassword);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Sign in failed. Check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Submit Personal Sign Up
  const handlePersonalSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!personalFirst.trim() || !personalLast.trim() || !personalEmail.trim() || !personalPassword) {
      setErrorMessage('Please complete all required fields.');
      return;
    }
    if (personalPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (personalPassword !== personalConfirmPassword) {
      setErrorMessage('Passwords do not match. Please verify.');
      return;
    }

    try {
      setIsLoading(true);
      await signUpPersonal({
        firstName: personalFirst.trim(),
        lastName: personalLast.trim(),
        displayName: `${personalFirst.trim()} ${personalLast.trim()}`,
        email: personalEmail.trim(),
        phoneNumber: personalPhone.trim(),
        country: personalCountry,
        state: personalState.trim() || 'Greater Accra',
        city: personalCity.trim() || 'Accra',
        constituency: personalConstituency.trim() || 'Ayawaso West Wuogon',
        districtOrMunicipality: personalDistrict.trim() || 'Ayawaso West Municipal',
        callingCode: personalCallingCode,
        preferredLanguage: personalLang,
        password: personalPassword,
      });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Personal registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Submit Expert Sign Up
  const handleExpertSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!expertFirst || !expertEmail || !expertPassword || !expertTitle) {
      setErrorMessage('Please fill in your credentials and professional title.');
      return;
    }

    try {
      setIsLoading(true);
      await signUpExpert({
        personal: {
          firstName: expertFirst.trim(),
          lastName: expertLast.trim(),
          displayName: `${expertTitle.startsWith('Dr.') ? '' : ''}${expertFirst.trim()} ${expertLast.trim()}`,
          email: expertEmail.trim(),
          phoneNumber: expertPhone.trim(),
          country: expertCountry,
          state: expertState.trim() || 'Greater Accra',
          city: expertCity.trim() || 'Accra',
          constituency: expertConstituency.trim() || 'Ayawaso West Wuogon',
          districtOrMunicipality: expertDistrict.trim() || 'Ayawaso West Municipal',
          callingCode: expertCallingCode,
          preferredLanguage: expertLang,
          password: expertPassword,
        },
        title: expertTitle.trim(),
        category: expertCategory,
        specialties: [expertCategory, 'Cross-Border Consultations', 'Multilingual Care'],
        bio: expertBio || 'Certified Nanivio global expert specializing in real-time multilingual services.',
        experienceYears: Number(expertExperience) || 5,
        services: ['1:1 Audio Consultation', '1:1 Video Consultation', 'Priority Chat'],
        consultationTypes: ['audio', 'video', 'chat'],
        ratePerMinGHS: Number(expertRateGHS) || 12.0,
        ratePerMinUSD: Number(expertRateUSD) || 0.85,
        workingHours: 'Mon-Sat: 08:00 - 19:00 GMT',
        qualifications: ['Certified Professional Credential', 'National Board Accredited'],
        licenses: expertLicense || 'Verified Council License',
        documentNames: ['license_certificate.pdf', 'national_id.pdf'],
        payoutMethod: expertPayoutMethod,
        payoutAccount: expertPayoutAccount || 'Primary Mobile Money Account',
      });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Expert registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Submit Business Sign Up
  const handleBusinessSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    const isDrive = bizCategoryType === 'nanivio_drive';
    if (!isDrive && (!bizName || !bizEmail || !bizPassword || !bizRepName)) {
      setErrorMessage('Please fill in organization details and authorized representative.');
      return;
    }
    if (isDrive && (!bizEmail || !bizPassword || !bizRepName || !driverPlateNumber)) {
      setErrorMessage('Please complete your driver details, plate number, and login credentials.');
      return;
    }

    try {
      setIsLoading(true);
      const names = bizRepName.trim().split(' ');
      const effectiveBizName = isDrive
        ? (bizName.trim() || `${driverVehicleMake} ${driverVehicleModel} (${driverPlateNumber})`)
        : bizName.trim();
      const effectiveCategory = isDrive
        ? 'Nanivio Drive (Ride-Hailing & Car Rental Partner / Uba Driver)'
        : bizCategory;
      const effectiveType = isDrive ? 'Nanivio Drive Fleet Partner' : bizType;

      const driverDetails = isDrive
        ? {
            licenseNumber: driverLicenseNumber || 'DL-GH-2024-9912',
            vehicleMake: driverVehicleMake,
            vehicleModel: driverVehicleModel,
            vehicleYear: Number(driverVehicleYear) || 2023,
            vehicleColor: driverVehicleColor,
            plateNumber: driverPlateNumber,
            serviceTier: driverServiceTier,
            seats: Number(driverSeats) || 4,
            hasAC: driverHasAC,
            offersCarRental: driverOffersRental,
            rentalDailyRateGHS: driverOffersRental ? Number(driverRentalRatePerDay) || 380 : undefined,
            spokenLanguages: driverSpokenLangs,
          }
        : undefined;

      await signUpBusiness({
        personal: {
          firstName: names[0] || 'Authorized',
          lastName: names.slice(1).join(' ') || 'Representative',
          displayName: effectiveBizName,
          email: bizEmail.trim(),
          phoneNumber: bizPhone.trim(),
          country: bizCountry,
          state: bizState.trim() || 'Greater Accra',
          city: bizCity.trim() || 'Accra',
          constituency: bizConstituency.trim() || 'Ayawaso West Wuogon',
          districtOrMunicipality: bizDistrict.trim() || 'Ayawaso West Municipal',
          callingCode: bizCallingCode,
          preferredLanguage: 'en',
          password: bizPassword,
        },
        businessName: effectiveBizName,
        businessType: effectiveType,
        category: effectiveCategory,
        country: bizCountry,
        state: bizState.trim() || 'Greater Accra',
        city: bizCity.trim() || 'Accra',
        constituency: bizConstituency.trim() || 'Ayawaso West Wuogon',
        districtOrMunicipality: bizDistrict.trim() || 'Ayawaso West Municipal',
        location: bizLocation || `${bizCity.trim() || 'Accra'}, ${bizCountry}`,
        description: isDrive
          ? `Verified Nanivio Drive Partner. Vehicle: ${driverVehicleMake} ${driverVehicleModel} (${driverPlateNumber}). Spoken languages: ${driverSpokenLangs.join(', ')}.`
          : (bizDesc || 'Verified commercial entity operating on the Nanivio Global Infrastructure.'),
        contactEmail: bizEmail.trim(),
        contactPhone: bizPhone.trim(),
        services: isDrive
          ? ['Nanivio On-Demand Ride Hailing', ...(driverOffersRental ? ['Uba Car Renting'] : []), 'Multilingual Rider Transit']
          : ['Enterprise Multi-lingual Rail', 'Trade Settlement & Escrow'],
        operatingHours: isDrive ? 'Active On-Demand 24/7' : 'Mon-Fri: 08:00 - 17:30 GMT',
        authorizedRepresentativeTitle: isDrive ? 'Owner & Registered Driver' : bizRepTitle,
        verificationDocuments: isDrive ? ['driver_license.pdf', 'roadworthy_cert.pdf'] : ['cert_of_incorporation.pdf', 'tax_certificate.pdf'],
        payoutAccount: bizPayoutAccount || 'Primary Mobile Money (Instant Daily Payout)',
        isNanivioDrive: isDrive,
        driverDetails,
      });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Submit Admin Login â€” Super Admin Master Key
const handleAdminSignIn = async (e: React.FormEvent) => {
  e.preventDefault();
  clearMessages();

  if (!adminPassword.trim()) {
    setErrorMessage('Please enter the Super Admin Master Key.');
    return;
  }

  try {
    setIsLoading(true);

    await signInWithAdminToken(adminPassword.trim());

    if (onSuccess) onSuccess();
  } catch (err: any) {
    setErrorMessage(err.message || 'Administrative authorization rejected.');
  } finally {
    setIsLoading(false);
  }
};

  // 6. Handle Password Recovery Request
  const handleRecoveryRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryId.trim()) return;
    try {
      setIsLoading(true);
      const res = await fetch('/api/auth/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: recoveryId.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setRecoveryMessage(
          `Recovery link generated for ${data.maskedEmail}. Demo Reset Token: ${data.resetToken.slice(0, 8)}...`
        );
      } else {
        setRecoveryMessage(data.error || 'Account not found.');
      }
    } catch {
      setRecoveryMessage('Network error occurred during recovery.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070d18] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Ambient background gradients */}
      <div className="absolute top-1/4 -left-48 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent pointer-events-none" />

      {/* Header & Nanivio Identity */}
      <div className="w-full max-w-xl mx-auto text-center mb-6 z-10 space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-emerald-500/30 text-emerald-300 text-xs font-semibold shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{NANIVIO_COMPANY.companyName}</span>
          </div>

          {/* Global App Interface Language Selector on Auth Screen - Live & Responsive */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-xs text-slate-300 shadow-md">
            <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[11px] text-slate-400">{authTxt.languageLabel}</span>
            <select
              id="select-auth-screen-language"
              aria-label="Interface Language"
              value={appLanguage}
              onChange={(e) => {
                const newCode = e.target.value;
                setAppLanguage(newCode);
                setMyLanguage(newCode as any);
                setPersonalLang(newCode as any);
              }}
              className="bg-transparent text-emerald-300 font-semibold text-xs border-none outline-none cursor-pointer pr-1"
            >
              {getAllLanguages()
                .filter((l) => l.ui)
                .map((l) => (
                  <option key={l.code} value={l.code} className="bg-slate-900 text-white">
                    {l.flag} {l.name} ({l.nativeName})
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="pt-1 flex justify-center">
          <NanivioLogo size="lg" showTagline={true} />
        </div>

        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          {authTxt.tagline || NANIVIO_COMPANY.officialTagline}
        </p>
      </div>

      {/* Main Authentication Card */}
      <div className="w-full max-w-xl mx-auto bg-[#0c1524] border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl z-10 space-y-6">
        {/* Navigation Selector for Account Entry Options */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950/80 rounded-2xl border border-slate-800 text-[11px] sm:text-xs font-semibold w-full overflow-hidden">
          <button
            id="tab-auth-signin"
            onClick={() => {
              setActiveTab('signin');
              clearMessages();
            }}
            className={`py-2 sm:py-2.5 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'signin'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{authTxt.tabSignIn}</span>
          </button>

          <button
            id="tab-auth-personal"
            onClick={() => {
              setActiveTab('personal');
              clearMessages();
            }}
            className={`py-2 sm:py-2.5 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'personal'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{authTxt.tabPersonal}</span>
          </button>

          <button
            id="tab-auth-expert"
            onClick={() => {
              setActiveTab('expert');
              clearMessages();
            }}
            className={`py-2 sm:py-2.5 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'expert'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{authTxt.tabExpert}</span>
          </button>

          <button
            id="tab-auth-business"
            onClick={() => {
              setActiveTab('business');
              clearMessages();
            }}
            className={`py-2 sm:py-2.5 px-1 rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'business'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{authTxt.tabBusiness}</span>
          </button>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/50 flex items-start gap-2.5 text-xs text-red-200"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{errorMessage}</div>
          </motion.div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 1: SIGN IN */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'signin' && (
          <form onSubmit={handleSignInSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>{authTxt.identifierLabel}</span>
                <span className="text-[10px] text-slate-500 font-mono">{authTxt.identifierSubLabel}</span>
              </label>
              <div className="relative">
                <input
                  id="input-signin-identifier"
                  type="text"
                  value={signInIdentifier}
                  onChange={(e) => setSignInIdentifier(e.target.value)}
                  placeholder={authTxt.identifierPlaceholder}
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/40"
                  required
                />
                <Mail className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">{authTxt.passwordLabel}</label>
                <button
                  type="button"
                  onClick={() => setIsRecoveryOpen(true)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline"
                >
                  {authTxt.forgotPassword}
                </button>
              </div>
              <div className="relative">
                <input
                  id="input-signin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  placeholder={authTxt.passwordPlaceholder}
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/40"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="btn-submit-signin"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{authTxt.signInBtn}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <div className="pt-2 text-center text-xs text-slate-400">
              <span>{authTxt.noAccountText} </span>
              <button
                type="button"
                onClick={() => setActiveTab('personal')}
                className="text-emerald-400 hover:underline font-semibold"
              >
                {authTxt.createAccountLink}
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 2: CREATE PERSONAL ACCOUNT */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'personal' && (
          <form onSubmit={handlePersonalSignUp} className="space-y-4">
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                  NV
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-mono">Permanent ID Preview</div>
                  <div className="text-xs font-bold text-emerald-300 font-mono">0486XXXXXX (0486 + 6 digits)</div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Instant Issuance
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{authTxt.firstNameLabel}</label>
                <input
                  id="input-personal-firstname"
                  type="text"
                  value={personalFirst}
                  onChange={(e) => setPersonalFirst(e.target.value)}
                  placeholder={authTxt.firstNamePlaceholder}
                  required
                  className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/70"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{authTxt.lastNameLabel}</label>
                <input
                  id="input-personal-lastname"
                  type="text"
                  value={personalLast}
                  onChange={(e) => setPersonalLast(e.target.value)}
                  placeholder={authTxt.lastNamePlaceholder}
                  required
                  className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/70"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">{authTxt.emailLabel}</label>
              <input
                id="input-personal-email"
                type="email"
                value={personalEmail}
                onChange={(e) => setPersonalEmail(e.target.value)}
                placeholder={authTxt.emailPlaceholder}
                required
                className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/70"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">{authTxt.phoneLabel}</label>
                <span className="text-[10px] text-emerald-400 font-medium">All 240+ Countries</span>
              </div>
              <div className="flex items-center gap-2">
                <CountryCallingCodeSelector
                  value={personalCallingCode}
                  selectedCountryName={personalCountry}
                  onChange={(dialCode, countryName) => {
                    setPersonalCallingCode(dialCode);
                    if (countryName) setPersonalCountry(countryName);
                  }}
                />
                <input
                  id="input-personal-phone"
                  type="tel"
                  value={personalPhone}
                  onChange={(e) => setPersonalPhone(e.target.value)}
                  placeholder="Phone (e.g. 024 412 3456)"
                  className="flex-1 px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/70"
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Country: <strong className="text-emerald-400 font-semibold">{personalCountry}</strong> ({personalCallingCode})
              </p>

              {/* Phone OTP Verification */}
              <div className="pt-1">
                {phoneVerified ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-medium">Phone number verified via Carrier SMS</span>
                  </div>
                ) : (
                  <div className="space-y-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">SMS Carrier Verification:</span>
                      <button
                        type="button"
                        onClick={() => handleSendPhoneOtp(personalPhone, personalCallingCode)}
                        disabled={isSendingOtp || otpCooldown > 0 || !personalPhone.trim()}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 disabled:opacity-50 transition-colors"
                      >
                        {isSendingOtp ? 'Sending...' : otpCooldown > 0 ? `Resend in ${otpCooldown}s` : otpSent ? 'Resend SMS' : 'Verify via SMS'}
                      </button>
                    </div>

                    {otpSent && (
                      <div className="space-y-2 pt-1 border-t border-slate-800/80">
                        {otpSandboxCode && (
                          <div className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-lg">
                            Preview Sandbox Code: <strong className="font-mono text-white">{otpSandboxCode}</strong>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            value={phoneOtpCode}
                            onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="Enter 6-digit OTP"
                            className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono tracking-widest text-center focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleVerifyPhoneOtp(personalPhone, personalCallingCode)}
                            disabled={isVerifyingOtp || phoneOtpCode.length < 4}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
                          >
                            {isVerifyingOtp ? 'Verifying...' : 'Confirm'}
                          </button>
                        </div>
                        {otpNotice && (
                          <p className="text-[10px] text-slate-400">{otpNotice}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Location & Electoral Geometry for Google Maps Live Services */}
            <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Location &amp; Live Map Coordinates</span>
                </span>
                <span className="text-[10px] text-slate-400">Google Map Ready</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">State / Region</label>
                  <input
                    id="input-personal-state"
                    type="text"
                    value={personalState}
                    onChange={(e) => setPersonalState(e.target.value)}
                    placeholder="e.g. Greater Accra"
                    className="w-full px-2.5 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">City / Town</label>
                  <input
                    id="input-personal-city"
                    type="text"
                    value={personalCity}
                    onChange={(e) => setPersonalCity(e.target.value)}
                    placeholder="e.g. Accra"
                    className="w-full px-2.5 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">Constituency</label>
                  <input
                    id="input-personal-constituency"
                    type="text"
                    value={personalConstituency}
                    onChange={(e) => setPersonalConstituency(e.target.value)}
                    placeholder="e.g. Ayawaso West Wuogon"
                    className="w-full px-2.5 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">District / Municipality</label>
                  <input
                    id="input-personal-district"
                    type="text"
                    value={personalDistrict}
                    onChange={(e) => setPersonalDistrict(e.target.value)}
                    placeholder="e.g. Ayawaso West Municipal"
                    className="w-full px-2.5 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>{authTxt.preferredLangLabel}</span>
                <span className="text-[10px] text-emerald-400">1:1 Langpretation Ready</span>
              </label>
              <select
                id="select-personal-lang"
                value={personalLang}
                onChange={(e) => {
                  const val = e.target.value as SupportedLanguageCode;
                  setPersonalLang(val);
                  setAppLanguage(val);
                  setMyLanguage(val);
                }}
                className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/70"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{authTxt.createPasswordLabel}</label>
                <input
                  id="input-personal-password"
                  type="password"
                  value={personalPassword}
                  onChange={(e) => setPersonalPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                  className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/70"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{authTxt.confirmPasswordLabel}</label>
                <input
                  id="input-personal-password-confirm"
                  type="password"
                  value={personalConfirmPassword}
                  onChange={(e) => setPersonalConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  required
                  className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/70"
                />
              </div>
            </div>

            <button
              id="btn-submit-personal-signup"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{authTxt.createPersonalBtn}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="pt-2 text-center text-xs text-slate-400">
              <span>{authTxt.alreadyHaveAccount} </span>
              <button
                type="button"
                onClick={() => setActiveTab('signin')}
                className="text-emerald-400 hover:underline font-semibold"
              >
                {authTxt.signInLink}
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 3: JOIN AS EXPERT */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'expert' && (
          <form onSubmit={handleExpertSignUp} className="space-y-4">
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-emerald-500/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Expert Verification Workflow</span>
                </div>
                <div className="text-[10px] text-slate-400">Step {expertStep} of 3 Â· Subject to Admin Review</div>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className={`w-2 h-2 rounded-full ${expertStep >= 1 ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                <span className={`w-2 h-2 rounded-full ${expertStep >= 2 ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                <span className={`w-2 h-2 rounded-full ${expertStep >= 3 ? 'bg-emerald-400' : 'bg-slate-700'}`} />
              </div>
            </div>

            {expertStep === 1 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">First Name</label>
                    <input
                      type="text"
                      value={expertFirst}
                      onChange={(e) => setExpertFirst(e.target.value)}
                      placeholder="e.g. Kwame"
                      required
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Last Name</label>
                    <input
                      type="text"
                      value={expertLast}
                      onChange={(e) => setExpertLast(e.target.value)}
                      placeholder="e.g. Mensah"
                      required
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Professional Email</label>
                  <input
                    type="email"
                    value={expertEmail}
                    onChange={(e) => setExpertEmail(e.target.value)}
                    placeholder="amina.mensah@nanivio.com"
                    required
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Country Calling Code & Phone</label>
                  <div className="flex items-center gap-2">
                    <CountryCallingCodeSelector
                      value={expertCallingCode}
                      selectedCountryName={expertCountry}
                      onChange={(dialCode, countryName) => {
                        setExpertCallingCode(dialCode);
                        if (countryName) setExpertCountry(countryName);
                      }}
                    />
                    <input
                      type="tel"
                      value={expertPhone}
                      onChange={(e) => setExpertPhone(e.target.value)}
                      placeholder="Phone (e.g. 24 498 7654)"
                      className="flex-1 px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                {/* Location Fields */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">State / Region</label>
                    <input
                      type="text"
                      value={expertState}
                      onChange={(e) => setExpertState(e.target.value)}
                      placeholder="e.g. Greater Accra"
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700/70 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">City / Town</label>
                    <input
                      type="text"
                      value={expertCity}
                      onChange={(e) => setExpertCity(e.target.value)}
                      placeholder="e.g. Accra"
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700/70 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">Constituency</label>
                    <input
                      type="text"
                      value={expertConstituency}
                      onChange={(e) => setExpertConstituency(e.target.value)}
                      placeholder="e.g. Ayawaso West Wuogon"
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700/70 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">District / Municipality</label>
                    <input
                      type="text"
                      value={expertDistrict}
                      onChange={(e) => setExpertDistrict(e.target.value)}
                      placeholder="e.g. Ayawaso West Municipal"
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700/70 rounded-lg text-xs text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Password</label>
                  <input
                    type="password"
                    value={expertPassword}
                    onChange={(e) => setExpertPassword(e.target.value)}
                    placeholder="Password (minimum 6 characters)"
                    required
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setExpertStep(2)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2"
                >
                  <span>Next: Professional Credentials</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {expertStep === 2 && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Professional Title / Designation</label>
                  <input
                    type="text"
                    value={expertTitle}
                    onChange={(e) => setExpertTitle(e.target.value)}
                    placeholder="Senior Telemedicine Consultant & Pediatrician"
                    required
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Category</label>
                    <select
                      value={expertCategory}
                      onChange={(e) => setExpertCategory(e.target.value)}
                      className="w-full px-2.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    >
                      <option value="Healthcare & Medicine">Healthcare &amp; Medicine</option>
                      <option value="Legal & Advisory">Legal &amp; Advisory</option>
                      <option value="Cross-Border Trade">Cross-Border Trade</option>
                      <option value="Translation & Langpretation">Translation &amp; Langpretation</option>
                      <option value="Technology & AI">Technology &amp; AI</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Experience (Years)</label>
                    <input
                      type="number"
                      value={expertExperience}
                      onChange={(e) => setExpertExperience(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Professional License / Registration #</label>
                  <input
                    type="text"
                    value={expertLicense}
                    onChange={(e) => setExpertLicense(e.target.value)}
                    placeholder="e.g. Medical and Dental Council #MDC/RN/14920"
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setExpertStep(1)}
                    className="w-1/3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-medium"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpertStep(3)}
                    className="w-2/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2"
                  >
                    <span>Next: Rates &amp; Payout</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {expertStep === 3 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Rate per Min (GHâ‚µ)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={expertRateGHS}
                      onChange={(e) => setExpertRateGHS(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Rate per Min (USD $)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={expertRateUSD}
                      onChange={(e) => setExpertRateUSD(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Payout Account (Settlement Rail)</label>
                  <input
                    type="text"
                    value={expertPayoutAccount}
                    onChange={(e) => setExpertPayoutAccount(e.target.value)}
                    placeholder="MTN Mobile Money: 0244987654 or Bank Routing"
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setExpertStep(2)}
                    className="w-1/3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-medium"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-2/3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Submit for Admin Verification</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 4: REGISTER BUSINESS / ORGANIZATION & NANIVIO DRIVE */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'business' && (
          <form onSubmit={handleBusinessSignUp} className="space-y-4">
            {/* Business Category Switcher */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setBizCategoryType('standard')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  bizCategoryType === 'standard'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Commercial Business</span>
              </button>
              <button
                type="button"
                onClick={() => setBizCategoryType('nanivio_drive')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  bizCategoryType === 'nanivio_drive'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-emerald-400 hover:text-emerald-300'
                }`}
              >
                <Car className="w-3.5 h-3.5" />
                <span>Nanivio Drive (Uba Driver)</span>
              </button>
            </div>

            {/* Header info banner */}
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-emerald-500/20 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  {bizCategoryType === 'nanivio_drive' ? (
                    <>
                      <Car className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Nanivio Drive Partner Onboarding</span>
                    </>
                  ) : (
                    <>
                      <Building2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Corporate Entity Registration</span>
                    </>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">
                  {bizCategoryType === 'nanivio_drive'
                    ? 'Live Car Driver & Uba Fleet Registration'
                    : `Step ${bizStep} of 2 Â· Permanent Business NV ID`}
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                bizCategoryType === 'nanivio_drive'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
              }`}>
                {bizCategoryType === 'nanivio_drive' ? 'Driver Partner' : 'Enterprise'}
              </span>
            </div>

            {/* Standard Business Step 1 */}
            {bizCategoryType === 'standard' && bizStep === 1 && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Registered Business / Organization Name</label>
                  <input
                    type="text"
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    placeholder="e.g. Acme Enterprise Ltd"
                    required
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Business Type</label>
                    <select
                      value={bizType}
                      onChange={(e) => setBizType(e.target.value)}
                      className="w-full px-2.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    >
                      <option value="Private Limited Company (LTD)">Private Limited Company (LTD)</option>
                      <option value="Corporation / PLC">Corporation / PLC</option>
                      <option value="Non-Governmental Org (NGO)">Non-Governmental Org (NGO)</option>
                      <option value="Sole Proprietorship">Sole Proprietorship</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Industry / Sector</label>
                    <input
                      type="text"
                      value={bizCategory}
                      onChange={(e) => setBizCategory(e.target.value)}
                      placeholder="Agri-Business & Export Logistics"
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Corporate Email</label>
                  <input
                    type="email"
                    value={bizEmail}
                    onChange={(e) => setBizEmail(e.target.value)}
                    placeholder="contact@ghanacocoadirect.com"
                    required
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Official Phone & Calling Code</label>
                  <div className="flex items-center gap-2">
                    <CountryCallingCodeSelector
                      value={bizCallingCode}
                      selectedCountryName={bizCountry}
                      onChange={(dialCode, countryName) => {
                        setBizCallingCode(dialCode);
                        if (countryName) setBizCountry(countryName);
                      }}
                    />
                    <input
                      type="tel"
                      value={bizPhone}
                      onChange={(e) => setBizPhone(e.target.value)}
                      placeholder="Phone (e.g. 30 255 5666)"
                      className="flex-1 px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                {/* Location Fields */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">State / Region</label>
                    <input
                      type="text"
                      value={bizState}
                      onChange={(e) => setBizState(e.target.value)}
                      placeholder="e.g. Greater Accra"
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700/70 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">City / Town</label>
                    <input
                      type="text"
                      value={bizCity}
                      onChange={(e) => setBizCity(e.target.value)}
                      placeholder="e.g. Accra"
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700/70 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">Constituency</label>
                    <input
                      type="text"
                      value={bizConstituency}
                      onChange={(e) => setBizConstituency(e.target.value)}
                      placeholder="e.g. Ayawaso West Wuogon"
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700/70 rounded-lg text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-400">District / Municipality</label>
                    <input
                      type="text"
                      value={bizDistrict}
                      onChange={(e) => setBizDistrict(e.target.value)}
                      placeholder="e.g. Ayawaso West Municipal"
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700/70 rounded-lg text-xs text-white"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setBizStep(2)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Next: Authorized Representative &amp; Compliance</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Standard Business Step 2 */}
            {bizCategoryType === 'standard' && bizStep === 2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Authorized Representative</label>
                    <input
                      type="text"
                      value={bizRepName}
                      onChange={(e) => setBizRepName(e.target.value)}
                      placeholder="Yaw Ofori"
                      required
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Title</label>
                    <input
                      type="text"
                      value={bizRepTitle}
                      onChange={(e) => setBizRepTitle(e.target.value)}
                      placeholder="Managing Director"
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Create Corporate Password</label>
                  <input
                    type="password"
                    value={bizPassword}
                    onChange={(e) => setBizPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    required
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Settlement Payout Account</label>
                  <input
                    type="text"
                    value={bizPayoutAccount}
                    onChange={(e) => setBizPayoutAccount(e.target.value)}
                    placeholder="Ecobank Ghana: 1441002981019 or Corporate MoMo"
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBizStep(1)}
                    className="w-1/3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-2/3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Submit Business Registration</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* NANIVIO DRIVE (UBA DRIVER) FORM */}
            {bizCategoryType === 'nanivio_drive' && (
              <div className="space-y-3.5">
                <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Sign up as an active Nanivio Car Driver &amp; Uba Fleet partner. Earn instant daily payouts with live Google Map routing.
                  </span>
                </div>

                {/* Driver Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Driver Full Legal Name</label>
                    <input
                      type="text"
                      value={bizRepName}
                      onChange={(e) => setBizRepName(e.target.value)}
                      placeholder="e.g. Samuel K. Asante"
                      required
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Driver's License Number</label>
                    <input
                      type="text"
                      value={driverLicenseNumber}
                      onChange={(e) => setDriverLicenseNumber(e.target.value)}
                      placeholder="e.g. DL-GH-2024-9912"
                      required
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                {/* Phone and Email */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Email Address</label>
                    <input
                      type="email"
                      value={bizEmail}
                      onChange={(e) => setBizEmail(e.target.value)}
                      placeholder="driver@nanivio.com"
                      required
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Driver Phone (MoMo Line)</label>
                    <div className="flex items-center gap-1.5">
                      <CountryCallingCodeSelector
                        value={bizCallingCode}
                        selectedCountryName={bizCountry}
                        onChange={(dialCode, countryName) => {
                          setBizCallingCode(dialCode);
                          if (countryName) setBizCountry(countryName);
                        }}
                      />
                      <input
                        type="tel"
                        value={bizPhone}
                        onChange={(e) => setBizPhone(e.target.value)}
                        placeholder="024 498 7654"
                        required
                        className="flex-1 px-2.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Vehicle Specifications */}
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Vehicle &amp; Fleet Specifications</span>
                  </span>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">Make</label>
                      <input
                        type="text"
                        value={driverVehicleMake}
                        onChange={(e) => setDriverVehicleMake(e.target.value)}
                        placeholder="Toyota"
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">Model</label>
                      <input
                        type="text"
                        value={driverVehicleModel}
                        onChange={(e) => setDriverVehicleModel(e.target.value)}
                        placeholder="Corolla"
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">Year</label>
                      <input
                        type="number"
                        value={driverVehicleYear}
                        onChange={(e) => setDriverVehicleYear(Number(e.target.value))}
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">Color</label>
                      <input
                        type="text"
                        value={driverVehicleColor}
                        onChange={(e) => setDriverVehicleColor(e.target.value)}
                        placeholder="Silver Metallic"
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">Plate Number</label>
                      <input
                        type="text"
                        value={driverPlateNumber}
                        onChange={(e) => setDriverPlateNumber(e.target.value)}
                        placeholder="GN 4821-24"
                        required
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-emerald-300 font-mono font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">Service Category</label>
                      <select
                        value={driverServiceTier}
                        onChange={(e) => setDriverServiceTier(e.target.value as RideServiceTier)}
                        className="w-full px-1.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      >
                        <option value="standard">Nanivio Go</option>
                        <option value="comfort">Nanivio Comfort</option>
                        <option value="xl">Nanivio XL (6-Seat)</option>
                        <option value="executive">Nanivio Executive</option>
                        <option value="delivery">Nanivio Delivery</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={driverHasAC}
                        onChange={(e) => setDriverHasAC(e.target.checked)}
                        className="rounded accent-emerald-500"
                      />
                      <span>Air Conditioning (A/C) Equipped</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-emerald-400 font-semibold">
                      <input
                        type="checkbox"
                        checked={driverOffersRental}
                        onChange={(e) => setDriverOffersRental(e.target.checked)}
                        className="rounded accent-emerald-500"
                      />
                      <span>Enable for Uba Car Renting</span>
                    </label>
                  </div>

                  {driverOffersRental && (
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-300">Daily Car Rental Rate:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 font-mono">GHâ‚µ</span>
                        <input
                          type="number"
                          value={driverRentalRatePerDay}
                          onChange={(e) => setDriverRentalRatePerDay(Number(e.target.value))}
                          className="w-24 px-2 py-1 bg-slate-950 border border-slate-600 rounded text-xs text-emerald-400 font-mono font-bold"
                        />
                        <span className="text-[10px] text-slate-400">/day</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Location Across Google Map */}
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Driver Operating Territory</span>
                    </span>
                    <span className="text-[10px] text-slate-400">Google Map Matching</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">State / Region</label>
                      <input
                        type="text"
                        value={bizState}
                        onChange={(e) => setBizState(e.target.value)}
                        placeholder="Greater Accra"
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">City / Town</label>
                      <input
                        type="text"
                        value={bizCity}
                        onChange={(e) => setBizCity(e.target.value)}
                        placeholder="Accra"
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">Constituency</label>
                      <input
                        type="text"
                        value={bizConstituency}
                        onChange={(e) => setBizConstituency(e.target.value)}
                        placeholder="Ayawaso West Wuogon"
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-400">District / Municipality</label>
                      <input
                        type="text"
                        value={bizDistrict}
                        onChange={(e) => setBizDistrict(e.target.value)}
                        placeholder="Ayawaso West Municipal"
                        className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Spoken Languages across Nanivio App */}
                <div className="space-y-1.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Driver Spoken Languages</span>
                    <span className="text-[10px] text-emerald-400 font-medium">Multilingual Langpretation</span>
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Select the languages you speak fluently to match with local &amp; international riders:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1 max-h-28 overflow-y-auto">
                    {SUPPORTED_LANGUAGES.map((lang) => {
                      const isSelected = driverSpokenLangs.includes(lang.code);
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setDriverSpokenLangs((prev) => prev.filter((c) => c !== lang.code));
                            } else {
                              setDriverSpokenLangs((prev) => [...prev, lang.code]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                          }`}
                        >
                          <span>{lang.flag}</span>
                          <span>{lang.name}</span>
                          {isSelected && <Check className="w-3 h-3 text-emerald-400 ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Password and MoMo Settlement */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Driver App Password</label>
                    <input
                      type="password"
                      value={bizPassword}
                      onChange={(e) => setBizPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      required
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Driver MoMo / Bank Payout</label>
                    <input
                      type="text"
                      value={bizPayoutAccount}
                      onChange={(e) => setBizPayoutAccount(e.target.value)}
                      placeholder="MTN MoMo: 0244987654"
                      required
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Car className="w-4 h-4" />
                      <span>Complete Nanivio Drive Registration</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 5: PROTECTED ADMIN ACCESS GATEWAY */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'admin' && (
          <form onSubmit={handleAdminSignIn} className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Restricted Gateway Â· Authorized Personnel Only</span>
              </div>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                This administrative terminal provides sovereign control over feature switches, pricing engines, user suspension, and verification queues.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Admin NV ID or Official Email</label>
              <input
                id="input-admin-identifier"
                type="text"
                value={adminIdentifier}
                onChange={(e) => setAdminIdentifier(e.target.value)}
                placeholder="Admin email or Nanivio ID"
                required
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-amber-500/40 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Security Key / Password</label>
              <input
                id="input-admin-password"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                required
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-amber-500/40 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
            </div>

            <button
              id="btn-submit-admin-signin"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authenticate Admin Access</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Security Badge Footer */}
        {activeTab !== 'admin' && (
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-center text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-slate-600" />
              <span>Nanivio Security Engine v2.5 â€¢ Protected & Encrypted</span>
            </div>
          </div>
        )}
      </div>

      {/* Account Recovery Drawer Modal */}
      <AnimatePresence>
        {isRecoveryOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">{authTxt.recoveryTitle}</h3>
                </div>
                <button
                  onClick={() => {
                    setIsRecoveryOpen(false);
                    setRecoveryMessage(null);
                  }}
                  className="text-slate-400 hover:text-white text-xs px-2 py-1"
                >
                  âœ•
                </button>
              </div>

              <p className="text-xs text-slate-400">
                {authTxt.recoverySubtitle}
              </p>

              <form onSubmit={handleRecoveryRequest} className="space-y-3">
                <input
                  type="text"
                  value={recoveryId}
                  onChange={(e) => setRecoveryId(e.target.value)}
                  placeholder={authTxt.recoveryInputLabel}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />

                {recoveryMessage && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs text-emerald-300">
                    {recoveryMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
                >
                  {authTxt.recoveryBtn}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};



