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
   npm run dev:vercel
   ```

5. Open `http://localhost:3000/vision-forge`.

For frontend-only debugging with Vite, run:

```sh
npm run dev
```

## AI Gaming Intelligence Terminal

The `/terminal` route reads real signals from `/api/terminal/signals`.

Required server-only env vars:

```env
DATABASE_URL=
TERMINAL_INGEST_SECRET=
```

Create the table with:

```sh
psql "$DATABASE_URL" -f migrations/20260812000000_create_terminal_signals.sql
```

Hermes ingests signals with:

```sh
curl -X POST "https://www.gamingalchemists.com/api/terminal/signals" \
  -H "Authorization: Bearer $TERMINAL_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  --data '{
    "externalId": "hermes-source-id",
    "headline": "Concise real signal headline",
    "summary": "One to two short sentences describing what actually happened.",
    "alchemistTake": "One short action-oriented sentence for the guild.",
    "category": "AI_TOOLS",
    "tags": ["ai", "game-dev"],
    "relevantStrengths": ["Builder", "Researcher"],
    "sourceName": "Original Source",
    "sourceUrl": "https://example.com/original-source",
    "originalDate": "2026-08-12",
    "discoveredAt": "2026-08-12T17:42:00-04:00"
  }'
```

Use Neon Postgres through Vercel Marketplace unless the project already has a production Postgres `DATABASE_URL`.
