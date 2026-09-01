"""Every table in `public` must have row level security enabled, full stop.

A table created without RLS is readable/writable by any authenticated
client the moment the harness (or production) grants the default table
privileges Supabase ships with -- there is no policy layer to fall back on,
just PostgREST's default table grants. That failure mode is exactly what
this suite is for: it doesn't show up in `npm run typecheck`, and unlike a
misdirected notice, an actual open table doesn't even fail silently, it just
looks like a working query.

A table can legitimately have RLS enabled with zero policies -- that's not a
bug, it's "nothing but a service-role/security-definer path is allowed to
touch this," and rate_limit_hits (0038) is exactly that case. The test still
requires it to be deliberate: allow-listed by name here, in the same
migration that added it, and with a table comment saying why, so an
"RLS enabled with no policies" state never happens by accident.
"""
import psycopg2

CONN = dict(host="/tmp", port=5439, user="postgres", dbname="postgres",
            options="-c client_encoding=UTF8 -c search_path=public,extensions")

results = []


def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"\n         {detail}" if detail and not cond else ""))
    return bool(cond)


# Tables allowed to have RLS enabled with zero policies, and why. Every entry
# here must also carry a real `comment on table` in the migration that
# created or altered it -- this list alone is not the documentation, the
# in-database comment is, this just says which tables are allowed to have
# one instead of a policy.
ZERO_POLICY_ALLOWLIST = {
    "rate_limit_hits",
}


def fetch_public_tables(cur):
    cur.execute("""
        select c.relname, c.relrowsecurity, obj_description(c.oid, 'pg_class')
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname
    """)
    return cur.fetchall()


def fetch_policy_counts(cur):
    cur.execute("""
        select tablename, count(*)
        from pg_policies
        where schemaname = 'public'
        group by tablename
    """)
    return dict(cur.fetchall())


def test_every_public_table_has_rls(cur):
    tables = fetch_public_tables(cur)
    check("at least one public table exists to check", len(tables) > 0, "found none -- migrations may not have applied")
    for relname, has_rls, _comment in tables:
        check(f"{relname}: row level security enabled", has_rls, "relrowsecurity is false")


def test_zero_policy_tables_are_documented(cur):
    tables = fetch_public_tables(cur)
    policy_counts = fetch_policy_counts(cur)

    for relname, has_rls, comment in tables:
        if not has_rls:
            continue  # already failed above; don't double-report here
        policy_count = policy_counts.get(relname, 0)
        if policy_count > 0:
            continue

        check(
            f"{relname}: zero-policy table is explicitly allow-listed",
            relname in ZERO_POLICY_ALLOWLIST,
            f"{relname} has RLS but no policies and isn't in ZERO_POLICY_ALLOWLIST -- "
            f"either add a policy, or add it here AND give it a table comment explaining why",
        )
        check(
            f"{relname}: zero-policy table has a table comment explaining why",
            bool(comment),
            f"{relname} has no `comment on table` -- add one in the migration that left it policy-less",
        )


def main():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        test_every_public_table_has_rls(cur)
        test_zero_policy_tables_are_documented(cur)
    finally:
        conn.rollback()
        cur.close()
        conn.close()

    passed = sum(1 for _, c, _ in results if c)
    print(f"\n{passed}/{len(results)} assertions passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
