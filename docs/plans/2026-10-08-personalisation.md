# Personalisation plan — assistant, look, and worlds

Date: 8 Oct 2026 · Owner: Aditya · For: Aditya, Runal

## Why

Most dashboards people buy look the same and can't be changed. AUTIVA's edge is
that the workspace feels like *yours*: your assistant, your look, your world.
This plan orders that work so each step ships on its own, costs nothing extra
until voice is involved, and never shows something that isn't real.

## What a customer can change (three layers)

| Layer | Options | Where it is stored |
|---|---|---|
| **Assistant** | Name (default "Bolo"), orb palette (5 presets), voice (ElevenLabs), how chatty it is (brief / normal) | user preference |
| **Look** | Appearance (Auto / Light / Dark, exists today), accent colour, glass strength (clear / frosted), density (comfortable / compact), which Home cards show and in what order | user preference, with workspace defaults |
| **World** | The scene behind everything: City (today), then alternatives such as Orbit (agents as ships around planets), Reef (agents as fish between reefs), Campus | workspace setting, per-user override |

Language stays **Automatic**: Bolo answers in the language it is spoken to. We
do not show a list of three languages (that reads as "only three").

## How it works (one data model, one contract)

1. **`UserPreference` table** (Prisma, one row per user): `assistantName`,
   `orbPalette`, `voiceId`, `theme`, `accent`, `glass`, `density`,
   `homeCards` (ordered list), `world`. Workspace owners set defaults on the
   tenant; a user's own row overrides them. Read once on load, saved on change.
   No localStorage for these (they must follow the person across devices).
2. **Worlds are renderers over the same data.** The City already speaks a
   small message contract with the dashboard. Any new world implements the
   same contract and plugs in with no dashboard changes:

   | Message | Direction | Meaning |
   |---|---|---|
   | `autiva:city` | dashboard → world | modules + recent runs (real) |
   | `autiva:city-agents` | dashboard → world | the business's real agents: id, name, district, status, current step |
   | `autiva:city-mode` | dashboard → world | hero (behind widgets) or explore (full controls) |
   | `autiva:city-previews` | both | ask for / return one image per building |
   | `autiva:city-select` | world → dashboard | a building was tapped: open its marketplace |
   | `autiva:city-ready` | world → dashboard | loaded, send me data |

   Rule for every world: decoration may be invented, **anything that looks like
   your business must come from these messages** (agents, statuses, runs).
3. **Settings sheet** (glass, opened from the avatar menu): three tabs —
   Assistant, Look, World — each with a live preview, Save and Reset.

## Voice with ElevenLabs

- Voice picker lists voices from the ElevenLabs voice library (Voices API),
  with a 5-second preview, and stores the chosen `voiceId` on the user.
- The conversation uses the workspace's ElevenLabs agent with a per-session
  **voice override** (must be enabled in the agent's security settings), so we
  keep one agent, not one per customer.
- **Cost:** conversational voice is billed per minute on the ElevenLabs plan.
  Check the current price on elevenlabs.io/pricing before launch and put it in
  the package price; customers on the cheapest package get the default voice.
- Production uses an **API key**, never a personal subscription.

## Order of work (each step ships alone)

| # | Step | Cost | Done when |
|---|---|---|---|
| 1 | Settings sheet: assistant name, orb palette, accent, glass strength, Home card toggles (stored per browser for a demo) | ₹0 | a user can rename Bolo and hide a card |
| 2 | `UserPreference` table + API; move step 1 off the browser into the DB | ₹0 | settings follow the user to the phone |
| 3 | ElevenLabs voice picker + per-session override | per-minute voice usage | a user hears their chosen voice |
| 4 | Second world (Orbit) built on the contract above, behind a "Labs" toggle | ₹0 | same real agents/statuses appear as ships |
| 5 | World picker for workspace owners; sell extra worlds in higher packages | — | after 3 paying customers ask for it |

## Guardrails

- Every accent and palette passes a contrast check against both themes.
- Worlds have a performance budget (60 fps on a mid laptop, a lighter mode on
  phones) and respect "reduce motion".
- Nothing a customer configures can make a fake status look real.
