import { render, screen } from "@testing-library/react";
import { PaymentStatusBadge } from "./PaymentStatusBadge";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `t:${key}`,
}));

describe("PaymentStatusBadge", () => {
  it("renders translated status and class for completed", () => {
    render(<PaymentStatusBadge status="completed" />);

    const badge = screen.getByText("t:status.completed");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-green-100");
  });
});
