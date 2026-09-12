jest.mock("node:fs", () => ({ readFileSync: jest.fn() }));
const { readFileSync } = require("node:fs");
const { databaseTls } = require("./database-tls.cjs");
const verified = {
  DATABASE_SSL_MODE: "verify-full",
  DATABASE_SSL_CA_FILE: "/ca.crt",
};
beforeEach(() => {
  readFileSync.mockReset();
  readFileSync.mockReturnValue("test-ca");
});
test("leaves legacy behavior unchanged and permits explicit local disable", () => {
  expect(databaseTls({})).toBeUndefined();
  expect(databaseTls({ DATABASE_SSL_MODE: "disable" })).toBe(false);
  expect(readFileSync).not.toHaveBeenCalled();
});
test("rejects modes that cannot verify the server", () => {
  expect(() => databaseTls({ DATABASE_SSL_MODE: "require" })).toThrow(
    "must be",
  );
});
test("requires an explicit CA for verified TLS", () => {
  expect(() => databaseTls({ DATABASE_SSL_MODE: "verify-full" })).toThrow(
    "CA_FILE",
  );
});
test.each([
  "sslmode=require",
  "ssl=false",
  "application_name=rent&sslcert=other",
])("rejects pg connection-string TLS overrides: %s", (query) => {
  expect(() =>
    databaseTls({ ...verified, DATABASE_URL: "postgres://db/app?" + query }),
  ).toThrow("parameters");
});
test.each([
  undefined,
  "postgres://db/app",
  "postgres://db/app?application_name=rent",
])("uses the configured CA with URL %s", (url) => {
  expect(databaseTls({ ...verified, DATABASE_URL: url })).toEqual({
    rejectUnauthorized: true,
    ca: "test-ca",
  });
  expect(readFileSync).toHaveBeenCalledWith("/ca.crt", "utf8");
});
test("fails closed when the CA cannot be read", () => {
  readFileSync.mockImplementation(() => {
    throw new Error("CA unavailable");
  });
  expect(() => databaseTls(verified)).toThrow("CA unavailable");
});
