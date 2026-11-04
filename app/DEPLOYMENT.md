# Reproducing the public demo deployment

A fresh checkout deploys with every feature flag off and placeholder budget
values. That is deliberate: inference fails closed, and the live API routes
answer "Live launch not enabled" until a deployment is configured. This page
lists the non-secret settings the public demo runs with, so the submission can
be reproduced without copying any private account or grant identifiers.

## 1. Deploy

```sh
cd app
npm install
wrangler deploy          # creates the worker, assets and Durable Object classes
```

`wrangler.jsonc` declares six Durable Object classes and the static asset
directory; the `v1` migration creates them on first deploy.

## 2. Secrets

```sh
wrangler secret put META_API_KEY               # your own Meta Model API key
wrangler secret put ECHO_OWNER_SIGNING_KEY     # any strong random value
wrangler secret put ECHO_OWNER_PASSWORD_SHA256 # sha256 of your owner password
```

Only `META_API_KEY` is used by the public demo path. The other two gate the
owner console, which the demo does not need.

## 3. Public demo settings (dashboard Variables or wrangler.jsonc `vars`)

| Setting | Demo value | Notes |
| --- | --- | --- |
| `ECHO_PUBLIC_LIVE` | `yes` | Master switch for the public scene API. |
| `ECHO_BUFFERED_TEST_APPROVED` | `yes` | Consent-gated buffered-clip analysis. Without it the API refuses provider calls. |
| `ECHO_PUBLIC_PREVIEW` | `yes` | Serves the public UI/assets on GET. |
| `ECHO_PUBLIC_DIRECT_VIDEO` | `yes` | Sends bounded clips straight to the model; one vision request per analysis, no token-count preflight. |
| `ECHO_PUBLIC_CONTINUOUS` | `yes` | Watch sessions do not expire mid-watch. |
| `ECHO_PUBLIC_GRANT` | any unique string you choose | Ledger scope for the shared budget. Not a Meta credential; pick your own. |
| `ECHO_PUBLIC_EXPIRES` | `none` | Or a future epoch-ms to auto-close the test. |
| `ECHO_PUBLIC_UNLIMITED` | `yes` for an open test, `no` to enforce caps | With `no`, the budget below is a hard ceiling shared by all visitors. |
| `ECHO_PUBLIC_MAX_VISION` | e.g. `200` | Hard cap on scene analyses when not unlimited. |
| `ECHO_PUBLIC_MAX_COUNT` | e.g. `200` | Cap on token-count preflights (unused in direct-video mode). |
| `ECHO_PUBLIC_MAX_STT_SECONDS` | e.g. `600` | Cap on speech-to-text seconds. |
| `ECHO_PUBLIC_MAX_VOICE_CHARS` | e.g. `3200` | Cap on voice synthesis characters. |
| `ECHO_PUBLIC_SESSION_MS` | `900000` | Session lifetime when continuous mode is off. |

All caps must be positive integers even in unlimited mode; reservations are
recorded either way, and failures consume them. The live demo runs unlimited
for the public test.

Recording note: the 2026-11-03 verification/demo recording ran against that
unlimited public configuration - no server setting was changed. Usage was
limited by the recording driver instead, which counted every analysis request
and stopped well under its bound: 34 vision requests total, 0 speech-to-text
seconds (microphone path deliberately disabled). The example caps above are a
suggested bounded configuration, not values that were set or used.

## 4. Owner console (optional, not part of the demo)

`ECHO_LIVE_ENABLED`, `ECHO_MEDIA_SCOPE`, `ECHO_GRANT_ID`,
`ECHO_SCENE_GRANT`, `ECHO_SESSION_SECRET` and the Baseten provider settings
belong to earlier experimental modes and stay unset/off for this submission.
