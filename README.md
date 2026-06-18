# Event Intel - Backend

Turn a name + company (or business card photo) into a full intelligence brief with personalized outreach drafts and open job matches, in ~15-20 seconds.

## Stack

- **FastAPI** + **uvicorn** - async API server
- **Anthropic Claude** - business card OCR (Vision) + report generation
- **Clay** - person and company enrichment (LinkedIn, funding, tech stack, email)
- **Greenhouse / Lever / Ashby APIs** - job board scanning (no auth required)
- **Apify** - fallback LinkedIn Jobs scraper (optional)
- **Pydantic** - typed data contracts throughout the pipeline

---

## Setup

### 1. Install dependencies

**Requires Python 3.10+** (the API uses `X | None` runtime type annotations that
FastAPI evaluates at startup; 3.9 will fail to boot).

```bash
cd event_intel
python3.11 -m venv .venv          # any 3.10+ interpreter works
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
ANTHROPIC_API_KEY=sk-ant-...
CLAY_API_KEY=clay_...
CLAY_TABLE_WEBHOOK_URL=https://api.clay.com/v3/sources/webhook/...
```

### 3. Clay setup (critical for enrichment)

1. Create a Clay table with these columns: `name`, `company`, `title`, `email`, `linkedin_url`
2. Add enrichment integrations:
   - **People Data Labs** (person: LinkedIn, skills, career history)
   - **Clearbit** or **Apollo** (company: funding, tech stack, headcount)
3. Add a **Webhook source** to the table (Settings > Sources > Webhook)
4. Copy the webhook URL to `CLAY_TABLE_WEBHOOK_URL`
5. Copy your table ID from the URL: `app.clay.com/.../tables/TABLE_ID_HERE`
6. Add to `.env`: `CLAY_TABLE_ID=TABLE_ID_HERE`

Clay column names in the enrichment response will vary based on your integrations.
Open `app/services/clay_service.py` and adjust the field mapping in `_map_clay_row_to_enrichment()`
to match your actual Clay column IDs.

### 4. Apify setup (optional, for companies not on Greenhouse/Lever/Ashby)

1. Create an account at apify.com
2. Copy your API token to `APIFY_API_TOKEN`
3. The scraper used is `bebity/linkedin-jobs-scraper` (free tier is enough for a pilot)

### 5. Run the server

```bash
uvicorn app.main:app --reload --port 8000
```

API docs at: http://localhost:8000/docs

---

## API Endpoints

### `POST /api/generate`
Full pipeline. Returns complete report JSON.

```bash
# With name + company (typed)
curl -X POST http://localhost:8000/api/generate \
  -F "name=Sarah Chen" \
  -F "company=Anthropic" \
  -F "event_name=AWS Summit 2025"

# With a business card photo
curl -X POST http://localhost:8000/api/generate \
  -F "card_image=@/path/to/card.jpg" \
  -F "event_name=AWS Summit 2025"
```

### `POST /api/generate/stream`
Same pipeline but streams stage updates via Server-Sent Events.
Use this for the mobile UI - users see progress as it happens.

Events emitted: `pipeline_start`, `stage_start`, `stage_complete`, `stage_warning`, `stage_error`, `done`, `error`

### `POST /api/ocr`
Parse a business card only. Good for testing card quality.

```bash
curl -X POST http://localhost:8000/api/ocr \
  -F "card_image=@/path/to/card.jpg"
```

### `POST /api/jobs`
Search for target roles at a company.

```bash
curl -X POST http://localhost:8000/api/jobs \
  -F "company=Databricks"
```

---

## Pipeline Architecture

```
Input (name+company or card image)
    │
    ▼ [OCR - Claude Vision, ~2s, only if card image]
Resolved contact: name, company, title
    │
    ├─────────────────────────────┐
    ▼                             ▼
Clay enrichment (~4-8s)      Job board scan (~3-6s)
Person + company data        Greenhouse/Lever/Ashby APIs
    │                             │
    └──────────┬──────────────────┘
               ▼ [asyncio.gather - runs both in parallel]
        Enriched context
               │
               ▼ [Claude report generation, ~4s]
          IntelReport
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
LinkedIn DM  Email    Talking points
```

Total: ~15-20s with Clay, ~8-12s without.

---

## Project Structure

```
event_intel/
├── app/
│   ├── main.py              # FastAPI app, CORS, router registration
│   ├── config.py            # Pydantic settings (reads .env)
│   ├── models/
│   │   └── pipeline.py      # All typed Pydantic models
│   ├── services/
│   │   ├── ocr_service.py   # Claude Vision business card parsing
│   │   ├── clay_service.py  # Clay enrichment (webhook + polling)
│   │   ├── jobs_service.py  # Greenhouse/Lever/Ashby/Apify job search
│   │   ├── report_service.py # Claude report + outreach generation
│   │   └── pipeline.py      # Orchestrator: coordinates all stages
│   └── api/
│       └── routes.py        # FastAPI endpoints
├── requirements.txt
├── .env.example
└── README.md
```

---

## Deployment (Render.com - easiest for a pilot)

1. Push to GitHub
2. Create a new Web Service on render.com
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables from your `.env`

The free tier spins down after inactivity. Upgrade to Starter ($7/mo) for the event to avoid cold starts.

---

## Extending for Career Fairs / Sales Teams

The pipeline is designed to extend:

- **Career fair mode**: add `context: "career_fair"` to `ContactInput` and adjust the report prompt in `report_service.py` to frame outreach as candidate-to-employer
- **Sales team mode**: replace Abu's background in the system prompt with a company/product description, add CRM sync as a post-pipeline step
- **History/logging**: add a SQLite or Postgres layer to persist `PipelineState` per session
- **Batch mode**: wrap `run_pipeline()` in a list comprehension with `asyncio.gather()` for post-event batch processing of all contacts
