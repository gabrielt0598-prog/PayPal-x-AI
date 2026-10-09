# PayPal × AI — Personal Finance

A closed-loop personal finance app for someone who lives entirely on their
**PayPal balance and PayPal Debit Card**. A dark, Revolut-Business-inspired UI
(the "Clean" design in [`design/`](design/README.md)) with a docked side panel
and a **PayPal AI** drawer (⌘K) that sits next to the page. Ask about
spending, categorise transactions, cancel subscriptions and apply PayPal offers
while the page you're looking at stays visible — without the assistant ever
inventing a number.

Pages: Home, Transactions, Recurring, Essentials, Offers, Rewards, Insights and
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
| UI | Clean design system: Tailwind tokens + SVG charts (`src/components/clean/`) |
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
| **Kernel** | Runs a cloud browser with a saved profile to cancel subscriptions on merchant sites that aren't billed through PayPal (Netflix, Max, …) | `KERNEL_API_KEY`, `KERNEL_PROFILE_NAME` | `src/lib/services/kernel.ts` |
| **Zapier** | Fires an external notification when the balance drops below the auto-reload threshold | `ZAPIER_WEBHOOK_URL` | `src/lib/services/zapier.ts` |
| **Claude** | The assistant: tool-using agent over the user's data | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `src/lib/agent/` |

Detailed setup for each: [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md).

### PayPal SDK context plugin

PayPal ships skills that teach Claude Code how to use the APIMatic SDK. Install
them on your machine with:

```bash
npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview
```

## Project layout

```
src/
  app/
    page.tsx                 the app (CleanApp)
    api/state                GET snapshot / DELETE reset (demo store)
    api/agent                POST chat → Claude tool loop → Jev guardrail
    api/{paypal,jev,kernel,zapier,memory,demo,integrations}/…
    api/demo/move-money      Add money / Transfer / rewards cash-out / Store Sync reorder
  components/
    clean/                   Clean design: side panel, pages, charts, UI primitives
    assistant/               PayPal AI drawer (⌘K), citations, action cards
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

`src/lib/mock-data.ts` deterministically generates three months
(8 Jul – 7 Oct 2026) for Jordan Lee ($75,000/yr, biweekly direct deposit into
PayPal): rent, utilities, pay-per-ride transit, 14 subscriptions (Claude Pro,
Netflix, Disney+, Max, Spotify, YouTube Premium, Mobbin, Notion, Figma,
1Password, iCloud+, Duolingo, Lightroom, Planet Fitness), everyday card spend,
PayPal offers and an auto-reload. Every transaction carries a reconciled running
balance, so the assistant and the guardrail can check numbers exactly.
