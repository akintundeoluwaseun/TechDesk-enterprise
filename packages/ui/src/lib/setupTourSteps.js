import { Printer, Store, PenLine } from "lucide-react";
import { db } from "./db";
import { shopSetupNeeds } from "./setupTours";

const nameSet = () => !shopSetupNeeds(db.getSettings()).name;
const signed = () => !shopSetupNeeds(db.getSettings()).signature;

/**
 * Before the first sale: only what's missing. A shop with a name but no
 * signature goes straight to the signature.
 */
export function saleSetupSteps({ desktop, needs = shopSetupNeeds(db.getSettings()) }) {
  const tap = desktop ? "Click" : "Tap";
  const steps = [
    {
      center: true,
      icon: needs.name ? Store : PenLine,
      eyebrow: "Before your first sale",
      title: needs.name ? "Put your name on your receipts" : "Sign your receipts once",
      body: needs.name
        ? "Every receipt you hand a customer carries your shop's name and your signature. It takes a few seconds, and you only do it once."
        : "Your shop name is set. Add your signature and it goes on every receipt and repair ticket automatically.",
      points: [needs.name && "Your shop name, printed at the top", needs.signature && "Your signature, printed at the bottom"].filter(Boolean),
      button: "Set it up",
    },
  ];

  if (needs.name) {
    steps.push({
      route: "/settings",
      target: "shop-name",
      action: "do",
      title: "Your shop's name",
      body: "Type it the way you want customers to see it. It saves as you type.",
      ready: nameSet,
    });
  }

  if (needs.signature) {
    steps.push(
      {
        route: "/settings",
        target: "owner-signature",
        action: "click",
        title: "Now your signature",
        body: `${tap} “Tap to sign”, sign with your finger or mouse, then save.`,
      },
      // The pad has the screen; the tour waits until a signature is saved,
      // and comes back to the step above if the pad is closed without one.
      { target: "signature-pad", action: "wait", until: signed, fallback: steps.length },
    );
  }

  return steps;
}

/** After the first repair: why the ticket matters, then where it is. */
export function repairTicketSteps({ desktop, repairId, ticketLabel = "repair ticket" }) {
  const tap = desktop ? "Click" : "Tap";
  return [
    {
      center: true,
      icon: Printer,
      eyebrow: "Your first repair is booked in",
      title: `Print the ${ticketLabel} and give it to your customer`,
      body: "A printed ticket is physical evidence of what they left with you, in what state, and for how much.",
      points: [
        "The customer keeps it and brings it back to collect their device",
        "It shows the fault, the price and both signatures",
        "No arguments later about what was handed over",
      ],
      button: "Show me where",
    },
    {
      target: `ticket-${repairId}`,
      action: "click",
      title: `Download the ${ticketLabel}`,
      body: `${tap} here to save it, then print it and hand it to your customer.`,
    },
  ];
}
