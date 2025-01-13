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
    }
});