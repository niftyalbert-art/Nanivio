export type ReferenceGroup = 'general' | 'scientific' | 'both';
export type ReferenceSource = 'Wikipedia' | 'Wikidata' | 'arXiv' | 'PubMed';
export interface ReferenceResult {
  source: ReferenceSource;
  title: string;
  url: string;
  summary: string;
  published?: string;
  caveat: string;
}
export interface ReferenceSearchResult {
  results: ReferenceResult[];
  unavailable: ReferenceSource[];
  searched: ReferenceSource[];
}

const SOURCE_GROUPS: Record<ReferenceGroup, ReferenceSource[]> = {
  general: ['Wikipedia', 'Wikidata'],
  scientific: ['arXiv', 'PubMed'],
  both: ['Wikipedia', 'Wikidata', 'arXiv', 'PubMed'],
};
const MAX_BYTES = 512_000;
const USER_AGENT = 'Nanivio-Malvi/1.0 (read-only reference lookup)';

/** Decode text only: never evaluate remote markup, entities, or instructions. */
export function referenceText(value: unknown, limit = 900): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
      const point = code.startsWith('x') || code.startsWith('X') ? parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity: string) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity] || '')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

function tag(xml: string, name: string) {
  return referenceText(xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1]);
}

function endpoint(base: string, params: Record<string, string>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

export function validateReferenceRequest(input: unknown): { query: string; group: ReferenceGroup } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A reference query and source group are required.');
  const { query, group } = input as Record<string, unknown>;
  if (typeof query !== 'string' || query.trim().length < 3 || query.length > 180 ||
      /[\u0000-\u001f@]|https?:\/\//i.test(query)) {
    throw new Error('Use 3–180 characters of general topic keywords, without account identifiers, email addresses, or URLs.');
  }
  if (group !== 'general' && group !== 'scientific' && group !== 'both') throw new Error('Choose general, scientific, or both.');
  return { query: query.trim().replace(/\s+/g, ' '), group };
}

