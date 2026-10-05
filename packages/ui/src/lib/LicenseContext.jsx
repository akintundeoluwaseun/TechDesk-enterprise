import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { dayKey, normalizeState, advance, mergeStates } from "./trial";
import { remaining as pdfsRemainingFrom } from "./pdfAllowance";
import { usage as outputUsage, recordPdf, onUsageChange } from "./outputAllowance";
import { IS_ANDROID_APP } from "./platform";
import { isTier, tierCan, isUpgrade } from "@techdesk/editions";
import { FREE_TIER, setCurrentTier } from "./tier";
import { HASH_HEX, normalizeCode, hashPreimage } from "./activationCode";
import { POOL_SIZE, inPool, isValidIndex, pinAt, hashesAt } from "./activationTable";
import { checkout } from "@techdesk/core";
import { effectiveTier, YEARLY_FROM } from "./licenceTerm";

const LicenseContext = createContext(null);

const KEY_ASSIGNED_INDEX = "techdesk_license_index";
const KEY_TRIAL = "techdesk_trial";
const KEY_TRIAL_START_LEGACY = "techdesk_trial_start";
const KEY_ACTIVATED = "techdesk_activated";
const KEY_TIER = "techdesk_tier";
const KEY_UNLOCKS = "techdesk_unlocks";
// The server's yearly licence for this PIN, cached so it still counts down
// with no connection. See licenceTerm.js.
const KEY_LICENCE = "techdesk_licence_term";
const LICENCE_CHECK_MS = 6 * 60 * 60 * 1000;

function readLicence() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_LICENCE) || "null");
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

// What a device activated before any of this counts as.
//
// The table now says which tier every code buys, so nothing issued from here
// on is ever a guess. This covers the other direction: a device carrying the
// old activation flag, from back when the tier was decided by WHICH INSTALLER
// you downloaded rather than by a code. Those shops bought Business or
// Enterprise and there is no longer any record on the device of which.
//
// Business is the floor -- everything such a customer can have bought except
// Enterprise. Guessing high would give away the product; guessing free would
// take back what they paid for, on a morning they did nothing wrong. They can
// type an Enterprise code any time and it upgrades them, so a wrong guess
// here is a conversation, not a loss.
const LEGACY_TIER = "business";

// Truncated to exactly what the table stores. The generator keeps the first
// HASH_HEX characters of the digest; comparing anything longer here would
// reject every code ever issued, so the length comes from the shared module
// rather than being written out twice.
async function sha256Prefix(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, HASH_HEX);
}

// The device's PIN is drawn once from the table and must never change: the
// activation code a customer paid for is only valid against the PIN it was
// issued for. Losing this index silently re-rolls the PIN and invalidates a
// code that has already been bought, so it is persisted alongside the
// activation flag rather than in localStorage alone.
function readLocalIndex() {
  const raw = localStorage.getItem(KEY_ASSIGNED_INDEX);
  if (raw === null) return null;
  const index = Number(raw);
  return isValidIndex(index) ? index : null;
}

// New devices draw from the PINs on the owner's list only.
function assignIndex() {
  return Math.floor(Math.random() * POOL_SIZE);
}

// A device that has never paid for anything: no activation, no code typed,
// no licence on record. Only such a device may be given a new PIN (one on
// the owner's list) -- there is nothing a new PIN could cost it.
function neverPaid() {
  try {
    if (localStorage.getItem(KEY_ACTIVATED) === "1") return false;
  } catch {
    return false;
  }
  if (readLocalUnlocks().length) return false;
  const lic = readLicence();
  return !lic?.found;
}

function storeLocalIndex(index) {
  try {
    localStorage.setItem(KEY_ASSIGNED_INDEX, String(index));
  } catch {
    // license.json is the durable copy; losing this mirror is survivable.
  }
}

function readLocalTrial() {
  try {
    const raw = localStorage.getItem(KEY_TRIAL);
    if (raw) return normalizeState(JSON.parse(raw));
    // Pre-1.0.3 installs stored only the install timestamp.
    const legacy = localStorage.getItem(KEY_TRIAL_START_LEGACY);
    if (legacy) return normalizeState(legacy);
  } catch {
    /* fall through to a fresh trial */
  }
  return null;
}

