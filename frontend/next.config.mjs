import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: ['localhost', 'rent.maese.com.ar'],
    },
};

export default withNextIntl(nextConfig);
