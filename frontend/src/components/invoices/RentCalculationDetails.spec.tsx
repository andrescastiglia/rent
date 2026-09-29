import { render, screen } from "@testing-library/react";
import { RentCalculationDetails } from "./RentCalculationDetails";
import { RentCalculation } from "@/types/payment";
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
const calculation: RentCalculation = {
  version: 1,
  asOf: "2025-04-01",
  currency: "ARS",
  initialRent: "1000.00",
  finalRent: "1197.90",
  applied: true,
  adjustments: [
    {
      baseDate: "2025-01-01",
      effectiveDate: "2025-04-01",
      previousRent: "1000.00",
      newRent: "1197.90",
      type: "inflation_index",
      index: "igp_m",
      lagMonths: 1,
      frequencyMonths: 3,
      scheduleAnchor: "2025-04-01",
      numerator: "11979",
      denominator: "10000",
      observations: [
        {
          id: "obs",
          date: "2025-03-01",
          value: "-1.0000000000",
          revision: 2,
          value_kind: "monthly_percent",
          source: "FGV via BCB",
          source_series: "SGS:189",
          source_url: "https://example.test",
          retrieved_at: "2025-04-01",
        },
      ],
    },
  ],
};
it("shows exact saved observations, negative percentages and revisions without recalculating", () => {
  render(<RentCalculationDetails calculation={calculation} />);
  expect(screen.getByRole("heading", { name: "title" })).toBeVisible();
  expect(screen.getByText(/-1\.0000000000%/)).toBeInTheDocument();
  expect(
    screen.getByText(/FGV via BCB · SGS:189 · revision 2/),
  ).toBeInTheDocument();
  expect(screen.getByText(/lag: 1/)).toBeVisible();
});
it("distinguishes legacy invoices without evidence from generations without adjustments", () => {
  const { rerender, container } = render(
    <RentCalculationDetails calculation={null} />,
  );
  expect(container).toBeEmptyDOMElement();
  rerender(
    <RentCalculationDetails
      calculation={{ ...calculation, adjustments: [] }}
    />,
  );
  expect(screen.getByText("unchanged")).toBeVisible();
});
