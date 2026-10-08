// Kernel (onkernel.com) cloud browsers for merchant-site subscription cancellations.
//
// live = KERNEL_API_KEY set -> create a cloud browser that loads the saved profile KERNEL_PROFILE_NAME
//        (persisted logins, save_changes=true), run Playwright inside the browser VM to open the merchant's
//        account / cancellation page, and STOP before the final irreversible confirm click.
//        The user finishes (or takes over) through the returned liveViewUrl.
// mock = no key -> status "simulated" with a realistic step log.
//
// SDK calls used (@onkernel/sdk 0.121.0):
//   new Kernel({ apiKey, timeout, maxRetries })
//   client.browsers.create({ profile: { name, save_changes }, stealth, timeout_seconds, start_url })
//        -> { session_id, browser_live_view_url, ... }
//   client.browsers.playwright.execute(session_id, { code, timeout_sec }) -> { success, result, error, stdout }
//   client.browsers.deleteByID(session_id)
//
// Human-in-the-loop: a browser that reaches the final confirm step or hits a login wall is deliberately left
// running (inactivity timeout KEEP_ALIVE_S) so the user can take over from the live view. Failed runs are deleted.

import Kernel from "@onkernel/sdk";
import type { RecurringPayment } from "../types";
import type { BrowserCancellationResult, KernelService, ServiceMode } from "./contracts";

const KEEP_ALIVE_S = 300;
const NAV_TIMEOUT_S = 75;

/** Merchant account / cancellation pages (best effort; the live page may redirect through login). */
export const MERCHANT_URLS: Record<string, string> = {
  Netflix: "https://www.netflix.com/cancelplan",
  Max: "https://www.max.com/account/subscription",
  "YouTube Premium": "https://www.youtube.com/paid_memberships",
  Anthropic: "https://claude.ai/settings/billing",
  Mobbin: "https://mobbin.com/settings/billing",
  Figma: "https://www.figma.com/settings",
  "Apple iCloud+": "https://account.apple.com/account/manage",
  Adobe: "https://account.adobe.com/plans",
  "Planet Fitness": "https://www.planetfitness.com/my-account",
};

export function kernelMode(): ServiceMode {
  return process.env.KERNEL_API_KEY?.trim() ? "live" : "mock";
}

function errMsg(err: unknown) {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function simulated(sub: RecurringPayment, why?: string): BrowserCancellationResult {
  const url = MERCHANT_URLS[sub.merchant];
  const host = url ? new URL(url).host : `${sub.merchant.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;
  return {
    status: "simulated",
    mode: "mock",
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

export const kernel: KernelService = {
  async cancelOnMerchantSite(sub): Promise<BrowserCancellationResult> {
    const apiKey = process.env.KERNEL_API_KEY?.trim();
    if (!apiKey) return simulated(sub);

    const target = MERCHANT_URLS[sub.merchant];
    if (!target) {
      return { status: "failed", mode: "live", steps: [`No known cancellation page for ${sub.merchant}`], message: `No cancellation page is configured for ${sub.merchant}` };
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
        return { status: "failed", mode: "live", liveViewUrl, steps, message: "The cloud browser could not complete the navigation" };
      }

      const r = (exec.result ?? {}) as ScriptResult;
      steps.push(`Opened ${new URL(target).host}${new URL(target).pathname}`);
      if (r.loginWall) {
        keepAlive = true;
        steps.push("Hit a login wall: the saved profile has no active session for this merchant");
        return {
          status: "needs_login",
          mode: "live",
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
        liveViewUrl,
        steps,
        ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}),
        message: `Open the live view to review and press the final confirm button for ${sub.merchant}. The browser stays open for ${Math.round(KEEP_ALIVE_S / 60)} minutes.`,
      };
    } catch (err) {
      console.error("[kernel] cancellation run failed:", errMsg(err));
      steps.push("Kernel request failed; see server logs");
      return { status: "failed", mode: "live", steps, message: "Kernel could not run the cancellation" };
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
  },
};
