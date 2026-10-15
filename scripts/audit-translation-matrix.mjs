// Static/planning audit only. Never calls MT/ASR/TTS providers, creates accounts,
// records usage, or treats routing declarations as actual translation evidence.
// Run: node --import tsx scripts/audit-translation-matrix.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  AUTHORITATIVE_18_LANG_CODES as codes,
  NANIVIO_18_LANGUAGES as languages,
  buildUniversal18x18Matrix,
} from '../src/lib/translator-engine/matrix/universal18Matrix.ts';
import { LanguageRouter } from '../src/lib/translator-engine/routing/language-router.ts';
import { ProviderRegistry } from '../src/lib/translator-engine/providers/registry.ts';
import { NllbMtProvider } from '../src/lib/translator-engine/mt/nllb.ts';
import { LatencyMetricsTracker } from '../src/lib/translator-engine/metrics/latency.ts';
import { LanguageDetector } from '../src/lib/translator-engine/detection/language-detector.ts';

const directory = 'generated-artifacts/translation-engine-audit';
await fs.mkdir(directory, { recursive: true });
const router = new LanguageRouter();
const matrix = buildUniversal18x18Matrix();
assert.equal(codes.length, 18);
assert.equal(matrix.length, 324);
assert.equal(new Set(matrix.map(row => `${row.sourceLang}:${row.targetLang}`)).size, 324);

