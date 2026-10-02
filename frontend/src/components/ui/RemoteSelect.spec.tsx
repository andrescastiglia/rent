import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { RemoteSelect, type RemoteOption } from "./RemoteSelect";
import type { PageResult } from "@/lib/pagination";
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
function Harness({
  load,
}: Readonly<{
  load: (search: string, page: number) => Promise<PageResult<RemoteOption>>;
}>) {
  const [value, setValue] = useState("");
  return (
    <RemoteSelect
      id="person"
      label="Person"
      value={value}
      onChange={setValue}
      load={load}
      required
    />
  );
}
const page = (number: number) => ({
  data: [{ value: `person${number}`, label: `Contact ${number}` }],
  total: 2,
  page: number,
  limit: 1,
});
it("loads later server pages and preserves the selected identity across them", async () => {
  const load = jest.fn(async (_search: string, p: number) => page(p));
  render(<Harness load={load} />);
  await screen.findByRole("option", { name: "Contact 1" });
  fireEvent.change(screen.getByLabelText("Person"), {
    target: { value: "person1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "next" }));
  await screen.findByRole("option", { name: "Contact 2" });
  expect(load).toHaveBeenLastCalledWith("", 2);
  expect(screen.getByLabelText("Person")).toHaveValue("person1");
  expect(screen.getByRole("option", { name: "Contact 1" })).toBeInTheDocument();
});
it("reports a failed read, disables invalid choices and retries only explicitly", async () => {
  const load = jest
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(page(1));
  render(<Harness load={load} />);
  await screen.findByText("error");
  expect(screen.getByLabelText("Person")).toBeDisabled();
  expect(load).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await screen.findByRole("option", { name: "Contact 1" });
  expect(load).toHaveBeenCalledTimes(2);
});
it("debounces server search and discards an obsolete response", async () => {
  let finish: ((value: PageResult<RemoteOption>) => void) | undefined;
  const load = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(page(2));
  render(<Harness load={load} />);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "later" },
  });
  await waitFor(() => expect(load).toHaveBeenLastCalledWith("later", 1));
  await screen.findByRole("option", { name: "Contact 2" });
  finish?.(page(1));
  await waitFor(() =>
    expect(
      screen.queryByRole("option", { name: "Contact 1" }),
    ).not.toBeInTheDocument(),
  );
});
