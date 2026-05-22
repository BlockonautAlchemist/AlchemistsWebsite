const { resolve } = require('node:path');
const { defineConfig } = require('vite');
const { getStreamersData } = require('./server/streamers/twitch');

module.exports = defineConfig({
  plugins: [
    {
      // Mirror the local Vercel routes that pure Vite does not know about.
      name: 'vite-dev-routes',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || '/', 'http://localhost');
          if (url.pathname !== '/api/streamers') {
            next();
            return;
          }

          res.setHeader('Content-Type', 'application/json; charset=utf-8');

          if (req.method === 'OPTIONS') {
            res.setHeader('Allow', 'GET, OPTIONS');
            res.statusCode = 204;
            res.end();
            return;
          }

          if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET, OPTIONS');
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Use GET for the streamers endpoint.' }));
            return;
          }

          try {
            const data = await getStreamersData();
            res.statusCode = 200;
            res.end(JSON.stringify(data));
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: error.message || 'Unable to load streamers.' }));
          }
        });

        const cleanUrls = {
          '/vision-forge': '/vision-forge.html',
          '/streamers': '/streamers.html'
        };
        server.middlewares.use((req, _res, next) => {
          const path = req.url && req.url.replace(/\/$/, '');
          if (path && cleanUrls[path]) {
            req.url = cleanUrls[path];
          }
          next();
        });
      }
    }
  ],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        visionForge: resolve(__dirname, 'vision-forge.html'),
        streamers: resolve(__dirname, 'streamers.html')
      }
    }
  }
});
