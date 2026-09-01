import { isValid, parse } from "date-fns";

/**
 * A birth date field is optional everywhere it appears, but once typed it
 * has to be a real calendar date -- shape alone ("2026-13-45") matches a
 * YYYY-MM-DD regex and would reach Postgres, which answers in its own
 * vocabulary instead of this field's.
 */
export function isValidBirthDate(value: string): boolean {
  return isValid(parse(value, "yyyy-MM-dd", new Date()));
}
