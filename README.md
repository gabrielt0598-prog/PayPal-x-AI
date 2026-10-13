# PayPal × AI — Personal Finance

A closed-loop personal finance app for someone who lives entirely on their
**PayPal balance and PayPal Debit Card**. A dark, Revolut-Business-inspired UI
(the **Final** design in [`design/`](design/README.md)) with a floating bottom
dock and a **PayPal AI** panel (⌘K) that opens from the right over the page.
Ask about spending, run what-if scenarios, categorise transactions, cancel
subscriptions and apply PayPal offers while the page you're looking at stays
visible — without the assistant ever inventing a number.

Pages: Home, Transactions, Budget, Recurring, Essentials, Offers, Rewards, Insights and
Account. Essentials (reorders through a PayPal Store Sync merchant) and Rewards
(PayPal Rewards points) use sample catalogs and points, because neither has a
public API; their payments still post to the PayPal balance ledger.

Built for the PayPal × AI hackathon. Localhost demo; deployment comes later.

## Quick start

```bash
npm install
npm run dev                  # creates .env on first run, then serves http://localhost:3000
```

Paste your API keys into **`.env`** (created from `.env.example` on first run, or
with `npm run setup:env`). `.env` is git-ignored, and the setup script refuses to
run if it ever isn't, so pushing the repo never publishes your keys. Every key is
optional — see below. Restart `npm run dev` after editing `.env`.

```bash
git check-ignore -v .env     # sanity check: prints the .gitignore rule that hides it
```

With no keys at all, everything runs on deterministic mock data and a rule-based
assistant, so the demo works for $0. Add keys one at a time to switch each
integration to live mode; the dashboard's integrations widget shows which are live.

## Stack

| Concern | Choice |
|---|---|
| App | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 |
| UI | Clean design system: Tailwind tokens + primitives (`src/components/clean/`) |
| Transactions and recurring tables | AG Grid Community (`ag-grid-react`), themed to the Clean design |
| Spending line, bar and donut charts | AG Charts Community (`ag-charts-react`), themed to the Clean design |
| Assistant | Claude via `@anthropic-ai/sdk` — default `claude-haiku-5-5` (`ANTHROPIC_MODEL`) |
| Guardrails & categorisation | TypeSafe Jev via `@typesafe-ai/sdk` + deterministic figure checks |
| Money data | APIMatic-generated PayPal Server SDK (`@paypal/paypal-server-sdk`) |
| Merchant-site cancellations | Kernel cloud browsers (`@onkernel/sdk`) |
| Low-balance alerts | Zapier Catch Hook webhook |
| Agent memory | Local JSON store (`.data/`, git-ignored) |

## Partner integrations

