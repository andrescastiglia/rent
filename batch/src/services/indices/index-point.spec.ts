import { parseIndexPoint } from "./index-point";

describe("index observations", () => {
  it("keeps daily dates in UTC and monthly deflation as a percentage", () => {
    expect(parseIndexPoint("03/01/2025", "21.60", "level")).toEqual({
      date: new Date("2025-01-03T00:00:00Z"),
      value: 21.6,
    });
    expect(
      parseIndexPoint("2025-03-01", "-0.34", "monthly_percent").value,
    ).toBe(-0.34);
    expect(parseIndexPoint("2025-03-01", 0, "monthly_percent").value).toBe(0);
  });
  it.each([null, undefined, "", " ", "1.2garbage", NaN, Infinity, 0, -1])(
    "rejects invalid index levels: %s",
    (value) => {
      expect(() => parseIndexPoint("2025-01-01", value, "level")).toThrow();
    },
  );
  it.each(["2025-02-30", "2025-13-01", "2025-1-01", "2025-01", "oops"])(
    "rejects invalid dates: %s",
    (date) => {
      expect(() => parseIndexPoint(date, 1, "level")).toThrow();
    },
  );
  it("rejects percentages that would erase or reverse the rent", () => {
    expect(() =>
      parseIndexPoint("2025-01-01", -100, "monthly_percent"),
    ).toThrow();
  });
});
