import { z } from "zod";

/** Login locks after this many failed attempts. The lock duration is not set. */
export const LOGIN_FAILURES_BEFORE_LOCK = 3;

/** The 6-digit new-device code is valid for 5 minutes. */
export const EMAIL_CODE_TTL_MS = 5 * 60 * 1000;

/** A sensitive action needs a passkey check within this window. */
export const STEP_UP_TTL_MS = 5 * 60 * 1000;

/** WebAuthn challenges are single use and expire on this same window. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const passwordSignInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  requireCode: z.boolean().optional(),
});

export const codeSignInSchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
});

export const pinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
});

export const deviceSetupSchema = z.object({
  email: z.email(),
});

export type PasswordSignIn = z.infer<typeof passwordSignInSchema>;
export type CodeSignIn = z.infer<typeof codeSignInSchema>;
