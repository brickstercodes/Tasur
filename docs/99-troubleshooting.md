# Troubleshooting

Common issues during local development and how to fix them.

---

## Dev server won't start

**Symptom:** `npm run dev` crashes immediately.

**Check:**

1. `.env.local` exists and has all required keys from `.env.example`
2. `npm install` has been run and `node_modules/` exists
3. Node.js version is 20+ (`node --version`)

---

## Supabase connection errors

**Symptom:** `Error: supabaseUrl is required` or similar at runtime.

**Fix:** Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in `.env.local`. The `NEXT_PUBLIC_` prefix is required for these to be available in the browser.

---

## Agent calls throw "not yet configured"

**Symptom:**

```
Error: Mastra agent "document-parser" is not yet configured.
Set AGENT_PROVIDER=manual to use the manual fallback.
```

**Fix:** This is expected during early development. Real agent implementations are wired up in later modules. Use `AGENT_PROVIDER=manual` in `.env.local` to switch to the manual fallback path once that's implemented.

---

## `npm run lint` fails

**Symptom:** ESLint errors on files you didn't touch.

**Fix:** Run `npm run lint:fix` first to auto-fix anything that can be fixed automatically. For remaining errors, check the rule name in the output and fix manually.

---

## `npm run format:check` fails in CI

**Symptom:** Prettier reports unformatted files in CI but they look fine locally.

**Fix:** Run `npm run format` locally and commit the result. This usually happens when files are edited without running Prettier. Consider adding a pre-commit hook.

---

## TypeScript errors after schema changes

**Symptom:** Type errors referencing `database.ts` after a Supabase migration.

**Fix:** Regenerate the database types:

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

---

## Import ordering warnings from ESLint

**Symptom:** `import/order` warnings about import grouping.

**Fix:** Run `npm run lint:fix` — ESLint can auto-fix import order. The expected order is: external packages first, then internal `@/` paths, then relative imports.
