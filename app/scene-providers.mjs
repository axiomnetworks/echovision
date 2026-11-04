/* Real HTTP adapters. Creation performs no I/O; enabled actor alone invokes them.
   Fixed origins, no retries, bounded reads/timeouts. Existing grant is NOT copied in config. */
async function bounded(response,max){if(!response.ok)throw Error('Provider refused '+response.status);const reader=response.body.getReader();let size=0,parts=[];for(;;){const{value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('Provider response bound');}parts.push(value);}const out=new Uint8Array(size);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
export function sceneProviders(env,{fetcher=fetch}={}){
 return {
  sttAudio:async raw=>{
   if(!env.META_API_KEY||!(raw instanceof Uint8Array)||raw.length>480044)throw Error('STT unconfigured/bound');
   const form=new FormData();form.append('request',new Blob([JSON.stringify({mode:'PUSH_TO_TALK',model:'muse-voice-transcribe-1.0',audioEncoding:'WAV'})],{type:'application/json'}));form.append('audio',new Blob([raw],{type:'audio/wav'}),'question.wav');
   const response=await fetcher('https://api.meta.ai/v1/asr/transcribe',{method:'POST',headers:{authorization:'Bearer '+env.META_API_KEY,'accept':'application/json'},body:form,signal:AbortSignal.timeout(30000)}),d=JSON.parse(new TextDecoder().decode(await bounded(response,100000))),text=d.transcript;
   if(typeof text!=='string'||!text.trim()||text.length>160)throw Error('Transcript bound');return text;
  },
  stt:async()=>{
   if(!env.META_API_KEY||!env.ASSETS)throw Error('STT adapter unconfigured');
   const raw=await bounded(await env.ASSETS.fetch(new Request('https://assets.invalid/fixtures/question.wav')),720044),form=new FormData();
   form.append('request',new Blob([JSON.stringify({mode:'PUSH_TO_TALK',model:'muse-voice-transcribe-1.0',audioEncoding:'WAV'})],{type:'application/json'}));form.append('audio',new Blob([raw],{type:'audio/wav'}),'question.wav');
   const response=await fetcher('https://api.meta.ai/v1/asr/transcribe',{method:'POST',headers:{authorization:'Bearer '+env.META_API_KEY},body:form,signal:AbortSignal.timeout(30000)}),d=JSON.parse(new TextDecoder().decode(await bounded(response,100000)));
   if(typeof d.transcript!=='string'||!d.transcript.trim()||d.transcript.length>160)throw Error('Transcript bound');return d.transcript;
  },
  meta:async(path,payload)=>{
   if(!['responses','responses/input_tokens'].includes(path)||!env.META_API_KEY)throw Error('Meta adapter unconfigured');
   const response=await fetcher('https://api.meta.ai/v1/'+path,{method:'POST',headers:{authorization:'Bearer '+env.META_API_KEY,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
   return JSON.parse(new TextDecoder().decode(await bounded(response,100000)));
  },
 };
}
export async function serverFixtures(env){
 const defs={'authored-clip-v1':['/fixtures/scene-motion.mp4','clip'],'baseline-photo-v1':['/fixtures/baseline.jpg','photo'],'current-photo-v1':['/fixtures/current.jpg','photo']},out={};
 for(const[id,[path,kind]]of Object.entries(defs)){const raw=await bounded(await env.ASSETS.fetch(new Request('https://assets.invalid'+path)),500000);let s='';for(let at=0;at<raw.length;at+=8192)s+=String.fromCharCode(...raw.subarray(at,at+8192));out[id]={kind,base64:btoa(s)};}
 return out;
}
