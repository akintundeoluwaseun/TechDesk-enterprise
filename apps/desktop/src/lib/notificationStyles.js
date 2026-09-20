// How this app draws a notification: one look per activity type.
//
// The feed itself -- what happened, in what order, what counts as unread --
// is in @techdesk/core. This is the half that knows about lucide icons and
// Tailwind classes, which is the half that changes when the UI changes.
//
// Real category labels: the message text already says what happened, so the
// heading does not invent a sub-status.

import { ShoppingCart, Wrench, Box, User, Settings as SettingsIcon, Bell } from "lucide-react";

export const NOTIF_STYLES = {
  sale: { Icon: ShoppingCart, label: "New Sale", light: "bg-blue-100 text-blue-600", dark: "bg-blue-500/20 text-blue-400" },
  repair: { Icon: Wrench, label: "Repair Update", light: "bg-emerald-100 text-emerald-600", dark: "bg-emerald-500/20 text-emerald-400" },
  inventory: { Icon: Box, label: "Stock Update", light: "bg-amber-100 text-amber-600", dark: "bg-amber-500/20 text-amber-400" },
  lowstock: { Icon: Box, label: "Low Stock Alert", light: "bg-amber-100 text-amber-600", dark: "bg-amber-500/20 text-amber-400" },
  customer: { Icon: User, label: "New Customer", light: "bg-violet-100 text-violet-600", dark: "bg-violet-500/20 text-violet-400" },
  settings: { Icon: SettingsIcon, label: "Account Update", light: "bg-slate-200 text-slate-600", dark: "bg-slate-500/20 text-slate-400" },
};

export const DEFAULT_NOTIF_STYLE = {
  Icon: Bell,
  label: "Activity",
  light: "bg-slate-200 text-slate-600",
  dark: "bg-slate-500/20 text-slate-400",
};

export function notifStyle(type) {
  return NOTIF_STYLES[type] || DEFAULT_NOTIF_STYLE;
}
