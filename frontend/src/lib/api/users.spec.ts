type MockedApiClient = {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
};

type MockedAuth = {
  getToken: jest.Mock;
  getUser: jest.Mock;
  setUser: jest.Mock;
};

async function loadUsersApi(mockMode: boolean): Promise<{
  apiClient: MockedApiClient;
  auth: MockedAuth;
  usersApi: typeof import("./users").usersApi;
}> {
  jest.resetModules();

  const apiClient: MockedApiClient = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  };
  const auth: MockedAuth = {
    getToken: jest.fn(),
    getUser: jest.fn(),
    setUser: jest.fn(),
  };

  jest.doMock("../api", () => ({
    apiClient,
    IS_MOCK_MODE: mockMode,
  }));

  jest.doMock("../auth", () => auth);

  const { usersApi } = await import("./users");
  return { apiClient, auth, usersApi };
}

async function resolveMockDelay<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(250);
  return promise;
}

describe("usersApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-30T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the stored mock profile with normalized nullable fields and fallback language", async () => {
    const { usersApi, auth, apiClient } = await loadUsersApi(true);
    auth.getUser.mockReturnValue({
      id: "7",
      email: "owner@example.com",
      firstName: "Olga",
      lastName: "Owner",
      phone: undefined,
      avatarUrl: undefined,
      language: "de",
      role: "owner",
      permissions: { leases: true },
    });

    await expect(resolveMockDelay(usersApi.getMyProfile())).resolves.toEqual({
      id: "7",
      email: "owner@example.com",
      firstName: "Olga",
      lastName: "Owner",
      phone: null,
      avatarUrl: null,
      language: "es",
      role: "owner",
      permissions: { leases: true },
    });
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("returns the default mock profile when there is no stored user", async () => {
    const { usersApi, auth } = await loadUsersApi(true);
    auth.getUser.mockReturnValue(null);

    await expect(resolveMockDelay(usersApi.getMyProfile())).resolves.toEqual(
      expect.objectContaining({
        id: "1",
        email: "admin@example.com",
        language: "es",
        role: "admin",
      }),
    );
  });

  it("updates the mock profile, preserves current avatar when omitted, and persists the merged user", async () => {
    const { usersApi, auth, apiClient } = await loadUsersApi(true);
    auth.getUser.mockReturnValue({
      id: "9",
      email: "staff@example.com",
      firstName: "Sara",
      lastName: "Staff",
      phone: "+54 11 5555 0000",
      avatarUrl: "/avatar.png",
      language: "pt",
      role: "staff",
      permissions: { dashboard: true },
    });

    await expect(
      resolveMockDelay(
        usersApi.updateMyProfile({
          firstName: "Silvia",
          language: "en",
        }),
      ),
    ).resolves.toEqual({
      id: "9",
      email: "staff@example.com",
      firstName: "Silvia",
      lastName: "Staff",
      phone: "+54 11 5555 0000",
      avatarUrl: "/avatar.png",
      language: "en",
      role: "staff",
      permissions: { dashboard: true },
    });

    expect(auth.setUser).toHaveBeenCalledWith({
      id: "9",
      email: "staff@example.com",
      firstName: "Silvia",
      lastName: "Staff",
      phone: "+54 11 5555 0000",
      avatarUrl: "/avatar.png",
      language: "en",
      role: "staff",
      permissions: { dashboard: true },
    });
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it("manages mock users end to end through create, list, update, activation and password reset", async () => {
    const { usersApi, apiClient } = await loadUsersApi(true);

    const created = await resolveMockDelay(
      usersApi.create({
        email: " NEW.USER@Example.com ",
        password: "ignored-in-mock",
        firstName: "  New ",
        lastName: " User  ",
        phone: " 12345 ",
        role: "staff",
        permissions: { users: true },
      }),
    );

    expect(created).toEqual({
      id: expect.stringMatching(/^mock-user-\d+$/),
      email: "new.user@example.com",
      firstName: "New",
      lastName: "User",
      phone: "12345",
      avatarUrl: null,
      language: "es",
      role: "staff",
      isActive: true,
      permissions: { users: true },
    });

    await expect(resolveMockDelay(usersApi.list(1, 1))).resolves.toEqual({
      data: [created],
      total: 2,
      page: 1,
      limit: 1,
    });

    await expect(
      resolveMockDelay(
        usersApi.update(created.id, {
          email: " Updated@Example.com ",
          firstName: " Updated ",
          lastName: " Name ",
          phone: "",
          permissions: { reports: true },
        }),
      ),
    ).resolves.toEqual({
      ...created,
      email: "updated@example.com",
      firstName: "Updated",
      lastName: "Name",
      phone: null,
      permissions: { reports: true },
    });

    await expect(
      resolveMockDelay(usersApi.setActivation(created.id, false)),
    ).resolves.toEqual(
      expect.objectContaining({
        id: created.id,
        isActive: false,
      }),
    );

    await expect(
      resolveMockDelay(
        usersApi.resetPassword(created.id, "  temp-pass-1234  "),
      ),
    ).resolves.toEqual({
      message: "Password changed successfully",
      temporaryPassword: "temp-pass-1234",
    });

    const generatedReset = await resolveMockDelay(
      usersApi.resetPassword(created.id),
    );
    expect(generatedReset.message).toBe("Password changed successfully");
    expect(generatedReset.temporaryPassword).toMatch(/^tmp-[a-z0-9]+-0001$/);

    await expect(
      resolveMockDelay(
        usersApi.changeMyPassword({
          currentPassword: "old",
          newPassword: "new",
        }),
      ),
    ).resolves.toBeUndefined();

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it("throws clear errors when updating or toggling an unknown mock user", async () => {
    const { usersApi } = await loadUsersApi(true);

    const updatePromise = expect(
      usersApi.update("missing", { firstName: "Nobody" }),
    ).rejects.toThrow("User not found");
    await jest.advanceTimersByTimeAsync(250);
    await updatePromise;

    const activationPromise = expect(
      usersApi.setActivation("missing", false),
    ).rejects.toThrow("User not found");
    await jest.advanceTimersByTimeAsync(250);
    await activationPromise;
  });

  it("calls the backend endpoints with the current token and maps server users", async () => {
    const { usersApi, apiClient, auth } = await loadUsersApi(false);
    auth.getToken.mockReturnValue("token-123");

    apiClient.get
      .mockResolvedValueOnce({
        id: "1",
        email: "admin@example.com",
        firstName: "Admin",
        lastName: "User",
        phone: undefined,
        avatarUrl: undefined,
        language: "de",
        role: "admin",
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "2",
            email: null,
            firstName: "Owner",
            lastName: "User",
            phone: undefined,
            avatarUrl: undefined,
            language: "pt",
            role: "owner",
            permissions: undefined,
          },
        ],
        total: 1,
        page: 3,
        limit: 10,
      });
    apiClient.patch
      .mockResolvedValueOnce({
        id: "1",
        email: "admin@example.com",
        firstName: "Ada",
        lastName: "User",
        phone: null,
        avatarUrl: "/avatar.png",
        language: "en",
        role: "admin",
        permissions: { dashboard: true },
      })
      .mockResolvedValueOnce({
        id: "2",
        email: "owner@example.com",
        firstName: "Olga",
        lastName: "Owner",
        phone: "555",
        avatarUrl: null,
        language: "es",
        role: "owner",
        isActive: false,
        permissions: { users: false },
      })
      .mockResolvedValueOnce({
        id: "2",
        email: "owner@example.com",
        firstName: "Olga",
        lastName: "Owner",
        phone: "555",
        avatarUrl: null,
        language: "es",
        role: "owner",
        isActive: true,
        permissions: { users: true },
      });
    apiClient.post
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: "3",
        email: "staff@example.com",
        firstName: "Sam",
        lastName: "Staff",
        phone: null,
        avatarUrl: null,
        language: "en",
        role: "staff",
        permissions: { reports: true },
      })
      .mockResolvedValueOnce({
        message: "Password changed successfully",
        temporaryPassword: "server-temp",
      });

    await expect(usersApi.getMyProfile()).resolves.toEqual({
      id: "1",
      email: "admin@example.com",
      firstName: "Admin",
      lastName: "User",
      phone: null,
      avatarUrl: null,
      language: undefined,
      role: "admin",
      isActive: undefined,
      companyId: undefined,
      permissions: {},
    });

    await expect(
      usersApi.updateMyProfile({
        firstName: "Ada",
        avatarUrl: "/avatar.png",
      }),
    ).resolves.toEqual({
      id: "1",
      email: "admin@example.com",
      firstName: "Ada",
      lastName: "User",
      phone: null,
      avatarUrl: "/avatar.png",
      language: "en",
      role: "admin",
      permissions: { dashboard: true },
    });

    await expect(
      usersApi.changeMyPassword({
        currentPassword: "old",
        newPassword: "new",
      }),
    ).resolves.toBeUndefined();

    await expect(usersApi.list(3, 10)).resolves.toEqual({
      data: [
        {
          id: "2",
          email: null,
          firstName: "Owner",
          lastName: "User",
          phone: null,
          avatarUrl: null,
          language: "pt",
          role: "owner",
          permissions: {},
        },
      ],
      total: 1,
      page: 3,
      limit: 10,
    });

    await expect(
      usersApi.create({
        email: "staff@example.com",
        password: "secret",
        firstName: "Sam",
        lastName: "Staff",
        role: "staff",
        permissions: { reports: true },
      }),
    ).resolves.toEqual({
      id: "3",
      email: "staff@example.com",
      firstName: "Sam",
      lastName: "Staff",
      phone: null,
      avatarUrl: null,
      language: "en",
      role: "staff",
      permissions: { reports: true },
    });

    await expect(
      usersApi.update("2", {
        firstName: "Olga",
      }),
    ).resolves.toEqual({
      id: "2",
      email: "owner@example.com",
      firstName: "Olga",
      lastName: "Owner",
      phone: "555",
      avatarUrl: null,
      language: "es",
      role: "owner",
      isActive: false,
      permissions: { users: false },
    });

    await expect(usersApi.setActivation("2", true)).resolves.toEqual({
      id: "2",
      email: "owner@example.com",
      firstName: "Olga",
      lastName: "Owner",
      phone: "555",
      avatarUrl: null,
      language: "es",
      role: "owner",
      isActive: true,
      permissions: { users: true },
    });

    await expect(usersApi.resetPassword("2")).resolves.toEqual({
      message: "Password changed successfully",
      temporaryPassword: "server-temp",
    });

    expect(apiClient.get).toHaveBeenNthCalledWith(
      1,
      "/users/profile/me",
      "token-123",
    );
    expect(apiClient.patch).toHaveBeenNthCalledWith(
      1,
      "/users/profile/me",
      { firstName: "Ada", avatarUrl: "/avatar.png" },
      "token-123",
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      "/users/profile/change-password",
      { currentPassword: "old", newPassword: "new" },
      "token-123",
    );
    expect(apiClient.get).toHaveBeenNthCalledWith(
      2,
      "/users?page=3&limit=10",
      "token-123",
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      "/users",
      {
        email: "staff@example.com",
        password: "secret",
        firstName: "Sam",
        lastName: "Staff",
        role: "staff",
        permissions: { reports: true },
      },
      "token-123",
    );
    expect(apiClient.patch).toHaveBeenNthCalledWith(
      2,
      "/users/2",
      { firstName: "Olga" },
      "token-123",
    );
    expect(apiClient.patch).toHaveBeenNthCalledWith(
      3,
      "/users/2/activation",
      { isActive: true },
      "token-123",
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      3,
      "/users/2/reset-password",
      { newPassword: undefined },
      "token-123",
    );
  });
});
