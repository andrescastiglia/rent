import { formatMoney, formatMoneyByCode } from "./format-money";

describe("format-money", () => {
  it("formats using locale map and currency decimals", () => {
    const result = formatMoney(
      1500.5,
      { code: "ARS", symbol: "$", decimalPlaces: 2, isActive: true },
      "es",
    );

    expect(result).toContain("$");
    expect(result).toContain("1.500,50");
  });

  it("falls back to default symbol and decimals", () => {
    const result = formatMoney(1000, undefined, "en");

    expect(result).toBe("$ 1,000.00");
  });

  it("supports explicit locale passthrough when not mapped", () => {
    const result = formatMoney(
      1000,
      { code: "EUR", symbol: "EUR", decimalPlaces: 0, isActive: true },
      "de-DE",
    );

    expect(result).toBe("EUR 1.000");
  });

  it("formats by currency code and fallbacks to code as symbol", () => {
    expect(formatMoneyByCode(10, "USD", "en")).toBe("US$ 10.00");
    expect(formatMoneyByCode(10, "XYZ", "en")).toBe("XYZ 10.00");
  });
});
