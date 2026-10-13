"use client";

// Cancel flow for a subscription: confirm dialog -> live cloud-browser run (step rail with timings)
// -> the caller closes the side panel and shows a success toast with Undo.
// The run calls the real endpoints: POST /api/kernel/cancel for merchant-site (Kernel) subscriptions,
// POST /api/paypal/subscriptions/:id/cancel for PayPal-billed ones.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import type { BrowserCancellationResult } from "@/lib/services/contracts";
import type { RecurringPayment } from "@/lib/types";
import { Avatar, Btn, cx, KV, Modal, money, Panel, Pill, shortDate } from "../ui";

const STEP_MS = 850;

const isKernel = (r: RecurringPayment) => r.cancelChannel === "kernel_browser";
export const domainOf = (r: RecurringPayment) => `${r.merchant.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;

export function stepLabels(r: RecurringPayment) {
  return isKernel(r)
    ? ["Launched secure cloud browser", `Opened ${r.merchant} account page`, `Found “${r.plan}” membership`, "Clicked “Cancel membership”", "Declined retention offer", "Confirmed cancellation", "Saved screenshot and replay"]
    : ["Connected to PayPal Subscriptions", `Found your ${r.merchant} agreement`, "Sent the cancellation request", "Confirmed it with PayPal"];
}

function pageLabels(r: RecurringPayment) {
  return ["Account · " + r.plan, "Account · " + r.plan, "Membership · " + r.plan, "Are you sure you want to cancel?", "Wait! 50% off for 3 months?", "Confirm cancellation", "Your membership is cancelled"];
}

export interface RunState {
  r: RecurringPayment;
  step: number;
  /** ms since the run started at which each step began. */
  marks: number[];
  status: "running" | "done" | "error";
  elapsed?: number;
  message?: string;
  conf?: string;
  liveViewUrl?: string;
  replayUrl?: string;
}

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function useCancelRun(onDone: (r: RecurringPayment, conf?: string) => void) {
  const { refresh } = useFinance();
  const [run, setRun] = useState<RunState | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      stopTimer();
      abort.current?.abort();
    },
    [],
  );

  const start = useCallback(
    async (r: RecurringPayment) => {
      stopTimer();
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      const total = stepLabels(r).length;
      const t0 = performance.now();
      setRun({ r, step: 0, marks: [0], status: "running" });
      timer.current = setInterval(() => {
        setRun((c) => (c && c.status === "running" && c.step < total - 1 ? { ...c, step: c.step + 1, marks: [...c.marks, performance.now() - t0] } : c));
      }, STEP_MS);

      const fail = (message: string, extra?: Partial<RunState>) => {
        stopTimer();
        setRun((c) => (c ? { ...c, status: "error", message, ...extra } : c));
      };
      try {
        const kernel = isKernel(r);
        const res = await fetch(kernel ? "/api/kernel/cancel" : `/api/paypal/subscriptions/${encodeURIComponent(r.id)}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kernel ? { recurringId: r.id } : { reason: "Cancelled by user" }),
          signal: ctrl.signal,
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string; result?: BrowserCancellationResult; ok?: boolean };
        // 409 = the store already has it cancelled (e.g. after an Undo): treat the run as finished.
        const ok = res.status === 409 || (res.ok && (kernel ? json.result?.status === "completed" || json.result?.status === "simulated" : json.ok !== false));
        if (!ok) {
          const m = json.result?.message ?? json.error ?? "The cancellation could not be completed.";
          return fail(m, { liveViewUrl: json.result?.liveViewUrl, replayUrl: json.result?.replayUrl });
        }
        stopTimer();
        const elapsed = performance.now() - t0;
        const conf = json.result?.confirmationNumber;
        setRun((c) => (c ? { ...c, step: total, marks: Array.from({ length: total }, (_, i) => c.marks[i] ?? elapsed), status: "done", elapsed, conf, replayUrl: json.result?.replayUrl } : c));
        await refresh();
        setTimeout(() => {
          setRun(null);
          onDone(r, conf);
        }, 1100);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        fail(e instanceof Error ? e.message : "Network error");
      }
    },
    [refresh, onDone],
  );

  const stop = useCallback(() => {
    stopTimer();
    abort.current?.abort();
    setRun(null);
    void refresh();
  }, [refresh]);

  return { run, start, stop, clear: () => setRun(null) };
}

