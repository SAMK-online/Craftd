# You Met Eleven Great People at That Conference. You Followed Up With Zero.

*How I turned the most-skipped step in networking — the follow-up — into a 30-second background job, and the engineering decisions that made it actually usable at a noisy conference.*

---

## The problem nobody admits to

You go to a conference. You meet someone great. You exchange a card or a LinkedIn handle, say "let's stay in touch," and you genuinely mean it.

Then you get home with eleven business cards, a dead phone, and zero memory of which conversation went with which name. The follow-up — the entire *reason* you flew out and paid for the ticket — is the thing you never do.

I kept living this loop, and the frustrating part is that the follow-up isn't *hard*. It's tedious in a very specific, defeating way. To send **one** good message, you have to:

- remember who the person actually was and what you talked about,
- look up their company and what it's doing *right now* (not what its 2019 About page says),
- figure out the real reason you'd follow up — a shared interest, an open role, a project worth referencing,
- find an email address that won't bounce,
- and write something that sounds like a human wrote it and not a mail-merge robot.

That's 15 minutes of context-switching per person. Multiply by eleven cards and a jet-lagged brain, and the honest outcome is: it never happens. The connection decays to nothing.

So I built **Craft'ed**: you drop a name and a company — or snap a photo of a business card — and by the time you've turned around to meet the next person, it has already produced a researched intel brief and a ready-to-send message, tuned specifically to *you* and your goals.

This is the story of what it does, how it works under the hood, and the handful of engineering decisions that turned "cool demo" into "thing I'd actually open in a crowded hall on bad hotel Wi-Fi."

---

## What it actually does

Craft'ed is a self-hosted networking tool. The core loop is deliberately, almost aggressively boring to use — which is the point. At an event you don't want a clever app; you want something that gets out of your way.

1. You type a name + company — or take a photo of a business card.
2. It **queues the job and immediately clears the input** so you can capture the next person without waiting.
3. In the background it researches the person and company, scans for open roles, finds a verified email, and writes the outreach.
4. A card lands on your dashboard. Tap it to open the full brief.

Each brief contains:

- **Who they are** and **what their company does** — researched live from the web, not pulled from a stale, pre-scraped people database.
- **Why to follow up** — a concrete "opportunity angle," not "great connecting at the event!"
- **Open roles that fit you** — it scans the contact's company across the major applicant-tracking systems (Greenhouse, Lever, Ashby) for roles that match *your* resume, each with a cleaned-up description and an apply link.
- **A verified work email** — a real, deliverable address. Or, honestly, nothing at all — it will never show you a guessed address dressed up as a real one.
- **Ready-to-send outreach** — a LinkedIn DM under 300 characters, a follow-up email with subject and body, and 3–5 talking points.

There's also a **Find People** mode: type something like *"Solutions Engineers at Anthropic"* or *"speakers at AWS Summit DC 2026"* and it surfaces matching individuals you can then run a full brief on.

The thing that keeps the output from feeling generic is the **persona**. You onboard once — name, role, goal, resume — and every brief is written through that lens. "I'm a student looking for an internship" produces a fundamentally different brief, DM, and set of job matches than "I'm a founder looking for design partners." Craft'ed knows which one you are, and it never forgets.

---

## The design constraint that shaped everything: graceful degradation

Most "AI tool" side projects die on the same hill. They need eight API keys, three of which cost money up front, and the whole thing face-plants if any single one is missing or rate-limited. You clone the repo, hit a wall of `KeyError: 'SOME_API_KEY'`, and close the tab forever.

I made one rule for myself early and refused to break it: **the only key you truly need is Anthropic. Everything else is optional, and its absence is a smaller feature — never a crash.**

| Key | What it unlocks | Without it |
|---|---|---|
| **Anthropic** *(required)* | Card OCR + all brief/DM/email writing | — |
| Tavily | Live web research on person + company | Falls back to public data only |
| Prospeo | Verified work-email lookup | No email shown (never a guess) |
| Exa | "Find People" discovery | Feature simply hides |
| Apify | LinkedIn job fallback for off-ATS companies | ATS boards only |
| Supabase | Server-side persistence across devices | Local JSON + `localStorage` fallback |

Run Craft'ed with *just* an Anthropic key and you still get a complete brief built from public web data and the free, unauthenticated ATS job boards. Every external integration is wrapped so that when it's unconfigured or it fails, the function returns `None` (or an empty list) and the pipeline keeps going with whatever it does have.

That one constraint — *"what is the minimum that still produces something useful?"* — quietly dictated the entire architecture. It's the reason a stranger can clone the repo and have it working in five minutes instead of rage-quitting at the `.env` file. And it forced a discipline that paid off everywhere else: **no single dependency is allowed to be load-bearing for the whole experience.**

