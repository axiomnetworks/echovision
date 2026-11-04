import{createPublicSession,readPublicSession,visitorEffectAllowed}from'./public-session.mjs';
const json=(d,status=200,extra={})=>new Response(JSON.stringify(d),{status,headers:{'content-type':'application/json','cache-control':'no-store','permissions-policy':'camera=(), microphone=()',...extra}});
export function publicLiveEnabled(env){return env.ECHO_PUBLIC_LIVE==='yes'&&env.ECHO_PUBLIC_GRANT&&(env.ECHO_PUBLIC_EXPIRES==='none'||Number(env.ECHO_PUBLIC_EXPIRES)>Date.now())&&env.PUBLIC_SCENE&&env.PUBLIC_BUDGET&&env.META_API_KEY&&env.ECHO_OWNER_SIGNING_KEY;}
export async function publicRoute(req,env){const path=new URL(req.url).pathname;if(path==='/api/public/availability'&&req.method==='GET')return json({enabled:!!publicLiveEnabled(env)});if(!publicLiveEnabled(env))return json({error:'Live launch not enabled; no media sent'},503);
 if(path==='/api/public/listen'&&req.headers.get('upgrade')==='websocket'){
  const session=await readPublicSession(req,env.ECHO_OWNER_SIGNING_KEY,Date.now(),env.ECHO_PUBLIC_CONTINUOUS==='yes');
  if(!session||req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Private same-origin session required'},403);
  return env.PUBLIC_SCENE.get(env.PUBLIC_SCENE.idFromName('visitor:'+session.id)).fetch(new Request('https://scene.invalid/listen',{headers:{Upgrade:'websocket'}}));
 }
 if(req.method!=='POST'||req.headers.get('origin')!==new URL(req.url).origin||!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'Same-origin JSON POST required'},403);
 if(path==='/api/public/session'){let p;try{const raw=await req.text();if(raw.length>100)throw Error();p=JSON.parse(raw);}catch{return json({error:'Bounded consent required'},400);}if(Object.keys(p).join()!=='consent'||!['meta-freecredits-ondevice-speech-v1','meta-freecredits-elevenlabs-retention-v1'].includes(p.consent))return json({error:'Review visitor media notice'},403);
 const identity=await createPublicSession(env.ECHO_OWNER_SIGNING_KEY,Date.now(),env.ECHO_PUBLIC_CONTINUOUS==='yes');return json({csrf:identity.session.csrf,expires:identity.session.expires},200,{'set-cookie':identity.cookie});}
 const session=await readPublicSession(req,env.ECHO_OWNER_SIGNING_KEY,Date.now(),env.ECHO_PUBLIC_CONTINUOUS==='yes');if(!visitorEffectAllowed(req,session))return json({error:'Private anonymous session and CSRF required'},403);
 if(!['/api/public/analyze','/api/public/start','/api/public/ask','/api/public/transcribe','/api/public/forget','/api/public/retarget'].includes(path))return json({error:'Unknown action'},404);
 const reader=req.body?.getReader();let size=0,parts=[];if(reader)for(;;){const{value,done}=await reader.read();if(done)break;size+=value.length;if(size>6000000){await reader.cancel();return json({error:'Media request too large'},413);}parts.push(value);}const bytes=new Uint8Array(size);let at=0;for(const b of parts){bytes.set(b,at);at+=b.length;}let p;try{p=JSON.parse(new TextDecoder().decode(bytes));if(Object.hasOwn(p,'_session'))throw Error();}catch{return json({error:'Invalid body'},400);}p._session=session.id;
 const actor=env.PUBLIC_SCENE.get(env.PUBLIC_SCENE.idFromName('visitor:'+session.id));return actor.fetch(new Request('https://scene.invalid/'+path.split('/').pop(),{method:'POST',body:JSON.stringify(p),signal:req.signal}));
                                          }
