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
    venueboost: {
        baseUrl: process.env.VB_BASE_URL || 'https://core.venueboost.io/api/v1',
        apiKey: process.env.VB_API_KEY || '4f3e2b1c9a7d4e8f9a1b2c3d4e5f6g7h8i9j0',
        bbVenueCode: process.env.BB_VB_CODE || 'BYB2929SCDE',
    },
    weather: {
        apiKey: process.env.OPENWEATHER_API_KEY,
        baseUrl: 'https://api.openweathermap.org/data/2.5',
        oneCallUrl: 'https://api.openweathermap.org/data/3.0/onecall',
        geocodingUrl: 'https://api.openweathermap.org/geo/1.0',
        units: process.env.WEATHER_UNITS || 'metric',
        language: process.env.WEATHER_LANGUAGE || 'en'
    }
});