// Whether the guided tour still has to run on this device.
//
// "pending" is set only when onboarding finishes, so a shop that was already
// using TechDesk before the tour existed never has it sprung on them. "done"
// is final -- finishing or skipping both count -- and Help can still replay
// it by hand.
const KEY = "techdesk_tour";

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Storage full or blocked: the tour just won't be remembered.
  }
}

export function markTourPending() {
  if (read() !== "done") write("pending");
}

export function isTourPending() {
  return read() === "pending";
}

export function markTourDone() {
  write("done");
}
