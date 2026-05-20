const { resolve } = require('node:path');
const { defineConfig } = require('vite');

module.exports = defineConfig({
  build: {
    rolldownOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        visionForge: resolve(__dirname, 'vision-forge.html')
      }
    }
  }
});
