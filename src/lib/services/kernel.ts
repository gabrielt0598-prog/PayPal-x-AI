// Kernel (onkernel.com) cloud browsers for subscription cancellations.
//
// Targets (env KERNEL_TARGET):
//   sandbox (default) = the demo subscriptions are FAKE, so Kernel cancels them on our own look-alike "sandbox
//        merchant" pages (merchant-sites.ts). One Playwright script runs in the Kernel VM: load the page (via
//        page.setContent(html) embedded in the script, or page.goto(PUBLIC_BASE_URL/demo-merchant/<id>) when a
//        public tunnel URL is configured), click Cancel membership -> Continue to cancel -> Confirm cancellation,
//        read the confirmation number and take a JPEG screenshot. A Kernel replay (video) records the run.
//        Status "completed" only when the merchant's cancelled text was found.
//   real = old behaviour for real merchant sites: browser with the saved profile KERNEL_PROFILE_NAME, opens the
//        account page, clicks at most ONE non-final entry point and STOPS before the irreversible final click
//        ("awaiting_confirmation"); the user finishes through liveViewUrl. Never auto-confirms.
// mock = no KERNEL_API_KEY -> status "simulated" with a realistic step log and a previewUrl to the local sandbox page.
//
// SDK calls used (@onkernel/sdk 0.121.0):
//   new Kernel({ apiKey, timeout, maxRetries })
//   client.browsers.create({ stealth, headless, timeout_seconds, profile? }) -> { session_id, browser_live_view_url }
//   client.browsers.replays.start(session_id) -> { replay_id, replay_view_url? }
//   client.browsers.playwright.execute(session_id, { code, timeout_sec }) -> { success, result, error, stdout }
//   client.browsers.replays.stop(replay_id, { id_or_name: session_id }) -> void
//   client.browsers.replays.list(session_id) -> [{ replay_id, replay_view_url?, ... }]
//   client.browsers.deleteByID(session_id)
//
// Cleanup: sandbox browsers are deleted after a short grace period (KERNEL_CLEANUP_GRACE_S, default 90s) so the
// live view / replay stays watchable; the inactivity timeout (grace + 60s) reaps them even if the process dies.
// Real-target runs that need a human (login wall / final confirm) are left open for KEEP_ALIVE_S.

import Kernel from "@onkernel/sdk";
import type { RecurringPayment } from "../types";
import type { BrowserCancellationResult, KernelService, ServiceMode } from "./contracts";
import { CANCEL_FLOW_SOURCE, confirmationNumber, merchantPath, renderMerchantPage } from "./merchant-sites";

const KEEP_ALIVE_S = 300;
const NAV_TIMEOUT_S = 75;

/** Merchant account / cancellation pages (best effort; the live page may redirect through login). */
export const MERCHANT_URLS: Record<string, string> = {
  Cinebox: "https://www.cinebox.com/cancelplan",
  Vantage: "https://www.vantage.tv/account/subscription",
  "Reelhouse Premium": "https://www.reelhouse.tv/account/memberships",
  Sable: "https://sable.app/settings/billing",
  Lumenshot: "https://lumenshot.app/settings/billing",
  Frameline: "https://www.frameline.app/settings",
  "Skyvault+": "https://account.skyvault.app/account/manage",
  Pixelforge: "https://account.pixelforge.com/plans",
  "Forge Fitness": "https://www.forgefit.com/my-account",
};

export function kernelMode(): ServiceMode {
  return process.env.KERNEL_API_KEY?.trim() ? "live" : "mock";
}

