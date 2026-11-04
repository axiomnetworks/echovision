const scopeSignature=l=>JSON.stringify({id:l.id,vision:l.vision,count:l.count,sttSeconds:l.sttSeconds,voiceChars:l.voiceChars});
/* One durable ledger shared by ALL anonymous sessions for a launch grant.
   Enforces operation/voice/audio allowances, not a provider hard-dollar ceiling.
   Configuration comes only from reviewed server deployment, never visitor requests.
   Reserve before effects. Failures/aborts consume reservations; no retry/refund. */
export class PublicBudget {
 constructor(storage,limits,now=()=>Date.now()){this.storage=storage;this.limits=limits;this.now=now;}
 async reserve(kind,amount=1){
  const l=this.limits;
  if(!l||!l.id||(l.expires!==null&&(!Number.isFinite(l.expires)||l.expires<=this.now()))||!['vision','count','sttSeconds','voiceChars'].includes(kind)||!Number.isSafeInteger(amount)||amount<1)throw Error('Live budget disabled');
  const cap=l[kind];if(!Number.isSafeInteger(cap)||cap<1)throw Error('Operation not approved');
  return this.storage.transaction(async tx=>{
   const key='budget:'+l.id,prior=await tx.get(key),signature=scopeSignature(l);
   if(prior&&scopeSignature(JSON.parse(prior.signature))!==signature)throw Error('Grant limits changed');
   const row=prior||{signature,vision:0,count:0,sttSeconds:0,voiceChars:0};
   if(l.audioReset&&row.audioReset!==l.audioReset){row.sttSeconds=0;row.audioReset=l.audioReset;}
   if(!l.unlimited&&row[kind]+amount>cap)throw Error('Shared launch budget exhausted');
   row[kind]+=amount;await tx.put(key,row);return l.unlimited?{unlimited:true,used:{vision:row.vision,count:row.count,sttSeconds:row.sttSeconds,voiceChars:row.voiceChars}}:{remaining:cap-row[kind],remainingByKind:{vision:l.vision-row.vision,count:l.count-row.count,sttSeconds:l.sttSeconds-row.sttSeconds,voiceChars:l.voiceChars-row.voiceChars}};
  });
 }
}

export class PublicLaunchBudget {
 constructor(ctx,env){this.ledger=new PublicBudget(ctx.storage,{id:env.ECHO_PUBLIC_GRANT,audioReset:env.ECHO_PUBLIC_AUDIO_RESET||null,unlimited:env.ECHO_PUBLIC_UNLIMITED==='yes',expires:env.ECHO_PUBLIC_EXPIRES==='none'?null:Number(env.ECHO_PUBLIC_EXPIRES),vision:Number(env.ECHO_PUBLIC_MAX_VISION),count:Number(env.ECHO_PUBLIC_MAX_COUNT),sttSeconds:Number(env.ECHO_PUBLIC_MAX_STT_SECONDS),voiceChars:Number(env.ECHO_PUBLIC_MAX_VOICE_CHARS)});}
 async fetch(req){try{const raw=await req.text();if(raw.length>150)throw Error();const p=JSON.parse(raw);if(Object.keys(p).some(k=>!['kind','amount'].includes(k)))throw Error();return new Response(JSON.stringify(await this.ledger.reserve(p.kind,p.amount)),{headers:{'content-type':'application/json'}});}catch{return new Response('Shared allowance unavailable',{status:429});}}
}
