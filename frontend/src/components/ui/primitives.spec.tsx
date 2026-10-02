import { fireEvent, render, screen } from "@testing-library/react";
import {
  Button,
  FormField,
  PageHeader,
  StatePanel,
  StatusBadge,
  Surface,
  FilterBar,
} from "./primitives";
import { DataTable, Pagination } from "./DataTable";
import { Dialog } from "./Dialog";
jest.mock("next-intl", () => ({
  useTranslations:
    () =>
    (
      key: string,
      values?: { page: number; totalPages: number; total: number },
    ) =>
      values
        ? `${key} ${values.page}/${values.totalPages} ${values.total}`
        : key,
}));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
it("links field help and validation to its labeled control", () => {
  render(
    <FormField
      id="amount"
      label="Importe"
      help="En pesos"
      error="Revise el importe"
    >
      {(attributes) => <input {...attributes} />}
    </FormField>,
  );
  const control = screen.getByLabelText("Importe");
  expect(control).toHaveAttribute("aria-invalid", "true");
  for (const id of control.getAttribute("aria-describedby")!.split(" "))
    expect(document.getElementById(id)).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Revise el importe");
});
it("does not submit an action or allow another click while busy", () => {
  const click = jest.fn();
  render(
    <form>
      <Button busy onClick={click}>
        Confirmar
      </Button>
    </form>,
  );
  const button = screen.getByRole("button");
  expect(button).toHaveAttribute("type", "button");
  expect(button).toHaveAttribute("aria-busy", "true");
  fireEvent.click(button);
  expect(click).not.toHaveBeenCalled();
});
it("distinguishes an error with recovery from a loading announcement", () => {
  const { rerender } = render(
    <StatePanel busy title="Consultando" description="Espere" />,
  );
  expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  rerender(
    <StatePanel
      error
      title="Falló la consulta"
      action={<Button>Reintentar</Button>}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Falló la consulta");
  expect(
    screen.getByRole("button", { name: "Reintentar" }),
  ).toBeInTheDocument();
});
it("presents one page heading and an explicit primary action", () => {
  render(
    <>
      <PageHeader
        title="Propiedades"
        description="Buscar dirección"
        eyebrow="Operaciones"
        actions={<Button>Nueva propiedad</Button>}
      />
      <FilterBar>
        <FormField id="filter" label="Dirección">
          {(attributes) => <input {...attributes} />}
        </FormField>
      </FilterBar>
      <Surface>
        <StatusBadge tone="success">Disponible</StatusBadge>
      </Surface>
    </>,
  );
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByLabelText("Dirección")).toBeInTheDocument();
  expect(screen.getByText("Disponible")).toBeInTheDocument();
});
it("retains a native table caption, headers and mobile summaries", () => {
  render(
    <DataTable
      items={[{ id: "a", amount: 10 }]}
      rowKey={(item) => item.id}
      caption="Cobros"
      emptyTitle="Sin cobros"
      columns={[
        {
          key: "amount",
          title: "Importe",
          align: "right",
          render: (item) => item.amount,
        },
      ]}
      renderMobileSummary={(item) => <span>Resumen {item.amount}</span>}
    />,
  );
  expect(screen.getByRole("table", { name: "Cobros" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Importe" })).toHaveAttribute(
    "scope",
    "col",
  );
  expect(screen.getByRole("list", { name: "Cobros" })).toHaveTextContent(
    "Resumen 10",
  );
});
it("shows genuine emptiness without constructing an empty table", () => {
  render(
    <DataTable
      items={[]}
      rowKey={String}
      caption="Cobros"
      emptyTitle="Sin cobros"
      columns={[]}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Sin cobros");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it("derives pagination from the server total and prevents out-of-range requests", () => {
  const change = jest.fn();
  const { rerender } = render(
    <Pagination page={1} pageSize={20} total={41} onPageChange={change} />,
  );
  expect(screen.getByText("pageSummary 1/3 41")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "previous" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  expect(change).toHaveBeenCalledWith(2);
  rerender(
    <Pagination page={3} pageSize={20} total={41} onPageChange={change} />,
  );
  expect(screen.getByRole("button", { name: "next" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "previous" }));
  expect(change).toHaveBeenCalledWith(2);
});
it("focuses the native dialog, permits Escape and restores the trigger after close", () => {
  const trigger = document.createElement("button");
  document.body.appendChild(trigger);
  trigger.focus();
  const close = jest.fn();
  const { unmount } = render(
    <Dialog
      open
      title="Revisar cobro"
      description="ARS 100"
      onClose={close}
      actions={<Button>Confirmar</Button>}
    >
      <input aria-label="Motivo" />
    </Dialog>,
  );
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Revisar cobro");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "close" }),
  );
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(close).toHaveBeenCalledTimes(1);
  unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
it("keeps a pending confirmation open when Escape is pressed", () => {
  const close = jest.fn();
  render(
    <Dialog open busy title="Guardando" onClose={close}>
      <p>En proceso</p>
    </Dialog>,
  );
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "close" })).toBeDisabled();
});
