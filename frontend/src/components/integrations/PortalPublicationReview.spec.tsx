import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortalPublicationReview } from "./PortalPublicationReview";
import {
  portalsApi,
  type PortalListing,
  type PortalOperationOverviewDto,
} from "@/lib/api/portals";
import { mercadoLibreApi } from "@/lib/api/mercadolibre";
jest.mock("@/lib/api/portals", () => ({
  ...jest.requireActual("@/lib/api/portals"),
  portalsApi: {
    list: jest.fn(),
    get: jest.fn(),
    operation: jest.fn(),
    history: jest.fn(),
    candidate: jest.fn(),
    resolve: jest.fn(),
    refresh: jest.fn(),
  },
}));
jest.mock("@/lib/api/mercadolibre", () => ({
  mercadoLibreApi: { status: jest.fn() },
}));
jest.mock("next-intl", () => ({
  useLocale: () => "es",
  useTranslations: () => (key: string) => key,
}));
const api = jest.mocked(portalsApi);
const listing = {
  id: "listing",
  propertyId: "property",
  portal: "mercadolibre",
  externalId: null,
  property: { name: "Apartment" },
} as PortalListing;
const operation = (
  enabled = true,
  status = "needs_review",
): PortalOperationOverviewDto => ({
  enabled,
  job: {
    id: "job",
    operation: "publish",
    status: status as NonNullable<PortalOperationOverviewDto["job"]>["status"],
    errorCode: "create_outcome_unknown",
    attempts: 1,
    updatedAt: new Date().toISOString(),
  },
});
beforeEach(() => {
  jest.resetAllMocks();
  api.list.mockResolvedValue([listing]);
  api.get.mockResolvedValue(listing);
  api.operation.mockResolvedValue(operation());
  api.history.mockResolvedValue([]);
  jest.mocked(mercadoLibreApi.status).mockResolvedValue({
    enabled: true,
    status: "active",
    sellerId: "42",
    expiresAt: null,
  });
});
const mount = async () => {
  render(<PortalPublicationReview propertyId="property" />);
  await screen.findByText("status.needs_review");
};
const choose = (action: string) =>
  fireEvent.change(screen.getByLabelText("actionLabel"), {
    target: { value: action },
  });
const fillReason = () =>
  fireEvent.change(screen.getByLabelText("reason"), {
    target: { value: "Reviewed seller account and property" },
  });
