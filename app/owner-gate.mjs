// Local preparation only. Random owner password and signing key must be separate vault-backed secrets.
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const COOKIE='__Host-echo_owner';
const headers={'cache-control':'no-store, private','referrer-policy':'same-origin','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'permissions-policy':'camera=(), microphone=()'};
const response=(body,status=200,more={})=>new Response(body,{status,headers:{...headers,...more}});
async function key(secret){if(typeof secret!=='string'||secret.length<43)throw Error('Missing signing key');return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function ownerCookie(secret,now=Date.now()){
 const p=b64(enc.encode(JSON.stringify({expires:now+900000,csrf:b64(crypto.getRandomValues(new Uint8Array(24)))})));
 const s=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(p))));
 return `${COOKIE}=${p}.${s}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900`;
}
export async function ownerSession(request,secret,now=Date.now()){
 try{const token=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token||token.length>1024)return null;const [p,s,...rest]=token.split('.');if(rest.length||!p||!s)return null;
 if(!await crypto.subtle.verify('HMAC',await key(secret),unb64(s),enc.encode(p)))return null;
 const d=JSON.parse(new TextDecoder().decode(unb64(p)));return Number.isFinite(d.expires)&&d.expires>now&&d.expires<=now+900000&&typeof d.csrf==='string'?d:null;}catch{return null;}
}
export class OwnerLoginLimit{
 constructor(ctx){this.ctx=ctx;}
 async fetch(){return this.ctx.storage.transaction(async tx=>{const now=Date.now();let s=await tx.get('attempts');if(!s||s.until<=now)s={used:0,until:now+60000};if(s.used>=5)return response('Try again later.',429,{'retry-after':'60'});s.used++;await tx.put('attempts',s);return response('ok');});}
}
async function boundedText(request){if(!request.body)return '';const r=request.body.getReader();let n=0,parts=[];for(;;){const {value,done}=await r.read();if(done)break;n+=value.byteLength;if(n>1024){await r.cancel();throw Error('Too large');}parts.push(value);}return new TextDecoder().decode(new Uint8Array(parts.flatMap(p=>Array.from(p))));}
const page=message=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private EchoVision sign in</title><style>body{font:1.15rem system-ui;line-height:1.5;max-width:32rem;margin:3rem auto;padding:1rem;color:#15251f;background:#f4f7f2}input,button{box-sizing:border-box;font:inherit;padding:.8rem;width:100%;min-height:48px;margin:.4rem 0 1rem}button{background:#123f30;color:white;border:0;border-radius:8px}a:focus,input:focus,button:focus{outline:3px solid #9c5100;outline-offset:3px}</style><main><h1>Private EchoVision</h1><p>Owner sign-in required. Camera and tracking remain disconnected.</p>${message?'<p role="alert">'+message+'</p>':''}<form method="post" action="/owner/login"><label for="username">Account</label><input id="username" name="username" autocomplete="username" value="EchoVision owner" readonly><label for="password">Private password</label><input type="password" id="password" name="password" autocomplete="current-password" required maxlength="256"><button type="submit">Sign in</button></form><p>Use your saved EchoVision login. Sign-in expires after 15 minutes. This page never starts the camera.</p></main></html>`;
export async function gate(request,env){
 const u=new URL(request.url);
 if(u.protocol!=='https:')return response('HTTPS required.',403);
 if(!env.ECHO_OWNER_PASSWORD_SHA256||!/^[a-f0-9]{64}$/.test(env.ECHO_OWNER_PASSWORD_SHA256)||!env.ECHO_OWNER_SIGNING_KEY||env.ECHO_OWNER_SIGNING_KEY.length<43||!env.OWNER_LOGIN_LIMIT)return response('Private access is not configured. Nothing is available.',503);
 const session=await ownerSession(request,env.ECHO_OWNER_SIGNING_KEY);
 if(u.pathname==='/owner/login'){
  if(request.method==='GET')return response(page(''),200,{'content-type':'text/html; charset=utf-8'});
  if(request.method!=='POST'||request.headers.get('origin')!==u.origin||!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return response('Request refused.',403);
  try{const limiter=env.OWNER_LOGIN_LIMIT.get(env.OWNER_LOGIN_LIMIT.idFromName('owner-login'));const limited=await limiter.fetch('https://limit.invalid/attempt');if(!limited.ok)return response('Too many sign-in attempts. Try again in one minute.',429,{'retry-after':'60'});
   const form=new URLSearchParams(await boundedText(request)),password=form.get('password');
   if(!password||password.length>256)return response(page('Sign-in failed.'),403,{'content-type':'text/html; charset=utf-8'});
   const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(password)))).map(b=>b.toString(16).padStart(2,'0')).join('');let diff=0;for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^env.ECHO_OWNER_PASSWORD_SHA256.charCodeAt(i);
   if(diff)return response(page('Sign-in failed.'),403,{'content-type':'text/html; charset=utf-8'});
   return response('',303,{location:'/', 'set-cookie':await ownerCookie(env.ECHO_OWNER_SIGNING_KEY)});
  }catch{return response('Sign-in temporarily unavailable.',503);}
 }
 if(u.pathname==='/owner/logout'){
  if(request.method!=='POST'||request.headers.get('origin')!==u.origin||!session)return response('Request refused.',403);
  let csrf=request.headers.get('x-csrf-token');if(!csrf){try{csrf=new URLSearchParams(await boundedText(request)).get('csrf');}catch{return response('Request refused.',403);}}if(csrf!==session.csrf)return response('Request refused.',403);
  return response('',303,{location:'/owner/login','set-cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
 }
 if(!session)return u.pathname.startsWith('/api/')?response('Private sign-in required.',401):response('',303,{location:'/owner/login'});
 return null;
}
