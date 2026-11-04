/* Local-only numeric stage summary. Does not inspect media or question text. */
const ms=n=>Number.isFinite(n)&&n>=0;
export function latencySummary(t){return Object.entries(t).filter(([k,v])=>ms(v)).map(([k,v])=>k.replace(/Ms$/,'')+' '+(v/1000).toFixed(2)+' sec').join('; ')+'.';}
export function analysisTiming(server,local){const out={};for(const k of ['visionMs','speechMs','totalServerMs','tokenCountMs'])if(ms(server?.[k]))out[k]=server[k];for(const k of ['encodeMs','captureMs','bufferSpanMs','latestClipAgeMs','uploadMs','answerRoundTripMs'])if(ms(local?.[k]))out[k]=local[k];return out;}
