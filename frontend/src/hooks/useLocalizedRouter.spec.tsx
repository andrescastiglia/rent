import { renderHook } from "@testing-library/react";
import { useLocalizedRouter } from "./useLocalizedRouter";

let mockPathname = "/es/dashboard";
const push = jest.fn();
const replace = jest.fn();
const back = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push, replace, back, refresh }),
}));

describe("useLocalizedRouter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves locale from pathname and localizes push/replace", () => {
    mockPathname = "/pt/leases";
    const { result } = renderHook(() => useLocalizedRouter());

    expect(result.current.locale).toBe("pt");
    expect(result.current.localizePath("/dashboard")).toBe("/pt/dashboard");
    expect(result.current.localizePath("/pt/settings")).toBe("/pt/settings");

    result.current.push("/invoices");
    result.current.replace("payments");

    expect(push).toHaveBeenCalledWith("/pt/invoices");
    expect(replace).toHaveBeenCalledWith("/pt/payments");
  });

  it("falls back to es locale and exposes back/refresh", () => {
    mockPathname = "/dashboard";
    const { result } = renderHook(() => useLocalizedRouter());

    expect(result.current.locale).toBe("es");
    expect(result.current.localizePath("/x")).toBe("/es/x");

    result.current.back();
    result.current.refresh();

    expect(back).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });
});
