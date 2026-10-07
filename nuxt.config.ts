export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: true },
  devServer: {
    host: 'localhost',
    port: 3000,
  },
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: 'GatheredHub',
      meta: [
        {
          name: 'description',
          content:
            'Plan a multi-day gathering: who is coming, where they are staying, and the calendar.',
        },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Fraunces:opsz,wght@9..144,520;9..144,640&display=swap',
        },
      ],
    },
  },
  runtimeConfig: {
    public: {
      firebaseApiKey: '',
      firebaseAuthDomain: '',
      firebaseProjectId: '',
      firebaseStorageBucket: '',
      firebaseMessagingSenderId: '',
      firebaseAppId: '',
      firebaseMeasurementId: '',
    },
  },
})
