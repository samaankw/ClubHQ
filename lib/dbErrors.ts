/**
 * Turn a Postgres/PostgREST error message into something a coach can read.
 *
 * Supabase surfaces the database's own wording, which leaks exactly the
 * vocabulary the app is careful to keep out of its copy — "row", "table",
 * "row-level security policy". Anything unrecognised falls back to the
 * caller's plain-language default; the raw text belongs in console.error,
 * not in an alert.
 */
export function userFacingDbError(message: string, fallback: string): string {
  const m = message.toLowerCase();
  if (m.includes("row-level security")) {
    return "You don't have permission to do that. Ask your club director.";
  }
  if (m.includes("duplicate key")) {
    return "That already exists.";
  }
  if (m.includes("out of range") || m.includes("invalid input syntax for type date")) {
    return "That date isn't a real calendar date.";
  }
  if (m.includes("violates foreign key")) {
    return "Something it points to no longer exists. Refresh and try again.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return fallback;
}
