"use client";

// Transfer = send money from your PayPal balance to another person (peer to peer), not to a bank.
// Shared by Home's balance card and the Wallet page. The people are fictional contacts.

import { useState } from "react";
import { Avatar, Btn, cx, Modal, money } from "./ui";

export const PEERS = ["Maya Chen", "Dev Patel", "Sam Rivera", "Lena Okafor", "Noah Brooks"] as const;

export function TransferModal({ balance, onClose, onConfirm }: { balance: number; onClose: () => void; onConfirm: (peer: string, amount: number, note: string) => Promise<void> }) {
  const [peer, setPeer] = useState<string>(PEERS[0]);
  const [n, setN] = useState(100);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const first = peer.split(" ")[0];
  return (
    <Modal label="Transfer to a person" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-faint">To</span>
        <div role="radiogroup" aria-label="Send to" className="flex flex-wrap gap-2">
          {PEERS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === peer}
              onClick={() => setPeer(p)}
              className={cx("flex h-10 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-[13px] font-medium", p === peer ? "border-white bg-white text-[#0a0a0a]" : "border-border-strong text-muted hover:text-text")}
            >
              <Avatar name={p} size={28} className={p === peer ? "!bg-black/10" : ""} />
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-faint">Amount</span>
        <span className="num text-[40px] font-semibold tracking-tight">{money(n)}</span>
      </div>
      <div role="group" aria-label="Amount" className="flex flex-wrap gap-2">
        {[10, 25, 50, 100].map((c) => (
          <Btn key={c} small kind={c === n ? "primary" : "secondary"} aria-pressed={c === n} onClick={() => setN(c)}>
            ${c}
          </Btn>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 60))}
        placeholder="Add a note (optional)"
        aria-label="Note"
        className="h-11 rounded-xl border border-border-strong bg-surface-2 px-3.5 text-sm outline-none placeholder:text-faint focus:border-accent/60"
      />
      <div className="rounded-xl bg-surface-2 px-3.5">
        <div className="flex py-3 text-[13px]">
          <span className="flex-1 text-muted">From</span>
          <span className="font-medium">PayPal balance · {money(balance)}</span>
        </div>
        <div className="flex border-t border-border py-3 text-[13px]">
          <span className="flex-1 text-muted">Arrives</span>
          <span className="font-medium">Instantly · free</span>
        </div>
        <div className="flex border-t border-border py-3 text-[13px]">
          <span className="flex-1 text-muted">Balance after</span>
          <span className="num font-medium">{money(balance - n)}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn
          kind="primary"
          disabled={busy || n > balance}
          onClick={async () => {
            setBusy(true);
            await onConfirm(peer, n, note.trim());
          }}
        >
          Transfer {money(n)} to {first}
        </Btn>
      </div>
    </Modal>
  );
}
