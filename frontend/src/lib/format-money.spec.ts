import {
  formatMoney,
  formatMoneyByCode,
  normalizeRoundedNumber,
} from "./format-money";

describe("money formatting", () => {
  it.each([
    [0, 0],
    [-0, 0],
    [-0.0, 0],
    [-0.0001, 0],
    [-0.005, -0.01],
  ])("normalizes %p at two decimals to %p", (value, expected) => {
    expect(normalizeRoundedNumber(value, 2)).toBe(expected);
  });

  it("never renders a negative sign for amounts rounded to zero", () => {
    const currency = {
      code: "ARS",
      symbol: "$",
      decimalPlaces: 2,
      isActive: true,
    };

    expect(formatMoney(-0, currency, "es")).toBe("$ 0,00");
    expect(formatMoney(-0.0001, currency, "es")).toBe("$ 0,00");
    expect(formatMoneyByCode(-0.0001, "USD", "en")).toBe("US$ 0.00");
  });
});
