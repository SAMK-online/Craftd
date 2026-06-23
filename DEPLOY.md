# Deploying Craft'd

Craft'd is two services that need to be reachable from your phone to use at an
event: the **API** (FastAPI) and the **web** app (Next.js). Locally `docker
compose up` is enough; to use it at a real event you deploy both to a host with
HTTPS. This guide covers **Render** and **Railway** — both give you HTTPS URLs
with no server to manage.

> The code is already deploy-ready: the API binds to the host's `$PORT`, and CORS
> is controlled by `CORS_ORIGINS`. You just wire two services together.

---

## The one thing that trips everyone up

There's a deploy order, because each service needs the other's URL:

```
1. Deploy API        → get  https://<api>        (no CORS yet)
2. Deploy web        → set  NEXT_PUBLIC_API_URL = https://<api>   (build-time!)
                       → get  https://<web>
3. Update API        → set  CORS_ORIGINS = https://<web>          → redeploy
4. Open https://<web> on your phone
```

Two rules to remember:
- **`NEXT_PUBLIC_API_URL` is baked in at *build* time** (it's inlined into the
  browser bundle). If you change it, the web service must **rebuild**, not just
  restart.
- **`CORS_ORIGINS` must match the web origin exactly** — scheme + host, **no
  trailing slash**: `https://craftd-web.onrender.com` ✅, not
  `https://craftd-web.onrender.com/` ❌.

---

## Render

### 1. API service
1. **New + → Web Service**, connect this GitHub repo.
2. **Root Directory:** `.`  ·  **Runtime:** Docker (it uses the root `Dockerfile`).
3. **Environment variables:**
   - `ANTHROPIC_API_KEY` = your key (required)
   - `APP_ENV` = `production`
   - *(optional)* `TAVILY_API_KEY`, `PROSPEO_API_KEY`, `EXA_API_KEY`,
     `APIFY_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`
   - Leave `CORS_ORIGINS` blank for now.
4. Deploy. Copy the URL, e.g. `https://craftd-api.onrender.com`.
   Sanity check: open `https://craftd-api.onrender.com/api/health` → `{"status":"ok"}`.

### 2. Web service
1. **New + → Web Service**, same repo.
2. **Root Directory:** `web`  ·  **Runtime:** Docker (uses `web/Dockerfile`).
3. **Environment variables:**
   - `NEXT_PUBLIC_API_URL` = the API URL from step 1
     (Render passes service env vars as Docker build args, so this reaches the build.)
4. Deploy. Copy the URL, e.g. `https://craftd-web.onrender.com`.

### 3. Close the loop (CORS)
1. Back on the **API** service → Environment → set
   `CORS_ORIGINS` = `https://craftd-web.onrender.com` → save (it redeploys).
2. Open the web URL on your phone. Done.

> Render's free tier sleeps after inactivity (cold starts ~30–60s). Use a paid
> instance for an event so the first capture isn't slow.

---

## Railway

1. **New Project → Deploy from GitHub repo.**
2. Create **two services** from the same repo, each with a different root:
   - **api** — Root Directory `/` (Dockerfile build). Railway injects `$PORT`; the
     API already binds to it.
   - **web** — Root Directory `/web` (Dockerfile build).
3. **Variables:**
   - api: `ANTHROPIC_API_KEY`, `APP_ENV=production` (+ optional keys). Add
     `CORS_ORIGINS` after step 4.
   - web: `NEXT_PUBLIC_API_URL` = the api's public URL. Mark it available at build
     time (Railway passes variables as build args).
4. Generate a public domain for each service (Settings → Networking → Generate
   Domain). Put the **web** domain into the api's `CORS_ORIGINS`, and the **api**
   domain into web's `NEXT_PUBLIC_API_URL`; redeploy **web** so the new API URL is
   rebuilt in.

---

## Persistence (recommended for events)

Without Supabase, captured runs live in an ephemeral `.craftd_runs.json` inside
the container and are **lost on every redeploy/restart**. For durable, cross-device
history, create a free Supabase project, run the SQL in the main README, and set
`SUPABASE_URL` + `SUPABASE_KEY` (service_role) on the **API** service.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Frontend loads, every request fails (CORS error in console) | `CORS_ORIGINS` missing/mismatched | Set it to the exact web origin, no trailing slash; redeploy API |
| Requests go to `http://localhost:8000` | `NEXT_PUBLIC_API_URL` wasn't set at build | Set it on the web service and **rebuild** (not just restart) |
| API 502 / won't start | Not binding `$PORT` | Already handled by the Dockerfile — confirm you didn't override the CMD |
| Contacts vanish after a deploy | No Supabase (ephemeral fallback) | Add `SUPABASE_URL` + `SUPABASE_KEY` |
| First request very slow | Free-tier cold start | Use a paid instance for the event |

---

## Custom domain (optional)

Both platforms let you attach a custom domain per service. If you do, update
`NEXT_PUBLIC_API_URL` (rebuild web) and `CORS_ORIGINS` to the new domains.
