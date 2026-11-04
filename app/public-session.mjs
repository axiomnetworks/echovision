/* Anonymous session identity. No account history, personal IDs or cross-user lookup.
   Browser cookie is opaque signed random id, HttpOnly/Secure/SameSite=Strict.
   CSRF is bound to that identity; visitors cannot pick another actor or budget. */
const enc=new TextEncoder(),b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(secret){if(typeof secret!=='string'||secret.length<43)throw Error('Session signing not configured');return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function createPublicSession(secret,now=Date.now(),continuous=false){
 const session={id:crypto.randomUUID(),csrf:b64(crypto.getRandomValues(new Uint8Array(24))),expires:continuous?null:now+15*60000},p=b64(enc.encode(JSON.stringify(session))),sig=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(p))));
 return {session,cookie:`__Host-echo_public=${p}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict${continuous?'':'; Max-Age=900'}`};
}
export async function readPublicSession(request,secret,now=Date.now(),continuous=false){
 try{const token=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-echo_public='))?.slice(19);if(!token||token.length>1500)return null;const[p,s,...rest]=token.split('.');if(rest.length||!p||!s||!await crypto.subtle.verify('HMAC',await key(secret),unb64(s),enc.encode(p)))return null;
 const d=JSON.parse(new TextDecoder().decode(unb64(p)));return typeof d.id==='string'&&/^[0-9a-f-]{36}$/.test(d.id)&&typeof d.csrf==='string'&&d.csrf.length===32&&((continuous&&d.expires===null)||(d.expires>now&&d.expires<=now+900000))?d:null;}catch{return null;}
}
export function visitorEffectAllowed(request,session){return request.method==='POST'&&request.headers.get('origin')===new URL(request.url).origin&&session&&request.headers.get('x-csrf-token')===session.csrf;}
