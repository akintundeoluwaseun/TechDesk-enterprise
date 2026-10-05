import { describe, it, expect } from "vitest";
import { compareVersions, latestFor } from "./updateCheck";

describe("update check", () => {
  it("compares versions as numbers", () => {
    expect(compareVersions("4.10.0", "4.9.2")).toBe(1);
    expect(compareVersions("4.9.0", "4.9.0")).toBe(0);
    expect(compareVersions("4.3.0", "4.9.0")).toBe(-1);
  });
  it("picks the newest release with files, per platform", () => {
    const list = [
      { tag_name: "android-v4.9.0", assets: [{}] },
      { tag_name: "v4.9.0", assets: [] }, // made, still uploading
      { tag_name: "v4.8.0", assets: [{}] },
      { tag_name: "v4.10.0", draft: true, assets: [{}] },
      { tag_name: "android-v4.8.0", assets: [{}] },
    ];
    expect(latestFor("desktop", list)).toBe("4.8.0");
    expect(latestFor("android", list)).toBe("4.9.0");
  });
});
