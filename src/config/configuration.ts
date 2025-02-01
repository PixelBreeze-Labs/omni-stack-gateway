// src/config/configuration.ts
export default () => ({
    port: parseInt(process.env.PORT, 10) || 3001,
    snapfood: {
        baseUrl: process.env.SNAPFOOD_BASE_URL || 'https://prodapi.snapfood.al/api',
        apiKey: process.env.SNAPFOOD_API_KEY,
    },
    snapfood_admin: {
        baseUrl: process.env.SNAPFOOD_ADMIN_URL || 'https://snapfood.omnistackhub.xyz/api',
        apiKey: process.env.SNAPFOOD_ADMIN_API_KEY,
    },
    trackmaster_admin: {
        baseUrl: process.env.TRACKMASTER_ADMIN_URL || 'https://trackmaster.omnistackhub.xyz/api',
        apiKey: process.env.TRACKMASTER_ADMIN_API_KEY,
    },
    bybest: {
        baseUrl: process.env.BYBEST_BASE_URL || 'https://bybest.shop/api/V1/sync-for-vb',
        apiKey: process.env.BYBEST_API_KEY || 'sync.venueboost.io',
        clientId: process.env.BYBEST_CLIENT_ID || '67957d78172a3de27fd14a9a',
    },
});