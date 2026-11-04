const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(secret){if(!secret||secret.length<32)throw Error('Session signing key missing');return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const random=()=>b64(crypto.getRandomValues(new Uint8Array(24)));
export async function accessMatches(input,expected){if(!expected||typeof input!=='string'||input.length>256)return false;const a=await crypto.subtle.digest('SHA-256',enc.encode(input)),b=await crypto.subtle.digest('SHA-256',enc.encode(expected));let n=0;const x=new Uint8Array(a),y=new Uint8Array(b);for(let i=0;i<x.length;i++)n|=x[i]^y[i];return n===0;}
export async function issueSession(secret,now=Date.now()){
 const data={owner:random(),csrf:random(),expires:now+600000};const p=b64(enc.encode(JSON.stringify(data)));
 const sig=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(p))));
 return {cookie:`echo_session=${p}.${sig}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=600`,csrf:data.csrf,owner:data.owner,expires:data.expires};
}
export async function verifySession(request,secret,csrf,now=Date.now()){
 try{
  const cookie=request.headers.get('cookie')||'';const token=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('echo_session='))?.slice(13);
  if(!token)return null;const [p,sig,...extra]=token.split('.');if(extra.length||!p||!sig)return null;
  if(!await crypto.subtle.verify('HMAC',await key(secret),unb64(sig),enc.encode(p)))return null;
  const data=JSON.parse(new TextDecoder().decode(unb64(p)));
  if(typeof data.expires!=='number'||data.expires<=now||data.expires>now+600000||typeof data.owner!=='string'||data.csrf!==csrf)return null;
  return data;
 }catch{return null;}
}