let evidence = null;
try {
  evidence = JSON.parse(await fs.readFile('generated-artifacts/live-call-checks/results.json', 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const actualChecks = evidence?.runs?.filter(run => run.origin === 'workspace').flatMap(run => run.checks || []) || [];
const twiVerified = actualChecks.some(check => check.name === 'Actual English-to-Twi translation provider returns output' &&
  check.passed && check.provider === 'khaya-ghana-nlp' && !check.cached);

const ghana = new Set(['ak', 'tw-ak', 'fat', 'ee', 'gaa', 'ha']);
const east = new Set(['sw', 'lg']);
const rows = matrix.map(entry => {
  const source = entry.sourceLang;
  const target = entry.targetLang;
  const plan = router.route(source, target, 'CALL');
  const resolved = router.resolveRoute(source, target);
  const notes = [];
  if (source !== target) {
    if ((ghana.has(source) && east.has(target)) || (east.has(source) && ghana.has(target))) {
      notes.push('HTTP Ghana-first branch does not select Khaya/Sunbird independently for each English-pivot hop');
    }
    if (source === 'tw-ak' || target === 'tw-ak') notes.push('Akuapem MT code is not mapped; distinct ASR/TTS support is not MT evidence');
    if (source === 'ha' || target === 'ha') notes.push('Preferred Khaya v1 Hausa MT pair is not in its documented catalogue; Azure Hausa MT is a possible separate route');
    if (source === 'zh' || target === 'zh') notes.push('Azure zh mapping needs validation against current zh-Hans/zh-Hant catalogue');
    if ((entry.route === 'PIVOT') !== plan.requiresPivot || (entry.route === 'PIVOT') !== resolved.requiresPivot) {
      notes.push('Planning layers disagree on pivot requirement; not itself proof of a runtime failure');
    }
    notes.push('No complete real speech-to-speech evidence for this pair');
  }
  return {
    source, sourceName: languages[source].name,
    target, targetName: languages[target].name,
    matrixRoute: entry.route,
    matrixStatus: entry.status,
    matrixMeasuredLatencyClaimMs: entry.measuredLatencyMs,
    clientPlanPivot: plan.requiresPivot,
    clientResolverPivot: resolved.requiresPivot,
    clientClaimsRealtimeExecutable: plan.canExecuteRealtimeAudio,
    declaredAsr: plan.asrProvider,
    declaredMt: plan.mtProvider,
    declaredTts: plan.ttsProvider,
    liveTextEvidence: source === target ? 'NO_TRANSLATION_NEEDED' :
      source === 'en' && target === 'ak' && twiVerified ? 'PRIOR_UNCACHED_KHAYA_OUTPUT_OBSERVED' : 'NOT_LIVE_VERIFIED',
    liveSpeechEvidence: source === target ? 'NOT_APPLICABLE' : 'NOT_LIVE_VERIFIED',
    notes: notes.join('; '),
  };
});

const languageRows = codes.map(code => {
  const language = languages[code];
  return {
    code, name: language.name, declaredCapability: language.capability,
    declaredAsr: language.speechRecognition, declaredMt: language.translation,
    declaredTts: language.textToSpeech, declaredRealtime: language.realtimeSpeechTranslation,
    declaredVoiceNotes: language.voiceNotes, active: language.active,
    configuredByCatalogue: [language.defaultAsrProvider, language.defaultMtProvider, language.defaultTtsProvider],
    verificationTimestampIsPopulatedWithoutMeasurement: Boolean(language.lastVerified),
  };
});

const mismatches = rows.filter(row => (row.matrixRoute === 'PIVOT') !== row.clientPlanPivot ||
  (row.matrixRoute === 'PIVOT') !== row.clientResolverPivot);
const tracker = new LatencyMetricsTracker();
const summary = {
  checkedAt: new Date().toISOString(),
  method: 'Exhaustive local declaration/planning audit; no provider inference or usage writes',
  languageCount: codes.length,
  combinationCount: rows.length,
  nonSelfCombinations: rows.filter(row => row.source !== row.target).length,
  matrixLiveVerifiedEntries: rows.filter(row => row.matrixStatus === 'LIVE VERIFIED').length,
  declaredRealtimeExecutableCount: rows.filter(row => row.clientClaimsRealtimeExecutable).length,
  pivotPlanningDisagreementCount: mismatches.length,
  matrixVsPlanDisagreementCount: rows.filter(row => (row.matrixRoute === 'PIVOT') !== row.clientPlanPivot).length,
  planVsResolverDisagreementCount: rows.filter(row => row.clientPlanPivot !== row.clientResolverPivot).length,
  importedLiveTextEvidenceCount: rows.filter(row => row.liveTextEvidence === 'PRIOR_UNCACHED_KHAYA_OUTPUT_OBSERVED').length,
  liveSpeechVerifiedCount: 0,
  emptyTracker: { averageLatencyMs: tracker.getAverageLatency(), idealPercentage: tracker.getIdealPercentage(),
    comprehensive: tracker.getComprehensiveReport() },
  defaultRegistry: new ProviderRegistry().getAll().map(provider => ({
    id: provider.id, declaredStatus: provider.status, declaredLatencyMs: provider.averageLatencyMs,
  })),
  nllbCanHandle: new NllbMtProvider().canHandle('en', 'fr'),
  unknownLanguageRejected: (()=>{try{router.route('not-a-language','en','CALL');return false;}catch{return true;}})(),
  unmatchedTextDetection: new LanguageDetector().detect('qzxvpl 918273'),
  languages: languageRows,
};
assert.equal(summary.nonSelfCombinations, 306);
assert.equal(summary.matrixLiveVerifiedEntries, 0);
assert.equal(summary.declaredRealtimeExecutableCount, 18);
assert.equal(summary.pivotPlanningDisagreementCount, 0);
assert.equal(summary.unknownLanguageRejected,true);
assert.equal(summary.nllbCanHandle, false);

const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const columns = Object.keys(rows[0]);
await fs.writeFile(`${directory}/18x18-routing-audit.csv`,
  [columns.map(csv).join(','), ...rows.map(row => columns.map(column => csv(row[column])).join(','))].join('\r\n') + '\r\n');
await fs.writeFile(`${directory}/findings.json`, JSON.stringify({ summary, pairs: rows }, null, 2));
console.log(JSON.stringify({
  combinations: summary.combinationCount, nonSelf: summary.nonSelfCombinations,
  matrixLiveVerified: summary.matrixLiveVerifiedEntries,
  claimedRealtimeExecutable: summary.declaredRealtimeExecutableCount,
  pivotPlanningDisagreements: summary.pivotPlanningDisagreementCount,
  importedRealTextEvidence: summary.importedLiveTextEvidenceCount,
  liveSpeechVerified: summary.liveSpeechVerifiedCount,
  outputDirectory: directory,
}));
