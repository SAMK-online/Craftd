---
name: deploy
description: Deploy Craft'd (API + web) to Render or Railway so it's usable from a phone at an event. Use when the user wants to deploy, ship, host, or publish the app, or asks how to get it running on a public URL. Walks the two-service wiring (ports, CORS, build-time API URL) and verifies the result.
---

# Deploy Craft'd

Guide the user through deploying Craft'd's two services (FastAPI **api** + Next.js
**web**) to a public host with HTTPS, then verify it works. The authoritative
recipe lives in `DEPLOY.md` at the repo root — read it first and follow it; this
skill is the interactive driver around it.

## Before you start
1. Read `DEPLOY.md` for the current, detailed steps.
2. Confirm the code is pushed to GitHub: `git status` is clean and `git remote -v`
   has an `origin`. If not, offer to commit/push first (no `Co-Authored-By` line).
3. Ask which target the user wants if they haven't said: **Render** or **Railway**.
   Default to Render (simplest dashboard flow).

## The mental model — say this to the user
The two services need each other's URLs, so there's an order:
1. Deploy **api** → get its URL.
2. Deploy **web** with `NEXT_PUBLIC_API_URL` = the api URL. **This is build-time** —
   changing it later requires a *rebuild*, not a restart.
3. Set the api's `CORS_ORIGINS` = the web URL (exact origin, **no trailing slash**) →
   redeploy api.
4. Open the web URL on a phone.

The two failure modes to pre-empt:
- Requests hitting `http://localhost:8000` → `NEXT_PUBLIC_API_URL` wasn't set/baked.
- CORS errors in the browser console → `CORS_ORIGINS` missing or mismatched.

## Required vs optional env (api service)
- **Required:** `ANTHROPIC_API_KEY`, `APP_ENV=production`, and (after web exists)
  `CORS_ORIGINS`.
- **Optional, degrade gracefully:** `TAVILY_API_KEY`, `PROSPEO_API_KEY`,
  `EXA_API_KEY`, `APIFY_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`.
- Web service: `NEXT_PUBLIC_API_URL` (required, build-time).

Remind the user: without `SUPABASE_URL`/`SUPABASE_KEY`, captured contacts are
ephemeral and lost on every redeploy — recommend Supabase for an actual event.

## Drive it
Walk the user through `DEPLOY.md` for their chosen platform one numbered step at a
time. After each deploy, collect the resulting URL from them and feed it into the
next step. Don't dump all steps at once — confirm each service is up before moving on.

## Verify at the end
Once both services are deployed and CORS is set, verify (use the real URLs):

1. **API health** — should return `{"status":"ok"}`:
   ```sh
   curl -s https://<api-url>/api/health
   ```
2. **CORS preflight** — confirm the api allows the web origin. Expect an
   `access-control-allow-origin` header echoing the web URL:
   ```sh
   curl -si -X OPTIONS https://<api-url>/api/runs \
     -H "Origin: https://<web-url>" \
     -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
   ```
   If that header is missing or wrong, `CORS_ORIGINS` on the api is unset or doesn't
   match the web origin exactly — fix and redeploy the api.
3. Ask the user to open the web URL on their phone and run one contact end-to-end.

## Done
Summarize the two live URLs, which optional integrations are active, and whether
persistence (Supabase) is on. If persistence is off, restate that history won't
survive redeploys.
