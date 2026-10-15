import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGE_CODES,planTranslation,azureLanguageCode,khayaSpeechCode,sunbirdSpeechCode } from '../src/lib/translator-engine/languagePlan.ts';
import { buildUniversal18x18Matrix,NANIVIO_18_LANGUAGES,getLanguageCapability } from '../src/lib/translator-engine/matrix/universal18Matrix.ts';
import { LanguageRouter } from '../src/lib/translator-engine/routing/language-router.ts';
import { ProviderRegistry } from '../src/lib/translator-engine/providers/registry.ts';
import { LatencyMetricsTracker } from '../src/lib/translator-engine/metrics/latency.ts';
import { LanguageDetector } from '../src/lib/translator-engine/detection/language-detector.ts';
import { NllbMtProvider } from '../src/lib/translator-engine/mt/nllb.ts';
import { authenticatedFetch } from '../src/lib/authenticatedFetch.ts';

test('all 324 directed declarations and both browser planners use the same authoritative plan',()=>{
  const rows=buildUniversal18x18Matrix(),router=new LanguageRouter();
  assert.equal(LANGUAGE_CODES.length,18);assert.equal(rows.length,324);
  assert.equal(new Set(rows.map(row=>row.sourceLang+':'+row.targetLang)).size,324);
  for(const row of rows){
    const plan=planTranslation(row.sourceLang,row.targetLang);
    assert.equal(row.route==='PIVOT',plan.requiresPivot);
    assert.equal(router.route(row.sourceLang,row.targetLang,'CALL').requiresPivot,plan.requiresPivot);
    assert.equal(router.resolveRoute(row.sourceLang,row.targetLang).requiresPivot,plan.requiresPivot);
    assert.equal(row.status,plan.supported?'NOT VERIFIED':'UNSUPPORTED');
    assert.equal(row.measuredLatencyMs,null);
  }
});
test('mixed specialist routes select each English-pivot leg independently',()=>{
  assert.deepEqual(planTranslation('ak','lg').hops,[{source:'ak',target:'en',provider:'khaya'},{source:'en',target:'lg',provider:'sunbird'}]);
  assert.deepEqual(planTranslation('lg','ak').hops,[{source:'lg',target:'en',provider:'sunbird'},{source:'en',target:'ak',provider:'khaya'}]);
  assert.deepEqual(planTranslation('ak','ha').hops.map(h=>h.provider),['khaya','azure']);
  assert.deepEqual(planTranslation('fr','ar').hops,[{source:'fr',target:'ar',provider:'azure'}]);
});
test('distinct Akuapem MT is never silently substituted or advertised as supported',()=>{
  assert.equal(planTranslation('en','tw-ak').supported,false);
  assert.equal(planTranslation('tw-ak','en').supported,false);
  assert.equal(planTranslation('tw-ak','tw-ak').supported,true);
  assert.equal(buildUniversal18x18Matrix().filter(row=>row.status==='UNSUPPORTED').length,34);
});
test('unknown codes fail rather than falling back to English',()=>{
  assert.throws(()=>getLanguageCapability('unknown'),/Unsupported/);
  assert.throws(()=>getLanguageCapability('__proto__'),/Unsupported/);
  assert.throws(()=>getLanguageCapability('constructor'),/Unsupported/);
  assert.throws(()=>planTranslation('en','unknown'),/Unsupported/);
  assert.throws(()=>planTranslation('unknown','unknown'),/Unsupported/);
});
test('catalogue and registry do not fabricate verification timestamps, costs or online status',()=>{
  for(const language of Object.values(NANIVIO_18_LANGUAGES)){assert.equal(language.lastVerified,null);assert.equal(language.costPerMinuteUsd,null);assert.notEqual(language.capability,'FULL');}
  for(const provider of new ProviderRegistry().getAll()){assert.notEqual(provider.status,'online');assert.equal(provider.averageLatencyMs,null);}
});
test('language codes are mapped separately for real service contracts',()=>{
  assert.equal(azureLanguageCode('zh'),'zh-Hans');assert.equal(azureLanguageCode('lg'),'lug');
  assert.equal(khayaSpeechCode('ak'),'twi');assert.equal(khayaSpeechCode('tw-ak'),'atw');assert.equal(khayaSpeechCode('ha'),'hau');
  assert.equal(sunbirdSpeechCode('lg'),'lug');assert.equal(sunbirdSpeechCode('sw'),'swa');
});
test('empty telemetry and quality have no invented success or performance benchmarks',()=>{
  const tracker=new LatencyMetricsTracker();
  assert.equal(tracker.getAverageLatency(),null);assert.equal(tracker.getIdealPercentage(),null);
  const report=tracker.getComprehensiveReport();
  assert.equal(report.totalTurns,0);assert.equal(report.qualityRatingScore,null);
  assert.equal(report.estimatedBleuScore,null);assert.equal(report.errorRate,null);
});
test('unmatched text is not reported as reliably detected English',()=>{
  const detection=new LanguageDetector().detect('qzxvpl 918273');
  assert.equal(detection.isReliable,false);assert.equal(detection.confidence,0);
});
test('unimplemented NLLB fails explicitly without an inference request',async()=>{
  const provider=new NllbMtProvider();assert.equal(provider.canHandle('en','ak'),false);
  await assert.rejects(provider.translate('hello','en','ak'),/not configured/);
});
test('authenticated transport never attaches account credentials to external URLs',()=>{
  assert.throws(()=>authenticatedFetch('https://example.com/api/translate'),/local application API/);
  assert.throws(()=>authenticatedFetch('//example.com/api/translate'),/local application API/);
  assert.throws(()=>authenticatedFetch('/api\\example.com/translate'),/local application API/);
});
