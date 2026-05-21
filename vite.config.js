const { resolve } = require('node:path');
const { defineConfig } = require('vite');

function cleanUrlHtmlRewrites() {
  function rewrite(req, res, next) {
    const rawUrl = String(req.url || '');
    const parsed = rawUrl.startsWith('http')
      ? new URL(rawUrl)
      : new URL(rawUrl, 'http://localhost');
    const pathname = parsed.pathname;
    const query = parsed.search ? parsed.search.slice(1) : '';
    const suffix = query ? `?${query}` : '';

    if (pathname === '/vision-forge') {
      req.url = `/vision-forge.html${suffix}`;
    } else if (pathname === '/game-signal-engine') {
      req.url = `/game-signal-engine.html${suffix}`;
    } else if (/^\/games\/[^/]+\/?$/.test(pathname)) {
      req.url = `/game.html${suffix}`;
    }

    next();
  }

  return {
    name: 'clean-url-html-rewrites',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    }
  };
}

module.exports = defineConfig({
  appType: 'mpa',
  plugins: [cleanUrlHtmlRewrites()],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        visionForge: resolve(__dirname, 'vision-forge.html'),
        gameSignalEngine: resolve(__dirname, 'game-signal-engine.html'),
        game: resolve(__dirname, 'game.html')
      }
    }
  }
});
