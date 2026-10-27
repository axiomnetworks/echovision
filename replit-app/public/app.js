'use strict';
const $=id=>document.getElementById(id);
let stream=null, epoch=0, active=false, config={}, csrf='', aborter=null, recorder=null, sampleMode=false;
const events=[];
function announce(text){
  if($('status').textContent===text)return;
  $('status').textContent=text;
  if($('speak').checked && 'speechSynthesis' in window){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(text));}
}
function record(text){events.unshift({time:new Date().toISOString(),text});if(events.length>100)events.pop();
  $('history').replaceChildren(...events.map(e=>{const li=document.createElement('li');li.textContent=new Date(e.time).toLocaleTimeString()+' - '+e.text;return li;}));$('no-history').hidden=!!events.length;}
async function api(path,body,signal){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  const value=await response.json();if(!response.ok)throw Error(value.error||'Request failed.');return value;
}
function stop(reason='Stopped. Camera is off.'){
  const was=active;active=false;++epoch;
  if(recorder?.state==='recording')recorder.stop();recorder=null;
  if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
  aborter?.abort();aborter=null;
  if(csrf)api('/api/stop',{csrf}).catch(()=>{});csrf='';
  $('preview').srcObject=null;$('preview').style.display='none';$('empty').hidden=false;
  for(const id of ['target','change','code','consent','nonpersonal','sample'])$(id).disabled=false;
  $('start').disabled=!config.enabled;$('sample-start').disabled=!config.enabled;$('stop').disabled=true;
  $('fresh').textContent='No current observation. An already submitted request may still finish at Meta.';
  if(was)record(reason);announce(reason);
}
function base64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);});}
async function sendClip(blob,mine,capturedAt){
  if(!active||mine!==epoch)return false;
  announce('Analyzing the last clip. Live events may be missed while analysis is pending.');
  $('fresh').textContent='Processing clip captured '+new Date(capturedAt).toLocaleTimeString()+'. No current result yet.';
  aborter=new AbortController();const timeout=setTimeout(()=>aborter.abort(),210000);
  let result;try{result=await api('/api/clip',{csrf,clip:await base64(blob)},aborter.signal);}finally{clearTimeout(timeout);}
  if(!active||mine!==epoch)return false;
  const age=Math.round((Date.now()-capturedAt)/1000);
  $('fresh').textContent='Last clip captured '+new Date(capturedAt).toLocaleTimeString()+'. Result is '+age+' seconds behind now.';
  const text=result.state==='lost_view'?'Target view lost. '+result.evidence:result.state==='uncertain'?'Uncertain. '+result.evidence:
    result.confirmed?'Requested change observed across two clips. '+result.evidence:result.state==='candidate'?'Possible change. Waiting for another clip to confirm. '+result.evidence:'Watching. '+result.evidence;
  record(text);announce(text);
  if(result.confirmed){stop('Watch complete. '+text);return false;}
  if(result.remaining<=0){stop('Approved analysis allowance reached. Camera is off.');return false;}
  return true;
}
function capture(mine){return new Promise((resolve,reject)=>{
  if(!active||mine!==epoch)return reject(Error('Stopped.'));
  const type=['video/mp4','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!type)return reject(Error('Recording is unsupported in this browser. Use a short sample clip.'));
  const chunks=[];recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:400000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>reject(Error('Camera recording failed.'));
  recorder.onstop=()=>resolve(new Blob(chunks,{type}));recorder.start();
  setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},4000);
});}
async function start(sample){
  if(active){
    if(sample&&sampleMode){const f=$('sample').files[0];if(!f||f.size>8000000)return announce('Choose a sample clip under 8 MB.');$('sample-start').disabled=true;try{await sendClip(f,epoch,Date.now());if(active){$('sample-start').disabled=false;announce('Clip analyzed. Choose the next sample clip or stop.');}}catch(e){stop(e.message);} }
    return;
  }
  if(!config.enabled)return announce('AI setup is awaiting operator approval. Nothing is uploaded.');
  if(!$('consent').checked)return announce('Review the camera-data notice and check your consent.');
  if(config.sample_only&&!$('nonpersonal').checked)return announce('This demo accepts only nonpersonal sample clips.');
  const file=$('sample').files[0];if(sample&&(!file||file.size>8000000))return announce('Select a silent sample clip under 8 MB. Only its first four seconds are analyzed.');
  const mine=++epoch;active=true;sampleMode=sample;
  try{
    const session=await api('/api/session',{code:$('code').value,target:$('target').value,change:$('change').value,consent:true,nonpersonal:$('nonpersonal').checked});
    if(!active||mine!==epoch)return;csrf=session.csrf;
    for(const id of ['target','change','code','consent','nonpersonal','sample'])$(id).disabled=true;
    $('start').disabled=true;$('sample-start').disabled=true;$('stop').disabled=false;
    record('Watch started. Target: '+$('target').value+'. Change: '+$('change').value+'.');
    if(sample){await sendClip(file,mine,Date.now());if(active){$('sample').disabled=false;$('sample-start').disabled=false;announce('Clip analyzed. Choose the next sample clip or stop.');}return;}
    if(config.sample_only)throw Error('Personal camera is not enabled. Use a nonpersonal sample clip.');
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Camera requires HTTPS and a supported recorder.');
    announce('Requesting camera permission. Silent clips will be sent through Replit to Meta.');
    const captureStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480},frameRate:{ideal:10}}});
    if(!active||mine!==epoch){captureStream.getTracks().forEach(t=>t.stop());return;}
    stream=captureStream;const video=$('preview');video.srcObject=stream;video.style.display='block';$('empty').hidden=true;await video.play();
    stream.getTracks().forEach(t=>t.onended=()=>{if(active)stop('Camera lost. No event can be determined.');});
    const started=Date.now();
    while(active&&mine===epoch){
      if(Date.now()-started>600000)return stop('Ten-minute session limit reached.');
      if(document.hidden)return stop('Page hidden. Camera is off.');
      const captured=Date.now();announce('Recording a four-second silent clip.');const clip=await capture(mine);
      if(!active||mine!==epoch)return;if(!(await sendClip(clip,mine,captured)))return;
    }
  }catch(error){if(mine===epoch)stop(error.name==='AbortError'?'Analysis timed out. Camera is off. No automatic retry.':error.message);}
}
$('watch-form').addEventListener('submit',e=>{e.preventDefault();start(false);});
$('sample-start').onclick=()=>{if($('watch-form').reportValidity())start(true);};$('stop').onclick=()=>stop();
$('clear').onclick=()=>{events.length=0;$('history').replaceChildren();$('no-history').hidden=false;announce('Text history cleared.');};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop('Page hidden. Camera is off.');});
window.addEventListener('pagehide',()=>{if(active)stop('Page closed. Camera is off.');});
fetch('/api/status').then(r=>r.json()).then(c=>{config=c;$('start').disabled=!c.enabled||c.sample_only;$('sample-start').disabled=!c.enabled;
  $('mode-notice').textContent=!c.enabled?'AI is awaiting approved setup and testing. Nothing uploads.':c.sample_only?'Restricted nonpersonal sample-clip demo. Personal camera uploads are disabled.':'Silent camera clips pass through Replit to Meta. Results are delayed, with gaps between clips.';}).catch(()=>announce('Backend unavailable. Camera is off.'));
