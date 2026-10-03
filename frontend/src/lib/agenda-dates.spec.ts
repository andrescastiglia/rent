import {
  addDays,
  calendarRange,
  civilDateTimeToIso,
  dayInZone,
} from "../../../shared/agenda";
describe("company agenda civil dates", () => {
  it("keeps civil dates separate from company instants", () => {
    expect(dayInZone(new Date("2026-10-04T01:00:00Z"))).toBe("2026-10-03");
    expect(
      civilDateTimeToIso("2026-10-04T09:00", "America/Argentina/Buenos_Aires"),
    ).toBe("2026-10-04T12:00:00.000Z");
  });
  it("uses Monday weeks across months and leap-year month ends", () => {
    expect(calendarRange("2026-10-01", "week")).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
    });
    expect(calendarRange("2028-02-10", "month")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("respects seasonal offsets and rejects nonexistent DST times", () => {
    expect(civilDateTimeToIso("2026-07-01T09:00", "America/New_York")).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(civilDateTimeToIso("2026-01-01T09:00", "America/New_York")).toBe(
      "2026-01-01T14:00:00.000Z",
    );
    expect(() =>
      civilDateTimeToIso("2026-03-08T02:30", "America/New_York"),
    ).toThrow();
  });
});
