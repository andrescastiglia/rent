import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

function getApiOrigin() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) return null;

    try {
        return new URL(apiUrl).origin;
    } catch {
        return null;
    }
}

function getApiProxyUrl() {
    const proxyUrl = process.env.API_PROXY_URL;
    if (proxyUrl) return proxyUrl.replace(/\/$/, '');

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl?.startsWith('http://') || apiUrl?.startsWith('https://')) {
        return apiUrl.replace(/\/$/, '');
    }

    return 'https://rent.maese.com.ar/api';
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'http',
                hostname: 'localhost',
            },
            {
                protocol: 'https',
                hostname: 'localhost',
            },
            {
                protocol: 'https',
                hostname: 'rent.maese.com.ar',
            },
            {
                protocol: 'http',
                hostname: 'rent.maese.com.ar',
            },
        ],
    },
    async headers() {
        const isProduction = process.env.NODE_ENV === 'production';
        const apiOrigin = getApiOrigin();
        const connectSrc = [
            "'self'",
            apiOrigin,
            ...(isProduction
                ? []
                : [
                    'http://localhost:*',
                    'http://127.0.0.1:*',
                    'ws://localhost:*',
                    'ws://127.0.0.1:*',
                ]),
        ]
            .filter(Boolean)
            .join(' ');
        const csp = isProduction
            ? `default-src 'self'; connect-src ${connectSrc}; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-src https://challenges.cloudflare.com;`
            : `default-src 'self'; connect-src ${connectSrc}; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-src https://challenges.cloudflare.com;`;

        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'Content-Security-Policy',
                        value: csp,
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=31536000; includeSubDomains',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                ],
            },
        ];
    },
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: `${getApiProxyUrl()}/:path*`,
            },
        ];
    },
};

export default withNextIntl(nextConfig);
