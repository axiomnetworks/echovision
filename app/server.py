"""Restricted user-present clip watcher. Inference disabled unless securely configured."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from http.cookies import SimpleCookie
import base64, hashlib, hmac, json, os, secrets, threading, time
from datetime import datetime, timezone
from budget import reserve, BudgetError
from watch_engine import normalize_clip, analyze_clip, event_gate, Unavailable
ROOT=Path(__file__).parent
LOCK=threading.Lock(); SESSIONS={}; RESERVED=0
# Unset/zero fails closed. Process guard plus transactional shared allowance.
MAX_CLIPS=min(10,max(0,int(os.environ.get('ECHO_MAX_CLIPS','0'))))
BOOT=time.time(); SECRET=secrets.token_bytes(32)
ENABLED=(os.environ.get('ECHO_INFERENCE_ENABLED')=='yes' and bool(os.environ.get('META_API_KEY'))
         and bool(os.environ.get('ECHO_ACCESS_CODE')) and bool(os.environ.get('DATABASE_URL'))
         and bool(os.environ.get('ECHO_ALLOWANCE_ID')) and bool(os.environ.get('ECHO_EXPIRES_AT')) and MAX_CLIPS>0)
def ready():
    try:
        end=datetime.fromisoformat(os.environ.get('ECHO_EXPIRES_AT',''))
        return ENABLED and end.tzinfo is not None and datetime.now(timezone.utc)<end
    except ValueError:return False

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT/'public'),**kwargs)
    def log_message(self,*args): pass
    def end_headers(self):
        for k,v in {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
            'Permissions-Policy':'camera=(self), microphone=()',
            'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; media-src 'self' blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"}.items(): self.send_header(k,v)
        super().end_headers()
    def reply(self,status,data,cookie=None):
        raw=json.dumps(data).encode(); self.send_response(status); self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(raw)))
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers(); self.wfile.write(raw)
    def session(self):
        try:
            cookie=SimpleCookie(self.headers.get('Cookie','')); sid=cookie['echo_session'].value
            session=SESSIONS.get(sid)
            if session and time.time()-session['created']<600:return session
        except (KeyError,ValueError):pass
        return None
    def do_GET(self):
        if self.path=='/api/status':
            return self.reply(200,{'enabled':ready(),'sample_only':os.environ.get('ECHO_PERSONAL_MEDIA')!='approved',
                'max_clips':MAX_CLIPS,'clip_seconds':4,'processing_fps':2,'max_session_seconds':600})
        if self.path.startswith('/api/'):return self.reply(404,{'error':'Not found'})
        if self.path not in ('/','/index.html','/app.js','/style.css','/privacy.html'):
            return self.reply(404,{'error':'Not found'})
        super().do_GET()
    def do_POST(self):
        self.connection.settimeout(30)
        global RESERVED
        # Refuse cross-site mutations. No wildcard CORS or third-party URLs.
        origin=self.headers.get('Origin','')
        if origin not in ('https://'+self.headers.get('Host',''),'http://'+self.headers.get('Host','')):
            return self.reply(403,{'error':'Open this app directly to continue.'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=11_000_000:raise ValueError()
            body=json.loads(self.rfile.read(size)); assert isinstance(body,dict)
        except (ValueError,AssertionError):return self.reply(400,{'error':'Invalid request.'})
        if self.path=='/api/session':
            if not ready():return self.reply(503,{'error':'AI connection awaits operator approval and setup. Nothing sent.'})
            if not hmac.compare_digest(str(body.get('code','')),os.environ['ECHO_ACCESS_CODE']):
                time.sleep(0.5); return self.reply(403,{'error':'Access code not accepted.'})
            if body.get('consent') is not True:return self.reply(400,{'error':'Review and accept the camera-data notice first.'})
            if os.environ.get('ECHO_PERSONAL_MEDIA')!='approved' and body.get('nonpersonal') is not True:
                return self.reply(403,{'error':'Only nonpersonal sample clips are enabled.'})
            target=str(body.get('target','')).strip(); change=str(body.get('change','')).strip()
            if not 1<=len(target)<=80 or not 1<=len(change)<=120:return self.reply(400,{'error':'Choose one target and requested visible change.'})
            sid=secrets.token_urlsafe(32); csrf=secrets.token_urlsafe(24)
            with LOCK:
                for k in list(SESSIONS):
                    if time.time()-SESSIONS[k]['created']>600:del SESSIONS[k]
                if len(SESSIONS)>=20:return self.reply(429,{'error':'Demo session limit reached.'})
                SESSIONS[sid]={'created':time.time(),'csrf':csrf,'target':target,'change':change,'busy':False,'last':0,'state':{}}
            return self.reply(200,{'csrf':csrf,'max_clips':MAX_CLIPS},'echo_session='+sid+'; HttpOnly; SameSite=Strict; Path=/'+('; Secure' if origin.startswith('https:') else ''))
        session=self.session()
        if not session or not hmac.compare_digest(str(body.get('csrf','')),session['csrf']):
            return self.reply(403,{'error':'Session ended. Start a new watch.'})
        if self.path=='/api/stop':
            with LOCK: session['stopped']=True
            return self.reply(200,{'stopped':True})
        if self.path!='/api/clip':return self.reply(404,{'error':'Not found'})
        if not ready():return self.reply(503,{'error':'Approved allowance inactive. Nothing sent.'})
        with LOCK:
            if session.get('stopped'):return self.reply(403,{'error':'Session stopped.'})
            if session['busy'] or time.time()-session['last']<5:return self.reply(429,{'error':'Wait for the current clip. No backlog is processed.'})
            if RESERVED>=MAX_CLIPS:return self.reply(429,{'error':'Approved demo clip allowance is exhausted. Camera must stop.'})
            session['busy']=True; session['last']=time.time()
        try:
            begun=time.monotonic(); raw=base64.b64decode(body.get('clip',''),validate=True); mp4=normalize_clip(raw)
            transcode_seconds=round(time.monotonic()-begun,3)
            begun=time.monotonic()
            with LOCK:
                if session.get('stopped'):raise Unavailable('Stopped before upload. Nothing sent.')
                if RESERVED>=MAX_CLIPS:raise Unavailable('Approved allowance exhausted. Nothing sent.')
                remaining=reserve() # durable atomic reservation before any provider call, never refunded
                RESERVED+=1
            db_seconds=round(time.monotonic()-begun,3)
            parallel=(os.environ.get('ECHO_EXPERIMENT')=='parallel-comparison-8' and MAX_CLIPS==8 and os.environ.get('ECHO_ALLOWANCE_ID')=='approved-parallel8-20261027' and remaining%2==0)
            result=analyze_clip(mp4,session['target'],session['change'],session['state'].get('evidence',''),os.environ['META_API_KEY'],parallel=parallel)
            result['evidence']=('Parallel experiment: ' if parallel else 'Baseline: ')+result['evidence']
            with LOCK:
                if session.get('stopped'):raise Unavailable('Stopped. An already submitted request may finish at Meta; no result announced.')
                result.setdefault('timings_seconds',{}).update({'transcode':transcode_seconds,'database':db_seconds})
                session['state']=event_gate(result,session['state']); result=session['state'].copy()
                result.update({'remaining':remaining,'observed_at':time.time(),'processing_seconds':round(time.time()-session['last'],1)})
            return self.reply(200,result)
        except (Unavailable,BudgetError,ValueError,TypeError) as e:
            return self.reply(422,{'error':str(e) if isinstance(e,(Unavailable,BudgetError)) else 'Invalid clip. Nothing sent.'})
        except Exception:
            return self.reply(503,{'error':'Analysis unavailable. No automatic retry was made.'})
        finally:
            with LOCK:session['busy']=False
if __name__=='__main__':ThreadingHTTPServer(('0.0.0.0',int(os.environ.get('PORT','3000'))),Handler).serve_forever()
