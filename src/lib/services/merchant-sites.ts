// Sandbox merchants: fake account / cancellation pages for the mock subscriptions in mock-data.ts.
//
// The subscriptions in this prototype are FAKE, so Kernel cannot (and must not) cancel them on the real merchant
// sites. Instead Kernel drives these self-contained look-alike pages: account -> cancel (retention offer) ->
// confirm -> cancelled. Pages carry a clear "Sandbox merchant" banner, use text names only (no real logos) and
// are pure functions of the RecurringPayment, so the same HTML is served by the Next route
// (src/app/demo-merchant/[recurringId]) and injected into the Kernel browser with page.setContent().
//
// CANCEL_FLOW_SOURCE is the Playwright click-flow. It is a string so it can run inside Kernel's
// playwright.execute (where `page` is in scope) AND locally against a Chromium for tests.

import type { RecurringPayment } from "../types";

export type MerchantStep = "account" | "cancel" | "confirm" | "cancelled";
export const MERCHANT_STEPS: readonly MerchantStep[] = ["account", "cancel", "confirm", "cancelled"];

export interface MerchantPageOptions {
  /**
   * true  = one self-contained document holding all four steps; buttons switch steps client-side (no navigation,
   *         works with page.setContent()).
   * false = only the requested step is rendered and buttons are plain links to `?step=...` (the Next route).
   */
  inline?: boolean;
}

