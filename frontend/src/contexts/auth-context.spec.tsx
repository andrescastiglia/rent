import React from "react";
import { render, screen, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { AuthProvider, useAuth } from "./auth-context";
import { useRouter, usePathname } from "next/navigation";
import { apiClient } from "@/lib/api";
import { getToken, getUser, setToken, setUser, clearAuth } from "@/lib/auth";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

jest.mock("@/lib/auth", () => ({
  getToken: jest.fn(),
  setToken: jest.fn(),
  getUser: jest.fn(),
  setUser: jest.fn(),
  clearAuth: jest.fn(),
}));

jest.mock("@/lib/permissions", () => ({
  hasModuleAccess: jest.fn().mockReturnValue(true),
}));

const mockPush = jest.fn();

function renderWithAuth(ui?: React.ReactNode) {
  return render(
    <AuthProvider>{ui ?? <span data-testid="child">child</span>}</AuthProvider>,
  );
}

function getAuthContext() {
  let ctx: ReturnType<typeof useAuth> | null = null;
  function Capture() {
    ctx = useAuth();
    return null;
  }
  render(
    <AuthProvider>
      <Capture />
    </AuthProvider>,
  );
  return ctx!;
}

beforeEach(() => {
  jest.clearAllMocks();
  (getToken as jest.Mock).mockReturnValue(null);
  (getUser as jest.Mock).mockReturnValue(null);
  (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  (usePathname as jest.Mock).mockReturnValue("/es/dashboard");
});

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider",
    );
    consoleSpy.mockRestore();
  });
});

describe("AuthProvider", () => {
  it("renders children", () => {
    renderWithAuth(<div>child</div>);
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("provides user and token as null initially", () => {
    const ctx = getAuthContext();
    expect(ctx.user).toBeNull();
    expect(ctx.token).toBeNull();
  });

  it("provides loading state", () => {
    const ctx = getAuthContext();
    // loading = !getHydratedSnapshot() => !true => false in client env
    expect(ctx.loading).toBe(false);
  });

  describe("login", () => {
    it("navigates to portal/tenant for tenant role", async () => {
      (usePathname as jest.Mock).mockReturnValue("/es/login");
      (apiClient.post as jest.Mock).mockResolvedValue({
        accessToken: "tok",
        user: {
          role: "tenant",
          id: "1",
          email: "a@b.com",
          firstName: "A",
          lastName: "B",
        },
      });

      const ctx = getAuthContext();
      await act(async () => {
        await ctx.login({ email: "a@b.com", password: "pass" });
      });

      expect(setToken).toHaveBeenCalledWith("tok");
      expect(mockPush).toHaveBeenCalledWith("/es/portal/tenant");
    });

    it("navigates to portal/owner for owner role", async () => {
      (usePathname as jest.Mock).mockReturnValue("/es/login");
      (apiClient.post as jest.Mock).mockResolvedValue({
        accessToken: "tok",
        user: {
          role: "owner",
          id: "1",
          email: "a@b.com",
          firstName: "A",
          lastName: "B",
        },
      });

      const ctx = getAuthContext();
      await act(async () => {
        await ctx.login({ email: "a@b.com", password: "pass" });
      });

      expect(mockPush).toHaveBeenCalledWith("/es/portal/owner");
    });

    it("navigates to dashboard for admin role", async () => {
      (usePathname as jest.Mock).mockReturnValue("/es/login");
      (apiClient.post as jest.Mock).mockResolvedValue({
        accessToken: "tok",
        user: {
          role: "admin",
          id: "1",
          email: "a@b.com",
          firstName: "A",
          lastName: "B",
        },
      });

      const ctx = getAuthContext();
      await act(async () => {
        await ctx.login({ email: "a@b.com", password: "pass" });
      });

      expect(mockPush).toHaveBeenCalledWith("/es/dashboard");
    });

    it('uses "es" fallback when locale in path is invalid', async () => {
      (usePathname as jest.Mock).mockReturnValue("/xyz/something");
      (apiClient.post as jest.Mock).mockResolvedValue({
        accessToken: "tok",
        user: {
          role: "admin",
          id: "1",
          email: "a@b.com",
          firstName: "A",
          lastName: "B",
        },
      });

      const ctx = getAuthContext();
      await act(async () => {
        await ctx.login({ email: "a@b.com", password: "pass" });
      });

      expect(mockPush).toHaveBeenCalledWith("/es/dashboard");
    });

    it("calls apiClient.post with /auth/login and credentials", async () => {
      (usePathname as jest.Mock).mockReturnValue("/es/login");
      (apiClient.post as jest.Mock).mockResolvedValue({
        accessToken: "tok",
        user: {
          role: "staff",
          id: "1",
          email: "a@b.com",
          firstName: "A",
          lastName: "B",
        },
      });

      const credentials = { email: "a@b.com", password: "pass" };
      const ctx = getAuthContext();
      await act(async () => {
        await ctx.login(credentials);
      });

      expect(apiClient.post).toHaveBeenCalledWith("/auth/login", credentials);
    });
  });

  describe("logout", () => {
    it("clears auth and navigates to /locale/login", () => {
      (usePathname as jest.Mock).mockReturnValue("/es/dashboard");

      const ctx = getAuthContext();
      act(() => {
        ctx.logout();
      });

      expect(clearAuth).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/es/login");
    });

    it("uses pt locale when path starts with /pt", () => {
      (usePathname as jest.Mock).mockReturnValue("/pt/dashboard");

      const ctx = getAuthContext();
      act(() => {
        ctx.logout();
      });

      expect(mockPush).toHaveBeenCalledWith("/pt/login");
    });
  });

  describe("register", () => {
    it("calls apiClient.post with /auth/register and data, returns response", async () => {
      const registerData = {
        email: "new@b.com",
        password: "pass",
        firstName: "New",
        lastName: "User",
        captchaToken: "cap",
      };
      const mockResponse = { id: "2", email: "new@b.com" };
      (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const ctx = getAuthContext();
      let result: unknown;
      await act(async () => {
        result = await ctx.register(registerData);
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        "/auth/register",
        registerData,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("updateUser", () => {
    it("calls setUser with the new user", () => {
      const newUser = {
        id: "1",
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        role: "admin" as const,
      };

      const ctx = getAuthContext();
      act(() => {
        ctx.updateUser(newUser);
      });

      expect(setUser).toHaveBeenCalledWith(newUser);
    });
  });

  describe("storage event", () => {
    it("re-reads auth on window storage event", () => {
      (getToken as jest.Mock).mockReturnValue("initial-token");
      (getUser as jest.Mock).mockReturnValue({
        id: "1",
        email: "a@b.com",
        firstName: "A",
        lastName: "B",
        role: "admin",
      });

      renderWithAuth();

      act(() => {
        window.dispatchEvent(new Event("storage"));
      });

      // The component should still render without errors after storage event
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });
  });
});
