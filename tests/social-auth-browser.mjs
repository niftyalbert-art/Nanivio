import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { launchBrowser } from '../scripts/live-call-checks/cdp.mjs';

// Real Supabase browser SDK and PKCE; isolated provider and profile responses.
// No external account login, credentials or paid provider requests.
const bundle=await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:`
  import {startSocialSignIn,finishSocialSignIn,socialSignupHeaders} from './src/lib/socialAuthClient';
  window.start=startSocialSignIn;window.headers=socialSignupHeaders;
  if(location.pathname==='/auth/callback'){
    const code=new URLSearchParams(location.search).get('code');
    Promise.all([finishSocialSignIn(code),finishSocialSignIn(code)])
      .then(results=>window.result=results[0]).catch(error=>window.error=error.message);
  }
`},bundle:true,write:false,format:'iife',platform:'browser'});
let origin='',challenge='',exchanges=0,completeCalls=0,returningUser=true;
const jwt=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:'fixture-user',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture-signature`;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  res.setHeader('Content-Type','application/json');
  if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles[0].text);}
  if(url.pathname==='/api/auth/social/config')return res.end(JSON.stringify({url:origin,publicKey:'fixture-public-anon',google:true,apple:true}));
  if(url.pathname==='/auth/v1/authorize'){
    challenge=url.searchParams.get('code_challenge');
    assert.equal(url.searchParams.get('code_challenge_method'),'s256');
    assert.equal(url.searchParams.get('provider'),'google');
    res.writeHead(302,{Location:`${origin}/auth/callback?code=fixture-code`});return res.end();
  }
  if(url.pathname==='/auth/v1/token'){
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);
    assert.equal(body.auth_code,'fixture-code');
    assert.equal(crypto.createHash('sha256').update(body.code_verifier).digest('base64url'),challenge);
    exchanges++;
    return res.end(JSON.stringify({access_token:jwt,refresh_token:'fixture-refresh',expires_in:3600,
      token_type:'bearer',user:{id:'fixture-user',email:'person@example.test',aud:'authenticated',app_metadata:{provider:'google'},user_metadata:{}}}));
  }
  if(url.pathname==='/api/auth/social/complete'){
    completeCalls++;
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);
    assert.equal(body.accessToken,jwt);
    assert.equal(body.provider,'google');
    return res.end(JSON.stringify(returningUser?{needsRegistration:false,token:jwt,user:{id:'fixture-user',email:'person@example.test'}}:
      {needsRegistration:true,email:'person@example.test'}));
  }
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><title>Isolated social-auth test</title><script src="/app.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
origin=`http://127.0.0.1:${server.address().port}`;
const browser=await launchBrowser();
try{
  for(const returning of [true,false]){
    returningUser=returning;
    const page=await browser.page(origin);
    await page.wait("typeof window.start==='function'");
    await page.evaluate(`void window.start('google');true`);
    await page.wait("!!window.result||!!window.error");
    assert.equal(await page.evaluate('window.error||null'),null);
    assert.equal(await page.evaluate('window.result.needsRegistration'),!returning);
    if(returning){
      assert.equal(await page.evaluate("JSON.parse(localStorage.getItem('nanivio_auth_user')).id"),'fixture-user');
      assert.equal(await page.evaluate("sessionStorage.getItem('nanivio_social_signup')"),null);
    }else{
      assert.equal(await page.evaluate("localStorage.getItem('nanivio_auth_token')"),null);
      assert.equal(await page.evaluate("window.headers('other@example.test')['x-nanivio-social-token']||null"),null);
      assert.equal(await page.evaluate("window.headers('person@example.test')['x-nanivio-social-provider']"),'google');
    }
    assert.equal(await page.evaluate("sessionStorage.getItem('nanivio-social-pkce')"),null);
  }
  const disabled=await browser.page(origin);
  await disabled.wait("typeof window.start==='function'");
  await disabled.evaluate("window.start('apple').catch(error=>window.appleError=error.message);true");
  await disabled.wait("!!window.appleError");
  assert.match(await disabled.evaluate('window.appleError'),/temporarily unavailable/);
  assert.equal(exchanges,2,'duplicate StrictMode completion must not redeem a code twice');
  assert.equal(completeCalls,2);
  console.log(JSON.stringify({passed:true,pkce:true,returningUser:true,newUserOnboarding:true,
    preferredEmailIsolation:true,duplicateCallbackGuard:true,appleDisabled:true,externalProviderLogins:0}));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
