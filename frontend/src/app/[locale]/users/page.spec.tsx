import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import Page from "./page";
import { usersApi } from "@/lib/api/users";
const mockTranslate = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => mockTranslate }));
jest.mock("@/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: string) => value,
}));
jest.mock("@/lib/api/users", () => ({
  usersApi: {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setActivation: jest.fn(),
    resetPassword: jest.fn(),
  },
}));
const api = jest.mocked(usersApi);
const user = {
  id: "u",
  email: "ana@example.com",
  firstName: "Ana",
  lastName: "Perez",
  role: "staff",
  roles: ["staff", "owner"],
  isActive: true,
  permissions: { payments: true },
  phone: "123",
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = jest.fn(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  });
  jest.clearAllMocks();
  api.list.mockResolvedValue({
    data: [
      user,
      {
        ...user,
        id: "other",
        email: null,
        roles: [],
        role: "owner",
        isActive: false,
      },
    ],
    total: 23,
    page: 1,
    limit: 20,
  } as never);
  api.create.mockResolvedValue({ ...user, id: "new" } as never);
  api.update.mockResolvedValue({ ...user, firstName: "Edited" } as never);
  api.setActivation.mockResolvedValue({ ...user, isActive: false } as never);
  api.resetPassword.mockResolvedValue({
    temporaryPassword: "new-secret",
    message: "changed",
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const mount = async () => {
  const view = render(<Page />);
  await screen.findByRole("table");
  return view;
};
const tableButton = (label: string, index = 0) =>
  within(screen.getByRole("table")).getAllByRole("button", { name: label })[
    index
  ];
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { selector: "input" }), {
    target: { value },
  });
const createForm = async () => {
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "newUser" }));
};
it("paginates on the server, resets the page when searching and renders secondary roles", async () => {
  await mount();
  expect(screen.getByRole("table")).toHaveTextContent("staff, owner");
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(2, 20, ""));
  fireEvent.change(screen.getByLabelText("search"), {
    target: { value: "Perez" },
  });
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith(1, 20, "Perez"),
  );
  expect(screen.getAllByText("Sin email")).toHaveLength(2);
});
it("shows loading failure and does not confuse it with a successful empty list", async () => {
  api.list.mockRejectedValueOnce(new Error("offline"));
  render(<Page />);
  expect(await screen.findByRole("alert")).toHaveTextContent("errors.load");
});
it("creates staff with selected permissions and preserves the primary role in its role list", async () => {
  await createForm();
  change("email", "staff@example.com");
  change("firstName", "Maria");
  change("lastName", "Lopez");
  change("phone", "321");
  change("password", "long-secret");
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "staff" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "roles.tenant" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "roles.tenant" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Pagos" }));
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await screen.findByText("messages.created");
  expect(api.create).toHaveBeenCalledWith({
    email: "staff@example.com",
    password: "long-secret",
    firstName: "Maria",
    lastName: "Lopez",
    phone: "321",
    role: "staff",
    roles: ["staff", "owner"],
    permissions: { payments: true },
  });
  expect(screen.queryByLabelText("password")).not.toBeInTheDocument();
});
it("creates an owner without staff permissions and cancels an unsaved form", async () => {
  await createForm();
  change("email", "owner@example.com");
  change("firstName", "Maria");
  change("lastName", "Lopez");
  change("password", "long-secret");
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await screen.findByText("messages.created");
  expect(api.create).toHaveBeenCalledWith(
    expect.objectContaining({
      role: "owner",
      permissions: {},
      phone: undefined,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "newUser" }));
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(screen.queryByLabelText("password")).not.toBeInTheDocument();
});
it("updates the selected user without changing their password and keeps a failed draft visible", async () => {
  await mount();
  fireEvent.click(tableButton("edit"));
  change("firstName", "Edited");
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await screen.findByText("messages.updated");
  expect(api.update).toHaveBeenCalledWith(
    "u",
    expect.objectContaining({ firstName: "Edited", roles: ["staff", "owner"] }),
  );
  expect(api.update.mock.calls[0][1]).not.toHaveProperty("password");
  fireEvent.click(tableButton("edit"));
  api.update.mockRejectedValueOnce(new Error("lost"));
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("errors.save");
  expect(screen.getByLabelText("firstName")).toHaveValue("Edited");
});
it("activates and deactivates the intended row, surfacing failures", async () => {
  await mount();
  fireEvent.click(tableButton("deactivate"));
  await screen.findByText("messages.deactivated");
  expect(api.setActivation).toHaveBeenCalledWith("u", false);
  api.setActivation.mockResolvedValueOnce({
    ...user,
    id: "other",
    isActive: true,
  } as never);
  fireEvent.click(tableButton("activate", 1));
  await screen.findByText("messages.activated");
  api.setActivation.mockRejectedValueOnce(new Error("denied"));
  fireEvent.click(tableButton("deactivate"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "errors.activation",
  );
});
it("validates and resets a password only after explicit confirmation, then removes its field", async () => {
  const { container } = await mount();
  fireEvent.click(tableButton("resetPassword"));
  const input = container.querySelector("input[type=password]")!;
  fireEvent.change(input, { target: { value: "short" } });
  fireEvent.submit(input.closest("form")!);
  expect(screen.getByText("errors.passwordMinLength")).toBeVisible();
  expect(api.resetPassword).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: " new-secret " } });
  fireEvent.submit(input.closest("form")!);
  await screen.findByText("messages.passwordReset: new-secret");
  expect(api.resetPassword).toHaveBeenCalledWith("u", "new-secret");
  expect(container.querySelector("input[type=password]")).toBeNull();
});
it("keeps password reset failures visible and permits dismissing the dialog", async () => {
  const { container } = await mount();
  fireEvent.click(tableButton("resetPassword"));
  const input = container.querySelector("input[type=password]")!;
  fireEvent.change(input, { target: { value: "long-secret" } });
  api.resetPassword.mockRejectedValueOnce(new Error("denied"));
  fireEvent.submit(input.closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "errors.resetPassword",
  );
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(container.querySelector("input[type=password]")).toBeNull();
});
it("shows the successful empty state after a server search", async () => {
  api.list.mockResolvedValueOnce({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
  } as never);
  await mount();
  expect(screen.getAllByText("noUsers")).toHaveLength(2);
});
