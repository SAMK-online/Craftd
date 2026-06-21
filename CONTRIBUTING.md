# Contributing to Craft'ed

Thanks for your interest! Craft'ed is a self-hosted, bring-your-own-keys tool, and
contributions are welcome — bug fixes, new integrations, and UI polish especially.

## Getting set up

See the [README](README.md) for the full quickstart. The short version:

```bash
# Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add ANTHROPIC_API_KEY (others optional)
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd web && npm install
cp .env.example .env.local
npm run dev
```

Or just `docker compose up --build`.

You only need `ANTHROPIC_API_KEY` to develop most things — every other integration
degrades gracefully when its key is absent.

## Project layout

```
app/services/      one file per pipeline stage:
  ocr_service        business-card OCR (Claude Vision)
  research_service   web research enrichment (Tavily + Claude)
  jobs_service       ATS job matching (Greenhouse/Lever/Ashby/Apify)
  email_service      verified email lookup (Prospeo)
  discovery_service  "find people" (Exa Search + Claude)
  report_service     final brief + outreach synthesis (Claude)
  queue_service      async run queue + persistence
  persona_store      persona persistence
  pipeline           orchestrates the stages
web/components/     UI; web/lib/ API client + helpers
```

## Conventions

- **Python**: type hints everywhere, `async` for I/O, keep each integration in its
  own `services/*.py` with a graceful fallback (return `None`/`[]` when its key is
  unset — never crash the pipeline).
- **TypeScript**: typed props; feature components in `web/components/`, primitives
  in `web/components/ui/`; styling via the Tailwind tokens in `tailwind.config.ts`
  (use the Clay palette — `canvas`, `ink`, `brand-*` — not raw hex).
- **Keep it runnable with just Anthropic.** New features must degrade gracefully.

## Adding an integration

1. Add the key(s) to `app/config.py` with a `*_configured` gate.
2. Create `app/services/<name>_service.py` returning typed models from
   `app/models/pipeline.py`; no-op/fallback when unconfigured.
3. Wire it into `pipeline.py` or a route in `app/api/routes.py`.
4. Document the key in `.env.example` and the README keys table.

## Submitting changes

1. Fork → branch (`feat/...` or `fix/...`).
2. Make sure it builds: backend `python -m compileall app`, frontend `npm run build`.
3. **Never commit secrets** — `.env` is gitignored; double-check your diff.
4. Open a PR describing the change and how you tested it.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, and what happened
(redact any keys from logs).
