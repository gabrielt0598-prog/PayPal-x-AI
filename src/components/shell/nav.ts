import { CreditCard, Gift, LayoutDashboard, LineChart, Repeat, type LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

/** Ids match the section anchors rendered by the dashboard. */
export const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: CreditCard },
  { id: "subscriptions", label: "Subscriptions", icon: Repeat },
  { id: "offers", label: "Offers", icon: Gift },
  { id: "insights", label: "Insights", icon: LineChart },
];
