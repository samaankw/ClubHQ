import Constants from "expo-constants";

export interface ReportableError {
  message: string;
}

// Deliberately narrow: `extra` only accepts primitives, not an arbitrary
// object. That's the actual PII guard, not a runtime scan -- a call site
// physically cannot hand this function a player record, a message body, or
// an evaluation note, because the type won't accept one. Only the error
// message itself is free text, so that's the one thing redacted below.
export interface ErrorContext {
  scope: string;
  extra?: Record<string, string | number | boolean>;
}

const JWT_PATTERN = /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

export function redactMessage(message: string): string {
  return message.replace(JWT_PATTERN, "[redacted-token]").replace(EMAIL_PATTERN, "[redacted-email]");
}

function readDsn(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { sentryDsn?: string } | undefined;
  return extra?.sentryDsn ?? "";
}

const dsn = readDsn();

type SentryModule = typeof import("@sentry/react-native");
let sentryModule: SentryModule | null = null;

// A no-op until a real DSN is configured (local dev, CI, and any fork
// without a Sentry project all fall here) -- reportError still works, it
// just logs instead of sending, so nothing about this file requires a
// Sentry account to build, test, or run correctly.
//
// The require is deliberately deferred inside this function and gated on
// `dsn`, not a static top-level import: @sentry/react-native starts a
// background cleanup timer (its tracing integration's AsyncExpiringMap) the
// moment it's loaded, even before init() is called. There's no reason to pay
// for that in dev, CI, or tests, where a DSN is never configured and nothing
// is ever sent. `require`, not a dynamic `import()`, because Metro (this
// app's bundler) and Jest (this app's test runner) both support a plain
// `require` call at any point in a module -- the same pattern already used
// for asset loading in components/ClubBioSection.tsx -- while Jest's default
// CJS transform can't execute a real dynamic `import()` without extra flags.
export function initErrorReporting(): void {
  if (!dsn || sentryModule) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@sentry/react-native") as SentryModule;
  mod.init({ dsn, enableAutoSessionTracking: true, tracesSampleRate: 0.2 });
  sentryModule = mod;
}

export function reportError(error: ReportableError, context: ErrorContext): void {
  const safeMessage = redactMessage(error.message);
  if (sentryModule) {
    sentryModule.captureException(new Error(safeMessage), { tags: { scope: context.scope }, extra: context.extra });
    return;
  }
  if (__DEV__) {
    console.error(`[${context.scope}]`, safeMessage, context.extra ?? "");
  }
}
