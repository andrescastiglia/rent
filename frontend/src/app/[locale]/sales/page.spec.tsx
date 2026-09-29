import { act, fireEvent, render, screen } from "@testing-library/react";
import SalesPage from "./page";
import { salesApi } from "@/lib/api/sales";

jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ loading: false }),
}));
jest.mock("@/components/common/CurrencySelect", () => ({
  CurrencySelect: () => null,
}));
jest.mock("@/lib/api/buyers", () => ({
  buyersApi: { getAll: jest.fn().mockResolvedValue([]) },
}));
jest.mock("@/lib/api/properties", () => ({
  propertiesApi: { getAll: jest.fn().mockResolvedValue([]) },
}));
jest.mock("@/lib/api/sales", () => ({
  salesApi: {
    getFolders: jest.fn().mockResolvedValue([]),
    getAgreements: jest.fn(),
    getReceipts: jest.fn(),
    downloadReceiptPdf: jest.fn(),
  },
}));

const receipt = {
  id: "r1",
  receiptNumber: "SREC-1",
  installmentNumber: 1,
  amount: 100,
  currency: "ARS",
  paymentDate: "2026-09-15",
  balanceAfter: 900,
  overdueAmount: 0,
  pdfUrl: null,
};

describe("Sales receipt availability", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (salesApi.getAgreements as jest.Mock).mockResolvedValue([
      {
        id: "a1",
        buyerName: "Buyer",
        totalAmount: 1000,
        paidAmount: 100,
        installmentAmount: 100,
        installmentCount: 10,
      },
    ]);
    (salesApi.getReceipts as jest.Mock).mockResolvedValue([receipt]);
  });
  afterEach(() => jest.useRealTimers());

  it("refreshes pending PDFs, stops polling when ready and displays download errors", async () => {
    await act(async () => {
      render(<SalesPage />);
    });
    expect(screen.getByText("receipts.preparingPdf")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "receipts.download" }),
    ).not.toBeInTheDocument();
    (salesApi.getReceipts as jest.Mock).mockResolvedValue([
      { ...receipt, pdfUrl: "db://document/r1" },
    ]);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("receipts.preparingPdf")).not.toBeInTheDocument();
    (salesApi.downloadReceiptPdf as jest.Mock).mockRejectedValue(
      new Error("expired session"),
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "receipts.download" }),
      );
    });
    expect(salesApi.downloadReceiptPdf).toHaveBeenCalledWith("r1", "SREC-1");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "receipts.downloadError",
    );
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(salesApi.getReceipts).toHaveBeenCalledTimes(2);
  });

  it("retries a failed refresh and stops when the page unmounts", async () => {
    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(<SalesPage />));
    });
    (salesApi.getReceipts as jest.Mock).mockRejectedValueOnce(
      new Error("temporary failure"),
    );
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText("receipts.preparingPdf")).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(salesApi.getReceipts).toHaveBeenCalledTimes(3);
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(salesApi.getReceipts).toHaveBeenCalledTimes(3);
  });
});
