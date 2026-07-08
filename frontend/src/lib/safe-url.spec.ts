import {
  buildPathWithQuery,
  encodeRouteSegment,
  getSafeDocumentHref,
} from "./safe-url";

describe("safe-url helpers", () => {
  it("encodes route segments", () => {
    expect(encodeRouteSegment("lease/123")).toBe("lease%2F123");
    expect(encodeRouteSegment(42)).toBe("42");
  });

  it("builds paths with non-empty query values", () => {
    expect(
      buildPathWithQuery("/templates/editor", {
        scope: "invoice",
        page: 2,
        enabled: true,
        empty: null,
        missing: undefined,
      }),
    ).toBe("/templates/editor?scope=invoice&page=2&enabled=true");
  });

  it("returns the original path when query values are empty", () => {
    expect(buildPathWithQuery("/leases", { leaseId: null })).toBe("/leases");
  });

  it("allows relative paths and http document hrefs", () => {
    expect(getSafeDocumentHref("/documents/contract.pdf")).toBe(
      "/documents/contract.pdf",
    );
    expect(getSafeDocumentHref("https://example.com/document.pdf")).toBe(
      "https://example.com/document.pdf",
    );
    expect(getSafeDocumentHref("http://example.com/document.pdf")).toBe(
      "http://example.com/document.pdf",
    );
  });

  it("rejects protocol-relative, unsupported, and invalid document hrefs", () => {
    expect(getSafeDocumentHref("//example.com/document.pdf")).toBeNull();
    expect(getSafeDocumentHref("javascript:alert(1)")).toBeNull();
    expect(getSafeDocumentHref("not a url")).toBeNull();
  });
});