function writeLocalTrial(state) {
  try {
    localStorage.setItem(KEY_TRIAL, JSON.stringify(state));
  } catch {
    // Out of quota, or storage blocked. The userData file is the durable
    // copy, so losing this mirror is survivable.
  }
}

// The unlock history: one entry per code ever accepted on this device.
//
// Not bookkeeping for its own sake. A shop rings and says "I paid for
// Enterprise and it still says Business" -- with a history you ask them to
// read what the Activation screen shows and you know within ten seconds
// whether the code landed, which tier it was for and when. Without one, the
// only state is a single word and you are both guessing.
function readLocalUnlocks() {
  try {
    const raw = localStorage.getItem(KEY_UNLOCKS);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((u) => isTier(u?.tier)) : [];
  } catch {
    return [];
  }
}

/** The best tier in a history, ignoring anything it does not recognise. */
function bestOf(unlocks) {
  let best = FREE_TIER;
  for (const u of unlocks || []) {
    if (isTier(u?.tier) && isUpgrade(best, u.tier)) best = u.tier;
  }
  return best;
}

/** Newest last, one per tier -- re-entering a code does not add a line.
 * The code itself rides along, not just the tier it bought -- see
 * verifyUnlocks below for why. */
function withUnlock(unlocks, tier, code) {
  const kept = (unlocks || []).filter((u) => u?.tier !== tier);
  return [...kept, { tier, at: new Date().toISOString(), code }];
}

/**
 * Which entries in a history are actually backed by a real code for this
 * PIN, checked the same way verifyCode checks one being typed in.
 *
 * This exists because tier and unlocks are both plain values in
 * localStorage and in license.json -- readable and writable by anything
 * with access to either, which on a desktop app is anyone with the
 * developer console open or a text editor pointed at the right file. Before
 * this, "activated": true and "tier": "enterprise" were simply believed:
 * typing that directly into localStorage and reloading was the entire
 * attack, no code, no guessing, nothing the 60-bit code space was supposed
 * to make hard. verifyCode is the only place that ever legitimately adds an
 * entry, and it always has the real code in hand when it does -- so an
 * entry with no code, or one whose code does not hash to this PIN's row for
 * that tier, was never produced by this app. Something else wrote it.
 */
async function verifyUnlocks(unlocks, licenseIndex) {
  if (!unlocks?.length) return [];
  const pin = await pinAt(licenseIndex);
  if (!pin) return [];
  const rows = await hashesAt(licenseIndex);
  const expected = new Map(rows.map((r) => [r.tier, r.hash]));

  const verified = [];
  for (const entry of unlocks) {
    // One-time and Upgrade codes aren't in this device's table; the server
    // vouches for those (licence.proven), and licenceTerm only counts them
    // while it does.
    if (entry?.server && isTier(entry.tier) && entry.code) { verified.push(entry); continue; }
    const target = expected.get(entry?.tier);
    if (!target || !entry?.code) continue;
    const digest = await sha256Prefix(hashPreimage(pin, entry.tier, entry.code));
    if (digest === target) verified.push(entry);
  }
  return verified;
}

