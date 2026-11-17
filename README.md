# CV Tailor

Web app that tailors PDF, DOCX, or plain-text resumes to a target job description and exports an ATS-friendly A4 PDF. Built with Express, vanilla JavaScript, NVIDIA NIM (`nvidia/nemotron-3.5-super-vl-120b-a12b`), `pdf.js`, `mammoth.js`, and `pdfmake`.

## Features

- Accepts uploaded PDFs (including scanned PDFs via page images), `.docx` files, or pasted plain text, plus an optional job-posting screenshot.
- Streams tailored resume JSON over Server-Sent Events (`POST /api/tailor`) into a live-typeset preview.
- Enforces factual constraints in the prompt so employers, dates, degrees, and metrics are preserved, using explicit `[PLACEHOLDER]` tags for missing details.
- Supports three rewrite levels (**Light touch**, **Balanced**, **Full rewrite**) and four single-column layouts (**Career**, **Skills**, **Portfolio**, **Academic**).
- Provides an editable A4 workbench with undo/redo, inline formatting and link editing, contact-icon detection and vector glyph export, and a 50-profile example deck.
- Exports selectable-text vector PDFs client-side via `pdfmake` with embedded `PT Serif`, `PT Sans`, `Barlow`, and custom icon fonts.

## Stack

- **Backend:** Node.js (>= 18), Express 5, `dotenv`, `ua-parser-js`
- **AI Provider:** NVIDIA NIM Chat Completions API (`nvidia/nemotron-3.5-super-vl-120b-a12b`)
- **Frontend:** Vanilla HTML/CSS/JS (no build step)
- **PDF / DOCX Tooling:** Vendored `pdf.js`, `mammoth.js`, and `pdfmake`

## Setup

```bash
npm install
cp .env.example .env
```

Add your NVIDIA API key from [build.nvidia.com/settings](https://build.nvidia.com/settings) to `.env`:

```env
NVIDIA_API_KEY=nvapi-your-key-here
PORT=3000
```

Start the server:

```bash
npm start
```

Then open `http://localhost:3000`.

## Deploy to Cloudflare Workers

This project supports Cloudflare Workers with Static Assets via `wrangler.jsonc` and `worker.mjs`:

```bash
npx wrangler secret put NVIDIA_API_KEY
npx wrangler deploy
```

For local Cloudflare emulation, put `NVIDIA_API_KEY=...` in `.dev.vars` and run `npm run cf:dev`.

## Scripts

```bash
npm start                     # Run server on PORT (default 3000)
npm run preview               # Local preview on 127.0.0.1:3001 with activity logging off
npm run preview -- --fixture  # Mock SSE stream on 127.0.0.1:3002 without API calls
npm run check                 # Syntax check for server and client JS
npm test                      # Run node:test suite
npm run build:icons           # Rebuild SVGs, icon registry, and PDF icon font (needs Python + fonttools/skia-pathops)
```

## Structure

```text
server.js             Express server for Node.js / Vercel
worker.mjs            Cloudflare Workers entrypoint (fetch handler)
wrangler.jsonc        Cloudflare Workers + Static Assets config
vercel.json           Vercel serverless config (300s maxDuration)
lib/
  model.js            Active AI model config and NVIDIA NIM request helper
  prompts.js          System/user prompts, budgets, and request validation
  tailor-stream.js    SSE streaming, key rotation, NVCF 202 polling, draft salvage
  activity.js         Structured activity logger with secret redaction
public/
  index.html          Single-page app markup
  app.js              Upload parsing, SSE client, editor, PDF export
  cv-layouts.js       Layout specs, section adaptation, fallback recommender
  cv-icons.js         Contact link detection, URL cleanup, DOM icon sync
  live-resume.js      Streaming preview renderer and scroll tracking
  hero-lab.js         Homepage example carousel
  demo-profiles.js    50 sample profiles across all layouts
  vendor/             Local pdf.js, mammoth.js, pdfmake, and embedded fonts
scripts/              Icon manifest/build scripts and local preview server
test/                 node:test unit and integration tests
```

## Environment Variables

- `NVIDIA_API_KEY` (required): Single key or comma-separated keys for automatic failover on errors/rate limits.
- `PORT` (optional): HTTP port, defaults to `3000`.
- `FUNCTION_MAX_DURATION_SECONDS` (optional): Platform timeout in seconds, defaults to `300` to match `vercel.json`.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (optional): Direct Telegram Bot API logging for CV submissions and PDF downloads (session-linked, server-side only).
- `LOG_API_URL`, `LOG_API_SECRET` (optional): External log relay endpoint and shared secret. Logging is disabled when unset.

## License

[MIT](LICENSE)
