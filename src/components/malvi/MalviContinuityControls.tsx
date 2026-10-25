import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronUp, Clock3, ExternalLink, Globe2, LoaderCircle, Search, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { authClient } from '../../lib/authClient';

type MemoryMessage = {
  id: string | number;
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
};

type MemoryResponse = {
  success: boolean;
  enabled: boolean;
  messages: MemoryMessage[];
  hasPrevious?: boolean;
  warning?: string;
};

type ResearchScope = 'web' | 'public-social';
type ResearchResult = {
  source: 'Web' | string;
  title: string;
  url: string;
  caveat: string;
  snippet?: string;
};
type ResearchCitation = { text: string; urls: string[] };
type ResearchResponse = {
  success: boolean;
  answer: string;
  results: ResearchResult[];
  citations: ResearchCitation[];
  searchSuggestions?: string;
  verified: boolean;
  checkedAt?: string;
  limitation?: string;
};

const suggestionsDocument = (html: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:;"><base target="_blank"></head>
<body style="margin:0;padding:8px;font:13px system-ui,sans-serif;color:#e4e0d4;background:#171918">${html}</body></html>`;

const safeResearchUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};

async function memoryRequest(method: 'GET' | 'PUT' | 'DELETE', query = '', enabled?: boolean): Promise<MemoryResponse> {
  const token = authClient.getToken();
  const response = await fetch(`/api/assistant/memory${query}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(method === 'PUT' ? { body: JSON.stringify({ enabled }) } : {}),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || 'Saved conversation controls are unavailable right now.');
  }
  return result;
}

async function researchRequest(query: string, scope: ResearchScope): Promise<ResearchResponse> {
  const token = authClient.getToken();
  const response = await fetch('/api/assistant/research', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, scope }),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.error || 'Public research is unavailable right now.');
  }
  return result;
}

