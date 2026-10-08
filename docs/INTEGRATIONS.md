# Integrations

Every integration runs in **live** mode when its key is set in `.env.local`, otherwise in a local **mock** mode, so the demo always works. `GET /api/integrations/status` reports which is which (no secrets). All service code is server-only in `src/lib/services/`.

```bash
cp .env.example .env.local   # then fill in what you have
```

| Service | Env vars | Mock fallback |
|---|---|---|
| TypeSafe Jev | `TYPESAFE_API_KEY`, `JEV_HALLUCINATION_THRESHOLD` (0.3) | rules for categorise/intent; deterministic guardrail only |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`, `PAYPAL_USE_MOCK` | in-memory store seeded from `mock-data.ts` |
| Zapier | `ZAPIER_WEBHOOK_URL` | logs, returns `delivered: false` |
| Kernel | `KERNEL_API_KEY`, `KERNEL_PROFILE_NAME` | simulated step log |
| Memory | none | always local: `.data/memory.json` |
| Claude | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | handled by the assistant module |

## TypeSafe Jev (`jev.ts`, `guardrail.ts`)

Jev is TypeSafe AI's non-generative decision model: typed questions in, calibrated answers out.

1. Get a key from the TypeSafe console (typesafe.ai), set `TYPESAFE_API_KEY`.
2. Live: `categorizeTransaction` and `classifyIntent` use a `choice` question (confidence = the chosen label's probability). `verifyReply` additionally asks a yes/no (`noul`) question, "does the reply state any figure, date, merchant or transaction not supported by the ground truth?", and blocks above `JEV_HALLUCINATION_THRESHOLD`.
3. Mock: merchant/keyword rules (confidence 0.95 exact merchant, 0.6 keyword, 0.3 default).

**The guardrail's deterministic check always runs first, in both modes.** It extracts every money figure (`$1,650`, `$1,650.00`, `1650 dollars`, `-$9.99`, `$2k`), percentage and `txn_...` id from the reply and requires each to exist in the ground truth (±0.01, or whole-dollar rounding of a ground-truth value; ISO dates and ids are scrubbed from the ground truth so they cannot "launder" a number). Anything else lands in `unsupportedFigures` / `unknownTransactionIds` and the verdict is `block`. Consequence: derived numbers (sums, differences) must be computed by a tool and included in the ground truth, or they will be blocked. A Jev outage degrades to deterministic-only.

```bash
curl -s localhost:3000/api/jev/categorize -H 'content-type: application/json' \
  -d '{"merchant":"Starbucks","description":"Coffee","amount":-5.75}'
curl -s localhost:3000/api/jev/verify -H 'content-type: application/json' \
  -d '{"reply":"Your balance is $123.45","groundTruth":"{\"balance\":1650}"}'
# -> {"verdict":"block","unsupportedFigures":["$123.45"],...}
```

## PayPal (`paypal.ts`)

APIMatic-generated `@paypal/paypal-server-sdk` 2.5.0. This file is the only place it is used.

1. Create a REST app at developer.paypal.com > Apps & Credentials (Sandbox). Enable **Transaction Search** (and Subscriptions) under the app's features. Copy Client ID and Secret.
2. Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT=sandbox`, and **`PAYPAL_USE_MOCK=false`**. Live mode needs both the flag and the credentials.
3. Live: `TransactionSearchController.searchTransactions` (31-day windows, mapping documented at the top of `paypal.ts`), `searchBalances`, `SubscriptionsController.listSubscriptions` and `cancelSubscription`. Any SDK failure is logged and degrades to the store (or `{ ok: false, error }` for cancellation).
4. Cancelling by a PayPal subscription id (`I-...`) calls the Subscriptions API. Cancelling a demo id such as `sub_disney` only updates the store (response `channel: "local_store"`).

```bash
curl -s 'localhost:3000/api/paypal/transactions?from=2026-09-01&to=2026-10-07'
curl -s localhost:3000/api/paypal/balance
curl -s -X POST localhost:3000/api/paypal/subscriptions/sub_disney/cancel \
  -H 'content-type: application/json' -d '{"reason":"Not using it"}'
```

## Zapier (`zapier.ts`)

1. In Zapier create a Zap: trigger **Webhooks by Zapier > Catch Hook**. Copy the hook URL into `ZAPIER_WEBHOOK_URL` (https only; it is never logged or returned).
2. Fire a test (below), then in the Zap pick the sample request and add an action: push (Pushover/Slack), SMS, or Gmail/Email using `{{message}}`, `{{balance}}`, `{{threshold}}`.
3. Payload: `event: "paypal.balance.below_auto_reload_threshold"`, a human `message`, plus the `LowBalanceAlert` fields (`userId, userName, balance, threshold, reloadAmount, fundingSource, triggeredBy, occurredAt`).
4. Delivery: 5 s timeout, one retry, identical alerts deduped for 10 minutes (the manual test route bypasses dedupe).

```bash
curl -s -X POST localhost:3000/api/zapier/low-balance          # manual test with current state
curl -s -X POST localhost:3000/api/demo/simulate-spend -H 'content-type: application/json' \
  -d '{"merchant":"Apple Store","amount":2000}'                 # crosses the $250 threshold -> alert
# -> {"transaction":{...},"balanceBefore":...,"balanceAfter":...,"crossedBelowThreshold":true,"zapier":{"delivered":true,...}}
```

Reset the demo balance with `curl -X DELETE localhost:3000/api/state`.

## Kernel (`kernel.ts`)

Cloud browsers for cancelling subscriptions that have no PayPal API (Netflix, Max, YouTube Premium, Claude Pro, Mobbin, Figma, iCloud+, Adobe, Planet Fitness).

1. Get an API key at onkernel.com, set `KERNEL_API_KEY`.
2. Create a persistent profile and log in once: with the Kernel CLI/dashboard, start a browser with `profile: { name: "pfm-demo", save_changes: true }`, open its live view, sign in to each merchant, then end the session so logins are saved. Set `KERNEL_PROFILE_NAME` to that name.
3. Live: creates a stealth browser with that profile, runs Playwright inside the VM to open the merchant's account page (`MERCHANT_URLS` in `kernel.ts`, best-effort URLs), and:
   - login wall detected -> `needs_login` (browser kept open so you can sign in via `liveViewUrl`);
   - otherwise clicks at most one non-final "cancel/manage" entry and **stops before the final confirm** -> `awaiting_confirmation` with `liveViewUrl` for the human to finish. It never reports `completed` unless it truly confirmed (currently it never auto-confirms);
   - failures delete the browser; kept-open browsers are reaped by a 5-minute inactivity timeout.
4. Mock: `status: "simulated"` with a realistic step log. The store marks the subscription cancelled for `simulated`/`completed`.

```bash
curl -s -X POST localhost:3000/api/kernel/cancel -H 'content-type: application/json' -d '{"recurringId":"sub_netflix"}'
```

## Memory (`memory.ts`)

Local JSON file `.data/memory.json` (git-ignored) plus an in-process cache; survives dev-server restarts. Keys are normalised to snake_case. Kernel is not used for memory.

```bash
curl -s -X POST localhost:3000/api/memory -H 'content-type: application/json' \
  -d '{"sessionId":"demo","key":"Monthly Salary","value":"$4,800"}'
curl -s 'localhost:3000/api/memory?sessionId=demo'
curl -s -X DELETE 'localhost:3000/api/memory?sessionId=demo&key=monthly_salary'
```

## Status

```bash
curl -s localhost:3000/api/integrations/status
# {"anthropic":"mock","jev":"mock","paypal":"mock","zapier":"mock","kernel":"mock","memory":"live"}
```
