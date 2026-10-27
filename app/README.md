# EchoVision restricted clip watcher

Python backend + accessible browser UI, Meta-hosted SAM3.1 and Standard Muse Spark. Source is public. A restricted one-hour hosting pilot was published on October 27, 2026, with generated sample clips only. It is not validated on a real phone. Inference fails closed unless all approved secrets/settings are present.

## Run

Python3.11+; `pip install -r requirements.txt`, then `python3 server.py` (or from repository root `python3 app/server.py`). `PORT` defaults3000. ffmpeg ships via pinned imageio-ffmpeg. No Replit Agent or GPU needed.

## Private settings

Set secrets through Replit Secrets, never source: META_API_KEY, ECHO_ACCESS_CODE, DATABASE_URL. Set operator configuration ECHO_INFERENCE_ENABLED=yes, ECHO_MAX_CLIPS (1..10), ECHO_ALLOWANCE_ID (unique authorization identifier), ECHO_EXPIRES_AT (explicit offset timestamp). Default all inference off. ECHO_PERSONAL_MEDIA=approved is a separate privacy gate; unset allows only nonpersonal samples. A browser checkbox is not operator authority to enable it.

PostgreSQL holds only the atomic approved-allowance counter, not media or targets. A reservation is never refunded and cannot replenish across restarts. One allowance ID cannot have its cap increased. New allowance IDs require new owner authority. Keep max1 deployment machine for predictable resource use and in-memory sessions. Sessions intentionally expire on restart; the budget does not. Paid production DB/deployment activation awaits explicit approval.

## Processing

At most4seconds of silent video is transcoded to2fps/640x480, then submitted to SAM and Spark. Raw files are temporary and removed by the app. Requests set store=false, but this is not a promise of zero provider retention. Free-credit Meta billing currently warns of product improvement. Input token-count is context measurement, NOT final billed usage; no exact production cost guarantee follows from it. Reasoning max4000combined output tokens; no automatic retries. Incomplete/invalid answers never become successful events.

Capture pauses while analysis runs. These are delayed clips with gaps, not full continuous video. IDs are clip-local. A missing target is lost/uncertain view, not room exit. One clip can support an observed event when SAM supplies at least three temporal frames and Muse directly describes the requested event with high model-reported confidence. This is supporting evidence, not a calibrated accuracy guarantee; camera motion, occlusion and disappearance remain uncertain/lost view. No medical, navigation, safety-critical, identity or facial-recognition use.

## Checks/status

34 offline tests pass, including real HTTP serving and ffmpeg transcoding. Earlier request/cost tests retained. Oct27 approved two-clip synthetic test completed: stationary red/blue shapes correctly returned watching/no movement twice. Exactly2SAM+2Spark+2tokenizer checks, no retries. Estimated provider-accounting cost$0.02589675, not settled billing. This does not validate motion/event success, browser-camera behavior or deployed Replit integration.

`python3 -m unittest discover -v`; `node --check public/app.js`. Further live tests need separate approval; no public user upload is authorized by this README.

Live hosting pilot and generated pair completed Oct27: published browser-to-Replit-to-Meta object-motion clip returned observed in about14seconds; ambiguous whole-scene motion returned uncertain in about12seconds. Two authorized pipelines only, no retries or personal footage. These timings exclude recording and are not general performance guarantees. Prior implementation had no per-stage timing, so bottleneck attribution remains unmeasured. Stage timing instrumentation added for future separately approved tests. AI operator flag disabled after allowance exhausted; no ongoing service or personal-camera approval.