function errMsg(err: unknown) {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

export function kernelTarget(): "sandbox" | "real" {
  return process.env.KERNEL_TARGET?.trim().toLowerCase() === "real" ? "real" : "sandbox";
}

/** Base URL of a publicly reachable deployment/tunnel (optional); the sandbox page is then opened by URL. */
function publicBaseUrl(): string | undefined {
  const v = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return v && /^https?:\/\//i.test(v) ? v : undefined;
}

function simulated(sub: RecurringPayment, why?: string): BrowserCancellationResult {
  if (kernelTarget() === "real") return simulatedReal(sub, why);
  const base = publicBaseUrl();
  const previewUrl = `${base ?? ""}${merchantPath(sub.id, "cancelled")}`;
  return {
    status: "simulated",
    mode: "mock",
    target: "sandbox",
    previewUrl,
    confirmationNumber: confirmationNumber(sub),
    steps: [
      why ?? "Kernel is in mock mode (no KERNEL_API_KEY); no cloud browser was started",
      "Launched cloud browser (simulated)",
      `Opened the sandbox ${sub.merchant} account page (simulated)`,
      `Found ${sub.plan} (${sub.merchant}) membership`,
      'Clicked "Cancel membership", then "Continue to cancel" past the retention offer (simulated)',
      'Clicked "Confirm cancellation" (simulated)',
      `Sandbox merchant shows "Your membership is cancelled" (confirmation ${confirmationNumber(sub)}, simulated)`,
      `Cancellation of ${sub.merchant} recorded locally`,
    ],
  };
}

function simulatedReal(sub: RecurringPayment, why?: string): BrowserCancellationResult {
  const url = MERCHANT_URLS[sub.merchant];
  const host = url ? new URL(url).host : `${sub.merchant.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;
  return {
    status: "simulated",
    mode: "mock",
    target: "real",
    previewUrl: merchantPath(sub.id, "cancelled"),
    steps: [
      why ?? "Kernel is in mock mode (no KERNEL_API_KEY); nothing was cancelled on the merchant site",
      "Launched cloud browser with saved profile (simulated)",
      `Opened ${host}${url ? new URL(url).pathname : "/account"}`,
      "Detected signed-in session from the saved profile",
      `Found ${sub.plan} (${sub.merchant}) membership`,
      "Clicked Cancel membership",
      "Confirmed cancellation (simulated)",
      `Cancellation of ${sub.merchant} recorded locally`,
    ],
  };
}

/**
 * Runs inside the Kernel browser VM (Playwright `page` is in scope). Navigates, detects a login wall, clicks at
 * most ONE non-final "cancel / manage" entry point and reports whether a final-confirm control is now visible.
 * It never clicks anything that looks like a final confirmation.
 */
function buildScript(target: string): string {
  return `
const target = ${JSON.stringify(target)};
const out = { loginWall: false, clicked: null, confirmVisible: false, finalUrl: null, title: null, notes: [] };
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);
const loginPath = /\\/(log-?in|sign-?in|signin|sign_in|signup|authenticate|auth\\/login|session\\/new|identity|accounts?\\/login)/i;
const hasPassword = (await page.locator('input[type="password"]:visible').count()) > 0;
if (hasPassword || loginPath.test(new URL(page.url()).pathname)) {
  out.loginWall = true;
}
if (!out.loginWall) {
  const FINAL = /(finish|confirm|yes,? cancel|end now|permanently|delete (my )?account|complete cancell)/i;
  const ENTRY = /(cancel (membership|subscription|plan|my)|end membership|cancel$|manage (membership|subscription|plan)|change plan)/i;
  const candidates = page.locator('a:visible, button:visible, [role="button"]:visible');
  const n = Math.min(await candidates.count(), 200);
  for (let i = 0; i < n; i++) {
    const el = candidates.nth(i);
    const label = ((await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || '').trim().replace(/\\s+/g, ' ');
    if (label && label.length < 60 && ENTRY.test(label) && !FINAL.test(label)) {
      out.clicked = label;
      await el.click({ timeout: 8000 }).catch((e) => { out.notes.push('click failed: ' + String(e).slice(0, 120)); out.clicked = null; });
      break;
    }
  }
  if (out.clicked) {
    await page.waitForTimeout(3000);
    const hasPw2 = (await page.locator('input[type="password"]:visible').count()) > 0;
    if (hasPw2 || loginPath.test(new URL(page.url()).pathname)) out.loginWall = true;
    out.confirmVisible = (await page.locator('a:visible, button:visible, [role="button"]:visible').filter({ hasText: FINAL }).count()) > 0;
  }
}
out.finalUrl = page.url();
out.title = await page.title();
return out;
`;
}

interface ScriptResult {
  loginWall?: boolean;
  clicked?: string | null;
  confirmVisible?: boolean;
  finalUrl?: string | null;
  title?: string | null;
  notes?: string[];
}

/** KERNEL_TARGET=real: real merchant site, saved profile, stops before the final irreversible click. */
async function cancelOnRealMerchant(sub: RecurringPayment, apiKey: string): Promise<BrowserCancellationResult> {
  {
    const target = MERCHANT_URLS[sub.merchant];
    if (!target) {
      return { status: "failed", mode: "live", target: "real", steps: [`No known cancellation page for ${sub.merchant}`], message: `No cancellation page is configured for ${sub.merchant}` };
    }

    const profileName = process.env.KERNEL_PROFILE_NAME?.trim() || "pfm-demo";
    const steps: string[] = [];
    let client: Kernel | undefined;
    let sessionId: string | undefined;
    let keepAlive = false;

    try {
      client = new Kernel({ apiKey, timeout: 45_000, maxRetries: 1 });
      const browser = await client.browsers.create({
        profile: { name: profileName, save_changes: true },
        stealth: true,
        headless: false,
        timeout_seconds: KEEP_ALIVE_S,
      });
      sessionId = browser.session_id;
      const liveViewUrl = browser.browser_live_view_url;
      steps.push(`Launched Kernel cloud browser with saved profile "${profileName}"`);

      const exec = await client.browsers.playwright.execute(sessionId, { code: buildScript(target), timeout_sec: NAV_TIMEOUT_S });
      if (!exec.success) {
        steps.push(`Browser automation failed: ${(exec.error ?? "unknown error").slice(0, 200)}`);
        return { status: "failed", mode: "live", target: "real", liveViewUrl, steps, message: "The cloud browser could not complete the navigation" };
      }

      const r = (exec.result ?? {}) as ScriptResult;
      steps.push(`Opened ${new URL(target).host}${new URL(target).pathname}`);
      if (r.loginWall) {
        keepAlive = true;
        steps.push("Hit a login wall: the saved profile has no active session for this merchant");
        return {
          status: "needs_login",
          mode: "live",
          target: "real",
          liveViewUrl,
          steps,
          ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}),
          message: `Sign in to ${sub.merchant} in the live browser (it is saved to profile "${profileName}"), then retry.`,
        };
      }
      steps.push(`Signed in; page: ${r.title ? `"${r.title}"` : (r.finalUrl ?? target)}`);
      if (r.clicked) steps.push(`Clicked "${r.clicked}"`);
      else steps.push("No cancel entry point found automatically; the account page is open for the user");
      if (r.notes?.length) steps.push(...r.notes);
      steps.push("Stopped before the final irreversible confirmation (human-in-the-loop)");
      keepAlive = true;
      return {
        status: "awaiting_confirmation",
        mode: "live",
        target: "real",
        liveViewUrl,
        steps,
        ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}),
        message: `Open the live view to review and press the final confirm button for ${sub.merchant}. The browser stays open for ${Math.round(KEEP_ALIVE_S / 60)} minutes.`,
      };
    } catch (err) {
      console.error("[kernel] cancellation run failed:", errMsg(err));
      steps.push("Kernel request failed; see server logs");
      return { status: "failed", mode: "live", target: "real", steps, message: "Kernel could not run the cancellation" };
    } finally {
      // Clean up unless the user needs the browser (login / final confirm). Inactivity timeout reaps the rest.
      if (sessionId && !keepAlive) {
        try {
          await client?.browsers.deleteByID(sessionId);
        } catch (err) {
          console.error("[kernel] browser cleanup failed:", errMsg(err));
        }
      }
    }
  }
}

interface FlowResult {
  confirmation?: string;
  finalText?: string;
  screenshot?: string;
  steps?: string[];
  finalUrl?: string;
  title?: string;
}

const PAUSE_MS = 1000;
const EXEC_TIMEOUT_S = 90;

function graceSeconds(): number {
  const n = Number(process.env.KERNEL_CLEANUP_GRACE_S);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 600) : 90;
}

/** Delete the browser now, or after the grace period (timer is unref'd; the inactivity timeout is the backstop). */
function scheduleDelete(client: Kernel, sessionId: string, graceS: number) {
  const del = async () => {
    try {
      await client.browsers.deleteByID(sessionId);
    } catch (err) {
      console.error("[kernel] browser cleanup failed:", errMsg(err));
    }
  };
  if (graceS <= 0) return del();
  const t = setTimeout(() => void del(), graceS * 1000);
  t.unref?.();
}

/** KERNEL_TARGET=sandbox: drive the fake merchant site end to end and really click through to "cancelled". */
async function cancelOnSandboxMerchant(sub: RecurringPayment, apiKey: string): Promise<BrowserCancellationResult> {
  const steps: string[] = [];
  const base = publicBaseUrl();
  const pageUrl = base ? `${base}${merchantPath(sub.id)}` : undefined;
  const previewUrl = `${base ?? ""}${merchantPath(sub.id, "cancelled")}`;
  const graceS = graceSeconds();
  const client = new Kernel({ apiKey, timeout: 45_000, maxRetries: 1 });
  let sessionId: string | undefined;
  let replayId: string | undefined;
  let liveViewUrl: string | undefined;
  let replayUrl: string | undefined;

  try {
    // Profile is optional for sandbox merchants: only attach it when KERNEL_PROFILE_NAME is explicitly set.
    const profileName = process.env.KERNEL_PROFILE_NAME?.trim();
    const browser = await client.browsers.create({
      stealth: true,
      headless: false,
      timeout_seconds: graceS + 120,
      ...(profileName ? { profile: { name: profileName, save_changes: false } } : {}),
    });
    sessionId = browser.session_id;
    liveViewUrl = browser.browser_live_view_url;
    steps.push(`Launched Kernel cloud browser (stealth)${profileName ? ` with profile "${profileName}"` : ""}`);

    try {
      const rep = await client.browsers.replays.start(sessionId);
      replayId = rep.replay_id;
      replayUrl = rep.replay_view_url;
      steps.push("Started Kernel replay recording");
    } catch (err) {
      console.error("[kernel] replay start failed:", errMsg(err));
      steps.push("Replay recording unavailable (continuing without it)");
    }

    // ONE execute call: Playwright `page` is in scope; the flow function comes from merchant-sites.ts.
    const opts = pageUrl ? { url: pageUrl, pauseMs: PAUSE_MS } : { html: renderMerchantPage(sub, "account", { inline: true }), pauseMs: PAUSE_MS };
    const code = `${CANCEL_FLOW_SOURCE}\nreturn await runCancelFlow(page, ${JSON.stringify(opts)});`;
    const exec = await client.browsers.playwright.execute(sessionId, { code, timeout_sec: EXEC_TIMEOUT_S }, { timeout: (EXEC_TIMEOUT_S + 15) * 1000 });

    const r = (exec.success ? (exec.result ?? {}) : {}) as FlowResult;
    if (r.steps?.length) steps.push(...r.steps);
    const found = exec.success && /membership is cancelled/i.test(r.finalText ?? "");
    if (!exec.success) steps.push(`Browser automation failed: ${(exec.error ?? "unknown error").slice(0, 200)}`);
    else if (!found) steps.push("The merchant never showed the cancelled confirmation");
    return await finish(found);

    async function finish(ok: boolean): Promise<BrowserCancellationResult> {
      if (sessionId && replayId) {
        try {
          await client.browsers.replays.stop(replayId, { id_or_name: sessionId });
          if (!replayUrl) {
            const list = await client.browsers.replays.list(sessionId);
            replayUrl = list.find((x) => x.replay_id === replayId)?.replay_view_url;
          }
          steps.push(replayUrl ? "Saved Kernel replay" : "Stopped replay recording");
        } catch (err) {
          console.error("[kernel] replay stop/list failed:", errMsg(err));
        }
      }
      return {
        status: ok ? "completed" : "failed",
        mode: "live",
        target: "sandbox",
        steps,
        previewUrl,
        ...(liveViewUrl ? { liveViewUrl } : {}),
        ...(replayUrl ? { replayUrl } : {}),
        ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}),
        ...(ok && r.confirmation ? { confirmationNumber: r.confirmation } : {}),
        ...(ok && r.screenshot ? { screenshotDataUrl: `data:image/jpeg;base64,${r.screenshot}` } : {}),
        ...(ok ? {} : { message: "The sandbox merchant did not confirm the cancellation" }),
      };
    }
  } catch (err) {
    console.error("[kernel] sandbox cancellation failed:", errMsg(err));
    steps.push("Kernel request failed; see server logs");
    return {
      status: "failed",
      mode: "live",
      target: "sandbox",
      steps,
      previewUrl,
      ...(liveViewUrl ? { liveViewUrl } : {}),
      message: "Kernel could not run the cancellation",
    };
  } finally {
    if (sessionId) await scheduleDelete(client, sessionId, graceS);
  }
}

export const kernel: KernelService = {
  async cancelOnMerchantSite(sub): Promise<BrowserCancellationResult> {
    const apiKey = process.env.KERNEL_API_KEY?.trim();
    if (!apiKey) return simulated(sub);
    return kernelTarget() === "real" ? cancelOnRealMerchant(sub, apiKey) : cancelOnSandboxMerchant(sub, apiKey);
  },
};
