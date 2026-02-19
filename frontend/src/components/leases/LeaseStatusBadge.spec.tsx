import { render, screen } from "@testing-library/react";
import { LeaseStatusBadge } from "./LeaseStatusBadge";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `t:${key}`,
}));

describe("LeaseStatusBadge", () => {
  it("renders translated status and style class", () => {
    render(<LeaseStatusBadge status="ACTIVE" />);

    const badge = screen.getByText("t:status.active");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("bg-green-100");
  });
});