export const MalviContinuityControls: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [messages, setMessages] = useState<MemoryMessage[]>([]);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchScope, setResearchScope] = useState<ResearchScope>('web');
  const [research, setResearch] = useState<ResearchResponse | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState('');

  const load = useCallback(async (q = '') => {
    setLoading(true);
    setError('');
    try {
      const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const result = await memoryRequest('GET', params);
      setEnabled(result.enabled === true);
      setMessages(Array.isArray(result.messages) ? result.messages : []);
      setHasPrevious(result.hasPrevious === true);
      setQuery(q.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Saved conversation controls are unavailable.');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const changeConsent = async (next: boolean) => {
    if (saving) return;
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const result = await memoryRequest('PUT', '', next);
      window.dispatchEvent(new CustomEvent('nanivio:malvi-memory-change', { detail: { enabled: result.enabled } }));
      setEnabled(result.enabled === true);
      setNotice(result.warning || (result.enabled ? 'Future text and voice transcripts will be saved to this account. Start a new live session to use this setting.' : 'Saving future conversation transcripts is off.'));
      if (!result.enabled) {
        setMessages([]);
        setHasPrevious(false);
        setQuery('');
      } else {
        await load();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your setting could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const deleteHistory = async () => {
    if (!window.confirm('Delete all saved Malvi conversation history for this account? This cannot be undone.')) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await memoryRequest('DELETE');
      window.dispatchEvent(new CustomEvent('nanivio:malvi-memory-change', { detail: { enabled: false } }));
      setEnabled(result.enabled === true);
      setMessages([]);
      setHasPrevious(false);
      setQuery('');
      setSearch('');
      setNotice(result.warning || 'Saved conversation history deleted. Saving is now off.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Saved history could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    void load(search);
  };

  const submitResearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = researchQuery.trim();
    if (normalized.length < 3 || normalized.length > 180) {
      setResearchError('Enter a question or topic between 3 and 180 characters.');
      return;
    }
    setResearchLoading(true);
    setResearchError('');
    setResearch(null);
    try {
      const result = await researchRequest(normalized, researchScope);
      setResearch(result);
    } catch (reason) {
      setResearchError(reason instanceof Error ? reason.message : 'Public research is unavailable right now.');
    } finally {
      setResearchLoading(false);
    }
  };

  const researchResults = Array.isArray(research?.results) ? research.results : [];
  const researchCitations = Array.isArray(research?.citations) ? research.citations : [];

  return (
    <section aria-label="Malvi continuity and public research" className="rounded-2xl border border-[#826a3d]/45 bg-[#171918] text-[#f0eee7] shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#b89a5a]/35 bg-[#b89a5a]/10 text-[#d9bd7b]">
            <ShieldCheck size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-[#e4d3a8]">Malvi conversation memory</p>
            <p className="mt-0.5 text-[11px] leading-4 text-[#b7b5ad]">
              {loading ? 'Checking your account setting…' : saving ? 'Saving your choice…' : enabled ? 'Opted in · saved to this account' : 'Off by default · your choice'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold uppercase tracking-[.14em] ${enabled ? 'text-[#cfb56f]' : 'text-[#a9aaa5]'}`}>
            {loading ? 'Checking' : saving ? 'Saving' : enabled ? 'On' : 'Off'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Save future Malvi text and voice transcripts"
            disabled={loading || saving}
            onClick={() => void changeConsent(!enabled)}
            className={`relative h-7 w-12 rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4b76d] disabled:cursor-not-allowed disabled:opacity-55 ${enabled ? 'border-[#c9ad65] bg-[#9a7c38]' : 'border-[#555751] bg-[#30322e]'}`}
          >
            <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-[#f2ead4] shadow-sm transition-transform ${enabled ? 'translate-x-[23px]' : 'translate-x-[3px]'}`} />
          </button>
        </div>
      </div>

      <div className="border-t border-white/[.07] px-3.5 py-3 sm:px-4">
        <p className="text-[11px] leading-relaxed text-[#c6c4bc]">
          When enabled, future text and voice transcripts are saved under this account. Raw audio and images are not saved to Nanivio conversation history; provider handling is separate.
        </p>
        <p className="mt-1.5 text-[10px] leading-relaxed text-[#d5bf80]">
          This setting applies to your next live session. Turning it off or deleting saved messages will end active sessions so already-loaded memory is removed.
        </p>
        {error && (
          <div role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-[#a65e48]/35 bg-[#542d25]/25 px-2.5 py-2 text-[11px] leading-relaxed text-[#e8b5a4]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}
        {notice && !error && <p role="status" className="mt-2 flex items-center gap-1.5 text-[11px] text-[#d5c080]"><Check size={13} />{notice}</p>}
        {error && (
          <button type="button" onClick={() => void load()} className="mt-2 min-h-9 rounded-lg border border-[#b89a5a]/35 px-3 text-[11px] font-medium text-[#e1cb91] hover:bg-[#b89a5a]/10">
            Retry account setting
          </button>
        )}
      </div>

      <div className="border-t border-white/[.07]">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          className="flex min-h-10 w-full items-center justify-between gap-2 px-3.5 text-left text-[11px] font-semibold text-[#d7c58f] hover:bg-white/[.025] sm:px-4"
        >
          <span className="inline-flex items-center gap-2"><Clock3 size={14} /> Inspect saved history{hasPrevious ? ' · earlier messages available' : ''}</span>
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {expanded && (
          <div className="border-t border-white/[.07] px-3.5 pb-3.5 pt-3 sm:px-4">
            <form onSubmit={submitSearch} className="flex gap-2">
              <label className="sr-only" htmlFor="malvi-memory-search">Search saved conversation history</label>
              <input
                id="malvi-memory-search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search saved messages"
                disabled={!enabled || loading || saving}
                className="min-h-9 min-w-0 flex-1 rounded-lg border border-[#5a574d] bg-[#101211] px-3 text-xs text-[#f0eee7] placeholder:text-[#85857f] focus:border-[#b89a5a] focus:outline-none disabled:opacity-50"
              />
              <button type="submit" disabled={!enabled || loading || saving} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#a78b4f]/50 px-3 text-xs font-semibold text-[#e2cc8f] hover:bg-[#b89a5a]/10 disabled:opacity-45">
                <Search size={13} /><span>Search</span>
              </button>
            </form>
            {!enabled && !loading && <p className="mt-2 text-[11px] text-[#aaa9a2]">Turn memory on to inspect or search saved messages. Local chat history is not uploaded here.</p>}
            {loading ? (
              <div role="status" className="mt-3 flex items-center gap-2 text-[11px] text-[#aaa9a2]"><LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />Loading saved history…</div>
            ) : enabled && (
              <div className="mt-3">
                {query && <p className="mb-2 text-[10px] text-[#aaa9a2]">Relevant results for “{query}”</p>}
                {messages.length ? (
                  <ol className="max-h-52 space-y-2 overflow-y-auto pr-1">
                    {messages.map(message => (
                      <li key={message.id} className="rounded-lg border border-white/[.07] bg-[#101211] px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-[10px] text-[#aaa9a2]">
                          <span className="font-semibold capitalize text-[#d5bf80]">{message.role === 'assistant' ? 'Malvi' : 'You'}</span>
                          <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-[#e0ded6]">{message.text}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="rounded-lg border border-dashed border-[#57564f] px-3 py-3 text-center text-[11px] text-[#aaa9a2]">
                    {query ? 'No matching saved messages.' : 'No saved messages yet.'}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {query && <button type="button" onClick={() => { setSearch(''); void load(); }} className="min-h-9 text-[11px] text-[#d5bf80] underline underline-offset-4">Show recent history</button>}
                  <button type="button" disabled={saving || !enabled} onClick={() => void deleteHistory()} className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#a65e48]/45 px-3 text-[11px] font-semibold text-[#e0a895] hover:bg-[#542d25]/25 disabled:opacity-45">
                    {saving ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" /> : <Trash2 size={13} />}
                    Delete saved history
                  </button>
                </div>
              </div>
            )}
            {!enabled && !loading && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-[#aaa9a2]">Turn memory on to inspect or search saved messages. Local chat history is not uploaded here.</p>
                <button type="button" disabled={saving} onClick={() => void deleteHistory()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#a65e48]/45 px-3 text-[11px] font-semibold text-[#e0a895] hover:bg-[#542d25]/25 disabled:opacity-45">
                  {saving ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" /> : <Trash2 size={13} />}
                  Delete saved history
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-white/[.07] px-3.5 py-3.5 sm:px-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#b89a5a]/35 bg-[#b89a5a]/10 text-[#d9bd7b]"><Globe2 size={15} /></span>
          <div>
            <h3 className="text-xs font-semibold tracking-wide text-[#e4d3a8]">Public web research</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-[#c6c4bc]">
              Ask Malvi to search public web sources or publicly available social pages. This may use Gemini and search services and can incur usage.
            </p>
          </div>
        </div>

        <form onSubmit={submitResearch} className="mt-3 space-y-2.5">
          <label className="sr-only" htmlFor="malvi-research-query">Public research question</label>
          <textarea
            id="malvi-research-query"
            value={researchQuery}
            onChange={event => setResearchQuery(event.target.value.slice(0, 180))}
            minLength={3}
            maxLength={180}
            rows={2}
            placeholder="What would you like Malvi to look up?"
            className="min-h-[4.25rem] w-full resize-y rounded-lg border border-[#5a574d] bg-[#101211] px-3 py-2 text-xs text-[#f0eee7] placeholder:text-[#85857f] focus:border-[#b89a5a] focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-white/[.07] bg-[#101211] p-1" aria-label="Research source scope">
              {([
                ['web', 'Web'],
                ['public-social', 'Public social'],
              ] as const).map(([scope, label]) => (
                <button key={scope} type="button" aria-pressed={researchScope === scope} onClick={() => setResearchScope(scope)}
                  className={`min-h-8 rounded-md px-2.5 text-[11px] font-medium transition-colors ${researchScope === scope ? 'bg-[#8d753f]/35 text-[#f0d894]' : 'text-[#aaa9a2] hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[10px] tabular-nums text-[#aaa9a2]">{researchQuery.trim().length}/180</span>
            <button type="submit" disabled={researchLoading || researchQuery.trim().length < 3} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#d4bd7d] px-3.5 text-xs font-semibold text-[#171918] hover:bg-[#e2d09f] disabled:cursor-not-allowed disabled:opacity-45">
              {researchLoading ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : <Send size={13} />}
              {researchLoading ? 'Searching…' : 'Research'}
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-[#aaa9a2]">Public-only search. No access to private social profiles, messages, or closed groups. Use 3–180 characters.</p>
        </form>

        {researchLoading && (
          <div role="status" className="mt-3 rounded-lg border border-[#b89a5a]/20 bg-[#101211] px-3 py-3 text-[11px] text-[#d4c48f]">
            <span className="inline-flex items-center gap-2"><LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />Searching public sources…</span>
            <p className="mt-1 text-[#aaa9a2]">This may take a moment and may incur Gemini or search-provider usage.</p>
          </div>
        )}
        {researchError && <p role="alert" className="mt-3 rounded-lg border border-[#a65e48]/35 bg-[#542d25]/25 px-3 py-2 text-[11px] leading-relaxed text-[#e8b5a4]">{researchError}</p>}
        {research && !researchLoading && (
          <div className="mt-3 space-y-3 rounded-xl border border-white/[.08] bg-[#101211] p-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#d4bd7d]">Search-informed response</p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#aaa9a2]">Source snippets and citation mappings are context for this answer; they do not independently prove every claim.</p>
              <p className="mt-1 text-[10px] text-[#aaa9a2]">Search provider verification status: {research.verified ? 'reported verified' : 'not verified'}.</p>
              {research.checkedAt && <p className="mt-1 text-[10px] text-[#85857f]">Checked {new Date(research.checkedAt).toLocaleString()}</p>}
            </div>
            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-[#e4e1d8]">{research.answer}</p>
            <p className="rounded-lg border border-[#b89a5a]/20 bg-[#b89a5a]/[.06] px-2.5 py-2 text-[10px] leading-relaxed text-[#d1c8ae]">
              {research.limitation || 'Public sources only. This search cannot access private social profiles, private messages, or closed groups.'}
            </p>
            {researchResults.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#d4bd7d]">Sources and snippets</h4>
                <ul className="mt-2 space-y-2">
                  {researchResults.map((result, index) => {
                    const href = safeResearchUrl(result.url);
                    return (
                      <li key={`${result.url}-${index}`} className="rounded-lg border border-white/[.07] px-2.5 py-2">
                        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 text-[11px] font-semibold text-[#e4d3a8] underline decoration-[#b89a5a]/60 underline-offset-2">
                          <span>{result.title || href}</span><ExternalLink size={11} className="mt-0.5 shrink-0" />
                        </a> : <p className="text-[11px] font-semibold text-[#e4d3a8]">{result.title || 'Source link unavailable'}</p>}
                        <p className="mt-1 text-[10px] text-[#aaa9a2]">{result.source || 'Web'}{result.caveat ? ` · ${result.caveat}` : ''}</p>
                        {result.snippet && <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#d0cec5]">{result.snippet}</p>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {researchCitations.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#d4bd7d]">Citation mappings</h4>
                <ol className="mt-2 space-y-2">
                  {researchCitations.map((citation, index) => (
                    <li key={`${citation.text}-${index}`} className="rounded-lg border border-white/[.07] px-2.5 py-2">
                      <p className="text-[11px] leading-relaxed text-[#dedbd2]">{citation.text}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {citation.urls.map(url => {
                          const href = safeResearchUrl(url);
                          if (!href) return null;
                          const result = researchResults.find(item => safeResearchUrl(item.url) === href);
                          return <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#d4bd7d] underline underline-offset-2">{result?.title || new URL(href).hostname}</a>;
                        })}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {research.searchSuggestions && (
              <iframe
                title="Trusted provider search suggestions"
                srcDoc={suggestionsDocument(research.searchSuggestions)}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                className="h-24 w-full rounded-lg border border-white/10 bg-[#171918]"
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
};
