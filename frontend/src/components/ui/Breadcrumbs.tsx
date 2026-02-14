"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { useTranslations } from "next-intl";

// Mapping of route segments to translation keys
const segmentTranslationMap: Record<
  string,
  { namespace: string; key: string }
> = {
  dashboard: { namespace: "nav", key: "dashboard" },
  properties: { namespace: "nav", key: "properties" },
  tenants: { namespace: "nav", key: "tenants" },
  leases: { namespace: "nav", key: "leases" },
  templates: { namespace: "nav", key: "templates" },
  payments: { namespace: "nav", key: "payments" },
  invoices: { namespace: "nav", key: "invoices" },
  sales: { namespace: "nav", key: "sales" },
  interested: { namespace: "nav", key: "interested" },
  prospect: { namespace: "nav", key: "interested" },
  users: { namespace: "nav", key: "users" },
  new: { namespace: "breadcrumbs", key: "new" },
  edit: { namespace: "breadcrumbs", key: "edit" },
  settings: { namespace: "common", key: "settings" },
  profile: { namespace: "common", key: "myProfile" },
};

export default function Breadcrumbs() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tBreadcrumbs = useTranslations("breadcrumbs");

  // Remove locale from path if present
  const segments = pathname.split("/").filter(Boolean);

  // Check if first segment is a locale
  const locales = ["es", "pt", "en"];
  const hasLocale = locales.includes(segments[0]);

  const pathSegments = hasLocale ? segments.slice(1) : segments;

  // Don't show breadcrumbs on home page (or if pathSegments is empty)
  if (pathSegments.length === 0) {
    return null;
  }

  /**
   * Get translated name for a segment
   */
  const getSegmentName = (segment: string): string => {
    // Check if segment has a predefined translation
    const mapping = segmentTranslationMap[segment.toLowerCase()];
    if (mapping) {
      switch (mapping.namespace) {
        case "nav":
          return tNav(mapping.key);
        case "common":
          return tCommon(mapping.key);
        case "breadcrumbs":
          return tBreadcrumbs(mapping.key);
        default:
          break;
      }
    }

    // Check if it's a UUID (detail page) - show generic "details" label
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(segment)) {
      return tBreadcrumbs("details");
    }

    // Check if it's a numeric ID
    if (/^\d+$/.test(segment)) {
      return tBreadcrumbs("details");
    }

    // Fallback: capitalize and format the segment
    return (
      segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ") // NOSONAR
    );
  };

  return (
    <nav
      aria-label={tBreadcrumbs("ariaLabel")}
      className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 mb-4"
    >
      <Link
        href="/"
        className="hover:text-gray-900 dark:hover:text-gray-200 flex items-center transition-colors"
        title={tBreadcrumbs("home")}
      >
        <Home className="h-4 w-4" />
        <span className="sr-only">{tBreadcrumbs("home")}</span>
      </Link>

      {pathSegments.map((segment, index) => {
        // Reconstruct path up to this segment
        // We need to include the locale if it was present in the original path
        const segmentPath = `/${hasLocale ? segments.slice(0, index + 2).join("/") : segments.slice(0, index + 1).join("/")}`;

        const segmentName = getSegmentName(segment);
        const isLast = index === pathSegments.length - 1;

        return (
          <div key={segmentPath} className="flex items-center">
            <ChevronRight className="h-4 w-4 mx-1 text-gray-400 dark:text-gray-500" />
            {isLast ? (
              <span
                className="font-medium text-gray-900 dark:text-gray-100"
                aria-current="page"
              >
                {segmentName}
              </span>
            ) : (
              <Link
                href={segmentPath}
                className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
              >
                {segmentName}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
