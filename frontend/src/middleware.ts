import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './config/locales';

export default createMiddleware({
    // Lista de locales soportados
    locales,

    // Locale por defecto
    defaultLocale,

    // Estrategia de detección de locale
    localeDetection: true,

    // Siempre incluir el prefijo del locale en la URL
    localePrefix: 'always',
});

export const config = {
    // Matcher que ignora rutas internas de Next.js y archivos estáticos
    matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
