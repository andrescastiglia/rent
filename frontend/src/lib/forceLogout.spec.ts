/** @jest-environment node */

jest.mock("./auth", () => ({
  clearAuth: jest.fn(),
}));

import { clearAuth } from "./auth";
import { forceLogout } from "./forceLogout";

describe("forceLogout", () => {
  const originalLocation = (globalThis as any).location;

  const setLocation = (pathname: string, replace = jest.fn()) => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      writable: true,
      value: {
        pathname,
        replace,
      },
    });
    return replace;
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
    const replace = setLocation("/pt/dashboard");

    forceLogout();

    expect(clearAuth).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/pt/login");
  });

  it("avoids redirect loop when already on login", () => {
    const replace = setLocation("/es/login");

    forceLogout();

    expect(clearAuth).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("falls back to default locale when path has no locale segment", () => {
    const replace = setLocation("/dashboard");

    forceLogout();

    expect(replace).toHaveBeenCalledWith("/es/login");
  });
});