export function createReferenceSearch(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; value: ReferenceSearchResult }>();
  const inFlight = new Map<string, Promise<ReferenceSearchResult>>();
  const queues = new Map<ReferenceSource, Promise<unknown>>();
  const nextRequest = new Map<ReferenceSource, number>();
  const queued = new Map<ReferenceSource, number>();

  async function download(source: ReferenceSource, url: URL): Promise<string> {
    // Fixed API origins only; no user-provided URL, redirect, scraping, or PDF fetch.
    const allowed = ['en.wikipedia.org', 'www.wikidata.org', 'export.arxiv.org', 'eutils.ncbi.nlm.nih.gov'];
    if (url.protocol !== 'https:' || !allowed.includes(url.hostname)) throw new Error('Unapproved reference host.');
    if ((queued.get(source) || 0) >= 6) throw new Error('Reference source is busy.');
    queued.set(source, (queued.get(source) || 0) + 1);
    const task = (queues.get(source) || Promise.resolve()).catch(() => {}).then(async () => {
      const delay = (nextRequest.get(source) || 0) - Date.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      // Respect arXiv's 3-second interval and the unauthenticated NCBI API limit.
      nextRequest.set(source, Date.now() + (source === 'arXiv' ? 3100 : source === 'PubMed' ? 400 : 100));
      const response = await fetcher(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, application/atom+xml, application/xml' },
        redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Reference API unavailable.');
      if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Reference response too large.');
      if (!response.body) throw new Error('Empty reference response.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) throw new Error('Reference response too large.');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      return Buffer.concat(chunks).toString('utf8');
    });
    queues.set(source, task);
    try { return await task; }
    finally { queued.set(source, (queued.get(source) || 1) - 1); }
  }

  async function lookup(source: ReferenceSource, query: string): Promise<ReferenceResult[]> {
    if (source === 'Wikipedia') {
      const data = JSON.parse(await download(source, endpoint('https://en.wikipedia.org/w/api.php', {
        action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '2',
        prop: 'extracts', exintro: '1', explaintext: '1', exchars: '1000', format: 'json', formatversion: '2',
      })));
      if (data.error) throw new Error('Wikipedia query failed.');
      return (data.query?.pages || []).filter((p: any) => typeof p.title === 'string' && p.extract).map((p: any) => ({
        source, title: referenceText(p.title, 200), summary: referenceText(p.extract),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
        caveat: 'Community-edited general reference; verify important claims against primary sources.',
      }));
    }
    if (source === 'Wikidata') {
      const data = JSON.parse(await download(source, endpoint('https://www.wikidata.org/w/api.php', {
        action: 'wbsearchentities', search: query, language: 'en', limit: '2', format: 'json',
      })));
      if (data.error) throw new Error('Wikidata query failed.');
      return (data.search || []).filter((p: any) => /^Q\d+$/.test(p.id) && p.label).map((p: any) => ({
        source, title: referenceText(p.label, 200), summary: referenceText(p.description),
        url: `https://www.wikidata.org/wiki/${p.id}`,
        caveat: 'Entity label and description only; this lookup does not verify individual property statements.',
      }));
    }
    if (source === 'arXiv') {
      const terms = query.match(/[\p{L}\p{N}-]+/gu)?.slice(0, 16) || [];
      if (!terms.length) throw new Error('No searchable topic terms.');
      const xml = await download(source, endpoint('https://export.arxiv.org/api/query', {
        search_query: terms.map(term => `all:"${term}"`).join(' AND '),
        start: '0', max_results: '2', sortBy: 'relevance',
      }));
      if (!/<feed[\s>]/.test(xml)) throw new Error('Invalid arXiv feed.');
      const entries = Array.from(xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g));
      const results: ReferenceResult[] = [];
      for (const [, entry] of entries) {
        const id = tag(entry, 'id').replace(/^https?:\/\/arxiv.org\/abs\//, '');
        if (id === 'http://arxiv.org/api/errors' || /api\/errors/.test(id)) throw new Error('arXiv query failed.');
        if (!/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i.test(id)) continue;
        results.push({
          source, title: tag(entry, 'title'), summary: tag(entry, 'summary'),
          url: `https://arxiv.org/abs/${id}`, published: tag(entry, 'published').slice(0, 10),
          caveat: 'arXiv preprint; inclusion does not establish peer review or scientific consensus.',
        });
      }
      return results;
    }
    const search = JSON.parse(await download(source, endpoint('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', {
      db: 'pubmed', term: query, retmode: 'json', retmax: '2', sort: 'relevance', tool: 'nanivio_malvi',
    })));
    if (!Array.isArray(search.esearchresult?.idlist)) throw new Error('PubMed search failed.');
    const ids = search.esearchresult.idlist.filter((id: unknown) => typeof id === 'string' && /^\d+$/.test(id)).slice(0, 2);
    if (!ids.length) return [];
    const xml = await download(source, endpoint('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi', {
      db: 'pubmed', id: ids.join(','), retmode: 'xml', tool: 'nanivio_malvi',
    }));
    if (!/<PubmedArticleSet[\s>]/.test(xml)) throw new Error('Invalid PubMed response.');
    return Array.from(xml.matchAll(/<PubmedArticle\b[^>]*>([\s\S]*?)<\/PubmedArticle>/g)).flatMap(([, article]) => {
      const id = tag(article, 'PMID');
      if (!/^\d+$/.test(id)) return [];
      const abstract = Array.from(article.matchAll(/<AbstractText\b[^>]*>([\s\S]*?)<\/AbstractText>/g))
        .map(([, text]) => referenceText(text)).join(' ');
      return [{
        source, title: tag(article, 'ArticleTitle'), summary: referenceText(abstract || tag(article, 'Title')),
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        published: tag(article, 'Year'),
        caveat: 'PubMed-indexed literature; indexing is not quality endorsement or personalized medical advice.',
      }];
    });
  }

  return async (input: unknown): Promise<ReferenceSearchResult> => {
    const { query, group } = validateReferenceRequest(input);
    const key = `${group}:${query.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const pending = inFlight.get(key);
    if (pending) return pending;
    if (inFlight.size >= 24) throw new Error('Reference search is busy. Please try again shortly.');
    const task = (async () => {
      const searched = [...SOURCE_GROUPS[group]];
      const outcomes = await Promise.allSettled(searched.map(source => lookup(source, query)));
      const results: ReferenceResult[] = [];
      const unavailable: ReferenceSource[] = [];
      outcomes.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') results.push(...outcome.value.slice(0, 2));
        else unavailable.push(searched[index]);
      });
      const value = { results, unavailable, searched };
      // Query/result cache is bounded and in-memory only; no conversation or account data is persisted.
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + (unavailable.length ? 15_000 : 300_000), value });
      return value;
    })();
    inFlight.set(key, task);
    try { return await task; } finally { inFlight.delete(key); }
  };
}

export const searchReferenceSources = createReferenceSearch();
