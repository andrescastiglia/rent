import {
  clearAuth,
  getToken,
  getUser,
  isTokenExpired,
  removeToken,
  removeUser,
  setToken,
  setUser,
} from "./auth";

const buildToken = (payload: Record<string, unknown>) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `a.${encoded}.c`;
};

describe("auth helpers", () => {
  const originalMockMode = process.env.NEXT_PUBLIC_MOCK_MODE;

  const restoreMockMode = () => {
    if (originalMockMode === undefined) {
      delete process.env.NEXT_PUBLIC_MOCK_MODE;
    } else {
      process.env.NEXT_PUBLIC_MOCK_MODE = originalMockMode;
    }
  };

  beforeEach(() => {
    restoreMockMode();
    clearAuth();
    localStorage.clear();
    jest.useRealTimers();
  });

  afterAll(restoreMockMode);

  it("stores token durably and keeps sanitized user in memory only", () => {
    setToken("token-1");
    setUser({
      id: "1",
      email: "admin@example.com",
      firstName: "Ada",
      lastName: "Admin",
      phone: "+5411",
      role: "admin",
      password: "secret",
      accessToken: "token",
    });

    expect(getToken()).toBe("token-1");
    expect(localStorage.getItem("auth_user")).toBeNull();
    expect(getUser()).toEqual({
      id: "1",
      email: null,
      firstName: "Ada",
      lastName: "Admin",
      avatarUrl: null,
      role: "admin",
    });

    removeToken();
    removeUser();

    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("handles corrupted auth_user json safely", () => {
    localStorage.setItem("auth_user", "{invalid");

    expect(getUser()).toBeNull();
    expect(localStorage.getItem("auth_user")).toBeNull();
  });

  it("derives a minimal mock user from mock auth tokens", () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = "true";

    setToken("mock-token-1-123");

    expect(getUser()).toEqual({
      id: "1",
      email: "e2e.admin@example.com",
      firstName: "Admin",
      lastName: "User",
      avatarUrl: null,
      language: "es",
      role: "admin",
      isActive: true,
    });
    expect(localStorage.getItem("auth_user")).toBeNull();

    setToken("mock-token-role-owner-123");

    expect(getUser()).toEqual({
      id: "role-owner-1",
      email: "e2e.owner@example.com",
      firstName: "Owner",
      lastName: "User",
      avatarUrl: null,
      language: "es",
      role: "owner",
      isActive: true,
    });
  });

  it("ignores non-mock tokens when deriving mock users", () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = "true";
    setToken("real-token");

    expect(getUser()).toBeNull();
  });

  it("detects token expiration and invalid tokens", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const valid = buildToken({ exp: 1_800_000_000 });
    const expired = buildToken({ exp: 1_600_000_000 });

    expect(isTokenExpired(valid)).toBe(false);
    expect(isTokenExpired(expired)).toBe(true);
    expect(isTokenExpired("invalid")).toBe(true);
    expect(isTokenExpired(buildToken({}))).toBe(true);
  });

  it("clearAuth removes both token and user", () => {
    localStorage.setItem("auth_token", "x");
    localStorage.setItem("auth_user", JSON.stringify({ id: 1 }));

    clearAuth();

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(localStorage.getItem("auth_user")).toBeNull();
  });
});
