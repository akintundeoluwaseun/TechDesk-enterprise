import { describe, it, expect } from "vitest";
import { mergeResults } from "./speech";

describe("live speech results", () => {
  it("keeps only the longest when Android repeats each step", () => {
    expect(mergeResults(["add", "add iPhone", "add iPhone 11", "add iPhone 11 to Bola"])).toBe("add iPhone 11 to Bola");
  });
  it("joins separate sentences (desktop Chrome)", () => {
    expect(mergeResults(["sell two chargers", " to Chidi", "he paid transfer"])).toBe("sell two chargers to Chidi he paid transfer");
  });
  it("ignores a shorter repeat and blanks", () => {
    expect(mergeResults(["add iPhone 11", "", "add iPhone"])).toBe("add iPhone 11");
  });
});
