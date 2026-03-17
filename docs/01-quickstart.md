# Quickstart — Run Tasur Locally

This guide gets the development server running from a fresh clone.

---

## Prerequisites

- Node.js 20+ (`node --version`)
- npm 10+ (`npm --version`)
- A Supabase project (free tier is fine)
- An Anthropic or OpenAI API key

---

## Steps

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

Open `.env.local` and set:

| Key                             | Where to find it                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase Dashboard → Project Settings → API                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase Dashboard → Project Settings → API (secret)                             |
| `ANTHROPIC_API_KEY`             | [console.anthropic.com](https://console.anthropic.com)                           |
| `OPENAI_API_KEY`                | [platform.openai.com](https://platform.openai.com) (optional if using Anthropic) |
| `AGENT_PROVIDER`                | `mastra` or `manual` (start with `manual` during development)                    |

### 3. Apply database migrations

```bash
npx supabase db push
```

Or if running Supabase locally:

```bash
npx supabase start
npx supabase db reset
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Verify the setup

- The page should show "Tasur — Coming Soon"
- No errors in the terminal
- `npm run lint` should pass with zero errors
- `npm run format:check` should pass

---

## Switching agent providers

The entire agent layer is controlled by one env var:

```bash
# Use Mastra (primary path)
AGENT_PROVIDER=mastra

# Use Vercel AI SDK direct calls (fallback, easier for development)
AGENT_PROVIDER=manual
```

Change it in `.env.local` and restart the dev server. See [ADR-0001](adr/ADR-0001-dual-path-agent-framework.md) for context.

---

## Useful scripts

| Script                 | What it does                            |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Start development server with Turbopack |
| `npm run build`        | Production build                        |
| `npm run lint`         | ESLint check                            |
| `npm run lint:fix`     | ESLint with auto-fix                    |
| `npm run format`       | Prettier write (formats all files)      |
| `npm run format:check` | Prettier check (CI-safe)                |