it("keeps local audit readable while disabled and makes no provider operation", async () => {
  api.operation.mockResolvedValue(operation(false));
  await mount();
  expect(screen.getByLabelText("actionLabel")).toBeDisabled();
  expect(screen.getByText("disabled")).toBeInTheDocument();
  fireEvent.click(screen.getByText("history"));
  expect(api.candidate).not.toHaveBeenCalled();
  expect(api.resolve).not.toHaveBeenCalled();
});
it("requires an explicit absence confirmation without allowing a blind retry", async () => {
  await mount();
  expect(
    screen.queryByRole("option", { name: "action.retry" }),
  ).not.toBeInTheDocument();
  choose("confirm_not_created");
  fillReason();
  const button = screen.getByRole("button", { name: "resolve" });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  api.operation.mockResolvedValue(operation(true, "resolved"));
  fireEvent.click(button);
  await screen.findByText("status.resolved");
  expect(api.resolve).toHaveBeenCalledWith("listing", "job", {
    action: "confirm_not_created",
    reason: "Reviewed seller account and property",
    confirmedNoPublication: true,
  });
  expect(api.refresh).not.toHaveBeenCalled();
});
it("verifies the selected item before linking and refreshes its local metadata afterwards", async () => {
  api.candidate.mockResolvedValue({
    id: "MLA123",
    seller_id: 42,
    title: "Remote apartment",
    status: "paused",
    permalink: "https://mercadolibre.com.ar/MLA123",
  });
  await mount();
  choose("link");
  fireEvent.change(screen.getByLabelText("itemId"), {
    target: { value: "MLA123" },
  });
  fillReason();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "resolve" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "verify" }));
  await screen.findByText("Remote apartment");
  expect(screen.getByRole("link", { name: "view" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  api.get.mockResolvedValue({ ...listing, externalId: "MLA123" });
  api.operation.mockResolvedValue(operation(true, "resolved"));
  fireEvent.click(screen.getByRole("button", { name: "resolve" }));
  await screen.findByText("status.resolved");
  expect(api.resolve).toHaveBeenCalledWith("listing", "job", {
    action: "link",
    reason: "Reviewed seller account and property",
    externalId: "MLA123",
  });
  expect(screen.getByText("externalId")).toBeInTheDocument();
});
it("invalidates the preview when the selected ID changes", async () => {
  api.candidate.mockResolvedValue({
    id: "MLA123",
    seller_id: 42,
    status: "active",
    permalink: "https://evil.test/",
  });
  await mount();
  choose("link");
  fireEvent.change(screen.getByLabelText("itemId"), {
    target: { value: "MLA123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "verify" }));
  await screen.findByText("seller");
  expect(screen.queryByRole("link", { name: "view" })).not.toBeInTheDocument();
  fillReason();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("itemId"), {
    target: { value: "MLA456" },
  });
  expect(screen.queryByText("seller")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "resolve" })).toBeDisabled();
});
it("never repeats an uncertain resolution and requires a local read before any next action", async () => {
  api.resolve.mockRejectedValue(new Error("lost response"));
  await mount();
  choose("confirm_not_created");
  fillReason();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "resolve" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "resolve" })).toBeDisabled();
  api.operation.mockResolvedValue(operation(true, "resolved"));
  fireEvent.click(screen.getByRole("button", { name: "read" }));
  await screen.findByText("status.resolved");
  expect(api.resolve).toHaveBeenCalledTimes(1);
});
it("offers retry or accept-remote for a known item and queues a separate remote refresh", async () => {
  api.list.mockResolvedValue([{ ...listing, externalId: "MLA123" }]);
  api.get.mockResolvedValue({ ...listing, externalId: "MLA123" });
  await mount();
  expect(
    screen.queryByRole("option", { name: "action.link" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("option", { name: "action.retry" }),
  ).toBeInTheDocument();
  choose("accept_remote");
  fillReason();
  fireEvent.click(screen.getByRole("checkbox"));
  api.operation.mockResolvedValue(operation(true, "resolved"));
  fireEvent.click(screen.getByRole("button", { name: "resolve" }));
  await screen.findByText("status.resolved");
  expect(api.resolve).toHaveBeenCalledWith("listing", "job", {
    action: "accept_remote",
    reason: "Reviewed seller account and property",
  });
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await waitFor(() => expect(api.refresh).toHaveBeenCalledWith("listing"));
});
it("recovers list errors and excludes unsupported portals", async () => {
  api.list
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue([{ ...listing, portal: "zonaprop" }]);
  render(<PortalPublicationReview propertyId="property" />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "read" }));
  await screen.findByText("empty");
  expect(api.operation).not.toHaveBeenCalled();
});
it("recovers incident read failures with a local refresh", async () => {
  api.operation.mockRejectedValueOnce(new Error("offline"));
  render(<PortalPublicationReview propertyId="property" />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "read" }));
  expect(await screen.findByText("status.needs_review")).toBeVisible();
  expect(api.operation).toHaveBeenCalledTimes(2);
});
it("preserves failed candidate errors without exposing provider messages", async () => {
  api.candidate.mockRejectedValue(new Error("private provider details"));
  await mount();
  choose("link");
  fireEvent.change(screen.getByLabelText("itemId"), {
    target: { value: "MLA123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "verify" }));
  await screen.findByRole("alert");
  expect(
    screen.queryByText("private provider details"),
  ).not.toBeInTheDocument();
  expect(api.resolve).not.toHaveBeenCalled();
});
