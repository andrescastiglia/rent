import { formatCalendarDate } from "./calendar-date";

describe("civil dates", () => {
  it.each(["2026-08-01", "2026-08-01T00:00:00.000Z"])(
    "preserves the calendar day %s",
    (value) => {
      expect(formatCalendarDate(value, "es-AR")).toBe("1/8/2026");
    },
  );
  it("supports translated month labels", () => {
    expect(
      formatCalendarDate("2026-08-01", "en", { dateStyle: "medium" }),
    ).toBe("Aug 1, 2026");
    expect(
      formatCalendarDate("2026-08-01", "pt", { dateStyle: "medium" }),
    ).toContain("ago");
  });
  it.each([undefined, "", "not-a-date", "2026-02-30"])(
    "does not invent a day from %s",
    (value) => {
      expect(formatCalendarDate(value, "es")).toBe("—");
    },
  );
});
