import { act, renderHook } from "@testing-library/react";
import { useWorkflowMutation } from "./useWorkflowMutation";
import { ApiRequestError } from "@/lib/api";
it("freezes an uncertain payload and only recovers after an explicit call", async () => {
  const execute = jest
    .fn()
    .mockRejectedValueOnce(new Error("lost response"))
    .mockResolvedValueOnce({ id: "original" });
  const { result } = renderHook(() => useWorkflowMutation(execute));
  await act(() => result.current.submit({ amount: 10 }));
  expect(execute).toHaveBeenCalledTimes(1);
  expect(result.current.pending).toEqual({ amount: 10 });
  await act(() => result.current.submit({ amount: 20 }));
  expect(execute).toHaveBeenLastCalledWith({ amount: 10 });
  expect(result.current.success).toBe(true);
  expect(result.current.pending).toBeUndefined();
});
it("allows correcting a definite first rejection and resetting the success state", async () => {
  const execute = jest
    .fn()
    .mockRejectedValueOnce(new ApiRequestError(422, "invalid"))
    .mockResolvedValueOnce({});
  const { result } = renderHook(() => useWorkflowMutation(execute));
  await act(() => result.current.submit({ value: 1 }));
  expect(result.current.pending).toBeUndefined();
  expect(result.current.error).toBe("rejected");
  await act(() => result.current.submit({ value: 2 }));
  expect(execute).toHaveBeenLastCalledWith({ value: 2 });
  act(() => result.current.reset());
  expect(result.current.success).toBe(false);
});
it("blocks double submission while a request is active", async () => {
  let finish: () => void = () => {};
  const execute = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useWorkflowMutation(execute));
  let request: Promise<boolean> = Promise.resolve(false);
  act(() => {
    request = result.current.submit({ value: 1 });
  });
  await act(() => result.current.submit({ value: 1 }));
  expect(execute).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await request;
  });
  expect(result.current.busy).toBe(false);
});