---

## How it works under the hood

The backend is a small async **FastAPI** (Python) service; the frontend is **Next.js + TypeScript + Tailwind**. The interesting engineering is almost entirely in the orchestration and in how each stage handles its own failure.

```
name + company (or card photo)
        │
        ▼  OCR (Claude Vision, only if a card)
   resolved contact
        ├───────────────┬───────────────┐
        ▼               ▼               ▼
  web research      job scan        email find
  (Tavily+Claude)   (ATS APIs)      (Prospeo)
        └───────────────┴───────────────┘
                        ▼  synthesis (Claude)
                   Intel brief + outreach  →  dashboard
```

Let me walk each stage, because the details are where the real decisions live.

### Stage 0 — Capture and the queue

The capture box does one job and does it instantly: it creates a **run**, hands it to a background queue, and returns. The product premise — *"the follow-up is ready before you leave the room"* — only holds if the person doing the capturing is **never blocked** waiting on a result. So capture is fully decoupled from processing.

Each run executes as an `asyncio` task, but a **semaphore caps concurrency at three** pipelines at once:

```python
_MAX_CONCURRENCY = 3
_sem = asyncio.Semaphore(_MAX_CONCURRENCY)
```

This matters more than it looks. At a real event you capture in *bursts* — you meet four people at one booth and dump them in within twenty seconds. Without a cap, four simultaneous pipelines would each fan out into multiple web searches and LLM calls, and you'd hammer your own rate limits into the ground. The semaphore smooths bursts into a steady drip the upstream APIs can actually tolerate. Runs are scoped by a per-browser `device_id`, and persisted either to a Supabase `runs` table (survives restarts) or to a local `.craftd_runs.json` fallback.

### Stage 1 — OCR (only if there's a card)

If the input is a business-card photo, it goes to **Claude Vision** with a tightly constrained prompt. The prompt is the interesting part — it's engineered to be honest rather than helpful:

- It returns strict JSON with fixed keys (`name`, `company`, `title`, `email`, `phone`, `linkedin_url`, `website`, `raw_text`).
- `name` and `company` are required; if either can't be **confidently** read, the model is told to return `"UNKNOWN"` rather than hallucinate.
- LinkedIn URLs are only included if literally printed on the card — *no guessing a handle from the name.*

That "set it to UNKNOWN rather than guess" instruction becomes a real branch in the pipeline: if the resolved name or company comes back `UNKNOWN`, the run records a clear error ("check card image quality or provide name/company directly") instead of confidently researching the wrong person. OCR is also the *only* sequential stage — everything downstream needs a resolved contact first.

### Stage 2 — Research and jobs, in parallel

Web research and the job scan don't depend on each other, so they run **concurrently** with `asyncio.gather(..., return_exceptions=True)`. There's no reason to wait on a company's careers page before you start researching the human.

**Research** deliberately does *not* use a static people database (the kind that needs an email or LinkedIn URL up front and a paid plan to read anything back). Instead it:

1. Fires **two Tavily web searches in parallel** — one about the person, one about the company — which works from nothing more than a name + company string.
2. Feeds the raw results to Claude, which extracts a structured `EnrichmentResult` (person fields + company fields) **and rates its own confidence**, with an explicit instruction to *only* extract what the sources actually support and never invent facts.

That self-rated confidence is a small but important honesty valve: the synthesis downstream can lean harder on high-confidence facts and hedge on low-confidence ones.

**Jobs** uses a priority chain, fastest-and-most-reliable first:

1. Hit the **Greenhouse / Lever / Ashby public APIs** directly — they're unauthenticated, fast, and most startups use one of them.
2. If none of those resolve, fall back to an **Apify** LinkedIn-jobs scraper (only if configured).
3. If all else fails, degrade to a plain careers-page URL with no role data.

Crucially, the roles it looks for come from *your* persona's `target_roles` (derived from your resume and goal), with a broad default keyword set only as a fallback. Scraped job descriptions get run through an HTML/entity stripper so the brief shows a clean, readable summary instead of a soup of `<div>` tags. Email finding happens here too, opportunistically, once research has discovered the company's real domain.

### Stage 2.5 — Verified email, or nothing

Email lookup goes through **Prospeo's** enrich-person API with one non-negotiable setting: `only_verified_email: true`. On top of that, the service rejects any result whose status lands in a blocklist:

```python
BAD_STATUSES = {"INVALID", "UNDELIVERABLE", "FAILED", "DO_NOT_EMAIL"}
```

So you either get an address that's been verified as deliverable, or you get nothing. This is a *deliberate product stance*, not a limitation I'm apologizing for: a follow-up tool that surfaces a plausible-looking but wrong email is worse than one that admits it couldn't find one. A guessed `firstname@company.com` that bounces makes *you* look careless. Better an honest blank.

