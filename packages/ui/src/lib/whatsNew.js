import { useEffect, useState } from "react";

// "What's new": the notes a shop sees once after each update, and can read
// again any time from the menu.
//
// ADDING AN UPDATE: put a new entry at the TOP of UPDATES, with a new `id`
// (the date is fine). That's all -- every device that hasn't seen that id
// shows it once, on its next start, and the menu gets a dot until it has.
// `icon` is one of the names in WhatsNewModal's ICONS.
export const UPDATES = [
  {
    id: "2026-09-29b",
    date: "29 September 2026",
    title: "A livelier dashboard",
    items: [
      {
        icon: "bell",
        title: "Notifications that tell you who and what",
        text: "“Ade made a sale · ₦12,500 · 2 × Screen guard” from your other devices and branches, plus a daily nudge about customers who haven't paid or collected their repair. Turn each on or off in Settings → Device.",
      },
      {
        icon: "zap",
        title: "Your week at a glance",
        text: "The dashboard greets you, and every card shows a 7-day trend line.",
      },
      {
        icon: "sparkles",
        title: "A little celebration",
        text: "Saving a sale or booking a repair now brings a confirmation card and a burst of confetti.",
      },
      {
        icon: "phone",
        title: "News from TechDesk",
        text: "Important notices about updates and offers now pop up in the app and wait for you in the bell.",
      },
    ],
  },
  {
    id: "2026-09-29",
    date: "29 September 2026",
    title: "A fresh coat of paint",
    items: [
      {
        icon: "sparkles",
        title: "Everything moves now",
        text: "Pages glide in, lists cascade, numbers count up and pop-ups slide into place.",
      },
      {
        icon: "compass",
        title: "A guided tour for new shops",
        text: "New installs get a short welcome and a hands-on tour of the menu, Sales, Repairs and Inventory. Replay it any time from Help.",
      },
      {
        icon: "calendar",
        title: "Sales and repairs, grouped by time",
        text: "Today, This Week, This Month and Older. Tap a heading to open or close it.",
      },
      {
        icon: "ticket",
        title: "Tidier repair tickets",
        text: "Long shop names now wrap neatly instead of printing over the title.",
      },
      {
        icon: "sun",
        title: "Easier on the eyes",
        text: "Light mode is softer, with no more glaring white.",
      },
      {
        icon: "sync",
        title: "Sync takes care of itself",
        text: "Your data syncs automatically in the background. No buttons to press.",
      },
      {
        icon: "back",
        title: "Back means back",
        text: "On Android, the back button now closes pop-ups instead of the whole app.",
      },
    ],
  },
];

const KEY = "techdesk_whatsnew_seen";

export function latestUpdateId() {
  return UPDATES[0]?.id || null;
}

export function hasUnseenUpdate() {
  const id = latestUpdateId();
  if (!id) return false;
  try {
    return localStorage.getItem(KEY) !== id;
  } catch {
    return false;
  }
}

const seenListeners = new Set();

export function markUpdatesSeen() {
  const id = latestUpdateId();
  if (!id) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Can't remember it: it'll just show again next start.
  }
  for (const fn of seenListeners) fn();
}

/** True while there's an update this device hasn't opened yet -- for the menu dot. */
export function useUnseenUpdate() {
  const [unseen, setUnseen] = useState(hasUnseenUpdate);
  useEffect(() => {
    const fn = () => setUnseen(hasUnseenUpdate());
    seenListeners.add(fn);
    return () => seenListeners.delete(fn);
  }, []);
  return unseen;
}

// Same doorbell as upgradeModal.js: the menu rings it, the shell answers.
const openListeners = new Set();

export function openWhatsNew() {
  for (const fn of openListeners) {
    try {
      fn();
    } catch {
      // One listener throwing must not stop the rest.
    }
  }
}

export function onOpenWhatsNew(fn) {
  openListeners.add(fn);
  return () => openListeners.delete(fn);
}
