import { cn } from "./utils";

describe("cn", () => {
  it("joins truthy classes and ignores falsy values", () => {
    expect(cn("a", undefined, "b", null, false, "c")).toBe("a b c");
  });

  it("returns empty string when all classes are falsy", () => {
    expect(cn(undefined, null, false)).toBe("");
  });
});