### Stage 3 — Synthesis

Finally, a **single Claude call** takes the enrichment and the job data and produces the whole brief: person summary, company snapshot, the "why follow up" angle, the sub-300-character LinkedIn DM, the follow-up email (subject + body), and 3–5 talking points — all as structured JSON the backend parses directly.

The system prompt is built dynamically **from your persona**. Your name, role, resume summary, and skills aren't just used to match jobs — they set the *voice and strategy* of the entire brief. The same contact genuinely produces different outreach depending on who's asking and why. That's the difference between a tool that drafts *a* message and one that drafts *your* message.

### A note on "Find People"

Discovery handles two very different query shapes from a single search box — *role + company* ("Solutions Engineers at Anthropic") and *event context* ("speakers at SaaStr"). To cover both, it runs **two Exa searches in parallel**: a LinkedIn-profile search (great for role+company) and a general web search (which surfaces the speaker pages, agendas, sponsor lists, and team pages where event people actually live). Claude then extracts the distinct individuals, again with a hard "never invent anyone" rule. Email resolution is deferred until you actually craft a follow-up, keeping discovery snappy.

---

## The cross-cutting decision: every stage fails alone

If you take one architectural idea away from this, make it this one.

Every stage in the pipeline is wrapped so that an exception is **caught, logged, recorded as a partial result, and stepped over** — the pipeline *never* fully dies. Each stage also records its own timing. If Tavily times out, you still get the brief from public data and the jobs. If Prospeo is down, you still get research and roles, just no email. If the job scan throws, you still get the person summary and outreach.

```python
enrich_result, jobs_result = await asyncio.gather(
    enrich_coro, jobs_coro, return_exceptions=True
)
```

A networking tool that returns *nothing* because one upstream API hiccuped is worse than useless at an event — that's exactly the moment you can't afford it. Partial results beat total failure, every single time, especially when you're standing in a loud hall on flaky Wi-Fi with a queue of people you just met. "Graceful degradation" isn't a buzzword here; it's literally the per-stage `try/except` that lets a half-working internet still produce a usable brief.

---

## The part most "scraper" projects skip: responsible use

Here's the uncomfortable truth about any tool that researches real people and surfaces verified emails: the distance between "thoughtful warm follow-up" and "spam cannon" is exactly one `for` loop.

I didn't want to ship that capability and then look away, so responsible use is baked into how Craft'ed is framed and documented, not bolted on as a disclaimer:

- **It's built for warm follow-ups** — people you actually met, a card you were actually handed. That's the intended, consent-adjacent use.
- **A data source being legal does not make every use of it okay.** Cold-emailing strangers can implicate **CAN-SPAM** in the US and **GDPR/PECR** in the EU, *regardless* of where the address came from.
- **Nothing auto-sends.** Every draft is yours to read and edit before it goes anywhere. Keep messages honest; don't imply a familiarity that isn't real.
- **"Find People" is for research and intros**, not for assembling a cold-outreach list.
- **Honor "no."** Don't contact people who've opted out, and don't mass-blast.

You bring your own keys and run your own instance — which means *you* own how it's used. I'd much rather the tool be honest about that tension than pretend the question doesn't exist. The verified-email-or-nothing stance and the "review before you send" defaults are the technical expression of that same belief.

---

## What I'd tell you if you're building something similar

1. **Pick the one dependency you can't live without, and make literally everything else optional.** It forces a cleaner architecture *and* it's the entire difference between a repo people can run and a repo people star and forget.
2. **Decouple capture from processing.** The moment your tool makes a user wait, it loses to a notes app. Queue the work, free the human.
3. **Cap your own concurrency.** Real usage is bursty. A semaphore between you and your upstream APIs is three lines of code that saves you from rate-limit hell.
4. **Catch failures per stage, not per pipeline.** Return partial results. The failure modes you design for are the ones your users will actually hit.
5. **Make the model say "I don't know."** Prompt for `UNKNOWN`, verify emails, rate confidence. A tool that admits uncertainty earns far more trust than one that's confidently wrong.
6. **If your tool touches real people, write the responsible-use section first, not last.** It will change what you build — and that's the point.

---

## Try it

Craft'ed is open source (MIT) and self-hosted. Clone it, drop in your Anthropic key, and run `docker compose up` — or deploy the two services (API + web) to a host with HTTPS so you can use it from your phone at an actual event. Every other key is optional and unlocks one more layer of the brief.

The next time someone says "let's stay in touch," you might actually mean it — because the follow-up will already be sitting on your dashboard, researched and drafted, before you've finished shaking their hand.

*Built with FastAPI, Next.js, and Claude.*
