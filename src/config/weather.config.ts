export default () => ({
    weather: {
      apiKey: process.env.OPENWEATHER_API_KEY,
      baseUrl: 'https://api.openweathermap.org/data/2.5',
      oneCallUrl: 'https://api.openweathermap.org/data/3.0/onecall',
      geocodingUrl: 'https://api.openweathermap.org/geo/1.0',
      units: process.env.WEATHER_UNITS || 'metric',
      language: process.env.WEATHER_LANGUAGE || 'en'
    }
  });