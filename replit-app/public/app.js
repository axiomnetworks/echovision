'use strict';
const $=id=>document.getElementById(id);
let stream=null, epoch=0, timer=null, lastTime=-1, freshAt=0, active=false, started=0;
const events=[];
function announce(text){
  if($('status').textContent===text)return;
  $('status').textContent=text;
  if($('speak').checked && 'speechSynthesis' in window){
    speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}
function record(text){
  events.unshift({time:new Date().toISOString(),text});
  if(events.length>100)events.pop();
  $('history').replaceChildren(...events.map(event=>{
    const li=document.createElement('li');const time=document.createElement('time');
    time.dateTime=event.time;time.textContent=new Date(event.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    li.append(time,document.createTextNode(' - '+event.text));return li;
  }));
  $('no-history').hidden=events.length>0;
}
function stop(reason='Stopped. Camera is off.'){
  const wasActive=active;active=false;++epoch;
  clearInterval(timer);timer=null;
  if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;
  $('preview').srcObject=null;$('preview').style.display='none';$('empty').hidden=false;
  $('start').disabled=false;$('stop').disabled=true;$('target').disabled=false;$('change').disabled=false;
  $('fresh').textContent='No current frame. No AI observation.';
  if(wasActive)record(reason);announce(reason);
}
function checkFresh(){
  const v=$('preview');const now=performance.now();
  const track=stream?.getVideoTracks()[0];
  if(!track || track.readyState!=='live')return stop('Camera lost. Camera test stopped.');
  if(!track.muted && v.readyState>=2 && v.currentTime!==lastTime){lastTime=v.currentTime;freshAt=now;}
  if(now-started>30*60*1000)return stop('30-minute session limit reached. Camera is off. Start again to continue.');
  if(!freshAt || now-freshAt>8000){
    $('fresh').textContent='Camera is stale or unavailable. No current observation.';
    announce('Camera view lost or stale. No change can be determined.');
  }else{
    $('fresh').textContent='Local frame updated. No images uploaded. AI is off.';
    announce('Camera test running. AI is off. No changes are being detected.');
  }
}
$('watch-form').addEventListener('submit',async event=>{
  event.preventDefault();if(active)return;
  const myEpoch=++epoch;active=true;started=performance.now();freshAt=0;lastTime=-1;
  $('start').disabled=true;$('stop').disabled=false;$('target').disabled=true;$('change').disabled=true;
  announce('Requesting camera permission. No images will be uploaded.');
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera needs HTTPS and a supported browser.');
    const capture=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}}});
    if(myEpoch!==epoch){capture.getTracks().forEach(t=>t.stop());return;}
    stream=capture;const v=$('preview');v.srcObject=capture;v.style.display='block';$('empty').hidden=true;
    await v.play();if(myEpoch!==epoch)return;
    capture.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(myEpoch===epoch)stop('Camera lost. Camera test stopped.');}));
    record('Camera test started. Target: '+$('target').value.trim()+'. Requested change: '+$('change').value.trim()+'. AI off.');
    checkFresh();timer=setInterval(checkFresh,1000);
  }catch(error){if(myEpoch===epoch)stop(error.name==='NotAllowedError'?'Camera permission denied. Camera is off.':'Could not start camera. '+error.message);}
});
$('stop').addEventListener('click',()=>stop());
$('clear').addEventListener('click',()=>{events.length=0;$('history').replaceChildren();$('no-history').hidden=false;announce(active?'History cleared. Camera test is still running. AI is off.':'History cleared. Camera is off.');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop('Page hidden. Camera is off. Start again to resume.');});
window.addEventListener('pagehide',()=>{if(active)stop('Page closed. Camera is off.');});
