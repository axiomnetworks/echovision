/* Server-side validation before any provider side effect. MIME is not trusted.
   Client-supplied URLs, arbitrary MIME, oversized decoded pixels and audio-duration
   lies never reach a vendor. References remain session RAM, not durable storage. */
function raw64(s,max){if(typeof s!=='string'||s.length>Math.ceil(max/3)*4||!s.length||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('Bounded base64 required');const raw=Uint8Array.from(atob(s),c=>c.charCodeAt(0));if(raw.length>max)throw Error('Media too large');return raw;}
export function jpegDimensions(bytes){
 if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw Error('JPEG required');let at=2;
 while(at+4<=bytes.length){if(bytes[at++]!==255)throw Error('Invalid JPEG');let marker=bytes[at++];while(marker===255)marker=bytes[at++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const n=bytes[at]*256+bytes[at+1];if(n<2||at+n>bytes.length)throw Error('Invalid JPEG segment');if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){if(n<8)throw Error('Invalid JPEG dimensions');return{height:bytes[at+3]*256+bytes[at+4],width:bytes[at+5]*256+bytes[at+6]};}at+=n;}
 throw Error('JPEG dimensions missing');
}
export function validatePhoto(p){
 if(!p||Object.keys(p).some(k=>!['id','base64','label','offsetMs'].includes(k))||typeof p.id!=='string'||!/^[0-9a-f-]{36}$/.test(p.id)||typeof p.label!=='string'||p.label.length>80||(p.offsetMs!==undefined&&(!Number.isInteger(p.offsetMs)||p.offsetMs<0||p.offsetMs>10000)))throw Error('Invalid reference');
 const bytes=raw64(p.base64,500000),{width,height}=jpegDimensions(bytes);if(width<16||height<16||width>1024||height>1024)throw Error('Photo dimensions exceed limit');
 return{id:p.id,label:p.label,base64:p.base64,offsetMs:p.offsetMs??null,kind:'photo',width,height,historical:true};
}
export function validateWav(base64){
 const b=raw64(base64,480044),v=new DataView(b.buffer,b.byteOffset,b.byteLength),str=(at,n)=>String.fromCharCode(...b.subarray(at,at+n));
 if(b.length<44||str(0,4)!=='RIFF'||str(8,4)!=='WAVE'||str(12,4)!=='fmt '||v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||v.getUint16(22,true)!==1||v.getUint32(24,true)!==16000||v.getUint32(28,true)!==32000||v.getUint16(32,true)!==2||v.getUint16(34,true)!==16||str(36,4)!=='data'||v.getUint32(40,true)!==b.length-44||v.getUint32(4,true)!==b.length-8||(b.length-44)%2)throw Error('Only bounded mono16kPCM16WAV supported');
 const seconds=(b.length-44)/32000;if(seconds<.1||seconds>15)throw Error('Question recording must be0.1–15seconds');return{bytes:b,seconds,reservedSeconds:Math.ceil(seconds)};
}
export function validateMp4(p){
 if(!p||Object.keys(p).some(k=>!['id','base64','label','kind'].includes(k))||p.kind!=='clip'||typeof p.id!=='string'||!/^[0-9a-f-]{36}$/.test(p.id)||typeof p.label!=='string'||p.label.length>80)throw Error('Invalid clip');
 const bytes=raw64(p.base64,1000000),v=new DataView(bytes.buffer),str=(a,n)=>String.fromCharCode(...bytes.subarray(a,a+n));let duration=0,ftyp=false,scale=0,ticks=0,defaultDuration=0;
 function boxes(start,end,depth=0){if(depth>8)throw Error('MP4 nesting');for(let at=start;at+8<=end;){const n=v.getUint32(at),type=str(at+4,4),b=at+8;if(n<8||at+n>end)throw Error('MP4 box bound');if(type==='ftyp')ftyp=true;
 if(['moov','trak','mdia','moof','traf','mvex'].includes(type))boxes(b,at+n,depth+1);
 if(type==='mvhd'||type==='mdhd'){const ver=v.getUint8(b),off=ver===1?20:12;if(![0,1].includes(ver)||n<off+16)throw Error('MP4 timing bound');const ts=v.getUint32(b+off),du=ver===1?Number(v.getBigUint64(b+off+4)):v.getUint32(b+off+4);if(type==='mdhd'&&ts)scale=ts;if(ts&&du&&du<0xffffffff)duration=Math.max(duration,du/ts);}
 if(type==='trex'&&n>=28)defaultDuration=v.getUint32(b+12);
 if(type==='tfhd'){const flags=v.getUint32(b)&0xffffff;let off=b+8;if(flags&1)off+=8;if(flags&2)off+=4;if(flags&8){if(off+4>at+n)throw Error('MP4 timing bound');defaultDuration=v.getUint32(off);}}
 if(type==='trun'){const flags=v.getUint32(b)&0xffffff,count=v.getUint32(b+4);if(count>10000)throw Error('MP4 samples bound');let off=b+8;if(flags&1)off+=4;if(flags&4)off+=4;for(let i=0;i<count;i++){if(flags&256){if(off+4>at+n)throw Error('MP4 sample bound');ticks+=v.getUint32(off);off+=4;}else ticks+=defaultDuration;if(flags&512)off+=4;if(flags&1024)off+=4;if(flags&2048)off+=4;if(off>at+n)throw Error('MP4 sample bound');}}
 at+=n;}}
 boxes(0,bytes.length);if(!duration&&scale&&ticks)duration=ticks/scale;if(!ftyp||duration<.2||duration>10)throw Error('Use an MP4 clip0.2–10seconds under1MB');return{id:p.id,label:p.label,kind:'clip',base64:p.base64,durationMs:Math.round(duration*1000),historical:true};
}
