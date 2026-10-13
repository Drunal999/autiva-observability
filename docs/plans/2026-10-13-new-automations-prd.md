# New automations: PRD and handoff (13 Oct 2026)

Written for Runal and Runal's Claude Code. Read it top to bottom once; each
section says what exists, what is left, and who owns it. Anything marked
**[Runal]** is yours to pick up. **[Aditya]** items need his accounts or are in
his repo (`adityamondal-ai-spec/AUTIVA`).

House rules that apply to everything below (from Aditya's CLAUDE.md):

- Production runs on API keys, never subscriptions.
- Secrets never enter a repo. n8n credentials or `.env` only.
- No automated sending on social platforms or WhatsApp. Drafting is fine; a human sends. Posting through an official API is fine.
- Fail loudly. No fabricated values, no half-written rows, no silent fallbacks.
- No prices, ratings or buy buttons in the marketplace until they are real.
- Never claim an AI trains itself.

---

## 0. What shipped today (already on `main`)

| PR | What | Status |
|---|---|---|
| #7 | `vercel-build` runs `prisma migrate deploy` on production deploys only | Live. Fixed the login 500 (`User.prefs` missing) |
| #8 | Home: one `POST /api/batch` for its 8 opening reads (was 14 requests, now 7) | Live |
| #8 | Marketplace: **Meta Ads Optimizer** (planned) + **Ads Package** | Live |
| #8 | `GET /api/ingest/approvals`, `POST /api/ingest/approvals/<id>/applied`, `Approval.appliedAt/applyOk/applyNote` | Live, migration applied |

The real production URL is **https://autiva-observability.vercel.app**.
`autiva-observability-seven.vercel.app` is an old separate project whose auth
500s. Ignore it.

---

## 1. Meta Ads Optimizer (E9): built, waiting for an ad account

### Problem
Small businesses spend on Meta ads every month and nobody checks them weekly.
Ads with zero conversions keep spending; ad sets that sell stay under-funded.

### What it does
Every Monday 09:00 IST it reads the last 7 days of ad-level numbers and
proposes **one plan**:

- **Pause an ad** that spent at least 2x the target CPA with 0 conversions.
- **Ad set budget +20%** when its CPA is ≤ 70% of target (≥ 3 conversions).
- **Ad set budget −20%** when its CPA is ≥ 130% of target.
- Nothing below 1,000 impressions is judged.

The plan becomes **one approval** in the dashboard (risk `MONEY`, rupee delta
shown). Nothing touches Meta until a human approves.

Rules are plain code, not an LLM: these are money calls and must be the same
every time and explainable in one line. An LLM may later write the weekly
summary or creative ideas on top.

### Safety gate (`check()`)
It runs when the plan is made **and again right before applying**, on that
day's numbers:

- only `PAUSE` and `SET_DAILY_BUDGET`;
- only on IDs present in the account right now;
- at most 20% budget change;
- refused if a budget changed since the plan was approved;
- the account must be INR;
- more than 500 rows stops the run (no paging yet).

### Where it lives
| Piece | Location |
|---|---|
| Rules + gate | AUTIVA `workflows/meta_ads.mjs` |
| n8n plan workflow (11 nodes) | AUTIVA `workflows/E9_meta_ads_plan_v1.json` |
| n8n apply workflow (18 nodes) | AUTIVA `workflows/E9_meta_ads_apply_v1.json` |
| Generator (only writer of both JSONs) | AUTIVA `workflows/build_e9_meta_ads.mjs` |
| Tests (fixture, no Meta needed) | `node workflows/test_meta_ads.mjs` |
| Module row | AUTIVA `supabase/seeds/seed_modules.py`, key `marketing.meta_ads`, engine E9 |
| Marketplace card + blueprint | this repo, `src/lib/ops/marketplaceCatalog.ts`, `workflowBlueprints.ts` |
| Approval pickup/report API | this repo, `src/app/api/ingest/approvals/**` |

### How approval reaches n8n
The dashboard is hosted; n8n runs on Aditya's laptop and cannot be called. So
n8n **asks** every 15 minutes:

1. `GET /api/ingest/approvals?module=marketing.meta_ads` with a bearer ingest
   token. It returns approvals that are APPROVED, not applied, decided in the
   last 3 days, and for this module only.
2. It loads the plan from Supabase `agent_runs` (the approval's `runRef` is `run-e9-<agent_runs.id>`).
3. It re-reads ads and ad sets, then runs `check()` again.
4. It applies each change separately. One failure does not stop the others.
5. `POST /api/ingest/approvals/<id>/applied {ok, note}` happens **once**, success or failure. A repeat gets 409.
6. The Approvals page shows **Applied** or **Apply failed**, with the note on hover.

### Left to do
- **[Aditya]** Create a Meta Business portfolio and a Facebook Page, then a
  Marketing API app with a **sandbox ad account**, to test the wiring for free.
  Sandbox has no real insights, so the plan will be empty there.
- **[Aditya]** Run the seed, import both JSONs into n8n, and fill **Settings**
  (`ad_account_id`, `target_cpa_inr`) plus two credentials:
  - *Meta Marketing API* (Facebook Graph API)
  - *AUTIVA City Ingest* (Header Auth, `Authorization: Bearer <ingest token>`)
- **[Aditya]** First real test: a **pilot client already running Meta ads**
  adds the AUTIVA business portfolio as a partner on their ad account. Four
  free weeks. No own ad spend just to test.
- **[Runal]** After the first real run, check that the marketing building
  lights for `marketing.meta_ads` and that the approval reads well on a phone
  (the detail lists every change on its own line).
- **[later]** Paging beyond 500 rows. Creative-fatigue flag (needs history).
  Flip the catalog card to `ready` only after a real client run.

---

## 2. Lead reply triage (from the "Lead Finder + AI Email" idea): planned

Source: an unlicensed n8n file from a Notion page (Apollo/Apify leads →
Gmail → 2 follow-ups → **AI auto-replies to prospects**). We take the idea,
not the file.

### Keep
Classify each prospect reply as positive, neutral, objection, unsubscribe or
negative, and **draft** the reply.

### Drop
- **AI auto-sending replies to humans.** One wrong reply loses the deal and the name. A human sends.
- Bulk cold email from a personal Gmail: the account gets banned. Use a separate domain plus a sending service (Brevo or SES), an unsubscribe link and a daily cap.
- API tokens in URL query strings (Apify did this). Use headers.

### Fit
AUTIVA already has E2 outreach (producer + throttled sender). This is a new
step after E2: inbox → classify → draft → approval → human sends.

### Tasks
- **[Runal]** Marketplace: add a `planned` catalog item `reply-triage`
  (building `sales`).
  - purpose: "Sorts every reply to your outreach and drafts an answer for you to send."
  - needs: "Gmail or your mail inbox, Claude"
  - guard: "Drafts only; you send every reply."
  - Add a ≤5-column blueprint: `New reply → Classify → Unsubscribe? → (yes) Stop + log / (no) Draft reply → You approve & send`.
  - Add it to a test the way `meta-ads-optimizer` was added.
- **[Aditya]** The engine itself, after Meta Ads has a real run.

---

## 3. Faceless video factory, cheap version: planned

Source: an unlicensed n8n file (research → script → AI QA → **38 Veo clips** →
ElevenLabs → captions → FFmpeg → Drive → YouTube). The engineering is good:
paid generation runs after QA, polling is capped, and a final QC check blocks
publishing.

### Why not as-is
38 × 8 s of Veo costs about **₹3,500–4,500 per 5-minute video**. Mass
near-identical AI videos also risk YouTube's "inauthentic/repetitive content"
demonetisation.

### Our version
- Same pipeline, but visuals are **images with slow zoom** (about ₹3 each) plus only **3–4 Veo hero shots**.
- About **₹300–500 per video**.
- Upload through the official YouTube API.
- Every video is labelled AI-made.

### Tasks
- **[Runal]** Marketplace: `planned` item `faceless-video` (building `marketing`, add to the Creative Package).
  - needs: "Claude, ElevenLabs, image + video model (paid per video)"
  - guard: "You approve every script; videos are labelled AI-made."
  - Add a ≤5-column blueprint.
- **[Aditya]** Engine later. Show the per-video cost to the client before they buy (house rule: running cost first).

---

## 4. CA Notice Reader on CAMEL: pilot proposal

CAMEL (`camel-ai/camel`, **Apache-2.0**) is a Python multi-agent framework.
It is used only where several reasoning steps genuinely help. n8n stays for
fixed pipelines, and Job Hunt stays as it is.

### Pilot
`ca-notice-reader` (already a `planned` blueprint):

1. Read the notice.
2. Find the section and the deadline.
3. Draft a reply.
4. The CA approves.

It runs as a worker on Aditya's laptop (not Vercel; runs take minutes) and
reports through the existing `/api/ingest/runs`. The building lights up and
the approval reaches the queue, so no new dashboard work is needed.

Cost: about 5–15 LLM calls per run, ₹1–5 on a cheap OpenRouter model.

- **[Aditya]** Build after Meta Ads.

---

## 5. Dashboard tasks for Runal (not automations, but open)

1. **Move to Singapore, the biggest speed win.** Every API call from India
   currently takes about 400 ms, because functions run in `iad1` and Neon is in
   `us-east-2`. Both must move together.
   - Create a new Neon project in `ap-southeast-1`.
   - Copy the data: `pg_dump` the old DB, then `pg_restore` into the new one (use direct URLs).
   - Set the Production `DATABASE_URL` to the new pooled URL.
   - Vercel → Settings → Functions → Region → `sin1`.
   - Redeploy.
   - Keep the old DB for a week.
2. **Remove Hardik.**
   - Take `hardikwork05` out of `ALLOWED_GITHUB_LOGINS` if it is there.
   - In Neon, check first with `SELECT id, name, handle FROM "User" WHERE handle ILIKE 'hardik%';`
   - Then delete only his row. His comments keep their text with a null author; his calendar RSVPs and prefs go.
3. **Assistant and Job Hunt on the live site.** Not a bug: both talk to
   services on Aditya's laptop and only show on `localhost`. A Cloudflare
   Tunnel would expose them, but only while the laptop is on. Don't build this
   without asking Aditya.

## Definition of done for any item above
Typecheck and lint are clean. `npx vitest run` passes (the old
`scripts/local-city-demo.test.mjs` failure is known). Production build passes.
Verify in the browser, not just in tests. Run the secret scan before every
commit. One PR per item, against `main`.
