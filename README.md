# EchoVision restricted clip watcher

Python backend + accessible browser UI, Meta-hosted SAM3.1 and Standard Muse Spark. Source is public; service is not yet published or validated on a real phone. Inference fails closed unless all approved secrets/settings are present.

## Run

Python3.11+; `pip install -r requirements.txt`, then `python3 server.py` (or from repository root `python3 replit-app/server.py`). `PORT` defaults3000. ffmpeg ships via pinned imageio-ffmpeg. No Replit Agent or GPU needed.

## Private settings

Set secrets through Replit Secrets, never source: META_API_KEY, ECHO_ACCESS_CODE, DATABASE_URL. Set operator configuration ECHO_INFERENCE_ENABLED=yes, ECHO_MAX_CLIPS (1..10), ECHO_ALLOWANCE_ID (unique authorization identifier), ECHO_EXPIRES_AT (explicit offset timestamp). Default all inference off. ECHO_PERSONAL_MEDIA=approved is a separate privacy gate; unset allows only nonpersonal samples. A browser checkbox is not operator authority to enable it.

PostgreSQL holds only the atomic approved-allowance counter, not media or targets. A reservation is never refunded and cannot replenish across restarts. One allowance ID cannot have its cap increased. New allowance IDs require new owner authority. Keep max1 deployment machine for predictable resource use and in-memory sessions. Sessions intentionally expire on restart; the budget does not. Paid production DB/deployment activation awaits explicit approval.

## Processing

At most4seconds of silent video is transcoded to2fps/640x480, then submitted to SAM and Spark. Raw files are temporary and removed by the app. Requests set store=false, but this is not a promise of zero provider retention. Free-credit Meta billing currently warns of product improvement. Input token-count is context measurement, NOT final billed usage; no exact production cost guarantee follows from it. Reasoning max4000combined output tokens; no automatic retries. Incomplete/invalid answers never become successful events.

Capture pauses while analysis runs. These are delayed clips with gaps, not full continuous video. IDs are clip-local. A missing target is lost/uncertain view, not room exit. Two consecutive clip candidates support an alert but still may be wrong. No medical, navigation, safety-critical, identity or facial-recognition use.

## Checks/status

32 offline tests pass, including real HTTP serving and ffmpeg transcoding. Earlier request/cost tests retained. Oct27 approved two-clip synthetic test completed: stationary red/blue shapes correctly returned watching/no movement twice. Exactly2SAM+2Spark+2tokenizer checks, no retries. Estimated provider-accounting cost$0.02589675, not settled billing. This does not validate motion/event success, browser-camera behavior or deployed Replit integration.

`python3 -m unittest discover -v`; `node --check public/app.js`. Further live tests need separate approval; no public user upload is authorized by this README.
