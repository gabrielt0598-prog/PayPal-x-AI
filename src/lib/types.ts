// Shared domain types for the PayPal x AI PFM prototype.
// Every UI component, agent tool and service adapter speaks in these types,
// so the mock data and the real APIMatic PayPal SDK can be swapped behind them.

export type ISODate = string; // "2026-10-07"
export type ISODateTime = string; // "2026-10-07T14:32:00.000Z"

/** The Clean design's categories, plus Transfers and Cashback for money that isn't spending. */
export const CATEGORIES = [
  "Income",
  "Essential bills",
  "Dining",
  "Groceries",
  "Shopping",
  "Transport",
  "Subscriptions",
  "Other",
  "Transfers",
  "Cashback",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** How money moved. The user lives entirely on their PayPal balance + PayPal Debit Card. */
export type PaymentMethod =
  | "paypal_debit_card"
  | "paypal_balance"
  | "direct_deposit"
  | "auto_reload"
  | "bank_transfer"
  | "paypal_offer";

export type TransactionStatus = "completed" | "pending";

export interface Transaction {
  id: string; // "txn_0001"
  date: ISODateTime;
  merchant: string;
  description: string;
  /** Signed USD amount. Negative = money out, positive = money in. */
  amount: number;
  category: Category;
  method: PaymentMethod;
  status: TransactionStatus;
  /** Running PayPal balance immediately after this transaction posted. */
  balanceAfter: number;
  /** Set when the transaction is a charge from a recurring payment. */
  recurringId?: string;
  /** Set when a PayPal offer has been applied to this transaction. */
  appliedOfferId?: string;
  /** Unrecognised merchant descriptor the user should confirm a category for. */
  needsReview?: boolean;
}

export type BillingCycle = "weekly" | "monthly" | "yearly";
export type RecurringKind = "subscription" | "bill" | "variable";
export type RecurringStatus = "active" | "cancelled" | "paused";

export interface RecurringPayment {
  id: string; // "sub_netflix"
  merchant: string;
  plan: string;
  kind: RecurringKind;
  category: Category;
  /** Typical charge in USD (positive). For variable payments this is the trailing average. */
  amount: number;
  /** Variable payments only: observed range over the mock window. */
  amountRange?: { min: number; max: number };
  cycle: BillingCycle;
  /** Day of month the charge lands (monthly) — informational. */
  billingDay?: number;
  nextChargeDate: ISODate;
  status: RecurringStatus;
  cancelledAt?: ISODateTime;
  /** Can the agent cancel it? Rent/utilities cannot be cancelled from chat. */
  cancellable: boolean;
  /** Where cancellation happens: PayPal Subscriptions API vs. a merchant site (Kernel browser). */
  cancelChannel: "paypal_subscriptions_api" | "kernel_browser" | "none";
  /** Last time the user actually used the service (for "unused subscription" insights). */
  lastUsedAt?: ISODate;
  /** First charge ("Since" on the Recurring page). */
  since?: ISODate;
}

export type OfferType = "percent_cashback" | "fixed_cashback";

export interface Offer {
  id: string; // "offer_target_5"
  merchant: string;
  title: string;
  description: string;
  type: OfferType;
  /** Percent (5 = 5%) for percent_cashback, USD for fixed_cashback. */
  value: number;
  /** Minimum transaction spend (USD, positive) to qualify. */
  minSpend?: number;
  /** Maximum cashback per redemption in USD. */
  maxCashback?: number;
  validFrom: ISODate;
  validUntil: ISODate;
  /** available → added (saved, waiting for a purchase) → pending (cash back on its way) → applied (paid out). */
  status: "available" | "added" | "pending" | "applied" | "expired";
  /** Pending offers only: cash back owed and the day it posts to the balance. */
  pendingCashback?: number;
  postsOn?: ISODate;
  /** Why the offer was matched to this user ("you’ve shopped at Thistle 3 times since August"). */
  matchNote?: string;
  appliedToTransactionId?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  currency: "USD";
  annualSalary: number;
  /** Net take-home per paycheck (direct deposit into PayPal balance). */
  netPaycheck: number;
  payFrequency: "biweekly";
  paypalBalance: number;
  card: {
    product: "PayPal Debit Mastercard";
    last4: string;
    /** Demo state: a frozen card declines new purchases. Mock-only; PayPal has no public freeze API. */
    frozen?: boolean;
  };
  autoReload: {
    enabled: boolean;
    /** When balance drops below this, PayPal auto-reloads from the linked bank. */
    threshold: number;
    reloadAmount: number;
    fundingSource: string;
  };
  linkedBank: string;
  memberSince: ISODate;
}

/** Snapshot of everything the dashboard and agent need. Served by GET /api/state. */
export interface FinanceState {
  userProfile: UserProfile;
  transactions: Transaction[];
  recurring: RecurringPayment[];
  offers: Offer[];
  /** "Now" for the prototype, so charts and the agent agree on dates. */
  asOf: ISODateTime;
}

// ---------- Aggregations (computed in src/lib/finance.ts) ----------

export interface SpendPoint {
  /** Bucket key: "2026-10-07" (day), "2026-10" (month), "2026" (year). */
  period: string;
  label: string;
  spend: number;
  income: number;
}

export interface CategorySpend {
  category: Category;
  spend: number;
  share: number; // 0..1 of total spend
  count: number;
}
