import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MaintenanceAttachments from "./MaintenanceAttachments";
import { maintenanceAttachmentsApi } from "@/lib/api/maintenance-attachments";
import { ApiRequestError } from "@/lib/api";

jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/lib/api/maintenance-attachments", () => ({
  maintenanceAttachmentsApi: {
    list: jest.fn(),
    upload: jest.fn(),
    download: jest.fn(),
  },
}));
const api = jest.mocked(maintenanceAttachmentsApi);
beforeEach(() => {
  jest.clearAllMocks();
  api.list.mockResolvedValue([]);
  api.upload.mockResolvedValue(undefined);
  api.download.mockResolvedValue(undefined);
});
function choose(
  file = new File(["contenido"], "prueba.pdf", { type: "application/pdf" }),
) {
  fireEvent.change(screen.getByLabelText("file"), {
    target: { files: [file] },
  });
  return file;
}
it("lists approved and pending documents without downloading pending files", async () => {
  api.list.mockResolvedValue([
    { id: "approved", name: "Comprobante.pdf", status: "approved" },
    { id: "pending", name: "Imagen.png", status: "pending" },
  ] as never);
  render(<MaintenanceAttachments ticketId="ticket" />);
  await screen.findByText("Comprobante.pdf");
  const buttons = screen.getAllByRole("button", { name: "download" });
  expect(buttons[1]).toBeDisabled();
  fireEvent.click(buttons[0]);
  await waitFor(() =>
    expect(api.download).toHaveBeenCalledWith(
      expect.objectContaining({ id: "approved" }),
    ),
  );
});
it("recovers a failed listing with an explicit read retry", async () => {
  api.list.mockRejectedValueOnce(new Error("offline"));
  render(<MaintenanceAttachments ticketId="ticket" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("readError");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("empty");
  expect(api.list).toHaveBeenCalledTimes(2);
});
it.each([
  new File(["x"], "script.html", { type: "text/html" }),
  new File([], "empty.pdf", { type: "application/pdf" }),
])("rejects unsupported or empty files before sending", async (file) => {
  render(<MaintenanceAttachments ticketId="ticket" />);
  await screen.findByText("empty");
  choose(file);
  expect(screen.getByRole("alert")).toHaveTextContent("invalidFile");
  expect(screen.getByRole("button", { name: "upload" })).toBeDisabled();
  expect(api.upload).not.toHaveBeenCalled();
});
it("uploads once and shows confirmation after refreshing the list", async () => {
  render(<MaintenanceAttachments ticketId="ticket" />);
  await screen.findByText("empty");
  const file = choose();
  fireEvent.click(screen.getByRole("button", { name: "upload" }));
  await screen.findByText("success");
  expect(api.upload).toHaveBeenCalledTimes(1);
  expect(api.upload).toHaveBeenCalledWith("ticket", file);
  expect(screen.getByRole("button", { name: "upload" })).toBeDisabled();
});
it("freezes an uncertain upload and preserves the file through authorization failure on recovery", async () => {
  api.upload
    .mockRejectedValueOnce(new Error("response lost"))
    .mockRejectedValueOnce(new ApiRequestError(403, "access changed"));
  render(<MaintenanceAttachments ticketId="ticket" />);
  await screen.findByText("empty");
  const file = choose();
  fireEvent.click(screen.getByRole("button", { name: "upload" }));
  await screen.findByRole("button", { name: "recover" });
  expect(screen.getByLabelText("file")).toBeDisabled();
  expect(api.upload).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("file")).toBeDisabled();
  expect(api.upload).toHaveBeenLastCalledWith("ticket", file);
});
it("allows correcting a definite first rejection and reports a download failure", async () => {
  api.list.mockResolvedValue([
    { id: "doc", name: "Archivo.pdf", status: "approved" },
  ] as never);
  api.upload.mockRejectedValueOnce(new ApiRequestError(415, "unsupported"));
  api.download.mockRejectedValueOnce(new Error("offline"));
  render(<MaintenanceAttachments ticketId="ticket" />);
  await screen.findByText("Archivo.pdf");
  choose();
  fireEvent.click(screen.getByRole("button", { name: "upload" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("rejected");
  expect(screen.getByLabelText("file")).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "download" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("downloadError"),
  );
});
