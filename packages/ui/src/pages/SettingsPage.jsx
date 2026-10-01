import React from "react";
import { useSearchParams } from "react-router-dom";
import Topbar from "../components/Topbar";
import { useThemeTokens } from "../lib/ThemeContext";
import ShopTab from "./settings/ShopTab";
import DeviceTab from "./settings/DeviceTab";
import UpgradeLock from "../components/UpgradeLock";
import { IS_ANDROID_APP } from "../lib/platform";

// Every tab is here, in every install, for every shop.
//
// A tab a free shop has not paid for is SHOWN and locked, not removed. Two
// reasons. The product is one app that unlocks in place, so the code has to
// be present for an upgrade to have anything to switch on. And a feature you
// cannot see is a feature you never buy -- the Users tab quietly missing is
// indistinguishable from TechDesk simply not doing staff accounts.
//
// `feature` is what the tab needs; UpgradeLock renders the tab or the offer.
//
// Receipts lives inside Shop now, and Sync, Connect (head office) and
// Support live inside Account -- fewer top-level tabs, each locked at the
// section level instead of the tab level. Sync and Connect used to be two
// separate tabs with a comment arguing they were different things; the
// person running this shop reads them as the same kind of screen ("link
// this device to something else"), so they are one stop now, each section
// still gated by its own feature.
const UsersTab = React.lazy(() => import("./settings/UsersTab"));
const AccountTab = React.lazy(() => import("./settings/AccountTab"));

export const ALL_TABS = [
  { key: "shop", label: "Shop", Component: ShopTab },
  {
    key: "users",
    label: "Users",
    Component: UsersTab,
    feature: "staff",
    title: "Staff accounts",
    what: "Give each person behind the counter their own login, so you can see who sold what, and keep cost prices and reports to yourself.",
    // Not on a phone. Staff accounts and the PIN lock exist because several
    // people share one machine at a counter; a phone is one person's, in
    // their pocket, already locked by the phone itself. Offering to put a
    // second PIN on it is answering a question nobody asked, and the PIN
    // toggle lives on this tab, so both go together.
    counterOnly: true,
  },
  { key: "device", label: "Device", Component: DeviceTab },
  // No feature gate on the tab itself: a cloud account for this shop's own
  // records is the one cloud feature every tier gets. Sync and Connect,
  // folded in below it, keep their own per-section gates inside AccountTab.
  { key: "account", label: "Account", Component: AccountTab },
];

const TABS = ALL_TABS.filter((tab) => !(tab.counterOnly && IS_ANDROID_APP));

export default function SettingsPage() {
  const t = useThemeTokens();

  // The tab lives in the URL so search can land on one directly -- a result
  // for "Connect to HQ" that dropped you on Shop to go hunting for it would
  // not be much of a result. It also makes Back step between tabs, which is
  // what the button appears to promise.
  //
  // Receipts lives inside Shop, and Sync, Connect and Support live inside
  // Account -- fewer top-level tabs to scan, without losing anything.
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.some((x) => x.key === requested) ? requested : "shop";
  const active = TABS.find((x) => x.key === tab) || TABS[0];
  const Active = active.Component || ShopTab;

  function selectTab(key) {
    // replace: clicking through tabs should not mean as many taps of Back
    // to leave Settings.
    setParams(key === "shop" ? {} : { tab: key }, { replace: true });
  }

  return (
    <div className="flex-1 p-4 md:p-8">
      <Topbar title="Settings" />

      {/* The tabs don't fit a phone, so the strip scrolls sideways there
          rather than pushing the whole page wider than the screen. */}
      <div className="-mx-4 md:mx-0 px-4 md:px-0 mb-6 overflow-x-auto">
      <div className={`inline-flex rounded-xl p-1 ${t.insetBg}`}>
        {TABS.map((x) => (
          <button
            key={x.key}
            data-tour={`settings-tab-${x.key}`}
            onClick={() => selectTab(x.key)}
            className={`px-4 md:px-5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === x.key ? `${t.cardBg} ${t.textPrimary}` : t.textSecondary
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>
      </div>

      <div data-tour="settings-panel">
      <React.Suspense fallback={null}>
        {active.feature ? (
          <UpgradeLock feature={active.feature} title={active.title} what={active.what}>
            <Active />
          </UpgradeLock>
        ) : (
          <Active />
        )}
      </React.Suspense>
      </div>
    </div>
  );
}
