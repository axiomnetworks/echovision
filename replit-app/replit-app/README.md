# EchoVision: Watch this for me

Standalone Replit development project. Public source does not mean a live deployment.

## Current version

Accessible camera-control preview with target/change inputs, optional spoken status, Stop, hidden-page shutdown, 30-minute limit, stale-view status, and tab-private text-only session history. Camera frames stay in the browser. History is memory-only, never a database, and disappears on reload/close. Clear history removes only text; Stop turns off the camera.

**AI is off. This version cannot detect objects, track people, or identify changes.** No keys, provider requests, image uploads, background monitoring, automatic deployment, or database are included. It is not a safety, navigation or emergency tool. Device camera permission and screen-reader usability still need real-device testing.

## Run in development

Use Replit Run, or `python3 server.py` in a development environment. Python 3.11+, standard library only. Port 3000. This server is a development preview, not a hardened production service. Do not publish/deploy before reviewing hosting costs, auth, privacy, rate limits, request budget and storage policy.

## Selected AI architecture, not activated

- Hosted Meta SAM 3.1 (`sam-3.1`) for segmentation.
- Hosted Meta Standard Muse Spark (`muse-spark-1.3`) for reasoning.
- `meta_requests.py` builds requests offline only. It does not send them or access credentials.
- A future authenticated server must validate/decode images, enforce same-origin and access controls, cap requests/costs, avoid automatic retries, keep keys server-side, handle incomplete reasoning, and obtain media-processing consent before uploading.
- Continuous tracking, camera transport, segmentation parsing, stable identities, event rules and inference UI are not implemented or verified. A lower count or missing object never establishes that a person left a room.
- Reasoning caps include hidden reasoning and visible output; a token-limited or empty response is unavailable, never an answer.

Architecture references: https://dev.meta.ai/docs/sam/segmenting and https://dev.meta.ai/docs/protocols/chat-completions and https://dev.meta.ai/docs/reasoning/

## Checks

`python3 -m unittest -v` and `node --check public/app.js`.

## Repository layout

New standalone source lives under `replit-app/` in the existing EchoVision GitHub repository. Earlier Modal smoke-test files remain separate and inactive. No workflow dispatch is needed for source sync. Replit must run `python3 replit-app/server.py` when using that full repository layout, or `python3 server.py` when these files are the project root.
