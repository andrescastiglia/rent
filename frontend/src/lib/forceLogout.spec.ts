/** @jest-environment node */

jest.mock("./auth", () => ({
  clearAuth: jest.fn(),
}));

import { clearAuth } from "./auth";
import { forceLogout } from "./forceLogout";

describe("forceLogout", () => {
  const originalLocation = (globalThis as any).location;

  const setLocation = (pathname: string, assign = jest.fn()) => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      writable: true,
      value: {
        pathname,
        assign,
      },
    });
    return assign;
  };

  afterEach(() => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    jest.clearAllMocks();
  });

  it("redirects to locale login path and clears auth", () => {
    const assign = setLocation("/pt/dashboard");

    forceLogout();

    expect(clearAuth).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/pt/login");
  });

  it("avoids redirect loop when already on login", () => {
    const assign = setLocation("/es/login");

    forceLogout();

    expect(clearAuth).toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("falls back to default locale when path has no locale segment", () => {
    const assign = setLocation("/dashboard");

    forceLogout();

    expect(assign).toHaveBeenCalledWith("/es/login");
  });
});
