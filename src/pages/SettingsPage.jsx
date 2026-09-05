import React, { useState } from "react";
import Topbar from "../components/Topbar";
import { useThemeTokens } from "../lib/ThemeContext";
import ShopTab from "./settings/ShopTab";
import ReceiptsTab from "./settings/ReceiptsTab";
import UsersTab from "./settings/UsersTab";
import DeviceTab from "./settings/DeviceTab";
import DeveloperTab from "./settings/DeveloperTab";

const TABS = [
  { key: "shop", label: "Shop", Component: ShopTab },
  { key: "receipts", label: "Receipts", Component: ReceiptsTab },
  { key: "users", label: "Users", Component: UsersTab },
  { key: "device", label: "Device", Component: DeviceTab },
  { key: "developer", label: "Developer", Component: DeveloperTab },
];

export default function SettingsPage() {
  const t = useThemeTokens();
  const [tab, setTab] = useState("shop");
  const Active = TABS.find((x) => x.key === tab)?.Component || ShopTab;

  return (
    <div className="flex-1 p-8">
      <Topbar title="Settings" />

      <div className={`inline-flex rounded-xl p-1 mb-6 ${t.insetBg}`}>
        {TABS.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === x.key
                ? t.dark
                  ? "bg-[#1e222a] shadow-[2px_2px_4px_#14171d,-2px_-2px_4px_#282d37] text-white"
                  : "bg-[#e9ecf1] shadow-[2px_2px_4px_#c8cdd4,-2px_-2px_4px_#ffffff] text-slate-800"
                : t.textSecondary
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <Active />
    </div>
  );
}
