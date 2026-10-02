import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Page from "./page";
import { interestedApi } from "@/lib/api/interested";

const mockTranslate = (key: string) => {
  if (key === "broken") throw new Error("translation missing");
  return key;
};
let mockAuthLoading = false;
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ loading: mockAuthLoading }),
}));
jest.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: string) => value,
}));
jest.mock("@/lib/api/interested", () => ({
  interestedApi: {
    getAll: jest.fn(),
    getSummary: jest.fn(),
    convertToTenant: jest.fn(),
    convertToBuyer: jest.fn(),
    updateMatch: jest.fn(),
  },
}));
const api = jest.mocked(interestedApi);
const profile = {
  id: "i1",
  firstName: "Ana",
  lastName: "Pérez",
  phone: "123",
  status: "interested",
  operations: ["rent", "sale"],
  updatedAt: "2026-01-02",
};
const second = {
  ...profile,
  id: "i2",
  firstName: "Luis",
  lastName: "",
  status: "buyer",
  operations: undefined,
  operation: "sale",
  updatedAt: "2026-01-01",
};
const match = {
  id: "m1",
  propertyId: "p1",
  property: { name: "Casa Centro", operations: ["rent", "sale"] },
  score: 99,
  status: "pending",
  matchReasons: [
    "interested.matchReasons.cityMatches",
    "partialMatch",
    " custom reason ",
  ],
};
const summary = { profile, matches: [match], activities: [] };
beforeEach(() => {
  jest.clearAllMocks();
  mockAuthLoading = false;
  api.getAll.mockResolvedValue({
    data: [profile, second],
    total: 23,
    page: 1,
    limit: 20,
  } as never);
  api.getSummary.mockResolvedValue(summary as never);
  api.convertToTenant.mockResolvedValue(profile as never);
  api.convertToBuyer.mockResolvedValue(profile as never);
  api.updateMatch.mockResolvedValue(match as never);
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(window, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
async function mount() {
  const view = render(<Page />);
  await screen.findByRole("button", { name: /Ana Pérez/ });
  return view;
}
async function select() {
  fireEvent.click(screen.getByRole("button", { name: /Ana Pérez/ }));
  await screen.findByText("Casa Centro");
}

it("paginates and filters on the server, resetting the page for each query", async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await waitFor(() =>
    expect(api.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, limit: 20 }),
    ),
  );
  fireEvent.change(screen.getByLabelText("listSearchPlaceholder"), {
    target: { value: "Ana" },
  });
  await waitFor(() =>
    expect(api.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, name: "Ana" }),
    ),
  );
  fireEvent.change(screen.getByLabelText("filters.allOperations"), {
    target: { value: "sale" },
  });
  fireEvent.change(screen.getByLabelText("filters.allStages"), {
    target: { value: "buyer" },
  });
  await waitFor(() =>
    expect(api.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: "sale", status: "buyer", page: 1 }),
    ),
  );
  expect(screen.getByRole("link", { name: "workflow" })).toHaveAttribute(
    "href",
    "/es/interested/workflow",
  );
});

it("distinguishes an empty result from a failed request and exposes retry", async () => {
  api.getAll.mockRejectedValueOnce(new Error("offline"));
  render(<Page />);
  await screen.findByRole("alert");
  expect(screen.queryByText("empty")).not.toBeInTheDocument();
  api.getAll.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("empty");
});

it("expands matching properties and translates legacy activities while preserving unknown text", async () => {
  api.getSummary.mockResolvedValue({
    ...summary,
    activities: [
      {
        id: "a1",
        subject: "interested.activities.matchContactBody",
        body: "interested.activities.convertedToTenantBody",
        type: "call",
        status: "pending",
        createdAt: "2026-01-01",
        metadata: {},
      },
      {
        id: "a2",
        subject: "Follow up",
        body: "interested.broken",
        type: "note",
        status: "completed",
        dueAt: "2026-02-01",
        createdAt: "2026-01-02",
        metadata: {
          propertyId: "p1",
          tenantId: "t1",
          userEmail: "ana@example.com",
        },
      },
      {
        id: "a3",
        subject: undefined,
        type: "note",
        status: "pending",
        createdAt: "2025-01-01",
      },
    ],
  } as never);
  await mount();
  await select();
  expect(
    screen.getByText(/matchReasons.cityMatches.*custom reason/),
  ).toBeVisible();
  expect(screen.getByText("activities.matchContactBody")).toBeVisible();
  expect(screen.getByText("activities.convertedToTenantBody")).toBeVisible();
  expect(screen.getByText("interested.broken")).toBeVisible();
  expect(
    screen
      .getByRole("link", { name: "actions.newRentalContract" })
      .getAttribute("href"),
  ).toContain("interestedProfileId=i1");
  expect(
    screen
      .getByRole("link", { name: "actions.newSaleContract" })
      .getAttribute("href"),
  ).toContain("buyerProfileId=i1");
  fireEvent.click(screen.getByRole("button", { name: /Ana Pérez/ }));
  expect(screen.queryByText("Casa Centro")).not.toBeInTheDocument();
});

