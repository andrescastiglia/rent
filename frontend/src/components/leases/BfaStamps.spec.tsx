import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { BfaStamps } from "./BfaStamps";
import { bfaApi, type BfaLeaseOverview } from "@/lib/api/bfa";

jest.mock("@/lib/api/bfa", () => ({
  bfaApi: { forLease: jest.fn(), request: jest.fn() },
}));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const get = jest.mocked(bfaApi.forLease);
const request = jest.mocked(bfaApi.request);
const overview = (enabled: boolean): BfaLeaseOverview => ({
  enabled,
  documents: [
    {
      id: "document",
      name: "Contrato.pdf",
      sha256: null,
      status: null,
      currentVersion: true,
      verifiedAt: null,
      proof: null,
    },
  ],
});
beforeEach(() => jest.resetAllMocks());

it("displays disabled state and never allows submission", async () => {
  get.mockResolvedValue(overview(false));
  render(<BfaStamps leaseId="lease" />);
  expect(await screen.findByText("disabled")).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "requestDocument" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(request).not.toHaveBeenCalled();
});
it("enqueues only the chosen document and refreshes without resubmitting", async () => {
  get.mockResolvedValueOnce(overview(true)).mockResolvedValue({
    enabled: true,
    documents: [{ ...overview(true).documents[0], status: "queued" }],
  });
  render(<BfaStamps leaseId="lease" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "requestDocument" }),
  );
  await screen.findByText("status.queued");
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith("document");
  expect(
    screen.getByRole("button", { name: "requestDocument" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
  expect(request).toHaveBeenCalledTimes(1);
});
it("requires a read refresh after an ambiguous submission error", async () => {
  get.mockResolvedValue(overview(true));
  request.mockRejectedValue(new Error("response lost"));
  render(<BfaStamps leaseId="lease" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "requestDocument" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("error");
  expect(
    screen.getByRole("button", { name: "requestDocument" }),
  ).toBeDisabled();
  get.mockResolvedValue({
    enabled: true,
    documents: [{ ...overview(true).documents[0], status: "submitted" }],
  });
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await screen.findByText("status.submitted");
  expect(request).toHaveBeenCalledTimes(1);
});
it("shows previous-version evidence separately from the current file", async () => {
  get.mockResolvedValue({
    enabled: true,
    documents: [
      {
        ...overview(true).documents[0],
        currentVersion: false,
        sha256: "a".repeat(64),
        status: "stamped",
        proof: {
          stamped: true,
          stamps: [
            {
              blocknumber: "42",
              blocktimestamp: 1700000000,
              whostamped: "0x123",
            },
          ],
        },
      },
    ],
  });
  render(<BfaStamps leaseId="lease" />);
  expect(await screen.findByText("changed")).toBeInTheDocument();
  expect(screen.getByText(`SHA-256: ${"a".repeat(64)}`)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "requestDocument" })).toBeEnabled();
});
it("handles empty and failed reads with a refresh action", async () => {
  get
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ enabled: false, documents: [] });
  render(<BfaStamps leaseId="lease" />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  expect(await screen.findByText("empty")).toBeInTheDocument();
});
it.each([true, false])(
  "ignores a read completing after unmount (%s)",
  async (success) => {
    let resolve!: (data: BfaLeaseOverview) => void;
    let reject!: (error: Error) => void;
    get.mockReturnValue(
      new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      }),
    );
    const view = render(<BfaStamps leaseId="lease" />);
    view.unmount();
    await act(async () => {
      if (success) resolve(overview(false));
      else reject(new Error("offline"));
    });
    expect(request).not.toHaveBeenCalled();
  },
);
