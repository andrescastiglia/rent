const previousEnv = { ...process.env };

afterEach(() => {
  process.env = { ...previousEnv };
});

it.each(["/api", "/api/", "https://rent.maese.com.ar/api"])(
  "resolves property photos through the configured API %s",
  async (base) => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_API_URL = base;
    const { normalizePropertyImages } = await import("./property-images");
    const expectedBase = base.replace(/\/$/, "");
    expect(
      normalizePropertyImages([
        "/properties/images/photo",
        { url: "properties/images/preview?expires=123&signature=abc" },
        { path: "https://old.example/properties/images/photo" },
        "https://cdn.example/photo.jpg",
        null,
        {},
      ]),
    ).toEqual([
      `${expectedBase}/properties/images/photo`,
      `${expectedBase}/properties/images/preview?expires=123&signature=abc`,
      `${expectedBase}/properties/images/photo`,
      "https://cdn.example/photo.jpg",
    ]);
  },
);

it("preserves already normalized URLs and accepts properties without images", async () => {
  jest.resetModules();
  process.env.NEXT_PUBLIC_API_URL = "/api";
  const { normalizePropertyImages } = await import("./property-images");
  expect(normalizePropertyImages(["/api/properties/images/photo"])).toEqual([
    "/api/properties/images/photo",
  ]);
  expect(normalizePropertyImages(null)).toEqual([]);
});
