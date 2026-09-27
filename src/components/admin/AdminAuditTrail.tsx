import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Fingerprint,
  FileCheck,
  Sliders,
  UserCheck,
  Copy,
  Check,
  Download,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { AuditLogEntry } from '../../types/auth';

export const AdminAuditTrail: React.FC = () => {
  const {
    adminAuditLogs,
    fetchAdminAuditLogs,
  } = useNanivio();

  const [searchTargetNvId, setSearchTargetNvId] = useState('');
  const [selectedActionType, setSelectedActionType] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, [selectedActionType]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      await fetchAdminAuditLogs(
        searchTargetNvId || undefined,
        selectedActionType === 'ALL' ? undefined : selectedActionType
      );
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs();
  };

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(adminAuditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `nanivio_audit_trail_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header & Controls */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Immutable Administrative Audit Trail</span>
            </h2>
            <p className="text-xs text-slate-400">
              Cryptographically verified audit trail capturing all identity changes, compliance reviews, and feature toggles
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJson}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all shadow-sm"
              title="Export audit records to JSON"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>Export Audit</span>
            </button>

            <button
              onClick={loadLogs}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
          <div className="md:col-span-8 relative">
            <input
              type="text"
              value={searchTargetNvId}
              onChange={(e) => setSearchTargetNvId(e.target.value)}
              placeholder="Filter by NV User ID (e.g. 0486782914, 0486000001) or keyword..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/70"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          </div>

          <div className="md:col-span-3">
            <select
              value={selectedActionType}
              onChange={(e) => setSelectedActionType(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500/70"
            >
              <option value="ALL">All Action Types</option>
              <option value="USER_STATUS_CHANGE">User Status Change</option>
              <option value="EXPERT_REVIEW">Expert Review</option>
              <option value="BUSINESS_REVIEW">Business Review</option>
              <option value="ADMIN_LOGIN">Admin Login</option>
              <option value="USER_SIGNUP">User Signup</option>
              <option value="FEATURE_SWITCH_TOGGLE">Feature Switch Toggle</option>
            </select>
          </div>

          <div className="md:col-span-1">
            <button
              type="submit"
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Log Feed Table */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Action Type</th>
                <th className="p-3.5">Target NV User ID</th>
                <th className="p-3.5">Performed By</th>
                <th className="p-3.5">Details &amp; Reason</th>
                <th className="p-3.5 text-right">Client IP / Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {adminAuditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 text-xs font-sans">
                    {isLoading ? 'Loading audit records...' : 'No audit records match the current filter.'}
                  </td>
                </tr>
              ) : (
                adminAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* Timestamp */}
                    <td className="p-3.5 text-slate-400 text-[11px] whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                      <div className="text-[9px] text-slate-600">
                        {new Date(log.timestamp).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Action Type */}
                    <td className="p-3.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        log.action === 'USER_STATUS_CHANGE'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : log.action === 'EXPERT_REVIEW'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : log.action === 'BUSINESS_REVIEW'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : log.action === 'ADMIN_LOGIN'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>

                    {/* Target NV ID */}
                    <td className="p-3.5 text-emerald-300 font-bold whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{log.targetNvId}</span>
                        <button
                          onClick={() => handleCopy(log.targetNvId)}
                          className="text-slate-600 hover:text-slate-300 transition-colors"
                          title="Copy target NV ID"
                        >
                          {copiedId === log.targetNvId ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Performed By */}
                    <td className="p-3.5 text-slate-300 whitespace-nowrap">
                      <span className="text-amber-300 font-semibold">{log.performedBy}</span>
                    </td>

                    {/* Details */}
                    <td className="p-3.5 text-slate-300 max-w-xs font-sans text-xs">
                      {log.details}
                    </td>

                    {/* Context / IP */}
                    <td className="p-3.5 text-right text-slate-500 text-[10px] whitespace-nowrap">
                      <div>{log.ipAddress}</div>
                      <div className="text-slate-600">{log.userAgent}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
