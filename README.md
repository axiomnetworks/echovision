# EchoVision

A public "watch this for me" prototype from [Open Independence](https://openindependence.com). You point a camera or shared screen at something, ask for one thing - "find the milk", "tell me when the light turns blue" - and EchoVision stays quiet while it watches, then speaks when it has an answer.

Built during the **Meta Global AI Developer Hackathon** (October 26 - November 4, 2026), Indie Developer track, theme "Build for Your World".

**Try it:** https://echovision-private-owner-prep.openindependence.workers.dev/ - no account, no install, works in a modern browser. (The shorter public link is planned as the canonical address but does not start sessions yet.)

## How it works

- The browser records a rolling buffer of short original clips (2 seconds each, up to about 8 seconds in total) from your camera or a shared screen.
- Recent clips go to Meta's **Muse Spark** model through the Meta Model API, along with your question. Spoken questions are transcribed by Meta's **Muse Voice** model.
- Answers are spoken by the browser's built-in speech, so nothing is sent to a separate speech service. Watching continues while a reply plays.
- It speaks only when there is an answer, and repeats only when the answer changes. This is clip-by-clip watching, not instant continuous vision.

## Goal-focused watching

Each question is one active goal:

- **Find** keeps the last confirmed location and reports when the target moves, without guessing where it went.
- **Change-to** waits quietly for the requested change, then completes.
- An unclear request gets one short follow-up question instead of a guess.

## Privacy and safety

- Clips and questions travel through Cloudflare to Meta for analysis. Spoken answers are synthesized on your device; depending on its settings the device's speech may use network voices.
- No sign-in. Clips and conversation history live only in worker memory (RAM); the server's durable storage holds usage counters, never media. **Stop** and **Forget** clear the session from memory, and the app says so itself: provider-side records are not deleted by Forget, and provider retention is governed by Meta's API terms (requests are sent with `store: false`).
- No face identification, no navigation directions, no safety guarantees. Brief events can be missed and answers can be wrong - do not rely on it for safety.
- API keys live only in server-side secrets, never in this repository.

## Architecture

Cloudflare Worker + Durable Objects:

- `worker.mjs` routes requests and gates every mode behind explicit configuration.
- `public-scene.mjs` coordinates watching: 2-second MP4 clips, strict JSON-schema model answers, changed-answer gating so only new information is spoken.
- `public-session.mjs` / `auth.mjs` / `owner-gate.mjs` handle signed public sessions and owner operations.
- `scene-voice.mjs` / `voice-fixture.mjs` handle speech-to-text and test fixtures.
- `public/` holds the browser UI, designed for screen-reader use: labeled controls, `role=status` regions and `aria-live` status announcements, keyboard-operable flow, hands-free live listening, intent-inferred modes (no checkboxes), and a content-free session diagnostics panel. (Design intent, not an accessibility certification.)

## Running it

Requires a Cloudflare account and a Meta Model API key.

```sh
cd app
npm install
wrangler secret put META_API_KEY
wrangler secret put ECHO_OWNER_SIGNING_KEY
wrangler secret put ECHO_OWNER_PASSWORD_SHA256
npm run dev
```

`wrangler.jsonc` ships with every feature flag off and placeholder grant values; inference fails closed unless the flags, grant and secrets for a mode are set deliberately. See the comments in that file.

## Hackathon submission

Prepared for submission by Open Independence (Ashley Bernard) before the November 4, 2026 deadline. The demo video and entry links will be added here once the submission is actually published. If submitted, the event rules grant the organizers and partners a license to use the submission materials.

### Tested scope (honest limits)

Verified live on 2026-11-03 against the public deployment: consent-gated session start, typed questions, find ("Where is the milk bottle?"), appearance watch ("Tell me when the milk bottle appears.") and event watch ("Watch the door.") - all returning real Muse Spark answers to prerecorded test footage. Not verified in that pass: the hands-free microphone / speech-to-text path (kept off deliberately) and the app's spoken replies (the recording browser had no speech voices). End-device behavior (phone camera, on-device speech) follows the same code path but was not exercised in this pass.

Earlier prototype iterations (a Python + SAM design) remain in this repository's git history.
