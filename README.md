# AlchemistsWebsite

## Local Vision Forge testing

Vision Forge uses Vercel Functions for `/api/vision-forge/*`, so local end-to-end testing should run through Vercel CLI instead of plain Vite.

1. Copy the example environment file:

   ```sh
   cp .env.example .env
   ```

2. Fill in the two required secrets in `.env`:

   ```env
   OPENROUTER_API_KEY=...
   DISCORD_VISION_FORGE_WEBHOOK_URL=...
   ```

3. Install dependencies:

   ```sh
   npm install
   ```

4. Start the local Vercel dev server:

   ```sh
   npm run dev
   ```

5. Open `http://localhost:3000/vision-forge`.

For frontend-only debugging without local API routes, run:

```sh
npm run dev:vite
```
