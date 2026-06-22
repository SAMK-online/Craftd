import Link from "next/link";
import ShaderShowcase from "@/components/ui/hero";

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-canvas text-ink">
      <ShaderShowcase />
      <ProductDoc />
    </main>
  );
}

function ProductDoc() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <Label>What it is</Label>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-ink sm:text-4xl">
            A focused workflow for event networking.
          </h2>
          <p className="mt-4 text-base leading-8 text-body">
            Craft&apos;d is built for the moment after you meet someone. Add their name and company, or upload a card photo. The app queues the work, researches what it can, checks public job boards, and drafts a follow-up you can review before sending.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Fact title="Input" body="Name and company, optional title and notes, or a business-card image." />
          <Fact title="Output" body="An intel brief, open roles when found, talking points, and outreach drafts." />
          <Fact title="Data" body="Runs can persist in Supabase, with a JSON-file fallback when Supabase is not configured." />
          <Fact title="Control" body="You bring the keys; external integrations stay optional." />
        </div>
      </section>

      <section className="mt-16 grid gap-6 lg:grid-cols-2">
        <Screenshot
          src="/screenshots/event-dashboard.png"
          alt="Craft'd dashboard screenshot"
          label="Dashboard"
          caption="Contacts queue in the background, then appear as ready cards when the pipeline finishes."
        />
        <Screenshot
          src="/screenshots/intel-brief.png"
          alt="Craft'd intel brief screenshot"
          label="Intel brief"
          caption="The brief shows person and company context, matching roles, email when available, and drafts to copy."
        />
      </section>

      <section id="workflow" className="mt-20">
        <Label>How it works</Label>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Step number="1" title="Capture" body="Add a contact manually or upload a business card image." />
          <Step number="2" title="Resolve" body="Card OCR uses Claude Vision when a card image is present." />
          <Step number="3" title="Enrich" body="Optional Tavily, Prospeo, Exa, and Apify keys unlock more data sources." />
          <Step number="4" title="Draft" body="Claude generates the final brief and outreach JSON for the dashboard." />
        </div>
      </section>

      <section id="setup" className="mt-20 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Label>Setup</Label>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-ink">Bring your own keys.</h2>
          <p className="mt-4 text-base leading-8 text-body">
            Anthropic is required for OCR, resume parsing, and report generation. Other keys are optional and degrade gracefully when missing.
          </p>
          <Link
            href="/app"
            className="mt-6 inline-flex rounded-[8px] bg-ink px-5 py-3 text-sm font-semibold text-on-primary transition hover:bg-body-strong"
          >
            Open the app
          </Link>
        </div>

        <div className="overflow-hidden rounded-[8px] border border-hairline bg-ink text-white">
          <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
            Quickstart
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-7 text-white/90"><code>{`# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend
cd web
npm install
npm run dev`}</code></pre>
        </div>
      </section>

      <section id="integrations" className="mt-20">
        <Label>Specifications</Label>
        <div className="mt-5 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <p className="text-base leading-8 text-body">
            FastAPI (Python 3.10+) backend with an async pipeline, a Next.js 14 + TypeScript
            front-end, and Claude for generation. Every data source is its own service that
            no-ops when its key is absent — so it runs on just an Anthropic key.
          </p>
          <div className="overflow-hidden rounded-[8px] border border-hairline">
            {SPECS.map(([name, tag, desc], i) => (
              <div
                key={name}
                className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 bg-white px-4 py-3 ${i ? "border-t border-hairline" : ""}`}
              >
                <span className="text-sm font-semibold text-ink">{name}</span>
                <span
                  className={`justify-self-end rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    tag === "Required"
                      ? "bg-brand-coral text-white"
                      : tag === "Built-in"
                        ? "bg-brand-mint text-ink"
                        : "bg-surface-strong text-muted"
                  }`}
                >
                  {tag}
                </span>
                <span className="col-span-2 text-sm leading-6 text-body">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-coral">{children}</p>;
}

function Fact({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[8px] border border-hairline bg-white p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-body">{body}</p>
    </div>
  );
}

function Screenshot({
  src,
  alt,
  label,
  caption,
}: {
  src: string;
  alt: string;
  label: string;
  caption: string;
}) {
  return (
    <figure className="overflow-hidden rounded-[8px] border border-hairline bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="aspect-[4/3] w-full object-cover object-top" />
      <figcaption className="border-t border-hairline p-4">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-1 text-sm leading-6 text-body">{caption}</p>
      </figcaption>
    </figure>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="rounded-[8px] border border-hairline bg-surface-card p-5">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-brand-teal text-sm font-semibold text-white">
        {number}
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-body">{body}</p>
    </div>
  );
}

const SPECS: [string, string, string][] = [
  ["Anthropic Claude", "Required", "Card OCR, résumé parsing, and brief + outreach generation."],
  ["Tavily", "Optional", "Live person/company web research (else public data only)."],
  ["Prospeo", "Optional", "Verified work-email lookup."],
  ["Exa", "Optional", "Contact discovery in Find people — a search or an event link."],
  ["Greenhouse / Lever / Ashby", "Built-in", "Public job-board scan — no key needed."],
  ["Apify", "Optional", "LinkedIn jobs fallback for off-ATS companies."],
  ["Supabase", "Optional", "Persists persona + contacts (local fallback otherwise)."],
];
