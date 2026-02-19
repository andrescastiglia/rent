import { render, screen } from "@testing-library/react";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `t:${key}`,
}));

describe("InvoiceStatusBadge", () => {
  it("renders translated status and correct class for overdue", () => {
    render(<InvoiceStatusBadge status="overdue" />);

    const badge = screen.getByText("t:status.overdue");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-orange-100");
  });
});
