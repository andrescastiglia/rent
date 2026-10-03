const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

const isApiRelativeImagePath = (value: string): boolean =>
  value.startsWith("/uploads/") ||
  value.startsWith("uploads/") ||
  value.startsWith("/properties/images/") ||
  value.startsWith("properties/images/");

const shouldForceHttps = (): boolean =>
  typeof globalThis !== "undefined" &&
  globalThis.location?.protocol === "https:";

const forceHttpsWhenNeeded = (url: URL): string => {
  if (shouldForceHttps()) {
    url.protocol = "https:";
  }
  return url.toString();
};

export const normalizePropertyImages = (
  images: any[] | null | undefined,
): string[] => {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (typeof img === "string") return img;
      if (img && typeof img === "object") {
        if (typeof img.url === "string") return img.url;
        if (typeof img.path === "string") return img.path;
      }
      return null;
    })
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map(normalizePropertyImageUrl);
};

export const normalizePropertyImageUrl = (url: string): string => {
  if (!url) return url;
  const normalizeApiPathWithBase = (path: string): string => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (!API_BASE_URL) return normalizedPath;

    if (API_BASE_URL.startsWith("/")) {
      return `${API_BASE_URL.replace(/\/+$/, "")}${normalizedPath}`;
    }

    try {
      const base = API_BASE_URL.endsWith("/")
        ? API_BASE_URL
        : `${API_BASE_URL}/`;
      const resolved = new URL(normalizedPath.replace(/^\/+/, ""), base);
      return forceHttpsWhenNeeded(resolved);
    } catch {
      return normalizedPath;
    }
  };

  if (isApiRelativeImagePath(url)) {
    return normalizeApiPathWithBase(url);
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    return normalizeAbsoluteImageUrl(parsed, normalizeApiPathWithBase);
  } catch {
    return url;
  }
};

const normalizeAbsoluteImageUrl = (
  parsed: URL,
  normalizeApiPathWithBase: (path: string) => string,
): string => {
  if (
    parsed.pathname.startsWith("/uploads/") ||
    parsed.pathname.startsWith("/properties/images/")
  ) {
    return normalizeApiPathWithBase(`${parsed.pathname}${parsed.search}`);
  }

  if (parsed.hostname === "rent.maese.com.ar") {
    parsed.protocol = "https:";
    return parsed.toString();
  }

  return forceHttpsWhenNeeded(parsed);
};
