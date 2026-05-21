const { resolve } = require('node:path');
const { defineConfig } = require('vite');

module.exports = defineConfig({
  plugins: [
    {
      // Mirror the vercel.json "/vision-forge" -> "/vision-forge.html" rewrite
      // so the clean URL works under the pure Vite dev server too (otherwise
      // Vite resolves the extensionless path to vision-forge.js).
      name: 'clean-url-vision-forge',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/vision-forge' || req.url === '/vision-forge/') {
            req.url = '/vision-forge.html';
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
        visionForge: resolve(__dirname, 'vision-forge.html')
      }
    }
  }
});
