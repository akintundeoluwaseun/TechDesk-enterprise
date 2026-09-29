import React, { useState } from "react";
import { Monitor, ShoppingCart, Wrench, Box, BarChart3, ArrowRight, ArrowLeft } from "lucide-react";
import { ForceDark, useThemeTokens } from "../lib/ThemeContext";
import AccountGateScreen from "./AccountGateScreen";

// First run, before "new sale" or "new repair" mean anything yet -- three
// short steps instead of landing straight on an empty dashboard: what this
// is, what it does, then the question AccountGateScreen already asks (set
// up a new business, connect to one, or stay fully local). Dark throughout
// regardless of the shop's own theme choice, which is a setting for the app
// they haven't opened yet -- see ForceDark.
const STEP_COUNT = 3;

const INFO = [
  { icon: ShoppingCart, title: "Sales", text: "Ring up a sale, take payment, print or send the receipt." },
  { icon: Wrench, title: "Repairs", text: "Track every device from received to delivered." },
  { icon: Box, title: "Inventory", text: "Know what's on the shelf, and what it's worth." },
  { icon: BarChart3, title: "Reports", text: "Revenue, profit and trends, whenever you need them." },
];

function Dots({ step }) {
  return (
    <div className="fixed top-6 inset-x-0 flex items-center justify-center gap-2 z-10">
      {Array.from({ length: STEP_COUNT }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-white" : "w-1.5 bg-white/25"}`}
        />
      ))}
    </div>
  );
}

function Welcome({ onNext }) {
  const t = useThemeTokens();
  return (
    <div className={`min-h-screen w-full flex flex-col items-center justify-center px-6 ${t.bg}`}>
      <div className="flex flex-col items-center text-center animate-[onboardPop_0.6s_ease-out]">
        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${t.cardBg}`}>
          <Monitor className={`w-9 h-9 ${t.textPrimary}`} />
        </div>
        <h1 className={`text-2xl font-bold mb-2 ${t.textPrimary}`}>Welcome to TechDesk</h1>
        <p className={`text-sm max-w-xs ${t.textMuted}`}>
          Everything a repair shop needs to run its day &mdash; sales, repairs, inventory and more, all in one place.
        </p>
      </div>
      <button
        onClick={onNext}
        className="mt-10 flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-white text-black"
      >
        Get Started <ArrowRight className="w-4 h-4" />
      </button>
      <style>{`
        @keyframes onboardPop {
          0% { opacity: 0; transform: scale(0.92) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function QuickInfo({ onNext, onBack }) {
  const t = useThemeTokens();
  return (
    <div className={`min-h-screen w-full flex flex-col items-center justify-center px-6 ${t.bg}`}>
      <div className="w-full max-w-sm">
        <h1 className={`text-xl font-bold text-center mb-8 ${t.textPrimary}`}>Everything your shop needs</h1>
        <div className="flex flex-col gap-5 mb-10">
          {INFO.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.cardBg}`}>
                <Icon className={`w-5 h-5 ${t.textPrimary}`} />
              </div>
              <div>
                <div className={`font-semibold text-sm ${t.textPrimary}`}>{title}</div>
                <div className={`text-sm ${t.textMuted}`}>{text}</div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-white text-black"
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={onBack} className={`w-full mt-3 py-2 text-sm ${t.textMuted}`}>
          Back
        </button>
      </div>
    </div>
  );
}

export default function OnboardingScreen({ onDone }) {
  const [step, setStep] = useState(0);

  return (
    <ForceDark>
      <Dots step={step} />
      {step === 0 && <Welcome onNext={() => setStep(1)} />}
      {step === 1 && <QuickInfo onNext={() => setStep(2)} onBack={() => setStep(0)} />}
      {step === 2 && (
        <>
          <button
            onClick={() => setStep(1)}
            className="fixed top-6 left-6 flex items-center gap-1 text-sm text-neutral-400 z-10"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <AccountGateScreen onDone={onDone} />
        </>
      )}
    </ForceDark>
  );
}
