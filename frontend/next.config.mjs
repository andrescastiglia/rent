import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: ['localhost', 'rent.maese.com.ar'],
    },
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'Content-Security-Policy',
                        value: "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://static.cloudflareinsights.com; object-src 'none';",
                    },
                ],
            },
        ];
    },
};

export default withNextIntl(nextConfig);
