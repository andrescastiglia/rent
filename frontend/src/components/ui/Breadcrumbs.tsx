'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function Breadcrumbs() {
  const pathname = usePathname();
  const t = useTranslations('common');

  // Remove locale from path if present
  const segments = pathname.split('/').filter(Boolean);
  
  // Check if first segment is a locale
  const locales = ['es', 'pt', 'en'];
  const hasLocale = locales.includes(segments[0]);
  
  const pathSegments = hasLocale ? segments.slice(1) : segments;

  // Don't show breadcrumbs on home page (or if pathSegments is empty)
  if (pathSegments.length === 0) {
    return null; 
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-sm text-gray-500 mb-4">
      <Link 
        href="/" 
        className="hover:text-gray-900 flex items-center transition-colors"
      >
        <Home className="h-4 w-4" />
        <span className="sr-only">Home</span>
      </Link>

      {pathSegments.map((segment, index) => {
        // Reconstruct path up to this segment
        // We need to include the locale if it was present in the original path
        const segmentPath = `/${hasLocale ? segments.slice(0, index + 2).join('/') : segments.slice(0, index + 1).join('/')}`;
        
        // Format segment name (capitalize, replace hyphens)
        // Ideally this should be translated, but for now we format the slug
        const segmentName = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
        
        const isLast = index === pathSegments.length - 1;

        return (
          <div key={segmentPath} className="flex items-center">
            <ChevronRight className="h-4 w-4 mx-1 text-gray-400" />
            {isLast ? (
              <span className="font-medium text-gray-900" aria-current="page">
                {segmentName}
              </span>
            ) : (
              <Link 
                href={segmentPath}
                className="hover:text-gray-900 transition-colors"
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
