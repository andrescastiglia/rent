import { dashboardApi, type PersonActivityItem } from "./dashboard";
import { apiClient } from "../api";
import { getToken } from "../auth";
import { interestedApi } from "./interested";
import { ownersApi } from "./owners";

jest.mock("../api", () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

jest.mock("../auth", () => ({
  getToken: jest.fn(),
}));

jest.mock("./interested", () => ({
  interestedApi: {
    updateActivity: jest.fn(),
  },
}));

jest.mock("./owners", () => ({
  ownersApi: {
    updateActivity: jest.fn(),
  },
}));

describe("dashboardApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getToken as jest.Mock).mockReturnValue("token-123");
  });

  it("loads stats and operations overview with the current token", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ totalProperties: 3 })
      .mockResolvedValueOnce({ generatedAt: "2026-01-01T00:00:00.000Z" });

    await expect(dashboardApi.getStats()).resolves.toEqual({
      totalProperties: 3,
    });
    await expect(dashboardApi.getOperationsOverview()).resolves.toEqual({
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(apiClient.get).toHaveBeenNthCalledWith(
      1,
      "/dashboard/stats",
      "token-123",
    );
    expect(apiClient.get).toHaveBeenNthCalledWith(
      2,
      "/dashboard/operations-overview",
      "token-123",
    );
  });

  it("loads recent activity and reports using query params", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({ overdue: [], today: [], total: 0 })
      .mockResolvedValueOnce({ data: [], total: 0, page: 2, limit: 50 });

    await dashboardApi.getRecentActivity(50);
    await dashboardApi.getReports(2, 50);

    expect(apiClient.get).toHaveBeenNthCalledWith(
      1,
      "/dashboard/recent-activity?limit=50",
      "token-123",
    );
    expect(apiClient.get).toHaveBeenNthCalledWith(
      2,
      "/dashboard/reports?page=2&limit=50",
      "token-123",
    );
  });

  it("completes interested activities through the interested API", async () => {
    const activity: PersonActivityItem = {
      id: "activity-1",
      sourceType: "interested",
      personType: "interested",
      personId: "person-1",
      personName: "Ana",
      subject: "Follow up",
      body: null,
      status: "pending",
      dueAt: null,
      completedAt: null,
      propertyId: null,
      propertyName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await dashboardApi.completePersonActivity(activity);

    expect(interestedApi.updateActivity).toHaveBeenCalledWith(
      "person-1",
      "activity-1",
      expect.objectContaining({
        status: "completed",
        completedAt: expect.any(String),
      }),
    );
    expect(ownersApi.updateActivity).not.toHaveBeenCalled();
  });

  it("completes owner activities through the owners API", async () => {
    const activity: PersonActivityItem = {
      id: "activity-2",
      sourceType: "owner",
      personType: "owner",
      personId: "owner-1",
      personName: "Olga",
      subject: "Call owner",
      body: null,
      status: "pending",
      dueAt: null,
      completedAt: null,
      propertyId: null,
      propertyName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await dashboardApi.completePersonActivity(activity);

    expect(ownersApi.updateActivity).toHaveBeenCalledWith(
      "owner-1",
      "activity-2",
      expect.objectContaining({
        status: "completed",
        completedAt: expect.any(String),
      }),
    );
    expect(interestedApi.updateActivity).not.toHaveBeenCalled();
  });

  it("routes comment updates according to the activity source", async () => {
    const interestedActivity: PersonActivityItem = {
      id: "activity-3",
      sourceType: "interested",
      personType: "interested",
      personId: "person-3",
      personName: "Luis",
      subject: "Interested",
      body: null,
      status: "pending",
      dueAt: null,
      completedAt: null,
      propertyId: null,
      propertyName: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const ownerActivity: PersonActivityItem = {
      ...interestedActivity,
      id: "activity-4",
      sourceType: "owner",
      personType: "owner",
      personId: "owner-4",
    };

    await dashboardApi.updatePersonActivityComment(
      interestedActivity,
      "Follow up tomorrow",
    );
    await dashboardApi.updatePersonActivityComment(
      ownerActivity,
      "Needs owner confirmation",
    );

    expect(interestedApi.updateActivity).toHaveBeenCalledWith(
      "person-3",
      "activity-3",
      { body: "Follow up tomorrow" },
    );
    expect(ownersApi.updateActivity).toHaveBeenCalledWith(
      "owner-4",
      "activity-4",
      { body: "Needs owner confirmation" },
    );
  });
});
