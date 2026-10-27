# EchoVision

Web-only GitHub-to-Modal preparation. No Replit or local Mac required.

This repository starts with a CPU-only smoke test, not a working camera watcher. It contains no AI model, inference call, tracking, camera-image transport or real observations. No deployment has been verified.

## Smoke-test contract

- GET / returns {"status":"ok"}.
- GET /auth-test requires X-Demo-Token matching the server's private DEMO_TOKEN; otherwise 401. Never put that token in frontend source.
- Modal Secret echovision-auth must be configured securely before a permitted deployment.
- No GPU; one container max. CPU, RAM, startup and warm time can still cost money. Scale-to-zero is not a free-cost guarantee.

The workflow is intentionally manual-only, unlike the original push-triggered example. Creating/editing files or adding credentials does not auto-deploy. Its approval checkbox is an operator reminder, NOT a billing cap or evidence of permission.

Before the first run: confirm the existing Modal account/workspace, activation, applicable credits, net spend limit and gross usage cap; secure credentials; authorize a bounded test and endpoint audience; pin/test SDK dependencies and review action revisions. Credit coverage and spending controls have not been verified. A workflow green check alone does not verify endpoint behavior or cost controls.

The included workflow is prepared, not dispatched. No token values appear in this repository. Only create repository secrets through secure handling. GitHub Secrets protect credential storage but workflows using them can access those credentials, so review future workflow/code changes.

## Website stage

GitHub Pages hosts static files, not Python backend code. A real camera website is not included in this smoke-test milestone. Adding a public frontend and wiring a live endpoint requires separate checks for cross-origin calls/authentication, HTTPS camera permissions, stale/lost view, Stop, session isolation, costs and actual device/screen-reader behavior. A fresh short-lived session alone is not an anti-abuse authorization gate.

No Hugging Face account, license or model token is needed for this smoke test. Do not accept unused model licenses merely to follow an earlier example.
