/** @jest-environment node */

import { GET } from "./route";

describe("health route", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.API_PROXY_URL;
  });

  it("uses the internal backend when the public API URL is relative", async () => {
    process.env.NEXT_PUBLIC_API_URL = "/api";
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    } as Response);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/health",
      { cache: "no-store" },
    );
  });

  it("prefers the server proxy URL over the public API URL", async () => {
    process.env.API_PROXY_URL = "http://backend:3001/";
    process.env.NEXT_PUBLIC_API_URL = "https://rent.example/api";
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    } as Response);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://backend:3001/health",
      { cache: "no-store" },
    );
  });

  it("returns ok when upstream health is ok", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001/";
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    } as Response);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      upstream: { status: "ok" },
      status: "ok",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/health",
      {
        cache: "no-store",
      },
    );
  });

  it("returns unhealthy when upstream responds non-ok", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ status: "down" }),
    } as Response);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("unhealthy");
  });

  it("returns error payload when fetch throws", async () => {
    jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network error"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.error).toContain("network error");
  });
});
