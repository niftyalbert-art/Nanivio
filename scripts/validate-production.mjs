import fs from 'node:fs';
const required=['server.ts','package.json','src/lib/agoraClient.ts','src/server/normalizedBillingRepository.ts','src/server/productionStatus.ts','migrations/006_langpretation_persistent_config.sql'];
let ok=true; for(const f of required) if(!fs.existsSync(f)){console.error('MISSING',f);ok=false;}
const tts=fs.readFileSync('src/lib/translator-engine/audio/ttsAudioGenerator.ts','utf8');
const speech=fs.readFileSync('src/services/speechService.ts','utf8');
if(/createOscillator|sine-wave/.test(tts)){console.error('FAIL: synthetic Langpretation TTS detected');ok=false;}
if(/speechSynthesis/.test(speech)){console.error('FAIL: browser speechSynthesis remains in Langpretation speech service');ok=false;}
const realtime=fs.readFileSync('src/server/realtimeServer.ts','utf8');
if(!realtime.includes("case 'call:speech':") || !realtime.includes('Real call Langpretation')){console.error('FAIL: deprecated call speech handler not explicitly disabled');ok=false;}
console.log(ok?'Production static validation: PASS':'Production static validation: FAIL'); process.exit(ok?0:1);
