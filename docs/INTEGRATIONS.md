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
| Kernel | `KERNEL_API_KEY`, `KERNEL_TARGET` (sandbox), `PUBLIC_BASE_URL`, `KERNEL_PROFILE_NAME` | simulated step log + link to the local sandbox page |
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
  -d '{"merchant":"Ember Roast","description":"Coffee","amount":-5.75}'
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
  -d '{"merchant":"Voltway","amount":2000}'                 # crosses the $250 threshold -> alert
# -> {"transaction":{...},"balanceBefore":...,"balanceAfter":...,"crossedBelowThreshold":true,"zapier":{"delivered":true,...}}
```

Reset the demo balance with `curl -X DELETE localhost:3000/api/state`.

## Kernel (`kernel.ts`, `merchant-sites.ts`)

Cloud browsers for cancelling subscriptions that have no PayPal API (Cinebox, Vantage, Reelhouse Premium, Sable, Lumenshot, Frameline, Skyvault+, Pixelforge, Forge Fitness).

### Targets (`KERNEL_TARGET`)

- **`sandbox` (default)**: the demo subscriptions are fake, and automating real merchant sites would be pointless (nothing to cancel) and against their terms of service. So Kernel cancels them on our own look-alike **sandbox merchant** pages (`merchant-sites.ts`, also served at `/demo-merchant/<recurringId>?step=account|cancel|confirm|cancelled`). Each page carries a "Sandbox merchant · PayPal × AI demo, not the real X site" banner and uses text names only.
- **`real`**: the original path. Saved profile `KERNEL_PROFILE_NAME`, real merchant URLs (`MERCHANT_URLS`, best effort). It clicks at most one non-final "cancel/manage" entry and **stops before the final irreversible click** (`awaiting_confirmation`, human finishes via `liveViewUrl`); login wall -> `needs_login`. It never auto-confirms.

### Sandbox run (live: `KERNEL_API_KEY` set)

1. `browsers.create` (stealth; profile attached only if `KERNEL_PROFILE_NAME` is set), then `browsers.replays.start` records a video.
2. ONE `browsers.playwright.execute` script (`CANCEL_FLOW_SOURCE`): loads the sandbox page, then really clicks **Cancel membership -> Continue to cancel -> Confirm cancellation** with Playwright locators (about 1s pauses so live view / replay are watchable), waits for "Your membership is cancelled. You'll keep access until <date>.", reads the confirmation number and takes a small JPEG screenshot.
   - No `PUBLIC_BASE_URL`: the HTML is generated server-side and injected with `page.setContent(html)` (Kernel's cloud browser cannot reach `localhost`).
   - `PUBLIC_BASE_URL` set (e.g. `ngrok http 3000` / `cloudflared tunnel --url http://localhost:3000`): the browser does `page.goto(PUBLIC_BASE_URL + /demo-merchant/<id>)` so the address bar shows a real URL.
3. `replays.stop` + `replays.list` give `replayUrl`; `liveViewUrl` is kept. The browser is deleted after `KERNEL_CLEANUP_GRACE_S` (default 90s) so the links stay watchable; the inactivity timeout (grace + 120s) is the backstop. Never leaks browsers.
4. Result: `status: "completed"` only if the cancelled text was found, else `failed`. Extra fields: `replayUrl`, `screenshotDataUrl`, `confirmationNumber`, `previewUrl`, `target`. The chat card shows "Cancelled by Kernel" with the screenshot, confirmation, "Watch replay", "Live view" and "Open sandbox page".

### Mock (no `KERNEL_API_KEY`)

`status: "simulated"` with a realistic step log and `previewUrl` = local `/demo-merchant/<id>?step=cancelled` (the UI labels it "Simulated (add KERNEL_API_KEY to run in a real Kernel browser)"). The store marks the subscription cancelled for `simulated`/`completed`.

```bash
# open the fake merchant by hand: http://localhost:3000/demo-merchant/sub_netflix
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
