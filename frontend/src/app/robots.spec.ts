import robots from "./robots";

describe("robots", () => {
  it("returns robots configuration with allow all rule", () => {
    expect(robots()).toEqual({
      rules: [{ userAgent: "*", allow: "/" }],
    });
  });
});
