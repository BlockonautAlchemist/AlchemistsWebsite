# AlchemistsWebsite

## Local testing

Vision Forge and Game Signal Engine use Vercel Functions under `/api/*`, so local end-to-end testing should run through Vercel CLI instead of plain Vite.

1. Copy the example environment file:

   ```sh
   cp .env.example .env
   ```

2. Fill in the server-side values you need in `.env`:

   ```env
   OPENROUTER_API_KEY=
   OPENROUTER_MODEL=
   DISCORD_VISION_FORGE_WEBHOOK_URL=
   VISION_FORGE_SIGNING_SECRET=
   GAME_SIGNAL_DISCORD_WEBHOOK_URL=
   GAME_SIGNAL_REACTION_THRESHOLD=2
   GAME_SIGNAL_AUTO_PUBLISH=true
   GAME_SIGNAL_PUBLISH_SECRET=
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

6. Open `http://localhost:3000/game-signal-engine`.

For frontend-only debugging without local API routes, run:

```sh
npm run dev:vite
```

## Game Signal Engine flow

1. Submit a game The Alchemists should watch at `/game-signal-engine`.
2. The server validates and saves it in process memory.
3. If AI is configured, the server validates that the submission is game-related and refines the signal with OpenRouter JSON mode.
4. If `GAME_SIGNAL_DISCORD_WEBHOOK_URL` is configured, the server posts a Discord preview.
5. Track interest through `/api/game-signals/interest`.
6. Publish through the protected automation route:

   ```sh
   curl -X POST http://localhost:3000/api/game-signals/publish \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $GAME_SIGNAL_PUBLISH_SECRET" \
     -d '{"slug":"your-signal-slug","force":true}'
   ```

The v1 storage adapter is process memory only. Sample signals are clearly marked and appear when no real signals have been submitted.
