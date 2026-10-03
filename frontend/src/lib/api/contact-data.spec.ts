import { contactApi } from "./contact-data";
import { apiClient } from "../api";
jest.mock("../api", () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  IS_MOCK_MODE: false,
}));
jest.mock("../auth", () => ({ getToken: () => "test-token" }));
describe("geographic HTTP contracts", () => {
  it("submits only the entity reference when calculating ETA from an enriched destination", async () => {
    const destination = {
      type: "property" as const,
      id: "place",
      name: "Casa",
      address: "Mitre 100",
      latitude: -34.6,
      longitude: -58.4,
      precise: true,
    };
    const origin = {
      latitude: -34.7,
      longitude: -58.5,
      accuracy: 10,
      timestamp: Date.now(),
    };
    await contactApi.eta(destination, origin, "cycling");
    expect(apiClient.post).toHaveBeenCalledWith(
      "/contact-data/eta",
      {
        destination: { type: "property", id: "place" },
        origin,
        mode: "cycling",
      },
      "test-token",
    );
  });
});
