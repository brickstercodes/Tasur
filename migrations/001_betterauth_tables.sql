-- WHY: BetterAuth requires four tables to manage identity and sessions.
--
-- These are NOT Supabase Auth tables — they're BetterAuth's own schema,
-- living in the same Supabase PostgreSQL database but managed entirely by
-- BetterAuth. Supabase Auth is never used in Tasur.
--
-- How to apply:
--   Option A (recommended): Paste this SQL into the Supabase SQL Editor and run.
--   Option B (CLI):         Set DATABASE_URL in .env.local, then run:
--                           npx better-auth migrate
--
-- Tables:
--   "user"         — identity: id, email, name, emailVerified, image
--   "session"      — active sessions linked to a user; token is the cookie value
--   "account"      — OAuth accounts (Google, etc.) linked to a user
--   "verification" — email verification and password-reset tokens
--
-- Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT         NOT NULL,
  "email"         TEXT         NOT NULL UNIQUE,
  "emailVerified" BOOLEAN      NOT NULL DEFAULT FALSE,
  "image"         TEXT,
  "createdAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"          TEXT PRIMARY KEY,
  "expiresAt"   TIMESTAMPTZ  NOT NULL,
  "token"       TEXT         NOT NULL UNIQUE,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "userId"      TEXT         NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                    TEXT PRIMARY KEY,
  "accountId"             TEXT         NOT NULL,
  "providerId"            TEXT         NOT NULL,
  "userId"                TEXT         NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT PRIMARY KEY,
  "identifier" TEXT         NOT NULL,
  "value"      TEXT         NOT NULL,
  "expiresAt"  TIMESTAMPTZ  NOT NULL,
  "createdAt"  TIMESTAMPTZ  DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ  DEFAULT NOW()
);

-- Fast session lookups — BetterAuth reads session by token on every request.
CREATE INDEX IF NOT EXISTS idx_session_token  ON "session"("token");
CREATE INDEX IF NOT EXISTS idx_session_userId ON "session"("userId");

-- Fast account lookups during OAuth flows.
CREATE INDEX IF NOT EXISTS idx_account_userId     ON "account"("userId");
CREATE INDEX IF NOT EXISTS idx_account_provider   ON "account"("providerId", "accountId");
