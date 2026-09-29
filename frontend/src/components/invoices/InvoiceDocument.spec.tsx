import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { InvoiceDocument } from "./InvoiceDocument";
import { invoiceDocumentsApi } from "@/lib/api/invoice-documents";
jest.mock("@/lib/api/invoice-documents", () => ({
  invoiceDocumentsApi: { status: jest.fn(), download: jest.fn() },
}));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const api = jest.mocked(invoiceDocumentsApi);
beforeEach(() => {
  jest.resetAllMocks();
  api.status.mockResolvedValue({ status: "queued", available: false });
  api.download.mockResolvedValue(undefined);
});
it("keeps pending and dead letter documents unavailable and refreshes reads only", async () => {
  render(<InvoiceDocument invoiceId="lease" scopeKey="company:user" />);
  await screen.findByText("queued");
  expect(screen.getByRole("button", { name: "download" })).toBeDisabled();
  api.status.mockResolvedValue({ status: "dead_letter", available: false });
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await screen.findByText("deadLetter");
  expect(api.download).not.toHaveBeenCalled();
  api.status.mockResolvedValue({ status: "completed", available: true });
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await screen.findByText("available");
  fireEvent.click(screen.getByRole("button", { name: "download" }));
  await waitFor(() => expect(api.download).toHaveBeenCalledWith("lease"));
});
it("reports download failure and requires a read before another attempt", async () => {
  api.status.mockResolvedValue({ status: "completed", available: true });
  api.download.mockRejectedValueOnce(new Error("corrupt"));
  render(<InvoiceDocument invoiceId="lease" scopeKey="company:user" />);
  await screen.findByText("available");
  fireEvent.click(screen.getByRole("button", { name: "download" }));
  await screen.findByText("downloadError");
  expect(screen.getByRole("button", { name: "download" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "download" })).toBeEnabled(),
  );
  expect(api.download).toHaveBeenCalledTimes(1);
});
it("distinguishes read errors from an unavailable historic document", async () => {
  api.status.mockRejectedValueOnce(new Error("offline"));
  render(<InvoiceDocument invoiceId="lease" scopeKey="company:user" />);
  await screen.findByText("readError");
  expect(screen.queryByText("unavailable")).not.toBeInTheDocument();
  api.status.mockResolvedValue({ status: "unavailable", available: false });
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await screen.findByText("unavailable");
  expect(screen.queryByText("readError")).not.toBeInTheDocument();
});
it("ignores an old company response and resets the selected document without relying on parent keys", async () => {
  let resolve!: (value: { status: "completed"; available: boolean }) => void;
  api.status.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = render(
    <InvoiceDocument invoiceId="old" scopeKey="company:user" />,
  );
  view.rerender(<InvoiceDocument invoiceId="new" scopeKey="another:user" />);
  await screen.findByText("queued");
  await act(async () => resolve({ status: "completed", available: true }));
  expect(screen.queryByText("available")).not.toBeInTheDocument();
  expect(api.download).not.toHaveBeenCalled();
});
