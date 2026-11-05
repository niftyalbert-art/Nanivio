import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CreditCard,
  MessageCircle,
  Phone,
  Search,
  Video,
  Clock3,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { lookupNanivioUser } from '../../utils/userLookup';
import { LangpretationIcon } from '../common/LangpretationIcon';
import { VerifiedServicesLocationSection } from './VerifiedServicesLocationSection';

const activityLabel = (value: string) =>
  value.replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const valueFrom = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

const parseMoney = (value: unknown) => {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
};

const safeActivityDate = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '';
  const date = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value as string | number);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const activityTimestamp = (value: unknown) => {
  if (value === undefined || value === null || value === '') return 0;
  const timestamp = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value as string | number).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const currencyFormatter = (currency: string, amount: number) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
};

export const AccountHomeSections: React.FC = () => {
  const {
    authUser,
    currentUser,
    billingSummary,
    contacts,
    adminFeatures,
    setActiveTab,
    setPendingBillingAction,
    start1on1Call,
    startDirectChatWithUser,
  } = useNanivio();
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; user?: any; error?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const ownerId = authUser?.id || currentUser.id;
  const ownedSummary = billingSummary?.userId === ownerId ? billingSummary : null;
  const audioEnabled = adminFeatures?.audioCallsEnabled !== false;
  const videoEnabled = adminFeatures?.videoCallsEnabled !== false;

  const recentActivity = useMemo(() => {
    if (!ownedSummary) return [];
    return [...(ownedSummary.recentTransactions ?? [])]
      .filter((transaction) => {
        const rowOwner = valueFrom(transaction as unknown as Record<string, unknown>, 'userId', 'user_id');
        return rowOwner === undefined || rowOwner === ownerId;
      })
      .sort((a, b) => {
        const aDate = valueFrom(a as unknown as Record<string, unknown>, 'createdAt', 'created_at');
        const bDate = valueFrom(b as unknown as Record<string, unknown>, 'createdAt', 'created_at');
        return activityTimestamp(bDate) - activityTimestamp(aDate);
      })
      .slice(0, 4);
  }, [ownedSummary, ownerId]);

  const goToWallet = () => {
    setPendingBillingAction({ subTab: 'overview' });
    setActiveTab('billing');
  };

  const searchUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value || loading) return;
    setLoading(true);
    setFeedback(null);
    try {
      const saved = contacts.find((person) =>
        [person.nanivioNumber, person.nvId, person.name, person.username].some((field) =>
          field?.toLowerCase().includes(value.toLowerCase()),
        ),
      );
      const user = saved || (await lookupNanivioUser(value));
      setFeedback(
        user
          ? { message: `${user.name} · ${user.nanivioNumber || user.nvId || 'Nanivio member'}`, user }
          : { message: `No Nanivio member found for “${value}”. Check the ID and try again.`, error: true },
      );
    } catch {
      setFeedback({ message: 'Directory lookup is unavailable right now. Try again shortly.', error: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="account-home-sections">
      <section className="home-activity" aria-labelledby="account-home-activity-title">
        <div className="home-section-title home-activity-heading">
          <div><p className="home-overline">YOUR NANIVIO</p><h2 id="account-home-activity-title">Recent activity</h2></div>
          <button className="home-text-link" type="button" onClick={goToWallet}>See all <ArrowUpRight size={14} /></button>
        </div>
        {!ownedSummary ? (
          <div className="home-activity-empty">
            <Clock3 size={17} /><span>Activity will appear here when your billing details are available.</span>
          </div>
        ) : recentActivity.length ? (
          <div className="home-activity-list">
            {recentActivity.map((transaction) => {
              const record = transaction as unknown as Record<string, unknown>;
              const title = String(valueFrom(record, 'providerName', 'provider_name') || activityLabel(String(valueFrom(record, 'serviceType', 'service_type') || 'credit activity')));
              const service = String(valueFrom(record, 'serviceType', 'service_type') || 'credit activity');
              const rawStatus = String(valueFrom(record, 'status') || 'Recorded');
              const amount = parseMoney(valueFrom(record, 'total', 'total_amount', 'amount'));
              const currency = String(valueFrom(record, 'currency') || '');
              const activityDate = safeActivityDate(valueFrom(record, 'createdAt', 'created_at'));
              const transactionId = String(valueFrom(record, 'transactionId', 'transaction_id', 'referenceId', 'reference_id') || `${service}-${activityDate}`);
              return (
                <button className="home-activity-row" type="button" key={transactionId} onClick={goToWallet}>
                  <span className={`home-activity-icon ${rawStatus.toUpperCase() === 'COMPLETED' ? 'is-complete' : ''}`}><CreditCard size={17} /></span>
                  <span className="home-activity-main">
                    <strong>{title}</strong>
                    <small>{activityLabel(service)}{activityDate ? ` · ${activityDate}` : ''}</small>
                  </span>
                  <span className="home-activity-amount">
                    <strong>{amount !== undefined && currency ? currencyFormatter(currency, amount) : amount !== undefined ? `${amount.toLocaleString()} ${currency}`.trim() : '—'}</strong>
                    <small>{activityLabel(rawStatus)}</small>
                  </span>
                  <ArrowUpRight className="home-activity-arrow" size={14} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="home-activity-empty"><Clock3 size={17} /><span>No credit activity to show yet.</span></div>
        )}
      </section>

      <section className="home-find" aria-labelledby="account-home-find-title">
        <div className="home-find-heading">
          <div><p className="home-overline">PEOPLE, EVERYWHERE</p><h2 id="account-home-find-title">Find someone on Nanivio</h2></div>
          <button className="home-text-link" type="button" onClick={() => setActiveTab('contacts')}>Your contacts <ArrowUpRight size={14} /></button>
        </div>
        <form className="home-lookup" onSubmit={searchUser}>
          <Search size={18} aria-hidden="true" />
          <input aria-label="Search by Nanivio ID or name" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nanivio ID, phone number, or name" />
          <button type="submit" disabled={loading || !query.trim()}>{loading ? 'Searching…' : 'Find person'} <ArrowUpRight size={15} /></button>
        </form>
        {feedback && (
          <div className={`home-lookup-result ${feedback.error ? 'is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>
            <span>{feedback.message}</span>
            {feedback.user && <div className="home-result-actions">
              <button type="button" aria-label="Start audio call" disabled={!audioEnabled} onClick={() => audioEnabled && start1on1Call(feedback.user, 'audio')}><Phone size={16} /></button>
              <button type="button" aria-label="Start video call" disabled={!videoEnabled} onClick={() => videoEnabled && start1on1Call(feedback.user, 'video')}><Video size={16} /></button>
              <button type="button" aria-label="Open chat" onClick={() => startDirectChatWithUser({
                ...feedback.user,
                myLanguage: feedback.user.myLanguage || feedback.user.preferredLanguage || 'en',
                role: feedback.user.role || 'user',
              })}><MessageCircle size={16} /></button>
            </div>}
          </div>
        )}
      </section>

      <section className="home-language-note" aria-label="Langpretation">
        <span className="home-language-icon"><LangpretationIcon size={28} glow={false} /></span>
        <div><p className="home-overline">LANGPRETATION</p><p>Make every conversation understood. Find Langpretation in your chat and call controls.</p></div>
        <button type="button" onClick={() => setActiveTab('chat')} aria-label="Open chat to use Langpretation"><ArrowUpRight size={16} /></button>
      </section>

      <section className="home-services" aria-labelledby="account-home-services-title">
        <div className="home-services-heading">
          <div><p className="home-overline">EXPLORE NANIVIO</p><h2 id="account-home-services-title">Verified services &amp; live</h2></div>
          <button className="home-text-link" type="button" onClick={() => setActiveTab('services')}>Open services <ArrowUpRight size={14} /></button>
        </div>
        <VerifiedServicesLocationSection />
      </section>
    </div>
  );
};
