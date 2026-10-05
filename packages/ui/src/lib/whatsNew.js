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
    id: "2026-10-05q",
    date: "5 October 2026",
    title: "TechDesk 4.12.9: a shorter sidebar",
    items: [
      {
        icon: "sparkles",
        title: "More, in one place",
        text: "Restock planner, Money owed, Morning brief and What's new are under More in the sidebar, as on the phone.",
      },
      {
        icon: "sync",
        title: "Updates arrive again",
        text: "The desktop app now finds new versions by itself every time.",
      },
    ],
  },
  {
    id: "2026-10-05p",
    date: "5 October 2026",
    title: "TechDesk 4.12.8: meet your AI assistant",
    items: [
      {
        icon: "sparkles",
        title: "A new welcome",
        text: "The welcome pages now end with your AI assistant: talk to it, ask it, or show it your notebook.",
      },
      {
        icon: "zap",
        title: "Fits iPhone better",
        text: "The web app no longer zooms in when you tap a box on an iPhone, and everything is a little smaller on phones so more fits on screen.",
      },
    ],
  },
  {
    id: "2026-10-05o",
    date: "5 October 2026",
    title: "TechDesk 4.12.7: a tidier menu",
    items: [
      {
        icon: "sparkles",
        title: "Shorter menu",
        text: "On a phone, Light mode, Help, Restock planner, Money owed, Morning brief and What's new are now under More. The menu no longer covers your phone's clock and battery, and they stay visible in light mode.",
      },
    ],
  },
  {
    id: "2026-10-05n",
    date: "5 October 2026",
    title: "TechDesk 4.12.6: prices in your money",
    items: [
      {
        icon: "sparkles",
        title: "Outside Nigeria?",
        text: "Upgrade now shows each price in your own currency too, at today's rate (for example \u20A610,000, about $6.50). You still pay in Naira; your bank converts it.",
      },
    ],
  },
  {
    id: "2026-10-05m",
    date: "5 October 2026",
    title: "TechDesk 4.12.5: a new look",
    items: [
      {
        icon: "sparkles",
        title: "One TechDesk icon everywhere",
        text: "The app, the desktop app, the web app and the website now share the same indigo-to-sky TechDesk icon. Monitor keeps its own white icon, so you can tell them apart.",
      },
    ],
  },
  {
    id: "2026-10-05l",
    date: "5 October 2026",
    title: "TechDesk 4.12.4: Google Play payments",
    items: [
      {
        icon: "ticket",
        title: "Pay with Google Play",
        text: "On the Play Store app, Upgrade \u2192 Pay with Google Play buys Business, Enterprise, or the upgrade from Business to Enterprise with your Google account. It switches on straight away.",
      },
    ],
  },
  {
    id: "2026-10-05k",
    date: "5 October 2026",
    title: "TechDesk 4.12.3: a simpler Upgrade screen",
    items: [
      {
        icon: "ticket",
        title: "Two buttons",
        text: "Upgrade now has Pay online (Activate Business, Activate Enterprise, or Upgrade Business \u2192 Enterprise) and I have a code, which shows your PIN and a box for the code made for it.",
      },
    ],
  },
  {
    id: "2026-10-05j",
    date: "5 October 2026",
    title: "TechDesk 4.12.2: activation by PIN, and a quicker assistant",
    items: [
      {
        icon: "ticket",
        title: "Your PIN, your code",
        text: "Upgrade shows your PIN. Send it to TechDesk on WhatsApp, pay, and type the code we send back: Business, Enterprise, or Upgrade from Business to Enterprise. It now runs the full year.",
      },
      {
        icon: "zap",
        title: "Faster answers",
        text: "The assistant answers sooner, and when Google's AI is busy it switches to another one at once instead of making you wait.",
      },
    ],
  },
  {
    id: "2026-10-05i",
    date: "5 October 2026",
    title: "TechDesk 4.12.1: the mic hears Nigerian names",
    items: [
      {
        icon: "sparkles",
        title: "Names like Bola Oluwatoyin",
        text: "When the phone writes a name as English words (\u201cBola Oluwa to in\u201d), the assistant now finds the right customer. For shops with many such names, choose \u201cBest for names\u201d under How the mic listens: the AI listens instead of the phone.",
      },
      {
        icon: "zap",
        title: "No more repeated words",
        text: "On some Android phones the words you said showed again and again while you talked. Fixed, and the stop button always stays on screen.",
      },
    ],
  },
  {
    id: "2026-10-05h",
    date: "5 October 2026",
    title: "TechDesk 4.12: the restock planner",
    items: [
      {
        icon: "sparkles",
        title: "Know what to buy",
        text: "Inventory → Restock planner (or ask the assistant \u201cWhat should I restock?\u201d). It works out how fast each product sells, how long your stock will last, and how many to buy.",
      },
      {
        icon: "zap",
        title: "Fits your budget",
        text: "Tell it how much you have to spend and it puts the most urgent, best-selling items first. Send the list to your supplier on WhatsApp.",
      },
      {
        icon: "calendar",
        title: "Goods arrived? One tap",
        text: "When the order comes in, tap Goods arrived and everything is added to stock, with the new cost price if it changed. It also shows stock that isn't selling.",
      },
    ],
  },
  {
    id: "2026-10-05g",
    date: "5 October 2026",
    title: "TechDesk 4.11: updates by themselves, and activation codes",
    items: [
      {
        icon: "sync",
        title: "Updates come to you",
        text: "On Windows, TechDesk now downloads new versions by itself and installs them when you close it. On Android, tap Update now and it downloads and installs inside the app.",
      },
      {
        icon: "ticket",
        title: "Activation codes",
        text: "Business, Enterprise and Upgrade come as a code from TechDesk. Tap Upgrade, type the code (it starts with BUS, ENT or UPG), and it switches on straight away.",
      },
      {
        icon: "sparkles",
        title: "An easier assistant",
        text: "Home, Chat and History tabs at the top: your quick actions are always one tap away.",
      },
    ],
  },
  {
    id: "2026-10-05f",
    date: "5 October 2026",
    title: "TechDesk 4.10: a much faster assistant",
    items: [
      {
        icon: "zap",
        title: "Words appear as you talk",
        text: "Hold the mic and your words show up straight away. Let go and it's done in a moment: only the words are sent, not the recording.",
      },
      {
        icon: "sparkles",
        title: "Instant answers",
        text: "\u201cHow much did I sell today?\u201d, \u201cWho owes me?\u201d, \u201cWhat's running low?\u201d are answered instantly on your phone, even offline.",
      },
      {
        icon: "back",
        title: "Correct or cancel a sale",
        text: "\u201cThe charger I sold Bayo was 7k not 8k.\u201d \u201cCancel the last sale.\u201d Check, save, and undo if you need to.",
      },
      {
        icon: "bell",
        title: "Update notices",
        text: "The app now tells you when a new version is out, with a button to get it.",
      },
    ],
  },
  {
    id: "2026-10-05e",
    date: "5 October 2026",
    title: "TechDesk 4.9: returns, history, and a quicker assistant",
    items: [
      {
        icon: "back",
        title: "Returns, just by saying so",
        text: "\u201cThe laptop John bought yesterday was returned.\u201d The assistant finds the sale. Two Johns? It asks which one. Save, and the item goes back into stock and comes off the sale.",
      },
      {
        icon: "calendar",
        title: "History",
        text: "Tap the clock at the top of the assistant to see what it has done: sales made, stock added, returns, checks. One line each.",
      },
      {
        icon: "zap",
        title: "Quicker",
        text: "The mic starts listening straight away, and the assistant tells you what it's doing while you wait.",
      },
    ],
  },
  {
    id: "2026-10-05d",
    date: "5 October 2026",
    title: "TechDesk 4.8: meet your assistant",
    items: [
      {
        icon: "sparkles",
        title: "Your shop robot",
        text: "The round robot at the bottom of the screen is your assistant. Now and then it pops up with something useful, like who still owes you.",
      },
      {
        icon: "zap",
        title: "One-tap quick actions",
        text: "Tap the robot: New sale, New repair, Add product, Snap notebook, Money owed, Today's brief. Or ask \u201cSales today\u201d, \u201cWho owes me?\u201d, \u201cRunning low\u201d and get the answer instantly, even offline.",
      },
      {
        icon: "ticket",
        title: "Figures with commas",
        text: "Amounts in the assistant and Money owed now read 15,000 as you type them.",
      },
    ],
  },
  {
    id: "2026-10-05c",
    date: "5 October 2026",
    title: "TechDesk 4.7: get your money in",
    items: [
      {
        icon: "zap",
        title: "Money owed, in one place",
        text: "Menu \u2192 Money owed: everyone who owes you, how much, for what, and how long. Tap Message for a WhatsApp reminder that's written for you.",
      },
      {
        icon: "sparkles",
        title: "The right words each time",
        text: "Friendly first, then a reminder, then firm, with your bank details so they can transfer straight away.",
      },
      {
        icon: "calendar",
        title: "Promises and part-payments",
        text: "\u201cI'll pay Friday\u201d? Save the date and they leave the list until then. Record what they paid, even part of a repair bill.",
      },
    ],
  },
  {
    id: "2026-10-05b",
    date: "5 October 2026",
    title: "TechDesk 4.6: your morning brief",
    items: [
      {
        icon: "sun",
        title: "Start the day knowing where you stand",
        text: "The first time you open TechDesk each morning: what you took yesterday, who owes you, which repairs are waiting to be collected, and what's run out.",
      },
      {
        icon: "zap",
        title: "A to-do list that brings money in",
        text: "Tap Message to send a ready-written WhatsApp: \u201cyour phone is ready\u201d or \u201ca friendly reminder about your balance\u201d. You read it and press send.",
      },
      {
        icon: "phone",
        title: "Works offline, costs nothing",
        text: "The brief is worked out on your device. Open it any time from the menu, or send it to yourself on WhatsApp.",
      },
    ],
  },
  {
    id: "2026-10-05",
    date: "5 October 2026",
    title: "TechDesk 4.5: bring in your old notebook",
    items: [
      {
        icon: "sparkles",
        title: "Snap a notebook page",
        text: "Open the assistant and tap the camera. Take a photo of a page from your old sales book and each line becomes a sale, repair or stock entry, on the date it was written. Check them, then tap Save.",
      },
      {
        icon: "zap",
        title: "Your stock stays right",
        text: "Old sales from the notebook don't take from today's stock unless you tick it. A page that counts your shelf can set the stock to that number.",
      },
    ],
  },
  {
    id: "2026-10-04b",
    date: "4 October 2026",
    title: "TechDesk 4.4.3: your shop assistant",
    items: [
      {
        icon: "sparkles",
        title: "Ask your shop anything",
        text: "Tap the sparkle button and type or talk: \u201cWho owes me?\u201d, \u201cWhat's my profit this week?\u201d, \u201cWhat's running low?\u201d. The answer is worked out on your phone from your own records.",
      },
      {
        icon: "zap",
        title: "Sell things you don't stock",
        text: "Say a product that isn't in your stock and TechDesk sells it as a one-off item: just add the price. Or pick the right product from your stock.",
      },
      {
        icon: "zap",
        title: "Practice first",
        text: "Tap Practice in the assistant: five short tries teach you how to say things so it gets them right every time. Nothing is saved while you practise.",
      },
    ],
  },
  {
    id: "2026-10-04",
    date: "4 October 2026",
    title: "TechDesk 4.4: voice orders",
    items: [
      {
        icon: "sparkles",
        title: "Just say it",
        text: "Hold the mic button and say what happened: \u201cSell two chargers to Chidi, he paid transfer. Add ten iPhone 11 batteries.\u201d TechDesk fills it in, you check it, and tap Save. Needs the internet.",
      },
      {
        icon: "zap",
        title: "Type in an activation code",
        text: "Got a code from TechDesk? Tap Upgrade, then \u201cHave an activation code?\u201d. Your device's PIN is shown there too.",
      },
      {
        icon: "zap",
        title: "Profit that stays right",
        text: "Each sale now keeps what the item cost you that day, so changing a price later never rewrites past profit.",
      },
    ],
  },
  {
    id: "2026-10-01",
    date: "1 October 2026",
    title: "TechDesk 4.3",
    items: [
      {
        icon: "sparkles",
        title: "Try Business and Enterprise free",
        text: "While we test the new plans, Upgrade unlocks them free. No payment is taken.",
      },
      {
        icon: "zap",
        title: "Sync you can rely on",
        text: "Sales made offline now always reach your other devices, and an older edit can never overwrite a newer one.",
      },
      {
        icon: "phone",
        title: "Guided first sale and first repair",
        text: "TechDesk walks you through adding your shop name and signature, and printing the repair ticket for your customer.",
      },
    ],
  },
  {
    id: "2026-09-29b",
    date: "29 September 2026",
    title: "A livelier dashboard",
    items: [
      {
        icon: "bell",
        title: "Notifications that tell you who and what",
        text: "“Ade made a sale · ₦12,500 · 2 × Screen guard” from your other devices and branches, plus a reminder every 5 hours about each customer who hasn't paid or collected their repair, until they do.",
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