const ACCENTS: Record<string, string> = {
  Netflix: "#e50914",
  Max: "#5822b4",
  "YouTube Premium": "#ff0033",
  Anthropic: "#c96442",
  Mobbin: "#111827",
  Figma: "#a259ff",
  "Apple iCloud+": "#0a84ff",
  Adobe: "#fa0f00",
  "Planet Fitness": "#6b21a8",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function isMerchantStep(v: unknown): v is MerchantStep {
  return typeof v === "string" && (MERCHANT_STEPS as readonly string[]).includes(v);
}

export function merchantAccent(sub: Pick<RecurringPayment, "merchant">): string {
  const known = ACCENTS[sub.merchant];
  if (known) return known;
  let h = 0;
  for (const ch of sub.merchant) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 42%)`;
}

/** Deterministic fake confirmation number, stable per subscription so the page and the Kernel result agree. */
export function confirmationNumber(sub: Pick<RecurringPayment, "id" | "merchant">): string {
  let h = 2166136261;
  for (const ch of `${sub.id}|${sub.merchant}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `CX-${h.toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const money = (n: number) => `$${n.toFixed(2)}`;
const per = (c: RecurringPayment["cycle"]) => (c === "yearly" ? "year" : c === "weekly" ? "week" : "month");

/** Path (relative to the site root) of the sandbox page for a subscription. */
export function merchantPath(recurringId: string, step?: MerchantStep): string {
  return `/demo-merchant/${encodeURIComponent(recurringId)}${step && step !== "account" ? `?step=${step}` : ""}`;
}

const CSS = `
.mp,.mp *{box-sizing:border-box}
.mp{--accent:#111;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f2430;background:#f4f5f7;min-height:100vh;line-height:1.5}
.mp .banner{background:#fff8d6;border-bottom:1px solid #e8d98a;color:#6b5a00;font-size:12px;padding:6px 16px;text-align:center}
.mp header.top{background:#fff;border-bottom:1px solid #e3e5ea;padding:0 24px}
.mp .top-in{max-width:880px;margin:0 auto;height:56px;display:flex;align-items:center;gap:28px}
.mp .mark{font-weight:800;font-size:20px;letter-spacing:-.02em;color:var(--accent)}
.mp nav{display:flex;gap:18px;font-size:14px;color:#5b6270}
.mp nav .on{color:#1f2430;font-weight:600}
.mp .avatar{margin-left:auto;width:30px;height:30px;border-radius:50%;background:var(--accent);opacity:.85}
.mp main{max-width:880px;margin:0 auto;padding:32px 24px 64px}
.mp h1{font-size:28px;margin:0 0 6px;letter-spacing:-.01em}
.mp .sub{color:#5b6270;margin:0 0 24px}
.mp .card{background:#fff;border:1px solid #e3e5ea;border-radius:12px;padding:22px 24px;margin-bottom:16px}
.mp .row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #eef0f3;font-size:15px}
.mp .row:last-of-type{border-bottom:0}
.mp .row span:first-child{color:#5b6270}
.mp .badge{display:inline-block;background:#e6f6ec;color:#1a7f43;border-radius:999px;font-size:12px;font-weight:600;padding:2px 10px}
.mp .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px;align-items:center}
.mp .btn{display:inline-block;cursor:pointer;border:1px solid #c9cdd6;background:#fff;color:#1f2430;border-radius:8px;padding:10px 18px;font:inherit;font-size:15px;font-weight:600;text-decoration:none}
.mp .btn:hover{background:#f4f5f7}
.mp .btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.mp .btn.primary:hover{filter:brightness(.92);background:var(--accent)}
.mp .btn.danger{background:#b42318;border-color:#b42318;color:#fff}
.mp .btn.danger:hover{background:#9a1d14}
.mp .link{color:#5b6270;font-size:14px;text-decoration:underline;cursor:pointer}
.mp .offer{border:2px dashed var(--accent);border-radius:12px;padding:20px 24px;background:#fff}
.mp .offer b{color:var(--accent)}
.mp .ok{width:56px;height:56px;border-radius:50%;background:#e6f6ec;color:#1a7f43;display:flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:14px}
.mp .conf{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:18px;font-weight:700;letter-spacing:.04em}
.mp footer{max-width:880px;margin:0 auto;padding:0 24px 32px;color:#8a909c;font-size:12px}
.mp [hidden]{display:none!important}
`;

interface Ctx {
  sub: RecurringPayment;
  inline: boolean;
}

function nav(c: Ctx, step: MerchantStep, label: string, cls: string, action: string, attrs = "") {
  const href = c.inline ? "#" : `?step=${step}`;
  return `<a class="${cls}" role="button" href="${href}" data-go="${step}" data-action="${action}"${attrs}>${esc(label)}</a>`;
}

function section(c: Ctx, step: MerchantStep): string {
  const { sub } = c;
  const m = esc(sub.merchant);
  const plan = esc(sub.plan);
  const price = `${money(sub.amount)} / ${per(sub.cycle)}`;
  const next = esc(fmtDate(sub.nextChargeDate));
  switch (step) {
    case "account":
      return `<section data-step="account">
<h1>Account</h1><p class="sub">Manage your ${m} membership and billing.</p>
<div class="card" data-role="membership">
<div class="row"><span>Membership</span><span data-role="plan"><b>${plan}</b> <span class="badge">Active</span></span></div>
<div class="row"><span>Price</span><span data-role="price">${esc(price)}</span></div>
<div class="row"><span>Next billing date</span><span data-role="next-billing">${next}</span></div>
<div class="row"><span>Payment method</span><span>PayPal</span></div>
<div class="actions">${nav(c, "cancel", "Cancel membership", "btn", "cancel-membership")}</div>
</div>
</section>`;
    case "cancel":
      return `<section data-step="cancel">
<h1>Before you go&hellip;</h1><p class="sub">We'd hate to see you leave. Here's a one-time offer for your ${plan} plan.</p>
<div class="offer"><p><b>Keep ${plan} for 50% off</b> for the next 3 months &mdash; just ${esc(money(sub.amount / 2))} / ${per(sub.cycle)}.</p>
<div class="actions">${nav(c, "account", "Keep my membership", "btn primary", "keep-membership")}${nav(c, "confirm", "Continue to cancel", "link", "continue-to-cancel")}</div></div>
</section>`;
    case "confirm":
      return `<section data-step="confirm">
<h1>Confirm cancellation</h1><p class="sub">Please review before you cancel.</p>
<div class="card">
<div class="row"><span>Membership</span><span>${plan}</span></div>
<div class="row"><span>Access ends</span><span>${next}</span></div>
<div class="row"><span>Future charges</span><span>None after ${next}</span></div>
<div class="actions">${nav(c, "cancelled", "Confirm cancellation", "btn danger", "confirm-cancellation")}${nav(c, "account", "Never mind", "link", "never-mind")}</div>
</div>
</section>`;
    case "cancelled":
      return `<section data-step="cancelled">
<div class="card"><div class="ok" aria-hidden="true">&#10003;</div>
<h1 data-role="final-text">Your membership is cancelled. You'll keep access until ${next}.</h1>
<p class="sub">We've emailed a receipt. You won't be charged again.</p>
<div class="row"><span>Confirmation number</span><span class="conf" id="confirmation-number" data-role="confirmation">${esc(confirmationNumber(sub))}</span></div>
</div>
</section>`;
  }
}

const INLINE_SCRIPT = `
(function(){
  var root=document.querySelector('.mp');
  root.addEventListener('click',function(e){
    var t=e.target&&e.target.closest?e.target.closest('[data-go]'):null;
    if(!t)return;
    e.preventDefault();
    var next=t.getAttribute('data-go');
    root.querySelectorAll('section[data-step]').forEach(function(s){s.hidden=s.getAttribute('data-step')!==next;});
    window.scrollTo(0,0);
  });
})();`;

export interface MerchantPageParts {
  title: string;
  css: string;
  /** Markup of the `.mp` wrapper (no <html>/<body>). */
  body: string;
  /** Inline-mode only: script that switches steps client-side. */
  script: string;
}

export function merchantPageParts(sub: RecurringPayment, step: MerchantStep, opts: MerchantPageOptions = {}): MerchantPageParts {
  const inline = Boolean(opts.inline);
  const c: Ctx = { sub, inline };
  const m = esc(sub.merchant);
  const sections = inline
    ? MERCHANT_STEPS.map((s) => section(c, s).replace("<section ", s === step ? "<section " : "<section hidden ")).join("\n")
    : section(c, step);
  const body = `<div class="mp" style="--accent:${merchantAccent(sub)}" data-merchant="${esc(sub.id)}">
<div class="banner" data-role="sandbox-banner">Sandbox merchant &middot; PayPal &times; AI demo &mdash; not the real ${m} site</div>
<header class="top"><div class="top-in"><span class="mark">${m}</span><nav><span>Home</span><span class="on">Account</span><span>Help</span></nav><span class="avatar"></span></div></header>
<main>
${sections}
</main>
<footer>Demo page generated by PayPal &times; AI. No real account, charge or merchant is involved.</footer>
</div>`;
  return { title: `${sub.merchant} – Account (sandbox)`, css: CSS, body, script: inline ? INLINE_SCRIPT : "" };
}

/** A complete, self-contained HTML document (inline CSS/JS, no external assets). */
export function renderMerchantPage(sub: RecurringPayment, step: MerchantStep, opts: MerchantPageOptions = {}): string {
  const p = merchantPageParts(sub, step, opts);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title><style>body{margin:0}${p.css}</style></head><body>${p.body}${p.script ? `<script>${p.script}</script>` : ""}</body></html>`;
}

/**
 * Playwright click-flow. Source of a plain async function so it can be shipped to Kernel as a code string
 * (`page` is in scope there) and executed unchanged by local tests. Pass either opts.html (setContent) or
 * opts.url (goto). Returns { confirmation, finalText, screenshot (base64 JPEG), steps, finalUrl, title }.
 * Throws if the cancelled confirmation never appears.
 */
export const CANCEL_FLOW_SOURCE = `
async function runCancelFlow(page, opts) {
  const steps = [];
  const pause = () => page.waitForTimeout(opts.pauseMs || 1000);
  const T = 15000;
  if (opts.url) {
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    steps.push('Opened ' + opts.url);
  } else {
    await page.setContent(opts.html, { waitUntil: 'domcontentloaded' });
    steps.push('Loaded the sandbox merchant account page');
  }
  await page.locator('[data-step="account"]').waitFor({ state: 'visible', timeout: T });
  const plan = (await page.locator('[data-role="plan"]').innerText()).replace(/\\s+/g, ' ').trim();
  const price = (await page.locator('[data-role="price"]').innerText()).trim();
  steps.push('Found membership: ' + plan + ' at ' + price);
  await pause();

  await page.getByRole('button', { name: /^cancel membership$/i }).click({ timeout: T });
  await page.locator('[data-step="cancel"]').waitFor({ state: 'visible', timeout: T });
  steps.push('Clicked "Cancel membership"; the merchant showed a retention offer');
  await pause();

  await page.getByRole('button', { name: /^continue to cancel$/i }).click({ timeout: T });
  await page.locator('[data-step="confirm"]').waitFor({ state: 'visible', timeout: T });
  steps.push('Declined the offer by clicking "Continue to cancel"');
  await pause();

  await page.getByRole('button', { name: /^confirm cancellation$/i }).click({ timeout: T });
  await page.locator('[data-step="cancelled"]').waitFor({ state: 'visible', timeout: T });
  steps.push('Clicked "Confirm cancellation"');
  await page.waitForTimeout(600);

  const finalText = (await page.locator('[data-role="final-text"]').innerText()).replace(/\\s+/g, ' ').trim();
  const confirmation = (await page.locator('#confirmation-number').innerText()).trim();
  if (!/membership is cancelled/i.test(finalText)) throw new Error('Cancelled confirmation text not found: ' + finalText);
  steps.push('Merchant confirmed: "' + finalText + '" (confirmation ' + confirmation + ')');

  const vp = page.viewportSize() || { width: 1280, height: 800 };
  const w = Math.min(vp.width, 1000);
  const clip = { x: Math.max(0, Math.floor((vp.width - w) / 2)), y: 0, width: w, height: Math.min(vp.height, 520) };
  const shot = await page.screenshot({ type: 'jpeg', quality: 60, clip });
  const screenshot = shot.toString('base64');
  await pause();
  return { confirmation, finalText, screenshot, steps, finalUrl: page.url(), title: await page.title() };
}
`;
