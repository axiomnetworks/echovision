import{PublicScene}from'./public-scene.mjs';export{PublicScene};
import{PublicLaunchBudget}from'./public-budget.mjs';export{PublicLaunchBudget};
import{publicRoute}from'./public-route.mjs';
import{SceneVoice}from './scene-voice.mjs';
export{SceneVoice};
import {VoiceFixture} from './voice-fixture.mjs';
export {VoiceFixture};
import {gate,ownerSession,OwnerLoginLimit} from './owner-gate.mjs';
export {OwnerLoginLimit};
import {issueSession,verifySession} from './auth.mjs';
/* Private preparation. Enabled only by source-grounded operator grant, never by browser input.
   No GPU activation, provider request, public deployment or account creation performed. */
export class GrantCounter {
  constructor(storage) { this.storage=storage; }
  async reserve(grant,kind,cap,expires,now=Date.now()) {
    if(!grant||!['frame','acquisition','semantic'].includes(kind)||!Number.isInteger(cap)||cap<1||now>=expires)throw Error('No active grant');
    return this.storage.transaction(async tx=>{
      const key=`grant:${grant}:${kind}`;const row=await tx.get(key)||{cap,expires,used:0};
      if(row.cap!==cap||row.expires!==expires||row.used>=cap)throw Error('Grant exhausted or changed');
      row.used++;await tx.put(key,row);return row.cap-row.used;
    });
  }
}
async function sha256(value){const b=Uint8Array.from(atob(value),c=>c.charCodeAt(0));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
export function sameOrigin(request) {try{return request.headers.get('origin')===new URL(request.url).origin;}catch{return false;}}
export function freshFrame(p,now=Date.now()) {
  if(typeof p.captured_at_ms!=='number'||now-p.captured_at_ms>2000||now-p.captured_at_ms< -250)throw Error('Stale camera frame');
  if(typeof p.frame_id!=='string'||!p.frame_id||p.frame_id.length>80)throw Error('Invalid frame ID');
  if(typeof p.rgb_jpeg!=='string'||p.rgb_jpeg.length>670000||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.rgb_jpeg))throw Error('Invalid frame');
}
export class LiveCoordinator {
  constructor(ctx,env) {this.ctx=ctx;this.env=env;this.counter=new GrantCounter(ctx.storage);this.busy=false;}
  enabled(){return this.env.ECHO_LIVE_ENABLED==='yes'&&['approved','public-fixture-only'].includes(this.env.ECHO_MEDIA_SCOPE)&&this.env.BASETEN_API_KEY&&this.env.BASETEN_PREDICT_URL&&this.env.ECHO_GRANT_ID&&Number(this.env.ECHO_EXPIRES_MS)>Date.now();}
  async provider(p){
    // Never accept URL or key from client, never retry provider effects.
    const u=new URL(this.env.BASETEN_PREDICT_URL);
    if(u.protocol!=='https:'||!/^model-[a-z0-9]+\.api\.baseten\.co$/.test(u.hostname)||!u.pathname.endsWith('/predict'))throw Error('Provider route not configured');
    const r=await fetch(u,{method:'POST',headers:{Authorization:`Bearer ${this.env.BASETEN_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(p),signal:AbortSignal.timeout(p.operation==='acquire-and-start'?35000:10000)});
    if(!r.ok)throw Error('Provider unavailable');return r.json();
  }
  async stop(){
    const s=await this.ctx.storage.get('session');await this.ctx.storage.delete('session');await this.ctx.storage.deleteAlarm();
    if(s?.remote){try{await this.provider({operation:'stop',session:s.remote});}catch{}}
  }
  async alarm(){await this.stop();} // idempotent, no retry of charged inference
  async fetch(request){
    if(!this.enabled())return json({error:'Live disabled; nothing sent'},503);
    if(this.busy)return json({error:'One pending request; no backlog'},429);
    this.busy=true;
    try{
      const p=await request.json(),path=new URL(request.url).pathname;
      if(typeof p._verified_owner!=='string'||!p._verified_owner)throw Error('Verified app owner required');
      const existing=await this.ctx.storage.get('session');
      if(existing&&existing.owner!==p._verified_owner)throw Error('Session owned by another app session');
      if(path==='/stop'){await this.stop();return json({stopped:true});}
      const cap=Number(this.env.ECHO_MAX_FRAMES),expires=Number(this.env.ECHO_EXPIRES_MS);
      if(!Number.isInteger(cap)||cap<1||cap>120)throw Error('No frame allowance');
      let s=await this.ctx.storage.get('session');
      if(path==='/start'){
        if(s&&Date.now()<s.expires)throw Error('Session already active');
        freshFrame(p);
        if(typeof p.change!=='string'||!p.change.trim()||p.change.length>160)throw Error('Change instruction required');
        if(typeof p.target!=='string'||!p.target.trim()||p.target.length>80)throw Error('Target required');
        const acap=Number(this.env.ECHO_MAX_ACQUISITIONS);
        if(!Number.isInteger(acap)||acap<1||acap>2)throw Error('No acquisition allowance');
        await this.counter.reserve(this.env.ECHO_GRANT_ID,'acquisition',acap,expires);
        await this.counter.reserve(this.env.ECHO_GRANT_ID,'frame',cap,expires);
        const binary=Uint8Array.from(atob(p.rgb_jpeg),c=>c.charCodeAt(0));
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',binary))).map(b=>b.toString(16).padStart(2,'0')).join('');
        const result=await this.provider({operation:'acquire-and-start',seq:0,frame_id:p.frame_id,rgb_jpeg:p.rgb_jpeg,frame_sha256:digest,target:p.target,change:p.change});
        // Keep remote token for cleanup even if the first result is already stale.
        const token=crypto.randomUUID();
        s={owner:p._verified_owner,token,remote:result.session,seq:0,last_id:p.frame_id,expires:Math.min(Date.now()+60000,expires)};
        if(!s.remote)throw Error('No tracker session');
        await this.ctx.storage.put('session',s);await this.ctx.storage.setAlarm(s.expires);
        // Acquisition may take time. Its baseline is historical until a fresh tracked frame arrives.
        if(Date.now()-p.captured_at_ms>35000)throw Error('Initialization timed out');
        return json({session:token,result:result.result,semantic_alert:null,current:false,state:'initializing_waiting_for_fresh_frame',expires_in_s:60});
      }
      if(!s||Date.now()>s.expires)throw Error('Session absent or expired; acquire target');
      if(path==='/semantic'){
        if(this.env.ECHO_SEMANTIC_ENABLED!=='yes')throw Error('Semantic checks disabled');
        freshFrame(p);
        if(p.session!==s.token||p.seq!==s.seq||p.frame_id!==s.last_id)throw Error('Only latest tracked frame can be interpreted');
        const sc=Number(this.env.ECHO_MAX_SEMANTIC_CALLS);
        if(!Number.isInteger(sc)||sc<1||sc>8)throw Error('No semantic allowance');
        await this.counter.reserve(this.env.ECHO_GRANT_ID,'semantic',sc,expires);
        const binary=Uint8Array.from(atob(p.rgb_jpeg),c=>c.charCodeAt(0));
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',binary))).map(b=>b.toString(16).padStart(2,'0')).join('');
        const result=await this.provider({operation:'semantic-check',session:s.remote,seq:p.seq,frame_id:p.frame_id,rgb_jpeg:p.rgb_jpeg,frame_sha256:digest,captured_at_ms:p.captured_at_ms});
        if(Date.now()-p.captured_at_ms>2000)return json({state:'stale',semantic_alert:null,current:false});
        return json(result);
      }
      if(path!=='/frame')throw Error('Exact-frame acquisition adapter not enabled');
      freshFrame(p);
      if(p.session!==s.token||p.seq!==s.seq+1||p.frame_id===s.last_id)throw Error('Frame ownership or sequence invalid');
      await this.counter.reserve(this.env.ECHO_GRANT_ID,'frame',cap,expires);
      const result=await this.provider({operation:'frame',session:s.remote,seq:p.seq,frame_id:p.frame_id,rgb_jpeg:p.rgb_jpeg,frame_sha256:await sha256(p.rgb_jpeg)});
      if(Date.now()-p.captured_at_ms>2000)throw Error('Result stale');
      s.seq=p.seq;s.last_id=p.frame_id;await this.ctx.storage.put('session',s);
      return json({result:result.result,semantic_alert:null});
    }catch{await this.stop();return json({error:'Live request refused; no automatic retry'},422);}
    finally{this.busy=false;}
  }
}
export default {
 async fetch(request,env){
  // Explicit public preview mode serves only authored static UI/assets. Never bypass API gate.
  const previewPath=new URL(request.url).pathname;
  if(previewPath.startsWith('/api/public/'))return publicRoute(request,env);
  const publicAssets=new Set(['/','/scene.html','/scene.css','/scene-page.mjs','/scene-voice-session.mjs','/scene-http-transport.mjs','/fixtures/scene-motion.mp4','/fixtures/baseline.jpg','/fixtures/current.jpg','/fixtures/recorded-reply.mp3','/live.html','/live-page.mjs','/visitor-media.mjs','/screen-session.mjs','/live-listening.mjs','/request-errors.mjs','/clip-encoding-cache.mjs','/latency-timing.mjs','/live-diagnostics.mjs']);
  if(env.ECHO_PUBLIC_PREVIEW==='yes'&&['GET','HEAD'].includes(request.method)&&publicAssets.has(previewPath)){
    const target=new URL(request.url);if(previewPath==='/')target.pathname='/live.html';
    const asset=await env.ASSETS.fetch(new Request(target,request));const isHtml=(asset.headers.get('content-type')||'').includes('text/html');
    const r=new Response(isHtml?(await asset.text()).replaceAll('__OWNER_CSRF__','public-preview-no-effects'):asset.body,asset);
    r.headers.set('content-security-policy',"default-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");r.headers.set('cache-control','no-store');r.headers.set('x-content-type-options','nosniff');r.headers.set('permissions-policy',['/','/live.html'].includes(previewPath)&&env.ECHO_PUBLIC_LIVE==='yes'?'camera=(self), microphone=(self)':'camera=(), microphone=()');return r;
  }
  const refused=await gate(request,env);if(refused)return refused;
  const url=new URL(request.url);
  if(url.pathname==='/health')return json({ok:true,live_enabled:false,preparation_only:true});
  if(!url.pathname.startsWith('/api/')){const asset=await env.ASSETS.fetch(request);const session=await ownerSession(request,env.ECHO_OWNER_SIGNING_KEY);const isHtml=(asset.headers.get('content-type')||'').includes('text/html');const body=isHtml?(await asset.text()).replaceAll('__OWNER_CSRF__',session.csrf):asset.body;const r=new Response(body,asset);r.headers.set('content-security-policy',(['/fixture.html','/scene.html'].includes(url.pathname)?"default-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'none'":"default-src 'self'; script-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"));r.headers.set('cache-control','no-store, private');r.headers.set('referrer-policy','same-origin');r.headers.set('x-content-type-options','nosniff');r.headers.set('permissions-policy','camera=(), microphone=()');return r;}
  if(request.method!=='POST'||!sameOrigin(request))return json({error:'Same origin POST required'},403);
  if(url.pathname.startsWith('/api/scene/')){
    if(env.ECHO_SCENE_VOICE_ENABLED!=='yes'||!env.SCENE_VOICE)return json({error:'Scene voice disabled; nothing sent'},503);
    const owner=await ownerSession(request,env.ECHO_OWNER_SIGNING_KEY);
    if(!owner||request.headers.get('x-csrf-token')!==owner.csrf)return json({error:'Owner CSRF required'},403);
    if(!['/api/scene/start','/api/scene/ask','/api/scene/forget','/api/scene/status','/api/scene/transcribe'].includes(url.pathname))return json({error:'Unknown scene action'},404);
    const reader=request.body?.getReader();let parts=[],length=0;if(reader)for(;;){const{value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>2048){await reader.cancel();return json({error:'Bounded request required'},413);}parts.push(value);}
    const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}let p;try{p=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid JSON'},400);}
    if(Object.keys(p).some(k=>!['refs','session','question'].includes(k)))return json({error:'Only server references and bounded question accepted'},422);
    p._verified_owner=owner.csrf;const actor=env.SCENE_VOICE.get(env.SCENE_VOICE.idFromName('grant:'+env.ECHO_SCENE_GRANT));return actor.fetch(new Request('https://scene.invalid/'+url.pathname.split('/').pop(),{method:'POST',body:JSON.stringify(p)}));
  }
  if(url.pathname.startsWith('/api/fixture/')){
    // Dedicated public-material slice: no client audio/image/URL accepted.
    if(env.ECHO_VOICE_FIXTURE_ENABLED!=='yes'||env.ECHO_MEDIA_SCOPE!=='public-fixture-only'||!env.VOICE_FIXTURE)return json({error:'Voice fixture disabled; nothing sent'},503);
    const owner=await ownerSession(request,env.ECHO_OWNER_SIGNING_KEY);
    if(!owner||request.headers.get('x-csrf-token')!==owner.csrf)return json({error:'Owner CSRF required'},403);
    const reader=request.body?.getReader();let raw='',count=0;
    if(reader)for(;;){const {value,done}=await reader.read();if(done)break;count+=value.byteLength;if(count>1024){await reader.cancel();return json({error:'Bounded fixture request too large'},413);}raw+=new TextDecoder().decode(value);}
    let p;try{p=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
    if(!['/api/fixture/start','/api/fixture/ask','/api/fixture/forget'].includes(url.pathname)||Object.keys(p).some(k=>!['session'].includes(k)))return json({error:'Only fixed server fixtures accepted'},422);
    p._verified_owner=owner.csrf;const actor=env.VOICE_FIXTURE.get(env.VOICE_FIXTURE.idFromName('grant:'+env.ECHO_GRANT_ID));
    return actor.fetch(new Request('https://fixture.invalid/'+url.pathname.split('/').pop(),{method:'POST',body:JSON.stringify(p)}));
  }
  if(Number(request.headers.get('content-length'))>700000)return json({error:'Frame too large'},413);
  if(env.ECHO_LIVE_ENABLED!=='yes'||!['approved','public-fixture-only'].includes(env.ECHO_MEDIA_SCOPE)||!env.ECHO_SESSION_SECRET)return json({error:'Live not authorized/configured; nothing sent'},503);
  let body;try{body=await request.json();}catch{return json({error:'Invalid JSON'},400);}
  if(url.pathname==='/api/session'){
    if(body.consent!==true||!await ownerSession(request,env.ECHO_OWNER_SIGNING_KEY))return json({error:'Access or reviewed media consent required'},403);
    const s=await issueSession(env.ECHO_SESSION_SECRET);const r=json({csrf:s.csrf,expires:s.expires,scope:'experimental watcher; no navigation or safety claims',media_authorized:env.ECHO_MEDIA_SCOPE==='approved',public_fixture_only:env.ECHO_MEDIA_SCOPE==='public-fixture-only',semantic_authorized:env.ECHO_SEMANTIC_ENABLED==='yes'});r.headers.set('set-cookie',s.cookie);return r;
  }
  const owner=await verifySession(request,env.ECHO_SESSION_SECRET,body.csrf);
  if(!owner)return json({error:'Session ended'},403);
  // One fixed operator GRANT maps to one actor. New browser cookies cannot replenish counters.
  if(!['/api/live/start','/api/live/frame','/api/live/stop','/api/live/semantic'].includes(url.pathname))return json({error:'Exact-frame acquisition adapter not configured; nothing sent'},503);
  const id=env.LIVE.idFromName('grant:'+env.ECHO_GRANT_ID),actor=env.LIVE.get(id);
  const internalPath=url.pathname.endsWith('/stop')?'/stop':url.pathname.endsWith('/start')?'/start':url.pathname.endsWith('/semantic')?'/semantic':'/frame';delete body.csrf;body._verified_owner=owner.owner;
  return actor.fetch(new Request('https://actor.invalid'+internalPath,{method:'POST',body:JSON.stringify(body)}));
 }
};
