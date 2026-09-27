import type {
  NanivioUser,
  AuthSession,
  SignInCredentials,
  PersonalSignUpData,
  ExpertSignUpData,
  BusinessSignUpData,
  ExpertApplication,
  BusinessApplication,
  DriverVerificationApplication,
  DriverSignUpData,
  AdminAuditLogEntry,
  UserDossierResponse,
  AccountRole,
  AccountStatus,
  VerificationStatus,
} from '../types/auth';

const TOKEN_KEY = 'nanivio_auth_token';
const USER_KEY = 'nanivio_auth_user';

export class AuthClient {
  public getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  public setToken(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
  }

  public clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }

  public getStoredUser(): NanivioUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public setStoredUser(user: NanivioUser) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
  }

  public clearStoredUser() {
    try {
      localStorage.removeItem(USER_KEY);
    } catch {}
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-nanivio-token'] = token;
    }
    return headers;
  }

  // --- Phone OTP Operations (Twilio Verify & Carrier Backbone) ---

  public async sendPhoneOtp(
    phoneNumber: string,
    channel: 'sms' | 'whatsapp' = 'sms'
  ): Promise<{
    success: boolean;
    message: string;
    cooldownSeconds: number;
    channel: string;
    isTwilioVerify: boolean;
    demoCode?: string;
  }> {
    const res = await fetch('/api/auth/phone/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, channel }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to send verification code.');
    }
    return data;
  }

  public async verifyPhoneOtp(
    phoneNumber: string,
    code: string
  ): Promise<{
    success: boolean;
    message: string;
    verifiedPhone: string;
    verificationToken: string;
  }> {
    const res = await fetch('/api/auth/phone/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, code }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to verify OTP.');
    }
    return data;
  }

  // --- Authentication Operations ---

  public async signIn(identifier: string, password: string): Promise<{ session: AuthSession; user: NanivioUser }> {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to sign in.');
    }
    this.setToken(data.session.token);
    this.setStoredUser(data.user);
    return data;
  }

  public async signInWithAdminToken(masterKey: string): Promise<{ session: AuthSession; user: NanivioUser }> {
    const res = await fetch('/api/admin/auth/master-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterKey }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Invalid administrative authorization key.');
    }
    this.setToken(data.session.token);
    this.setStoredUser(data.user);
    return data;
  }

  public async registerPersonal(data: PersonalSignUpData): Promise<{ session: AuthSession; user: NanivioUser; nvId: string }> {
    const res = await fetch('/api/auth/register/personal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Registration failed.');
    }
    this.setToken(json.session.token);
    this.setStoredUser(json.user);
    return json;
  }

  public async registerExpert(data: ExpertSignUpData): Promise<{ session: AuthSession; user: NanivioUser; expertApp: ExpertApplication; nvId: string }> {
    const res = await fetch('/api/auth/register/expert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Expert application submission failed.');
    }
    this.setToken(json.session.token);
    this.setStoredUser(json.user);
    return json;
  }

  public async registerBusiness(data: BusinessSignUpData): Promise<{ session: AuthSession; user: NanivioUser; businessApp: BusinessApplication; nvId: string; businessNvId: string }> {
    const res = await fetch('/api/auth/register/business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Business registration failed.');
    }
    this.setToken(json.session.token);
    this.setStoredUser(json.user);
    return json;
  }

  public async registerDriver(data: DriverSignUpData): Promise<{ session: AuthSession; user: NanivioUser; driverApp: DriverVerificationApplication; nvId: string }> {
    const res = await fetch('/api/auth/register/driver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Driver registration failed.');
    }
    this.setToken(json.session.token);
    this.setStoredUser(json.user);
    return json;
  }

  public async signOut(): Promise<void> {
    const token = this.getToken();
    try {
      if (token) {
        await fetch('/api/auth/signout', {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ token }),
        });
      }
    } catch {}
    this.clearToken();
    this.clearStoredUser();
  }

  public async getSession(): Promise<NanivioUser | null> {
    const token = this.getToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/session', {
        headers: this.getHeaders(),
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.setStoredUser(data.user);
        return data.user;
      }
      this.clearToken();
      this.clearStoredUser();
      return null;
    } catch {
      return this.getStoredUser();
    }
  }

  public async requestPasswordRecovery(identifier: string): Promise<{ resetToken: string; message: string; maskedEmail: string }> {
    const res = await fetch('/api/auth/recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Recovery request failed.');
    }
    return data;
  }

  public async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Password reset failed.');
    }
    return true;
  }

  public async updateProfile(updates: Partial<NanivioUser>): Promise<NanivioUser> {
    const res = await fetch('/api/auth/profile/update', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Profile update failed.');
    }
    this.setStoredUser(data.user);
    return data.user;
  }

  // --- Admin Endpoints ---

  public async verifyAdmin(): Promise<boolean> {
    try {
      const res = await fetch('/api/admin/auth/verify', {
        headers: this.getHeaders(),
      });
      const data = await res.json();
      return !!(res.ok && data.success && data.isAdmin);
    } catch {
      return false;
    }
  }

  public async getAdminUsers(query?: string, role?: AccountRole, status?: AccountStatus): Promise<NanivioUser[]> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (role) params.set('role', role);
    if (status) params.set('status', status);

    const res = await fetch(`/api/admin/users?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch users list.');
    }
    return data.users || [];
  }

  public async searchByNvId(nvId: string): Promise<UserDossierResponse> {
    const res = await fetch(`/api/admin/users/search-nv?nvId=${encodeURIComponent(nvId)}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || `No dossier found for NV ID: ${nvId}`);
    }
    return data.dossier;
  }

  public async updateUserStatus(userId: string, status: AccountStatus, reason?: string): Promise<NanivioUser> {
    const res = await fetch('/api/admin/users/status', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ userId, status, reason }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update user status.');
    }
    return data.user;
  }

  public async grantUserSubscriptionOrMinutes(
    userId: string,
    tier: string,
    minutes: number,
    isTrial: boolean,
    notes?: string
  ): Promise<{ success: boolean; message: string; user: NanivioUser; subscription: any }> {
    const res = await fetch('/api/admin/users/grant-subscription', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ userId, tier, minutes, isTrial, notes }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to grant subscription or minutes.');
    }
    return data;
  }

  public async getAdminExperts(status?: VerificationStatus): Promise<ExpertApplication[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);

    const res = await fetch(`/api/admin/experts?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch expert applications.');
    }
    return data.applications || [];
  }

  public async reviewExpert(
    appId: string,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND',
    notes?: string
  ): Promise<ExpertApplication> {
    const res = await fetch('/api/admin/experts/review', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ appId, action, notes }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to review expert application.');
    }
    return data.expertApp;
  }

  public async toggleExpertFeatured(appId: string, featured: boolean): Promise<ExpertApplication> {
    const res = await fetch('/api/admin/experts/featured', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ appId, featured }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update featured state.');
    }
    return data.expertApp;
  }

  public async getAdminBusinesses(status?: VerificationStatus): Promise<BusinessApplication[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);

    const res = await fetch(`/api/admin/businesses?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch business applications.');
    }
    return data.applications || [];
  }

  public async reviewBusiness(
    appId: string,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND',
    notes?: string
  ): Promise<BusinessApplication> {
    const res = await fetch('/api/admin/businesses/review', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ appId, action, notes }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to review business application.');
    }
    return data.businessApp;
  }

  public async getAdminDrivers(status?: VerificationStatus): Promise<DriverVerificationApplication[]> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);

    const res = await fetch(`/api/admin/drivers?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch driver applications.');
    }
    return data.applications || [];
  }

  public async reviewDriver(
    appId: string,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'SUSPEND',
    notes?: string
  ): Promise<DriverVerificationApplication> {
    const res = await fetch('/api/admin/drivers/review', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ appId, action, notes }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to review driver application.');
    }
    return data.driverApp;
  }

  public async getAdminAuditLogs(limit?: number, targetNvId?: string, action?: string): Promise<AdminAuditLogEntry[]> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (targetNvId) params.set('targetNvId', targetNvId);
    if (action) params.set('action', action);

    const res = await fetch(`/api/admin/audit-logs?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch audit logs.');
    }
    return data.logs || [];
  }

  public async getLiveVerifiedExperts(): Promise<ExpertApplication[]> {
    try {
      const res = await fetch('/api/services/experts/live');
      const data = await res.json();
      return data.success ? data.experts || [] : [];
    } catch {
      return [];
    }
  }

  public async getLiveVerifiedBusinesses(): Promise<BusinessApplication[]> {
    try {
      const res = await fetch('/api/services/businesses/live');
      const data = await res.json();
      return data.success ? data.businesses || [] : [];
    } catch {
      return [];
    }
  }

  public async getGeoMatchedServices(params?: {
    country?: string;
    state?: string;
    city?: string;
    language?: string;
    type?: string;
    category?: string;
    q?: string;
    onlyOnline?: boolean;
  }): Promise<{ userLocation: any; count: number; results: any[] }> {
    try {
      const query = new URLSearchParams();
      if (params?.country) query.set('country', params.country);
      if (params?.state) query.set('state', params.state);
      if (params?.city) query.set('city', params.city);
      if (params?.language) query.set('language', params.language);
      if (params?.type) query.set('type', params.type);
      if (params?.category) query.set('category', params.category);
      if (params?.q) query.set('q', params.q);
      if (params?.onlyOnline) query.set('onlyOnline', 'true');

      const res = await fetch(`/api/services/geo-match?${query.toString()}`);
      const data = await res.json();
      return data.success
        ? { userLocation: data.userLocation, count: data.count, results: data.results || [] }
        : { userLocation: null, count: 0, results: [] };
    } catch {
      return { userLocation: null, count: 0, results: [] };
    }
  }
}

export const authClient = new AuthClient();
