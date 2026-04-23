/**
 * WHY: BetterAuth server configuration — the single source of truth for auth in Tasur.
 *
 * We use BetterAuth instead of Supabase Auth to avoid India-region access issues.
 * BetterAuth connects directly to our Supabase PostgreSQL database via a pg Pool,
 * keeping auth fully decoupled from the Supabase Auth service. This means we can
 * proxy or self-host auth independently of Supabase's hosted auth endpoints.
 *
 * All auth state lives in BetterAuth-managed tables (user, session, account,
 * verification). The Supabase client (src/lib/supabase.ts) is only used for
 * application data (study_sessions, concepts, flashcards) — never for auth.
 */

import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { Pool } from 'pg';

import { otpEmail, sendMail, verificationEmail } from './mailer';
import { provisionTutorialSession } from './tutorial';

// Session timing constants — named so their intent is obvious at a glance.
const SESSION_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days before full re-login
const SESSION_REFRESH_SECONDS = 60 * 60 * 24; // Extend session after 24 h of activity
const SESSION_COOKIE_CACHE_SECONDS = 60 * 5; // Cache session cookie for 5 minutes

const googleOAuthProviders =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {};

export const auth = betterAuth({
  // BetterAuth defaults to nanoid IDs. Override to UUID so user_id columns
  // (typed as uuid in Postgres) accept the value without a cast error.
  // As of v1.5.5, generateId lives under advanced.database (not advanced directly).
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },

  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase's pooler uses a self-signed cert in the chain. Disabling
    // rejectUnauthorized lets pg connect without verifying the CA.
    ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined },
    // Prevent stale connections from causing ETIMEDOUT on session lookups.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  }),

  emailAndPassword: {
    enabled: true,
    // Block sign-in until the user clicks the verification link.
    // Existing accounts must be marked emailVerified=true via SQL (see notes)
    // so only genuinely new signups are gated.
    requireEmailVerification: true,
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { subject, html, text } = verificationEmail(url);
      await sendMail({ to: user.email, subject, html, text });
    },
  },

  socialProviders: googleOAuthProviders,

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 5 * 60, // 5 minutes
      sendVerificationOTP: async ({ email, otp, type }) => {
        // type is 'sign-in' | 'email-verification' | 'forget-password'
        const { subject, html, text } = otpEmail(otp);
        await sendMail({
          to: email,
          subject: type === 'sign-in' ? subject : `Tasur code: ${otp}`,
          html,
          text,
        });
      },
    }),
  ],

  session: {
    expiresIn: SESSION_EXPIRY_SECONDS,
    updateAge: SESSION_REFRESH_SECONDS,
    cookieCache: {
      enabled: true,
      maxAge: SESSION_COOKIE_CACHE_SECONDS,
    },
  },

  // trustedOrigins prevents CSRF: requests must originate from these URLs.
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'],

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Fire-and-forget — don't block signup if this fails.
          provisionTutorialSession(user.id).catch((err) =>
            console.error('[tutorial] provision failed for', user.id, err),
          );
        },
      },
    },
  },
});
