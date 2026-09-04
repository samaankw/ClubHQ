/**
 * Turning a failed Copilot request into something a user can act on.
 *
 * The screen used to answer every failure with one sentence — "Something went
 * wrong pulling that data" — which threw away three different diagnoses the
 * system had already made: the edge function's own user-facing messages (a
 * rate-limit wait, a permission explanation), the Supabase gateway's 404 when
 * a function was never deployed, and the browser's network failure. All three
 * looked identical on screen, and "this function is not deployed" is not a
 * thing anyone should have to read server logs to discover.
 */

/** Shape of an error body from either the edge function or the gateway. */
interface ErrorBody {
  /** What our own functions return via `errorResponse`. */
  error?: unknown;
  /** What the Supabase functions gateway returns (e.g. NOT_FOUND). */
  message?: unknown;
  code?: unknown;
}

/**
 * The message to throw for a non-2xx response. `body` is whatever JSON came
 * back, or null when the response wasn't JSON at all.
 */
export function copilotResponseError(status: number, body: unknown): string {
  const parsed = (body ?? {}) as ErrorBody;
  const detail =
    typeof parsed.error === "string" && parsed.error
      ? parsed.error
      : typeof parsed.message === "string" && parsed.message
        ? parsed.message
        : null;

  // A 404 here means the gateway couldn't find the function, not that the
  // club has no data — worth naming, because the fix is a deploy and nothing
  // in the app will ever make it work.
  if (status === 404) {
    return "The Copilot service isn't deployed for this environment yet, so there's nothing to answer with.";
  }
  if (detail) return detail;
  return `The Copilot service returned an error (${status}).`;
}

/**
 * The message to show for anything thrown while asking. A TypeError from
 * `fetch` means the request never reached a server at all — a dropped
 * connection, or a blocked cross-origin request on web.
 */
export function copilotFailureMessage(err: unknown): string {
  if (err instanceof TypeError) {
    return "Couldn't reach the Copilot service. Check your connection and try again.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong pulling that data. Try again in a moment.";
}
