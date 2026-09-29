// How this app draws a notification: one look per activity type.
//
// The feed itself -- what happened, in what order, what counts as unread --
// is in @techdesk/core. This is the half that knows about lucide icons and
// Tailwind classes, which is the half that changes when the UI changes.
//
// Real category labels: the message text already says what happened, so the
// heading does not invent a sub-status.

import { ShoppingCart, Wrench, Box, User, Settings as SettingsIcon, Bell, CircleDollarSign, Megaphone } from "lucide-react";

export const NOTIF_STYLES = {
  sale: { Icon: ShoppingCart, label: "New Sale", light: "bg-blue-100 text-blue-600", dark: "bg-blue-500/20 text-blue-400" },
  repair: { Icon: Wrench, label: "Repair Update", light: "bg-emerald-100 text-emerald-600", dark: "bg-emerald-500/20 text-emerald-400" },
  inventory: { Icon: Box, label: "Stock Update", light: "bg-amber-100 text-amber-600", dark: "bg-amber-500/20 text-amber-400" },
  lowstock: { Icon: Box, label: "Low Stock Alert", light: "bg-amber-100 text-amber-600", dark: "bg-amber-500/20 text-amber-400" },
  customer: { Icon: User, label: "New Customer", light: "bg-violet-100 text-violet-600", dark: "bg-violet-500/20 text-violet-400" },
  settings: { Icon: SettingsIcon, label: "Account Update", light: "bg-neutral-200 text-neutral-600", dark: "bg-neutral-500/20 text-neutral-400" },
  announcement: { Icon: Megaphone, label: "From TechDesk", light: "bg-sky-100 text-sky-600", dark: "bg-sky-500/20 text-sky-400" },
  owed: { Icon: CircleDollarSign, label: "Payment Pending", light: "bg-red-100 text-red-600", dark: "bg-red-500/20 text-red-400" },
};

export const DEFAULT_NOTIF_STYLE = {
  Icon: Bell,
  label: "Activity",
  light: "bg-neutral-200 text-neutral-600",
  dark: "bg-neutral-500/20 text-neutral-400",
};

export function notifStyle(type) {
  return NOTIF_STYLES[type] || DEFAULT_NOTIF_STYLE;
}
