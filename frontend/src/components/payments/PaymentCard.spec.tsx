import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PaymentCard } from "./PaymentCard";
import { CreditNote, Payment } from "@/types/payment";

const mockPayments = { downloadReceiptPdf: jest.fn() };
const mockInvoices = {
  listCreditNotes: jest.fn(),
  downloadPdf: jest.fn(),
  downloadCreditNotePdf: jest.fn(),
};
const mockTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => mockTranslate,
  useLocale: () => "es",
}));
jest.mock("@/lib/api/payments", () => ({
  paymentsApi: {
    downloadReceiptPdf: (...args: unknown[]) =>
      mockPayments.downloadReceiptPdf(...args),
  },
  invoicesApi: {
    listCreditNotes: (...args: unknown[]) =>
      mockInvoices.listCreditNotes(...args),
    downloadPdf: (...args: unknown[]) => mockInvoices.downloadPdf(...args),
    downloadCreditNotePdf: (...args: unknown[]) =>
      mockInvoices.downloadCreditNotePdf(...args),
  },
}));

describe("PaymentCard", () => {
  const payment = {
    id: "payment",
    amount: 1234.5,
    currencyCode: "ARS",
    status: "completed",
    paymentDate: "2026-10-01",
    method: "cash",
    activityType: "monthly",
    reference: "Referencia",
    invoiceId: "invoice",
    receipt: { receiptNumber: "R-001", pdfUrl: "/receipt.pdf" },
  } as Payment;
  const note = {
    id: "note",
    paymentId: "payment",
    noteNumber: "NC-001",
  } as CreditNote;
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoices.listCreditNotes.mockResolvedValue([note]);
    mockPayments.downloadReceiptPdf.mockResolvedValue(undefined);
    mockInvoices.downloadPdf.mockResolvedValue(undefined);
    mockInvoices.downloadCreditNotePdf.mockResolvedValue(undefined);
    consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });
  afterEach(() => consoleError.mockRestore());

  it("renders payment identity, amount, status and the localized details link", async () => {
    render(<PaymentCard payment={payment} />);
    await screen.findByRole("button", { name: "actions.downloadCreditNote" });
    expect(screen.getByText("Referencia")).toBeInTheDocument();
    expect(screen.getByText("R-001")).toBeInTheDocument();
    expect(screen.getByText("Mensual")).toBeInTheDocument();
    expect(screen.getByText("status.completed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "view" })).toHaveAttribute(
      "href",
      "/es/payments/payment",
    );
  });
  it("downloads each document using its persisted identifier and number", async () => {
    render(<PaymentCard payment={payment} />);
    await screen.findByRole("button", { name: "actions.downloadCreditNote" });
    fireEvent.click(
      screen.getByRole("button", { name: "actions.downloadReceipt" }),
    );
    await waitFor(() =>
      expect(mockPayments.downloadReceiptPdf).toHaveBeenCalledWith(
        "payment",
        "R-001",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "actions.downloadInvoice" }),
    );
    await waitFor(() =>
      expect(mockInvoices.downloadPdf).toHaveBeenCalledWith("invoice"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "actions.downloadCreditNote" }),
    );
    await waitFor(() =>
      expect(mockInvoices.downloadCreditNotePdf).toHaveBeenCalledWith(
        "note",
        "NC-001",
      ),
    );
  });
  it("keeps an unprepared receipt unavailable for download", async () => {
    render(
      <PaymentCard
        payment={{ ...payment, receipt: { ...payment.receipt!, pdfUrl: null } }}
      />,
    );
    await screen.findByRole("button", { name: "actions.downloadCreditNote" });
    expect(
      screen.getByRole("button", { name: "receiptPreparingDescription" }),
    ).toBeDisabled();
    expect(mockPayments.downloadReceiptPdf).not.toHaveBeenCalled();
  });
  it("does not read invoice corrections when no invoice is linked", () => {
    render(
      <PaymentCard
        payment={
          {
            ...payment,
            invoiceId: undefined,
            receipt: undefined,
            reference: undefined,
            method: "unknown",
            activityType: "special",
          } as unknown as Payment
        }
      />,
    );
    expect(screen.getByText("special")).toBeInTheDocument();
    expect(mockInvoices.listCreditNotes).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("only exposes the correction associated with this payment", async () => {
    mockInvoices.listCreditNotes.mockResolvedValue([
      { ...note, paymentId: "other" },
    ]);
    render(<PaymentCard payment={payment} />);
    await waitFor(() =>
      expect(mockInvoices.listCreditNotes).toHaveBeenCalledWith("invoice"),
    );
    expect(
      screen.queryByRole("button", { name: "actions.downloadCreditNote" }),
    ).toBeNull();
  });
  it("handles a failed correction lookup without inventing a document", async () => {
    mockInvoices.listCreditNotes.mockRejectedValue(new Error("unavailable"));
    render(<PaymentCard payment={payment} />);
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to load credit notes for payment card",
        expect.any(Error),
      ),
    );
    expect(
      screen.queryByRole("button", { name: "actions.downloadCreditNote" }),
    ).toBeNull();
  });
  it.each([
    {
      method: "downloadReceiptPdf",
      button: "actions.downloadReceipt",
      source: mockPayments,
      log: "Failed to download receipt from payments list",
    },
    {
      method: "downloadPdf",
      button: "actions.downloadInvoice",
      source: mockInvoices,
      log: "Failed to download invoice from payments list",
    },
    {
      method: "downloadCreditNotePdf",
      button: "actions.downloadCreditNote",
      source: mockInvoices,
      log: "Failed to download credit note from payments list",
    },
  ])(
    "releases $button after a failed download",
    async ({ method, button, source, log }) => {
      (source as Record<string, jest.Mock>)[method].mockRejectedValue(
        new Error("unavailable"),
      );
      render(<PaymentCard payment={payment} />);
      await screen.findByRole("button", { name: "actions.downloadCreditNote" });
      fireEvent.click(screen.getByRole("button", { name: button }));
      await waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(log, expect.any(Error)),
      );
      expect(screen.getByRole("button", { name: button })).toBeEnabled();
    },
  );
  it.each([
    {
      method: "downloadReceiptPdf",
      button: "actions.downloadReceipt",
      source: mockPayments,
    },
    {
      method: "downloadPdf",
      button: "actions.downloadInvoice",
      source: mockInvoices,
    },
    {
      method: "downloadCreditNotePdf",
      button: "actions.downloadCreditNote",
      source: mockInvoices,
    },
  ])(
    "keeps $button disabled until the pending download completes",
    async ({ method, button, source }) => {
      let resolve: (value: unknown) => void = () => undefined;
      (source as Record<string, jest.Mock>)[method].mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      render(<PaymentCard payment={payment} />);
      await screen.findByRole("button", { name: "actions.downloadCreditNote" });
      fireEvent.click(screen.getByRole("button", { name: button }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "loading" })).toBeDisabled(),
      );
      await act(async () => resolve(undefined));
      expect(screen.getByRole("button", { name: button })).toBeEnabled();
    },
  );
  it("ignores a late read response after the payment card has unmounted", async () => {
    let resolve: (value: CreditNote[]) => void = () => undefined;
    mockInvoices.listCreditNotes.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { unmount, container } = render(<PaymentCard payment={payment} />);
    unmount();
    await act(async () => resolve([note]));
    expect(container).toBeEmptyDOMElement();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
