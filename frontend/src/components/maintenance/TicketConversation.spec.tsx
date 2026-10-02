import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TicketConversation from "./TicketConversation";
import { maintenanceApi } from "@/lib/api/maintenance";
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "es",
}));
jest.mock("@/lib/api/maintenance", () => ({
  maintenanceApi: { getComments: jest.fn(), addComment: jest.fn() },
}));
const api = jest.mocked(maintenanceApi);
beforeEach(() => {
  jest.clearAllMocks();
  api.getComments.mockResolvedValue([]);
  api.addComment.mockResolvedValue({} as never);
});
it("only displays public comments and reports read failures with retry", async () => {
  api.getComments
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([
      {
        id: "internal",
        body: "Nota privada",
        isInternal: true,
        createdAt: "2026-10-01",
      },
      {
        id: "public",
        body: "Visita coordinada",
        isInternal: false,
        createdAt: "2026-10-01",
        user: { firstName: "Ana", lastName: "Pérez" },
      },
    ] as never);
  render(<TicketConversation ticketId="ticket" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("commentsError");
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByText("Visita coordinada");
  expect(screen.queryByText("Nota privada")).not.toBeInTheDocument();
  expect(screen.getByText(/Ana Pérez/)).toBeInTheDocument();
});
it("posts an explicit public comment and blocks a duplicate until content changes", async () => {
  render(<TicketConversation ticketId="ticket" />);
  fireEvent.change(screen.getByLabelText("newComment"), {
    target: { value: "  Coordinar martes  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "sendComment" }));
  await screen.findByText("commentSuccess");
  expect(api.addComment).toHaveBeenCalledWith(
    "ticket",
    "Coordinar martes",
    false,
  );
  expect(screen.getByRole("button", { name: "sendComment" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("newComment"), {
    target: { value: "Nueva información" },
  });
  expect(screen.getByRole("button", { name: "sendComment" })).toBeEnabled();
});
it("does not retry an uncertain comment automatically and reuses the frozen request", async () => {
  api.addComment.mockRejectedValueOnce(new Error("response lost"));
  render(<TicketConversation ticketId="ticket" />);
  fireEvent.change(screen.getByLabelText("newComment"), {
    target: { value: "Información" },
  });
  fireEvent.click(screen.getByRole("button", { name: "sendComment" }));
  await screen.findByRole("button", { name: "recover" });
  expect(screen.getByLabelText("newComment")).toBeDisabled();
  expect(api.addComment).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "recover" }));
  await waitFor(() => expect(api.addComment).toHaveBeenCalledTimes(2));
  await screen.findByText("commentSuccess");
  expect(api.addComment).toHaveBeenLastCalledWith(
    "ticket",
    "Información",
    false,
  );
});
