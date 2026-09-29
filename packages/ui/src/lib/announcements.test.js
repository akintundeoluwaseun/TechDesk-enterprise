import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { notificationFeed } from "@techdesk/core";
import {
  checkIn,
  storedAnnouncements,
  unseenAnnouncements,
  markAnnouncementSeen,
  announcementFeedItems,
  appPlatform,
} from "./announcements";

const A = { id: "a1", title: "Version 4.3 is out", body: "Update today.", tone: "update", link_url: null, created_at: "2026-09-29T10:00:00Z" };
const B = { id: "b2", title: "Closed Monday", body: "", tone: "info", link_url: null, created_at: "2026-09-28T10:00:00Z" };

function reply(list, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(list) });
}

beforeEach(() => {
  localStorage.clear();
  globalThis.__TECHDESK_VERSION__ = "4.2.3";
});
afterEach(() => {
  delete globalThis.__TECHDESK_VERSION__;
});

describe("checking in with the console", () => {
  it("says which platform and version this is", async () => {
    const f = reply([A]);
    await checkIn({ fetchImpl: f });
    const [url, init] = f.mock.calls[0];
    expect(url).toMatch(/\/rest\/v1\/rpc\/app_checkin$/);
    expect(JSON.parse(init.body)).toEqual({ p_platform: appPlatform(), p_version: "4.2.3" });
  });

  it("keeps what came back, for the pop-up and the bell", async () => {
    await checkIn({ fetchImpl: reply([A, B]) });
    expect(storedAnnouncements().map((a) => a.id)).toEqual(["a1", "b2"]);
  });

  it("replaces the list, so one switched off in the console leaves the device too", async () => {
    await checkIn({ fetchImpl: reply([A, B]) });
    await checkIn({ fetchImpl: reply([A]) });
    expect(storedAnnouncements().map((a) => a.id)).toEqual(["a1"]);
  });

  it("offline or failing, leaves what it had alone", async () => {
    await checkIn({ fetchImpl: reply([A]) });
    expect(await checkIn({ fetchImpl: vi.fn().mockRejectedValue(new Error("offline")) })).toBe(null);
    expect(await checkIn({ fetchImpl: reply(null, false) })).toBe(null);
    expect(storedAnnouncements().map((a) => a.id)).toEqual(["a1"]);
  });

  it("a dev build with no version never checks in, so it can't pollute the console's version list", async () => {
    delete globalThis.__TECHDESK_VERSION__;
    const f = reply([A]);
    expect(await checkIn({ fetchImpl: f })).toBe(null);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("showing each one once", () => {
  it("is unseen until marked", async () => {
    await checkIn({ fetchImpl: reply([A, B]) });
    expect(unseenAnnouncements().map((a) => a.id)).toEqual(["a1", "b2"]);
    markAnnouncementSeen("a1");
    expect(unseenAnnouncements().map((a) => a.id)).toEqual(["b2"]);
  });
});

describe("the bell", () => {
  it("lists them alongside the shop's own notifications", async () => {
    await checkIn({ fetchImpl: reply([A]) });
    const feed = notificationFeed(null, 8, announcementFeedItems());
    const item = feed.find((i) => i.type === "announcement");
    expect(item.message).toBe("Version 4.3 is out — Update today.");
  });
});
