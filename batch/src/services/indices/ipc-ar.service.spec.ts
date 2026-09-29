import axios from "axios";
import { IpcArService } from "./ipc-ar.service";
jest.mock("axios");
jest.mock("../../shared/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
describe("IpcArService", () => {
  const get = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.DATOS_AR_IPC_SERIES_ID;
    (axios.create as jest.Mock).mockReturnValue({ get });
  });
  it("reads national monthly levels and sends UTC calendar dates", async () => {
    get.mockResolvedValue({
      data: { data: [["2025-01-01", 7864.1257]], count: 1 },
    });
    const service = new IpcArService();
    expect(
      await service.getIpc(new Date("2025-01-01"), new Date("2025-01-31")),
    ).toEqual([{ date: new Date("2025-01-01"), value: 7864.1257 }]);
    expect(get).toHaveBeenCalledWith("/", {
      params: {
        ids: "148.3_INIVELNAL_DICI_M_26",
        limit: "1000",
        start_date: "2025-01-01",
        end_date: "2025-01-31",
      },
    });
  });
  it.each([
    {},
    { data: [["2025-01-01", null]] },
    { data: [["2025-01-01", 1]], count: 2 },
  ])("rejects malformed, missing or truncated data", async (data) => {
    get.mockResolvedValue({ data });
    await expect(new IpcArService().getIpc()).rejects.toThrow();
  });
  it("refuses a different series under the IPC label", async () => {
    process.env.DATOS_AR_IPC_SERIES_ID = "wrong-series";
    await expect(new IpcArService().getIpc()).rejects.toThrow("national");
    expect(get).not.toHaveBeenCalled();
  });
});
