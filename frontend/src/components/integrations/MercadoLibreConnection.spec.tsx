import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MercadoLibreConnection } from "./MercadoLibreConnection";
import {
  mercadoLibreApi,
  type MercadoLibreStatus,
} from "@/lib/api/mercadolibre";

jest.mock("@/lib/api/mercadolibre", () => ({
  ...jest.requireActual("@/lib/api/mercadolibre"),
  mercadoLibreApi: {
    status: jest.fn(),
    begin: jest.fn(),
    complete: jest.fn(),
    disconnect: jest.fn(),
  },
}));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const api = jest.mocked(mercadoLibreApi);
const status: MercadoLibreStatus = {
  enabled: true,
  status: "unconfigured",
  sellerId: null,
  expiresAt: null,
};
const callback = { state: "a".repeat(43), code: "secret-code" };
beforeEach(() => {
  jest.resetAllMocks();
  api.status.mockResolvedValue(status);
});
it("shows disabled state without permitting authorization or code exchange", async () => {
  api.status.mockResolvedValue({ ...status, enabled: false });
  render(<MercadoLibreConnection callback={callback} />);
  await screen.findByText("disabled");
  for (const name of ["connect", "complete"]) {
    const button = screen.getByRole("button", { name });
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(api.begin).not.toHaveBeenCalled();
  expect(api.complete).not.toHaveBeenCalled();
});
it("navigates only after an explicit successful begin", async () => {
  const navigate = jest.fn();
  const url = "https://auth.mercadolibre.com.ar/authorization?state=test";
  api.begin.mockResolvedValue({ authorizationUrl: url });
  render(<MercadoLibreConnection navigate={navigate} />);
  await screen.findByText("status.unconfigured");
  fireEvent.click(screen.getByRole("button", { name: "connect" }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith(url));
  expect(api.begin).toHaveBeenCalledTimes(1);
});
it("rejects a malicious navigation response and requires a read refresh", async () => {
  const navigate = jest.fn();
  api.begin.mockResolvedValue({ authorizationUrl: "https://evil.test/" });
  render(<MercadoLibreConnection navigate={navigate} />);
  await screen.findByText("status.unconfigured");
  fireEvent.click(screen.getByRole("button", { name: "connect" }));
  await screen.findByRole("alert");
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "connect" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "connect" })).toBeEnabled(),
  );
});
it("does not automatically exchange on mount and consumes a code only once", async () => {
  api.complete.mockResolvedValue({
    ...status,
    status: "active",
    sellerId: "42",
  });
  render(
    <StrictMode>
      <MercadoLibreConnection callback={callback} />
    </StrictMode>,
  );
  await screen.findByText("status.unconfigured");
  expect(api.complete).not.toHaveBeenCalled();
  const button = screen.getByRole("button", { name: "complete" });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText("completed");
  expect(api.complete).toHaveBeenCalledTimes(1);
  expect(api.complete).toHaveBeenCalledWith(callback);
  expect(screen.queryByText(callback.code)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "complete" }),
  ).not.toBeInTheDocument();
});
it("never retries an ambiguous exchange, including after read refresh", async () => {
  api.complete.mockRejectedValue(new Error("lost response"));
  render(<MercadoLibreConnection callback={callback} />);
  await screen.findByText("status.unconfigured");
  fireEvent.click(screen.getByRole("button", { name: "complete" }));
  await screen.findByRole("alert");
  api.status.mockResolvedValue({ ...status, status: "active" });
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await screen.findByText("status.active");
  expect(
    screen.queryByRole("button", { name: "complete" }),
  ).not.toBeInTheDocument();
  expect(api.complete).toHaveBeenCalledTimes(1);
});
it("allows deliberate local disconnect even while the provider is disabled", async () => {
  api.status.mockResolvedValue({ ...status, enabled: false, status: "active" });
  api.disconnect.mockResolvedValue({
    ...status,
    enabled: false,
    status: "disconnected",
  });
  render(<MercadoLibreConnection />);
  await screen.findByText("status.active");
  fireEvent.click(screen.getByRole("button", { name: "disconnect" }));
  expect(api.disconnect).not.toHaveBeenCalled();
  expect(screen.getByText("disconnectHint")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(screen.queryByText("disconnectHint")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "disconnect" }));
  fireEvent.click(screen.getByRole("button", { name: "confirmDisconnect" }));
  await screen.findByText("status.disconnected");
  expect(api.disconnect).toHaveBeenCalledTimes(1);
});
it.each(["connecting", "refreshing"] as const)(
  "allows recovery of abandoned %s intents; the server enforces claim expiry",
  async (state) => {
    api.status.mockResolvedValue({ ...status, status: state });
    render(<MercadoLibreConnection callback={callback} />);
    await screen.findByText(`status.${state}`);
    expect(screen.getByRole("button", { name: "connect" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "complete" })).toBeEnabled();
  },
);
it("recovers failed status reads without writing", async () => {
  api.status.mockRejectedValueOnce(new Error("offline"));
  render(<MercadoLibreConnection callback={null} />);
  await screen.findByText("error");
  expect(screen.getByText("invalidCallback")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "refresh" }));
  await screen.findByText("status.unconfigured");
  expect(api.begin).not.toHaveBeenCalled();
});
it.each([true, false])(
  "ignores reads settling after unmount (%s)",
  async (success) => {
    let resolve!: (value: MercadoLibreStatus) => void;
    let reject!: (error: Error) => void;
    api.status.mockReturnValue(
      new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      }),
    );
    const view = render(<MercadoLibreConnection />);
    view.unmount();
    await act(async () => {
      if (success) resolve(status);
      else reject(new Error("offline"));
    });
    expect(api.begin).not.toHaveBeenCalled();
  },
);