export function LicenseProvider({ children }) {
  const [activated, setActivated] = useState(() => localStorage.getItem(KEY_ACTIVATED) === "1");

  // Free until a licence says otherwise. Not "unknown": a shop that has never
  // paid has the free tier, which is a whole working shop, not a locked one.
  const [unlocks, setUnlocks] = useState(readLocalUnlocks);
  const [tier, setTier] = useState(() => {
    const stored = localStorage.getItem(KEY_TIER);
    // The history outranks the flag: they are written together, so the only
    // way they disagree is that one of them was lost, and losing an upgrade
    // is the failure that costs a shop something they paid for.
    const fromHistory = bestOf(readLocalUnlocks());
    if (isTier(stored)) return isUpgrade(stored, fromHistory) ? fromHistory : stored;
    if (fromHistory !== FREE_TIER) return fromHistory;
    // Activated before tiers existed -- see LEGACY_TIER.
    return localStorage.getItem(KEY_ACTIVATED) === "1" ? LEGACY_TIER : FREE_TIER;
  });
  // Seeded from localStorage so the PIN renders immediately, then corrected
  // from license.json below if that disagrees.
  const [licenseIndex, setLicenseIndex] = useState(() => {
    const local = readLocalIndex();
    // A PIN from before the list existed, on a device that never paid: move
    // it onto the list so the owner can find its codes.
    if (local !== null && (inPool(local) || !neverPaid())) return local;
    const fresh = assignIndex();
    storeLocalIndex(fresh);
    return fresh;
  });
  // The PIN comes out of the table, and the table is loaded on demand -- so
  // it arrives a tick after the rest, and anything showing it has to cope
  // with not having it yet. Only the upgrade screen shows it, and it opens
  // long after this has resolved.
  const [pin, setPin] = useState(null);
  useEffect(() => {
    let cancelled = false;
    pinAt(licenseIndex)
      .then((value) => {
        if (!cancelled) setPin(value);
      })
      .catch(() => {
        // The table failed to load. The upgrade screen says so rather than
        // showing a blank where a number should be.
      });
    return () => {
      cancelled = true;
    };
  }, [licenseIndex]);

  // What the server says this PIN has paid for, and until when.
  const [licence, setLicence] = useState(readLicence);
  const claimTried = useRef(new Set());
  async function refreshLicence(forPin = pin) {
    if (!forPin) return null;
    const history = unlocksRef.current || [];
    const proofs = history.filter((u) => u?.server && u.code).map((u) => u.code);
    const res = await checkout.licenceStatus(forPin, proofs);
    if (!res?.ok) return null; // offline: keep the cached answer, dates and all
    const next = { found: !!res.found, tier: res.tier || null, expiresAt: res.expiresAt || null, upgrade: res.upgrade || null, trial: !!res.trial, proven: !!res.proven, paymentsLive: res.paymentsLive ?? null, checkedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY_LICENCE, JSON.stringify(next)); } catch { /* mirror only */ }
    setLicence(next);

    // A code typed while offline (or before the server learned about codes
    // typed in the app) still needs its year started -- otherwise it lapses
    // after the 14 days' grace. Once per code per session.
    if (!next.found) {
      const pending = history.filter((u) => !u?.server && u?.code && Date.parse(u.at) >= YEARLY_FROM && !claimTried.current.has(u.code));
      if (pending.length) {
        for (const u of pending) {
          claimTried.current.add(u.code);
          await checkout.redeemPinCode(u.code, forPin).catch(() => null);
        }
        return refreshLicence(forPin);
      }
    }
    return next;
  }
  useEffect(() => {
    if (!pin) return undefined;
    refreshLicence(pin);
    const every = setInterval(() => refreshLicence(pin), LICENCE_CHECK_MS);
    return () => clearInterval(every);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // A licence can run out while the app is open; recompute on the hour.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const effective = effectiveTier({ bought: tier, unlocks, licence, now: clock });

  const tierRef = useRef(tier);
  tierRef.current = tier;
  const unlocksRef = useRef(unlocks);
  unlocksRef.current = unlocks;

  // The free plan's three clean receipt PDFs a month -- counted, with the
  // ten stamped prints, in outputAllowance.js.
  const [pdfsUsed, setPdfsUsed] = useState(() => outputUsage().pdfs);
  useEffect(() => onUsageChange((u) => setPdfsUsed(u.pdfs)), []);
  // A new month frees them up again, without a restart.
  useEffect(() => {
    const t = setInterval(() => setPdfsUsed(outputUsage().pdfs), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  /** A free shop just spent one of this month's free PDF saves. */
  function recordPdfSaved() {
    recordPdf();
  }

  // Render immediately from local storage; the userData file is read a tick
  // later and reconciled, so the sidebar never waits on IPC to show a number.
  const [trial, setTrial] = useState(() => advance(normalizeState(readLocalTrial())));
  const trialRef = useRef(trial);
  trialRef.current = trial;

  const activatedRef = useRef(activated);
  activatedRef.current = activated;

  function commit(next) {
    setTrial(next);
    trialRef.current = next;
    writeLocalTrial(next);
    window.techdesk?.writeTrial?.(next);
  }

  // Restore activation from license.json. This is the half that fixes an app
  // showing "Activate" again the morning after it was activated: localStorage
  // may have lost the write, but the file did not. Sticky in one direction --
  // the file can turn activation on, never off.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(window.techdesk?.readLicense?.())
      .then((res) => {
        if (cancelled || !res?.ok) return;
        const stored = res.state;
        const storedIndex = Number(stored?.licenseIndex);
        // A PIN from before the list, on a device that has never paid
        // anything, isn't kept: the device has already moved onto the list.
        const filePaid = stored?.activated === true || (Array.isArray(stored?.unlocks) && stored.unlocks.length > 0);
        const hasStoredIndex = isValidIndex(storedIndex) && (inPool(storedIndex) || filePaid || !neverPaid());

        // The file is the authority on which PIN this device was issued, so a
        // device whose localStorage was cleared gets its original PIN back
        // instead of drawing a new one its paid code wouldn't match.
        if (hasStoredIndex && storedIndex !== licenseIndex) {
          setLicenseIndex(storedIndex);
          storeLocalIndex(storedIndex);
        }

        if (stored?.activated === true) {
          setActivated(true);
          try {
            localStorage.setItem(KEY_ACTIVATED, "1");
          } catch {
            /* mirror only */
          }
        }

        // The tier comes back too, and only ever upward. This is the other
        // half of the fix that stops a wiped profile from costing a shop
        // what they bought: the flag said "activated" but not "activated as
        // what", so an Enterprise customer used to come back as Business.
        const storedUnlocks = Array.isArray(stored?.unlocks)
          ? stored.unlocks.filter((u) => isTier(u?.tier))
          : [];
        const fromFile = isUpgrade(bestOf(storedUnlocks), stored?.tier)
          ? stored.tier
          : bestOf(storedUnlocks);
        if (isUpgrade(tierRef.current, fromFile)) {
          const merged = storedUnlocks.length ? storedUnlocks : withUnlock(unlocksRef.current, fromFile);
          applyTier(fromFile, merged, { persistFile: false });
        }

        // Seed the file on first run, and heal it if it is missing any part
        // of the record -- including for devices activated before the tier
        // and the history existed.
        const fileTierLags = isUpgrade(stored?.tier ?? FREE_TIER, tierRef.current);
        if (
          !stored ||
          !hasStoredIndex ||
          fileTierLags ||
          (activatedRef.current && stored.activated !== true)
        ) {
          window.techdesk?.writeLicense?.({
            activated: activatedRef.current,
            licenseIndex: hasStoredIndex ? storedIndex : licenseIndex,
            tier: tierRef.current,
            unlocks: unlocksRef.current,
          });
        }
      })
      .catch(() => {
        // No Electron bridge (browser/dev).
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile with the durable copy on disk. Whichever record is further
  // along wins, so clearing localStorage cannot buy a second trial and a
  // wiped profile cannot lose one.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(window.techdesk?.readTrial?.())
      .then((res) => {
        if (cancelled) return;
        const fromDisk = res?.ok && res.state ? normalizeState(res.state) : null;
        const merged = advance(mergeStates(trialRef.current, fromDisk));
        commit(merged);
      })
      .catch(() => {
        // No Electron bridge (browser/dev). localStorage stands alone.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Roll the day over while the app stays open -- a shop leaves this running
  // for weeks, so the count has to move at midnight without a restart.
  useEffect(() => {
    const t = setInterval(() => {
      const next = advance(trialRef.current, dayKey());
      if (next !== trialRef.current) commit(next);
    }, 60000);
    return () => clearInterval(t);
  }, []);

  // tier.js is read by code that is not a component -- the receipt helpers,
  // the sync hook -- so it has to learn about the licence too, on first load
  // as well as on an upgrade.
  useEffect(() => {
    setCurrentTier(effective);
  }, [effective]);

  // The mobile app is free. The trial and the activation code belong to the
  // desktop build, which is the one that is sold -- on a phone they are a
  // countdown to nothing, and an Activate button with no way to pay.
  //
  // Read as "this build is free", not "this device has activated": nothing is
  // written, nothing is checked, and the desktop build is untouched.
  // NOTHING EXPIRES ANY MORE.
  //
  // The app used to be a 7-day trial that locked. It is a free product now:
  // the whole shop, one person, forever. A shop that never pays a naira still
  // opens it every morning and it still works.
  //
  // So `restricted` is dead, and the countdown with it. A free shop told it
  // has six days left is a shop planning how to get its records out, not a
  // shop deciding whether to buy -- and the day it locks is the day they are
  // mid-repair and lose a customer, which is not a sale, it is a grudge.
  //
  // The trial state is still read and still written, because old installs
  // have it on disk and an upgrade must not look like data loss. It simply
  // stops being able to take anything away.
  const freeEdition = effective === FREE_TIER;
  const restricted = false;

  /**
   * Put a tier into effect everywhere at once.
   *
   * State for the screens, refs so code running later in this same tick sees
   * it, localStorage as the fast mirror, tier.js for the parts of the app
   * that are not components, and the userData file as the copy that survives
   * a cleared profile. Split across five places, so it lives in one function.
   */
  function applyTier(next, history, { persistFile = true } = {}) {
    setActivated(true);
    activatedRef.current = true;
    setTier(next);
    tierRef.current = next;
    setUnlocks(history);
    unlocksRef.current = history;

    try {
      localStorage.setItem(KEY_ACTIVATED, "1");
      localStorage.setItem(KEY_TIER, next);
      localStorage.setItem(KEY_UNLOCKS, JSON.stringify(history));
    } catch {
      // Quota or blocked storage -- the file below is what actually counts.
    }

    // The lock comes off whatever the shop was looking at, without a restart.
    // Being told to restart right after paying is the moment they start
    // wondering whether it worked.
    setCurrentTier(next);

    if (!persistFile) return Promise.resolve();
    // Durable, synchronous on the main-process side: once this resolves the
    // activation has really hit the disk, so a power cut can't undo it.
    return Promise.resolve(
      window.techdesk?.writeLicense?.({
        activated: true,
        licenseIndex,
        tier: next,
        unlocks: history,
      })
    ).catch(() => {});
  }

  /**
   * Puts a VERIFIED history into effect, which is not the same claim as
   * applyTier's: applyTier is "this device just bought this", always true
   * and always activated, because the only caller is a real match in
   * verifyCode. This is "this is what the history actually proves", which
   * can be less than what tier/unlocks currently say, and can be free --
   * so, unlike applyTier, whether the device ends up activated at all
   * follows from the result rather than being assumed.
   */
  function correctTier(next, history) {
    const isActivated = next !== FREE_TIER;
    setActivated(isActivated);
    activatedRef.current = isActivated;
    setTier(next);
    tierRef.current = next;
    setUnlocks(history);
    unlocksRef.current = history;
    setCurrentTier(next);

    try {
      if (isActivated) localStorage.setItem(KEY_ACTIVATED, "1");
      else localStorage.removeItem(KEY_ACTIVATED);
      localStorage.setItem(KEY_TIER, next);
      localStorage.setItem(KEY_UNLOCKS, JSON.stringify(history));
    } catch {
      // Quota or blocked storage -- the file below is what actually counts.
    }

    return Promise.resolve(
      window.techdesk?.writeLicense?.({
        activated: isActivated,
        licenseIndex,
        tier: next,
        unlocks: history,
      })
    ).catch(() => {});
  }

  /**
   * A shop typed a code. Work out what, if anything, it buys them.
   *
   * Every code on this PIN is tried, not just one, because a PIN is sold
   * twice: once for Business and again, later, for Enterprise. That is the
   * whole upgrade path -- the same device, the same PIN, a second code -- and
   * it is why this loops.
   *
   * Two rules decide what happens on a match:
   *
   *   Upgrades only. A code for a tier they already hold, or one below it,
   *   changes nothing. Someone who paid for Enterprise and then retypes their
   *   old Business code -- or hands the counter to a staff member who does --
   *   must not lose what they bought. It is not an error either, so it does
   *   not get an error's wording.
   *
   *   Best match wins. If more than one code somehow matched, the highest one
   *   is applied rather than the first one found.
   *
   * Returns {ok, applied, tier} rather than a boolean, because "wrong code"
   * and "that one's already on" are different things to say to a person.
   */
  async function verifyCode(input) {
    const clean = normalizeCode(input);
    if (!clean) return { ok: false, applied: false, tier: null };

    const pin = await pinAt(licenseIndex);
    if (!pin) return { ok: false, applied: false, tier: null };

    const businessCode = (unlocksRef.current || []).find((u) => u?.tier === "business")?.code || null;

    // A code the server checks and keeps: the one-time kind (BUS-, ENT-,
    // UPG-), or this PIN's Upgrade code, which isn't in the device's table.
    // It goes into the history marked `server`, and counts while the server
    // says this device holds it (licenceTerm).
    const fromServer = async (res) => {
      if (!res?.ok) return { ok: false, applied: false, tier: null, message: res?.message || null };
      const granted = isTier(res.tier) ? res.tier : null;
      // Also when the server already had it: a code used before this
      // version kept the year on the server but never reached the device.
      const onHere = granted && isUpgrade(tierRef.current, granted);
      if (onHere) {
        const history = [...(unlocksRef.current || []).filter((u) => u?.tier !== granted), { tier: granted, at: new Date().toISOString(), code: clean, server: true }];
        await applyTier(granted, history);
      }
      await refreshLicence(pin);
      return { ok: true, applied: !res.already || !!onHere, tier: granted, expiresAt: res.expiresAt || null, message: res.already && !onHere ? res.message || null : null };
    };

    if (/^(BUS|ENT|UPG)[0-9A-Z]{12}$/.test(clean)) {
      return fromServer(await checkout.redeemOneTimeCode(clean, pin, businessCode));
    }

    let matched = null;
    for (const { tier: candidate, hash } of await hashesAt(licenseIndex)) {
      const digest = await sha256Prefix(hashPreimage(pin, candidate, clean));
      if (digest === hash && (matched === null || isUpgrade(matched, candidate))) {
        matched = candidate;
      }
    }
    // Not this PIN's Business or Enterprise code: it may be its Upgrade code.
    if (matched === null) {
      const res = await checkout.redeemPinCode(clean, pin, businessCode);
      if (res?.ok && res.kind === "upgrade") return fromServer(res);
      if (res?.error === "offline" || res?.error === "server" || res?.error === "needs_business" || res?.error === "too_many") {
        return { ok: false, applied: false, tier: null, message: res.message };
      }
      return { ok: false, applied: false, tier: null };
    }

    if (!isUpgrade(tierRef.current, matched)) {
      // A real code, already spent. Say so plainly and leave everything as
      // it is -- including, on a device activated before tiers existed, the
      // Business floor it was given.
      return { ok: true, applied: false, tier: matched };
    }

    // On straight away, from the device's own table -- no internet needed.
    // Then the server is told, which starts the year (offline, refreshLicence
    // tries again later; the app allows 14 days).
    await applyTier(matched, withUnlock(unlocksRef.current, matched, clean));
    const claim = await checkout.redeemPinCode(clean, pin).catch(() => null);
    await refreshLicence(pin);
    return { ok: true, applied: true, tier: matched, expiresAt: claim?.ok ? claim.expiresAt || null : null };
  }

  // Whatever is in the unlock history -- from localStorage on this tick, or
  // from license.json a moment later once the effect above reconciles it --
  // gets checked against this PIN's real table the moment the table is
  // available. tier and unlocks are both plain, writable values; this is
  // what stops writing them directly from being activation. An entry that
  // fails is dropped, never left half-trusted, and the tier this device
  // actually shows is recomputed from what is left -- which can mean a
  // downgrade, including all the way to free, if none of it was real.
  useEffect(() => {
    let cancelled = false;
    const before = unlocks;
    (async () => {
      const verified = await verifyUnlocks(before, licenseIndex);
      if (cancelled) return;
      if (verified.length === before.length) return;

      console.error(
        "[license] an entry in the unlock history did not verify against this PIN's table -- correcting.",
      );
      const legacyFloor =
        localStorage.getItem(KEY_ACTIVATED) === "1" && verified.length === 0 ? LEGACY_TIER : FREE_TIER;
      const proven = bestOf(verified);
      correctTier(isUpgrade(legacyFloor, proven) ? proven : legacyFloor, verified);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseIndex, unlocks]);

  return (
    <LicenseContext.Provider
      value={{
        // On mobile there is nothing to activate, so nothing asks.
        activated: activated || freeEdition,
        freeEdition,
        // The tier in force today: what the codes prove, for as long as the
        // yearly licence runs (licenceTerm.js).
        tier: effective,
        boughtTier: tier,
        licence,
        refreshLicence,
        can: (feature) => tierCan(effective, feature),
        pin,
        unlocks,
        daysUsed: trial.daysUsed,
        restricted,
        verifyCode,
        pdfsUsed,
        pdfsRemaining: pdfsRemainingFrom(pdfsUsed),
        recordPdfSaved,
      }}
    >
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense must be used within LicenseProvider");
  return ctx;
}
