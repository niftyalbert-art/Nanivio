import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Shield,
  Filter,
  CheckCircle2,
  AlertOctagon,
  Ban,
  RefreshCw,
  Copy,
  Check,
  Eye,
  PhoneCall,
  Wallet,
  Calendar,
  Lock,
  ArrowRight,
  ExternalLink,
  Zap,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { NanivioUser, AccountRole, AccountStatus, UserDossierResponse } from '../../types/auth';

export const AdminUserDirectory: React.FC = () => {
  const {
    adminUsersList,
    fetchAdminUsers,
    searchDossierByNvId,
    updateUserStatus,
    adminGrantUserSubscriptionOrMinutes,
  } = useNanivio();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<AccountRole | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<AccountStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDossier, setSelectedDossier] = useState<UserDossierResponse | null>(null);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionTargetUser, setActionTargetUser] = useState<NanivioUser | null>(null);
  const [actionType, setActionType] = useState<'SUSPEND' | 'REACTIVATE' | 'DEACTIVATE' | null>(null);

  // Admin Subscription & Minutes Granting State
  const [subscriptionTargetUser, setSubscriptionTargetUser] = useState<NanivioUser | null>(null);
  const [grantPlanType, setGrantPlanType] = useState<'free_trial' | 'individual_premium' | 'langpretation_pro' | 'business_b2b' | 'bonus_minutes'>('free_trial');
  const [customMinutes, setCustomMinutes] = useState<number>(15);
  const [grantNotes, setGrantNotes] = useState<string>('');
  const [grantSuccessMsg, setGrantSuccessMsg] = useState<string | null>(null);
  const [grantErrorMsg, setGrantErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, [selectedRole, selectedStatus]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      await fetchAdminUsers(
        searchTerm || undefined,
        selectedRole === 'ALL' ? undefined : selectedRole,
        selectedStatus === 'ALL' ? undefined : selectedStatus
      );
    } catch (err) {
      console.error('Failed to load admin users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers();
  };

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleViewDossier = async (nvId: string) => {
    setIsLoading(true);
    try {
      const dossier = await searchDossierByNvId(nvId);
      if (dossier) {
        setSelectedDossier(dossier);
        setIsDossierOpen(true);
      }
    } catch (err) {
      console.error('Failed to load dossier:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!actionTargetUser || !actionType) return;
    try {
      setIsLoading(true);
      const newStatus: AccountStatus =
        actionType === 'SUSPEND'
          ? 'SUSPENDED'
          : actionType === 'REACTIVATE'
          ? 'ACTIVE'
          : 'DEACTIVATED';
      await updateUserStatus(actionTargetUser.id, newStatus, actionReason || `Admin action: ${actionType}`);
      setActionTargetUser(null);
      setActionType(null);
      setActionReason('');
      await loadUsers();
    } catch (err) {
      console.error('Status change failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGrantSubscription = async () => {
    if (!subscriptionTargetUser) return;
    setIsLoading(true);
    setGrantSuccessMsg(null);
    setGrantErrorMsg(null);
    try {
      const isTrial = grantPlanType === 'free_trial';
      const tier = isTrial ? 'free' : grantPlanType;
      const mins = isTrial ? 15 : customMinutes;
      const res = await adminGrantUserSubscriptionOrMinutes(
        subscriptionTargetUser.id,
        tier,
        mins,
        isTrial,
        grantNotes || (isTrial ? 'Admin granted 15-min free trial' : `Admin granted ${tier} with ${mins} mins`)
      );
      setGrantSuccessMsg(res.message || 'Subscription updated successfully.');
      setTimeout(() => {
        setSubscriptionTargetUser(null);
        setGrantSuccessMsg(null);
      }, 2000);
      await loadUsers();
      if (selectedDossier && (selectedDossier.user.id === subscriptionTargetUser.id || selectedDossier.user.nvId === subscriptionTargetUser.nvId)) {
        await handleViewDossier(subscriptionTargetUser.nvId);
      }
    } catch (err: any) {
      setGrantErrorMsg(err.message || 'Failed to grant subscription.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Directory Controls Bar */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Nanivio Sovereign User &amp; Identity Directory</span>
            </h2>
            <p className="text-xs text-slate-400">
              Lookup users by permanent NV User ID, email or phone, inspect separated accounts, and enforce compliance
            </p>
          </div>

          <button
            onClick={loadUsers}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Directory</span>
          </button>
        </div>

        {/* Filters and Search */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
          <div className="md:col-span-6 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by NV ID (e.g. 0486782914), email, phone, or name..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/70"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          </div>

          <div className="md:col-span-3">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500/70"
            >
              <option value="ALL">All Account Roles</option>
              <option value="PERSONAL">Personal Consumer</option>
              <option value="EXPERT">Verified Expert</option>
              <option value="BUSINESS">Corporate Business</option>
              <option value="ADMIN">System Administrator</option>
            </select>
          </div>

          <div className="md:col-span-3 flex gap-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500/70"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="INACTIVE">Inactive / Deactivated</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Directory Table */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-3.5">Permanent NV ID</th>
                <th className="p-3.5">Identity &amp; Profile</th>
                <th className="p-3.5">Account Role</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Created Date</th>
                <th className="p-3.5 text-right">Administrative Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {adminUsersList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 text-xs">
                    {isLoading ? 'Scanning Nanivio user ledger...' : 'No accounts match the specified criteria.'}
                  </td>
                </tr>
              ) : (
                adminUsersList.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* NV User ID */}
                    <td className="p-3.5 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-emerald-300">{user.nvId}</span>
                        <button
                          onClick={() => handleCopy(user.nvId)}
                          className="text-slate-500 hover:text-slate-200 transition-colors"
                          title="Copy NV ID"
                        >
                          {copiedId === user.nvId ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-500">Immutable</div>
                    </td>

                    {/* Profile */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-700 bg-slate-800 shrink-0">
                          <img
                            src={user.avatar}
                            alt={user.displayName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <div className="font-bold text-white text-xs">{user.displayName}</div>
                          <div className="text-[11px] text-slate-400">{user.email}</div>
                          <div className="text-[10px] text-slate-500">{user.phoneNumber || 'No phone set'}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                        user.role === 'ADMIN'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : user.role === 'EXPERT'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : user.role === 'BUSINESS'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}>
                        {user.role}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        user.status === 'ACTIVE'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                          : user.status === 'SUSPENDED'
                          ? 'bg-red-950/80 text-red-300 border-red-500/50'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {user.status}
                      </span>
                    </td>

                    {/* Created Date */}
                    <td className="p-3.5 text-slate-400 font-mono text-[11px]">
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleViewDossier(user.nvId)}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-medium transition-all flex items-center gap-1"
                          title="Inspect user dossier"
                        >
                          <Eye className="w-3 h-3 text-cyan-400" />
                          <span>Dossier</span>
                        </button>

                        <button
                          onClick={() => {
                            setSubscriptionTargetUser(user);
                            setGrantPlanType('free_trial');
                            setCustomMinutes(15);
                            setGrantNotes('');
                            setGrantSuccessMsg(null);
                            setGrantErrorMsg(null);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium transition-all flex items-center gap-1"
                          title="Grant monthly subscription, 15-min free trial, or live minutes"
                        >
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>Plan &amp; Time</span>
                        </button>

                        {user.status === 'ACTIVE' ? (
                          <button
                            onClick={() => {
                              setActionTargetUser(user);
                              setActionType('SUSPEND');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-950/70 text-red-300 border border-red-500/40 text-[11px] font-medium transition-all"
                            title="Suspend user account"
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setActionTargetUser(user);
                              setActionType('REACTIVATE');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium transition-all"
                            title="Reactivate account"
                          >
                            Reactivate
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setActionTargetUser(user);
                            setActionType('DEACTIVATE');
                          }}
                          className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-colors text-[11px]"
                          title="Deactivate / Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: DETAILED USER DOSSIER INSPECTOR */}
      {/* ------------------------------------------------------------- */}
      {isDossierOpen && selectedDossier && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-[#0c1626] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl overflow-hidden border border-emerald-500/50">
                  <img
                    src={selectedDossier.user.avatar}
                    alt={selectedDossier.user.displayName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedDossier.user.displayName}</h3>
                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-300">
                    <span>{selectedDossier.user.nvId}</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">{selectedDossier.user.email}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsDossierOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white border border-slate-800 text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            {/* Separated Accounts Inspector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Communication Account Card */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <PhoneCall className="w-4 h-4 text-emerald-400" />
                    <span>Communication Account</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                    {selectedDossier.communicationAccount.status}
                  </span>
                </div>
                <div className="text-xs text-slate-300 space-y-1 font-mono">
                  <div>SIP: <span className="text-white">{selectedDossier.communicationAccount.sipUri}</span></div>
                  <div>RTC Session UID: <span className="text-white">{selectedDossier.communicationAccount.agoraUid}</span></div>
                  <div>Langpretation: <span className="text-emerald-400">{selectedDossier.communicationAccount.langpretationEngine}</span></div>
                  <div>Preferred Lang: <span className="text-white">{selectedDossier.communicationAccount.defaultLanguage.toUpperCase()}</span></div>
                </div>
              </div>

              {/* Fintech Account Card */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-amber-400" />
                    <span>Fintech Account</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                    {selectedDossier.fintechAccount.status}
                  </span>
                </div>
                <div className="text-xs text-slate-300 space-y-1 font-mono">
                  <div>Ledger ID: <span className="text-white">{selectedDossier.fintechAccount.ledgerId}</span></div>
                  <div>Daily Limit: <span className="text-emerald-400">GH₵ {selectedDossier.fintechAccount.dailyLimitGHS.toLocaleString()}</span></div>
                  <div>Escrow Status: <span className="text-white">{selectedDossier.fintechAccount.escrowEnabled ? 'Enabled' : 'Disabled'}</span></div>
                  <div>Balances: <span className="text-amber-300">{selectedDossier.fintechAccount.wallets.map(w => `${w.currency} ${w.balance}`).join(' · ')}</span></div>
                </div>
              </div>

              {/* Langpretation Subscription & Live Quotas Card */}
              <div className="col-span-1 md:col-span-2 p-4 rounded-2xl bg-slate-950/80 border border-emerald-500/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span>Langpretation Live Minutes &amp; Subscription Plan</span>
                  </div>
                  <button
                    onClick={() => {
                      setIsDossierOpen(false);
                      setSubscriptionTargetUser(selectedDossier.user);
                      setGrantPlanType('free_trial');
                      setCustomMinutes(15);
                      setGrantNotes('');
                      setGrantSuccessMsg(null);
                      setGrantErrorMsg(null);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Grant Plan / Free Trial</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Active Plan</div>
                    <div className="text-xs font-bold text-white mt-0.5">
                      {selectedDossier.communicationAccount.subscription?.planName || 'Free Basic'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Remaining Balance</div>
                    <div className="text-sm font-black font-mono text-emerald-400 mt-0.5">
                      {selectedDossier.communicationAccount.balanceMinutes ?? 0} mins
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Monthly Quota</div>
                    <div className="text-xs font-bold font-mono text-slate-300 mt-0.5">
                      {selectedDossier.communicationAccount.quotaMinutes ?? 0} mins
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Trail for this user */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Identity Audit Trail
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {selectedDossier.auditTrail.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <span className="font-bold text-white font-mono">{log.action}</span>
                      <span className="text-slate-400 ml-2">{log.details}</span>
                    </div>
                    <span className="text-slate-500 font-mono text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: ACTION REASON PROMPT (SUSPEND / DEACTIVATE) */}
      {/* ------------------------------------------------------------- */}
      {actionTargetUser && actionType && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0c1626] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <AlertOctagon className="w-5 h-5 text-red-400" />
              <h3 className="text-sm font-bold text-white">
                {actionType === 'SUSPEND' ? 'Suspend Account' : actionType === 'REACTIVATE' ? 'Reactivate Account' : 'Deactivate Account'}
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              You are about to modify the status of user <strong className="text-white">{actionTargetUser.displayName}</strong> (<span className="font-mono text-emerald-400">{actionTargetUser.nvId}</span>).
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">
                Reason / Compliance Notes (Immutable Audit Entry)
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Specify regulatory, compliance, or operational reason..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-red-500/70"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setActionTargetUser(null);
                  setActionType(null);
                  setActionReason('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStatusChange}
                disabled={isLoading}
                className={`px-4 py-2 rounded-xl font-bold text-xs ${
                  actionType === 'REACTIVATE'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-red-500 hover:bg-red-400 text-white'
                }`}
              >
                Confirm {actionType}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: GRANT SUBSCRIPTION / FREE TRIAL / MINUTES */}
      {/* ------------------------------------------------------------- */}
      {subscriptionTargetUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0c1626] border border-emerald-500/30 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Grant Subscription or Live Minutes</h3>
                  <p className="text-xs text-slate-400">
                    Target: <span className="text-emerald-400 font-mono font-bold">{subscriptionTargetUser.displayName}</span> ({subscriptionTargetUser.nvId})
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSubscriptionTargetUser(null);
                  setGrantSuccessMsg(null);
                  setGrantErrorMsg(null);
                }}
                className="text-slate-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {grantSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                <span>{grantSuccessMsg}</span>
              </div>
            )}

            {grantErrorMsg && (
              <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-red-300 text-xs flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 flex-shrink-0 text-red-400" />
                <span>{grantErrorMsg}</span>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300 block">
                Select Subscription Tier or Trial Package:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setGrantPlanType('free_trial');
                    setCustomMinutes(15);
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    grantPlanType === 'free_trial'
                      ? 'bg-emerald-950/60 border-emerald-500 text-white'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400">Free Trial</span>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-[11px] text-slate-300 font-medium mt-1">15 Minutes Live Trial</div>
                  <div className="text-[10px] text-slate-500">For new users to test AI interpretation</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGrantPlanType('individual_premium');
                    setCustomMinutes(90);
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    grantPlanType === 'individual_premium'
                      ? 'bg-emerald-950/60 border-emerald-500 text-white'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400">Individual Premium</span>
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-[11px] text-slate-300 font-medium mt-1">90 Minutes / Month</div>
                  <div className="text-[10px] text-slate-500">Standard monthly quota (GH₵ 130)</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGrantPlanType('langpretation_pro');
                    setCustomMinutes(300);
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    grantPlanType === 'langpretation_pro'
                      ? 'bg-emerald-950/60 border-emerald-500 text-white'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-400">Unlimited Pro</span>
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="text-[11px] text-slate-300 font-medium mt-1">300 Minutes / Month</div>
                  <div className="text-[10px] text-slate-500">Heavy daily cross-border calls (GH₵ 290)</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGrantPlanType('business_b2b');
                    setCustomMinutes(1500);
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    grantPlanType === 'business_b2b'
                      ? 'bg-emerald-950/60 border-emerald-500 text-white'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-400">B2B Enterprise</span>
                    <Shield className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="text-[11px] text-slate-300 font-medium mt-1">1,500 Minutes / Month</div>
                  <div className="text-[10px] text-slate-500">Multi-seat corporate teams (GH₵ 1,150)</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGrantPlanType('bonus_minutes');
                    setCustomMinutes(60);
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all col-span-1 sm:col-span-2 ${
                    grantPlanType === 'bonus_minutes'
                      ? 'bg-emerald-950/60 border-emerald-500 text-white'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400">Minutes Top-Up (Direct Credit)</span>
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-[11px] text-slate-300 font-medium mt-1">Top-Up Langpretation &amp; Call Minutes</div>
                  <div className="text-[10px] text-slate-500">Adds live minutes to user's balance without changing their current subscription tier</div>
                </button>
              </div>

              {/* Custom bonus minutes option */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Live Minutes Allocation:
                  </label>
                  <span className="text-xs font-mono font-bold text-emerald-400">{customMinutes} minutes</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(Math.max(1, parseInt(e.target.value) || 0))}
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex gap-1">
                    {[15, 60, 120, 300].map((quickMin) => (
                      <button
                        key={quickMin}
                        type="button"
                        onClick={() => setCustomMinutes(quickMin)}
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] text-slate-300"
                      >
                        +{quickMin}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Admin Justification / Compliance Note:
                </label>
                <textarea
                  value={grantNotes}
                  onChange={(e) => setGrantNotes(e.target.value)}
                  placeholder="e.g., Onboarding promotion, customer resolution, or executive grant..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/70"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setSubscriptionTargetUser(null);
                  setGrantSuccessMsg(null);
                  setGrantErrorMsg(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGrantSubscription}
                disabled={isLoading}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Processing...' : 'Apply Subscription'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
