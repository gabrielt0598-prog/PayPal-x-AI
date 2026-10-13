"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useFinance } from "@/components/state/AppProviders";
import { REWARD_CATS, useClean } from "../AppState";
import { ymOf } from "../data";
import { Btn, Card, cx, GRID4, money, Page, Pill, Section, shortDate, TableHead } from "../ui";

const AMOUNTS = [500, 1000, "all"] as const;

export function RewardsPage() {
  const { state } = useFinance();
  const { rewards } = useClean();
  const [mode, setMode] = useState<"cash" | "credit">("cash");
  const [amt, setAmt] = useState<(typeof AMOUNTS)[number]>(1000);
  const [busy, setBusy] = useState(false);
  const n = amt === "all" ? rewards.pts : Math.min(amt, rewards.pts);
  const ym = state ? ymOf(state.asOf) : "2026-10";
  const catSpend = (c: string) => state?.transactions.filter((t) => t.amount < 0 && t.category === c && ymOf(t.date) === ym).reduce((a, t) => a - t.amount, 0) ?? 0;
  const spend = catSpend(rewards.cat);
  const capped = Math.min(spend, 1000);

  return (
    <Page title="Rewards">
      <div className="grid grid-cols-1 items-stretch gap-[var(--sec-gap,32px)] @3xl:grid-cols-2">
        <Section title="Your points">
          <Card className="flex-1">
            <div className="flex flex-col gap-1">
              <span className="num text-[40px] font-semibold leading-tight tracking-tight">
                {rewards.pts.toLocaleString("en-US")} <span className="text-lg font-medium text-muted">pts</span>
              </span>
              <span className="text-sm text-muted">Worth {money(rewards.pts / 100)} · 100 points = $1</span>
            </div>
            <span className="text-[13px] text-muted">Earned from this month’s 5% category and offer bonuses.</span>
            <div className="h-px bg-border" />
            <span className="text-[13px] font-semibold">Redeem as</span>
            <div role="radiogroup" aria-label="Redeem as" className="grid grid-cols-2 gap-2">
              {(
                [
                  ["cash", "Cash back", "To your PayPal balance"],
                  ["credit", "Shopping credit", "On your next PayPal checkout"],
                ] as const
              ).map(([id, label, sub]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  onClick={() => setMode(id)}
                  className={cx("flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-3 text-left", mode === id ? "border-accent bg-accent-bg" : "border-border-strong")}
                >
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-xs text-faint">{sub}</span>
                </button>
              ))}
            </div>
            <span className="text-[13px] font-semibold">Points</span>
            <div role="radiogroup" aria-label="Points to redeem" className="flex flex-wrap gap-2">
              {AMOUNTS.map((a) => (
                <Btn key={a} small role="radio" aria-checked={amt === a} kind={amt === a ? "primary" : "secondary"} onClick={() => setAmt(a)}>
                  {a === "all" ? `All · ${rewards.pts.toLocaleString("en-US")}` : a.toLocaleString("en-US")}
                </Btn>
              ))}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
              <span className="flex-1 text-sm text-muted">{n ? `${n.toLocaleString("en-US")} pts → ${money(n / 100)} ${mode === "cash" ? "added to your balance" : "off your next checkout"}` : "No points ready to redeem"}</span>
              <Btn
                kind="primary"
                disabled={!n || busy}
                onClick={async () => {
                  setBusy(true);
                  await rewards.redeem(mode, n);
                  if (amt === "all") setAmt(1000);
                  setBusy(false);
                }}
              >
                Redeem {n ? money(n / 100) : ""}
              </Btn>
            </div>
          </Card>
        </Section>

        <Section title={`5% category · ${new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(`${ym}-15`))}`}>
          <Card className="flex-1">
            <span className="text-sm leading-normal text-muted">Pick one category a month. Debit Card purchases there earn 5% back as points, on up to $1,000 of spend.</span>
            <div role="radiogroup" aria-label="Category" className="grid grid-cols-2 gap-2">
              {REWARD_CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={rewards.cat === c}
                  onClick={() => rewards.setCat(c)}
                  className={cx("flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-left text-sm font-medium", rewards.cat === c ? "border-accent bg-accent-bg" : "border-border-strong")}
                >
                  <span className="flex-1">{c}</span>
                  {rewards.cat === c && <Check size={14} className="text-accent" />}
                </button>
              ))}
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="num text-[22px] font-semibold">{money(spend)}</span>
                <span className="flex-1 text-[13px] text-faint">of $1,000 spent on {rewards.cat.toLowerCase()}</span>
                <span className="num text-[13px] font-semibold">{Math.round(capped * 5).toLocaleString("en-US")} pts</span>
              </div>
              <div className="h-2 rounded-full bg-surface-3">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(1, capped / 10)}%` }} />
              </div>
              <span className="text-xs text-faint">{spend ? "Earned so far this month" : `No ${rewards.cat.toLowerCase()} purchases yet this month`}</span>
            </div>
          </Card>
        </Section>
      </div>

      <Section title="Activity">
        <Card flush>
          <TableHead cols={["Activity", "Date", "Status", "Points"]} />
          {rewards.log.slice(0, 8).map((r, i) => (
            <div key={i} role="row" className={cx(GRID4, "py-[13px] text-left", i && "border-t border-border")}>
              <span className="truncate text-left text-[15px]">{r.label}</span>
              <span className="text-left text-sm text-muted">{shortDate(r.date)}</span>
              <span className="text-left">
                <Pill tone={r.status === "Earned" ? "pos" : "neu"}>{r.status}</Pill>
              </span>
              <span className={cx("num whitespace-nowrap text-left text-[15px]", r.pts > 0 ? "text-positive" : "text-text")}>
                {r.pts > 0 ? "+" : "−"}
                {Math.abs(r.pts).toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </Card>
      </Section>
      <p className="text-xs leading-normal text-faint">Points expire if you earn fewer than 10 points, or make fewer than 3 eligible PayPal transactions, in any 365 days.</p>
    </Page>
  );
}