| Partner | Role in the product | Env vars | Code |
|---|---|---|---|
| **TypeSafe Jev** | Verifies every assistant reply against tool data before it's shown (blocks invented figures/transactions); classifies intents; categorises transactions | `TYPESAFE_API_KEY`, `JEV_HALLUCINATION_THRESHOLD` | `src/lib/services/jev.ts` |
| **APIMatic / PayPal** | Source of truth for transactions, balance and PayPal-billed subscriptions (Transaction Search + Subscriptions controllers) | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`, `PAYPAL_USE_MOCK` | `src/lib/services/paypal.ts` |
| **Kernel** | Runs a cloud browser with a saved profile to cancel subscriptions on merchant sites that aren't billed through PayPal (Cinebox, Vantage, …) | `KERNEL_API_KEY`, `KERNEL_PROFILE_NAME` | `src/lib/services/kernel.ts` |
| **Zapier** | Fires an external notification when the balance drops below the auto-reload threshold | `ZAPIER_WEBHOOK_URL` | `src/lib/services/zapier.ts` |
| **Claude** | The assistant: tool-using agent over the user's data | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `src/lib/agent/` |

Detailed setup for each: [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md).

### PayPal SDK context plugin

PayPal ships skills that teach Claude Code how to use the APIMatic SDK. Install
them on your machine with:

```bash
npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview
```

### Demo alert

`/?alert=suspicious-charge` raises a PayPal AI chat bubble above the dock's AI
button (any code can raise one with a `pfm:alert` CustomEvent). Pressing it
opens the panel and starts the conversation. The app has no freeze-card or
dispute tool, so the assistant answers from the data and says what it can't do.

## Usage limits

The routes that spend money or quota are rate-limited (`src/lib/services/limits.ts`), so judges and
participants can't run up your bill. Each has a per-visitor rate (per minute and per day) and a global
daily cap; going over returns HTTP 429 with a friendly message and `Retry-After`.

| Guarded | Per minute | Per day | Global per day |
|---|---|---|---|
| PayPal AI (`/api/agent`: Claude + Jev) | 10 | 80 | 1,500 |
| Kernel cancellations (`/api/kernel/cancel`) | 2 | 6 | 60 |
| Zapier alerts (`/api/zapier/*`, `/api/demo/simulate-spend`) | 3 | 10 | 100 |
| Jev routes (`/api/jev/*`) | 20 | 200 | 2,000 |
| PayPal reads / SDK calls (`/api/paypal/*`) | 60 | 1,000 | 20,000 |

Tune with env vars, e.g. `LIMIT_AGENT_PER_MIN=5 LIMIT_AGENT_PER_DAY=40 LIMIT_AGENT_GLOBAL_PER_DAY=800`
(names: `LIMIT_<AGENT|KERNEL|ZAPIER|JEV|PAYPAL>_<PER_MIN|PER_DAY|GLOBAL_PER_DAY>`), or `RATE_LIMITS=off` for
local development. Each Claude turn is also capped at 1,500 output tokens, 6 tool rounds, 12 messages of
history and 4,000 characters per message.

**On Vercel the counters are per serverless instance**, so the real ceiling can be a few times higher.
For a hard cap also set: an Anthropic Console spend limit, your Kernel and Zapier plan limits, and a
Vercel Firewall rate-limit rule (Project → Firewall → Rate limiting) on `/api/*`.

## Project layout

```
src/
  app/
    page.tsx                 the app (CleanApp)
    api/state                GET snapshot / DELETE reset (demo store)
    api/agent                POST chat → Claude tool loop → Jev guardrail
    api/{paypal,jev,kernel,zapier,memory,demo,integrations}/…
    api/demo/move-money      Top up / Transfer / rewards cash-out / Store Sync reorder
    api/demo/offers          add or remove an offer (Added state)
  components/
    clean/                   Final design: bottom dock, pages (incl. Budget), charts, UI primitives
    assistant/               PayPal AI panel (⌘K), citations, step rail, what-if compare card
    state/AppProviders.tsx   shared client state (finance snapshot + panel)
  lib/
    types.ts                 domain types shared by UI, agent and services
    mock-data.ts             userProfile, transactions, subscriptions, offers
    finance.ts               pure aggregations (daily/monthly/yearly, categories…)
    store.ts                 in-memory server state + actions
    services/                contracts.ts + one adapter per partner
    agent/                   prompt, tools, loop, no-key fallback
```

## Mock data

`src/lib/mock-data.ts` deterministically generates 1 Jan – 7 Oct 2026 for Jordan
Lee ($75,000/yr, biweekly Acme Inc. payroll into PayPal), matching the Clean
design in `design/clean`: the same recent transactions (Thistle, Ember Roast,
Plateful, Corevale, Hopline, Parkside Apartments rent, Sonora, Brightgrid Energy, Greenfold,
Lilia, an unrecognised "SQ *COPPER PEAK" charge to review), the same bills
(Parkside Apartments, Brightgrid Energy, Tidyloop) and subscriptions (Kitebird+, Vantage, Parlo,
Pixelforge, Sable, Frameline, Forge Fitness, Reelhouse Premium, Cinebox, Sonora), the
same PayPal Offers (one pending, one earned), and monthly category totals that
match the design's Insights page. Every transaction carries a reconciled running
balance (closing at $2,033.90), so the assistant and the guardrail can check
numbers exactly.
