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
  beforeEach(() => {
    localStorage.clear();
    jest.useRealTimers();
  });

  it("stores and reads token/user from localStorage", () => {
    setToken("token-1");
    setUser({ id: "1", name: "Admin" });

    expect(getToken()).toBe("token-1");
    expect(getUser()).toEqual({ id: "1", name: "Admin" });

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
