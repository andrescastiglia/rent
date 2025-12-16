import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './config/locales';

const i18nMiddleware = createMiddleware({
    // Lista de locales soportados
    locales,

    // Locale por defecto
    defaultLocale,

    // Estrategia de detección de locale
    localeDetection: true,

    // Siempre incluir el prefijo del locale en la URL
    localePrefix: 'always',
});

// Wrap the generated middleware so we can bypass it for operational routes like /health
export default function middleware(request: NextRequest) {
    const pathname = request.nextUrl?.pathname || new URL(request.url).pathname;
    if (pathname === '/health' || pathname.startsWith('/health/')) {
        return NextResponse.next();
    }
    return i18nMiddleware(request);
}

export const config = {
    // Matcher that ignores internal Next.js routes and static files (we handle /health in code)
    matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