export function ConfirmCancel({ r, onKeep, onConfirm }: { r: RecurringPayment; onKeep: () => void; onConfirm: () => void }) {
  return (
    <Modal label={`Cancel ${r.merchant}?`} onClose={onKeep}>
      <Panel>
        <KV first k="Access ends" v={shortDate(r.nextChargeDate)} />
        <KV k="No longer charged" v={`${money(r.amount)}/mo · ${money(r.amount * 12)}/yr`} />
      </Panel>
      <p className="text-[13px] leading-normal text-muted">
        {isKernel(r)
          ? `Kernel will open ${domainOf(r)} in a secure cloud browser, cancel the membership, decline any retention offer and save a screenshot for your records.`
          : `This cancels ${r.merchant} through the PayPal Subscriptions API. You can resubscribe from the undo prompt right after.`}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Btn onClick={onKeep}>Keep {r.merchant}</Btn>
        <Btn className="!bg-[#c93a3a] !text-white hover:!bg-[#b23333]" onClick={onConfirm}>
          Cancel subscription
        </Btn>
      </div>
    </Modal>
  );
}

/** Drawer body while a cancellation is running: browser preview + step rail with timings. */
export function RunPanel({ run, onStop, onClose }: { run: RunState; onStop: () => void; onClose: () => void }) {
  const { r, step, marks, status } = run;
  const labels = stepLabels(r);
  const kernel = isKernel(r);
  const pages = pageLabels(r);
  const done = status === "done";
  const err = status === "error";
  return (
    <>
      <div className="flex items-center gap-2.5">
        <Avatar name={r.merchant} size={34} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-lg font-semibold leading-tight">{done ? `${r.merchant} cancelled` : err ? "Couldn’t finish" : `Cancelling ${r.merchant}…`}</h2>
          <span className="text-xs text-faint">{kernel ? "Kernel secure cloud browser" : "PayPal Subscriptions"}</span>
        </div>
        <Pill tone={done ? "pos" : err ? "warn" : "neg"}>{done ? "Completed" : err ? "Needs you" : "● Live"}</Pill>
      </div>

      {kernel && (
        <figure aria-label="Live browser preview" className="overflow-hidden rounded-xl border border-border-strong bg-surface-2">
          <div className="flex px-3 py-2">
            <span className="flex-1 truncate rounded-[10px] border border-border bg-surface px-2.5 py-1 font-mono text-xs text-muted">
              {domainOf(r)}
              {step >= 6 ? "/account/cancelled" : "/account/membership"}
            </span>
          </div>
          <div className="flex h-[200px] flex-col items-center justify-center gap-2 border-t border-border bg-white px-5 text-center text-black">
            <span className="text-xs font-medium text-[#555]">{r.merchant} · sandbox merchant</span>
            <span className="text-[17px] font-semibold">{pages[Math.min(step, 6)]}</span>
            <span className="text-xs font-medium text-[#0062c4]">{done ? (run.conf ? `Confirmation ${run.conf}` : "Cancelled") : `Kernel: ${labels[Math.min(step, labels.length - 1)]}`}</span>
          </div>
        </figure>
      )}

      <ol aria-label="Steps" aria-live="polite" className="m-0 list-none rounded-xl bg-surface-2 px-4 py-5">
        {labels.map((label, i) => {
          const complete = i < step || done;
          const now = i === step && status === "running";
          const failed = i === step && err;
          const last = i === labels.length - 1;
          return (
            <li key={label} className="flex items-stretch gap-3.5">
              <span className="flex flex-col items-center self-stretch">
                <span
                  className={cx(
                    "flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    complete ? "bg-positive text-white" : now ? "bg-accent text-white" : failed ? "bg-warning-bg text-warning" : "border border-border-strong text-faint",
                  )}
                >
                  {complete ? <Check size={13} /> : now ? "●" : failed ? "!" : i + 1}
                </span>
                {!last && <span className={cx("mt-1.5 min-h-3 w-0.5 flex-1 rounded-sm", complete && i < step ? "bg-positive" : done ? "bg-positive" : "bg-border-strong")} />}
              </span>
              <span className={cx("flex min-h-[22px] min-w-0 flex-1 items-start gap-3", !last && "pb-5")}>
                <span className={cx("flex-1 text-[13px]", complete ? "text-text" : now ? "font-medium text-text" : "text-faint")}>{label}</span>
                <span className="font-mono text-xs text-faint">{complete ? clock(marks[i + 1] ?? run.elapsed ?? marks[i] ?? 0) : now ? "now" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {err && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-warning-bg px-3.5 py-3 text-xs leading-normal text-warning">
          <span>{run.message}</span>
          {run.liveViewUrl && (
            <a href={run.liveViewUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              Open live view
            </a>
          )}
        </div>
      )}
      <div className="mt-auto flex justify-end gap-2">
        {status === "running" && <Btn onClick={onStop}>Stop</Btn>}
        {err && <Btn onClick={onClose}>Close</Btn>}
      </div>
    </>
  );
}