it("recovers a failed profile read without presenting absent matches as an empty success", async () => {
  api.getSummary.mockRejectedValueOnce(new Error("offline"));
  await mount();
  fireEvent.click(screen.getByRole("button", { name: /Ana Pérez/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("errors.detail");
  expect(screen.queryByText("noMatches")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("Casa Centro");
});

it("converts a rental prospect before accepting a match and refreshing its durable result", async () => {
  await mount();
  await select();
  fireEvent.click(screen.getByRole("button", { name: "actions.confirmRent" }));
  await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(2));
  expect(api.convertToTenant).toHaveBeenCalledWith("i1", {});
  expect(api.updateMatch).toHaveBeenCalledWith("i1", "m1", "accepted");
});

it("preserves an existing tenant conversion and accepted match on replay", async () => {
  api.getSummary.mockResolvedValue({
    ...summary,
    profile: { ...profile, convertedToTenantId: "t1" },
    matches: [{ ...match, status: "accepted" }],
  } as never);
  await mount();
  await select();
  expect(screen.getAllByText("matchStatus.accepted")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "actions.confirmRent" }));
  await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(2));
  expect(api.convertToTenant).not.toHaveBeenCalled();
  expect(api.updateMatch).not.toHaveBeenCalled();
});

it("converts a purchase prospect and routes a converted buyer to their own contract", async () => {
  api.getSummary.mockResolvedValue({
    ...summary,
    profile: { ...profile, operations: ["sale"] },
    matches: [{ ...match, property: { operations: ["sale"] } }],
  } as never);
  await mount();
  fireEvent.click(screen.getByRole("button", { name: /Ana Pérez/ }));
  await screen.findByText("p1");
  fireEvent.click(
    screen.getByRole("button", { name: "actions.confirmPurchase" }),
  );
  await waitFor(() =>
    expect(api.convertToBuyer).toHaveBeenCalledWith("i1", {
      notes: "actions.purchaseConfirmedReason",
    }),
  );
  await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(2));
  api.getSummary.mockResolvedValue({
    ...summary,
    profile: { ...profile, operations: ["sale"], convertedToBuyerId: "b1" },
    matches: [
      {
        ...match,
        property: { name: "Casa Centro", operations: ["sale"] },
        status: "accepted",
      },
    ],
  } as never);
  fireEvent.click(screen.getByRole("button", { name: /Ana Pérez/ }));
  fireEvent.click(screen.getByRole("button", { name: /Ana Pérez/ }));
  await screen.findByText("Casa Centro");
  expect(
    screen
      .getByRole("link", { name: "actions.newSaleContract" })
      .getAttribute("href"),
  ).toContain("buyerId=b1");
  fireEvent.click(
    screen.getByRole("button", { name: "actions.confirmPurchase" }),
  );
  await waitFor(() => expect(api.getSummary).toHaveBeenCalledTimes(4));
  expect(api.convertToBuyer).toHaveBeenCalledTimes(1);
});

it.each(["convertToTenant", "updateMatch"] as const)(
  "keeps %s failures visible and stops further mutations",
  async (method) => {
    api[method].mockRejectedValueOnce(new Error("conflict"));
    await mount();
    await select();
    fireEvent.click(
      screen.getByRole("button", { name: "actions.confirmRent" }),
    );
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("error"));
    expect(api.getSummary).toHaveBeenCalledTimes(1);
    if (method === "convertToTenant")
      expect(api.updateMatch).not.toHaveBeenCalled();
  },
);

it.each(["rent", "sale"])(
  "uses available property operation %s when prospect preferences differ",
  async (operation) => {
    api.getSummary.mockResolvedValue({
      ...summary,
      profile: {
        ...profile,
        operations: [operation === "rent" ? "sale" : "rent"],
      },
      matches: [
        {
          ...match,
          property: { name: "Casa Centro", operations: [operation] },
        },
      ],
    } as never);
    await mount();
    await select();
    fireEvent.click(
      screen.getByRole("button", {
        name:
          operation === "sale"
            ? "actions.confirmPurchase"
            : "actions.confirmRent",
      }),
    );
    await waitFor(() => expect(api.updateMatch).toHaveBeenCalled());
  },
);

it("does not confirm properties with no available operation and handles missing names", async () => {
  api.getAll.mockResolvedValue({
    data: [
      {
        ...profile,
        firstName: "",
        lastName: "",
        status: undefined,
        operations: undefined,
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  } as never);
  api.getSummary.mockResolvedValue({
    ...summary,
    matches: [
      {
        ...match,
        propertyId: "",
        property: undefined,
        score: undefined,
        matchReasons: [],
      },
    ],
  } as never);
  render(<Page />);
  const row = await screen.findByRole("button", { name: /123/ });
  fireEvent.click(row);
  expect(
    await screen.findByRole("button", { name: "actions.confirmRent" }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("link", { name: "actions.newRentalContract" }),
  ).not.toBeInTheDocument();
});

it("ignores a stale summary after selecting another person", async () => {
  let resolveOld!: (value: unknown) => void;
  api.getSummary.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }) as never,
  );
  api.getSummary.mockResolvedValueOnce({
    profile: second,
    matches: [],
    activities: [],
  } as never);
  await mount();
  fireEvent.click(screen.getByRole("button", { name: /Ana Pérez/ }));
  fireEvent.click(screen.getByRole("button", { name: /Luis/ }));
  await screen.findByText("noMatches");
  await act(async () => resolveOld(summary));
  expect(screen.queryByText("Casa Centro")).not.toBeInTheDocument();
  expect(screen.getByText("noMatches")).toBeVisible();
});

it("waits for authenticated context before loading data", async () => {
  mockAuthLoading = true;
  const view = render(<Page />);
  expect(api.getAll).not.toHaveBeenCalled();
  mockAuthLoading = false;
  view.rerender(<Page />);
  await screen.findByRole("button", { name: /Ana Pérez/ });
});
