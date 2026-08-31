// A small in-memory stand-in for the PostgREST query builder.
//
// The alternative was to hand the push module pre-fetched arrays, but most of
// the realistic bugs in recipient targeting live in the *queries* — filtering
// on a null team_id, dropping `.eq("enabled", true)`, forgetting to exclude
// the author. A fake that actually applies filters catches those; a fake that
// just returns fixture arrays would wave them through.
//
// It records every query issued, so a test can also assert on the shape of the
// request rather than only its result.

export type Row = Record<string, unknown>;

export interface RecordedQuery {
  table: string;
  select: string;
  filters: { op: string; column: string; value: unknown }[];
}

interface Filter {
  op: "eq" | "neq" | "in" | "not_is_null";
  column: string;
  value: unknown;
}

function matches(row: Row, filter: Filter): boolean {
  const actual = row[filter.column];
  switch (filter.op) {
    case "eq":
      return actual === filter.value;
    case "neq":
      return actual !== filter.value;
    case "in":
      return (filter.value as unknown[]).includes(actual);
    case "not_is_null":
      return actual !== null && actual !== undefined;
  }
}

class QueryBuilder implements PromiseLike<{ data: Row[] | null; error: null }> {
  private filters: Filter[] = [];

  constructor(
    private readonly rows: Row[],
    private readonly record: RecordedQuery,
    private readonly embeds: Record<string, { table: string; on: string }>
  ) {}

  select(columns: string) {
    this.record.select = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.push({ op: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.push({ op: "neq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.push({ op: "in", column, value });
    return this;
  }

  // Only the `.not(col, "is", null)` form the push code uses.
  not(column: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) {
      throw new Error(`fakeSupabase: unsupported .not(${column}, ${operator}, ${value})`);
    }
    this.push({ op: "not_is_null", column, value: null });
    return this;
  }

  private push(filter: Filter) {
    this.filters.push(filter);
    this.record.filters.push({ op: filter.op, column: filter.column, value: filter.value });
  }

  private resolve(): Row[] {
    let out = this.rows.filter((row) => this.filters.every((f) => matches(row, f)));

    // Resolve a one-level embed like `players(parent_id)` the way PostgREST
    // would, so the push code's `row.players?.parent_id` access is exercised
    // rather than hand-fed.
    const embedMatch = this.record.select.match(/^(\w+)\(([^)]*)\)$/);
    if (embedMatch) {
      const [, embedName] = embedMatch;
      const embed = this.embeds[embedName];
      if (!embed) throw new Error(`fakeSupabase: no embed configured for "${embedName}"`);
      out = out.map((row) => ({
        ...row,
        [embedName]:
          this.embedRows(embed.table).find((e) => e.id === row[embed.on]) ?? null,
      }));
    }
    return out;
  }

  private embedRows: (table: string) => Row[] = () => [];
  attachEmbedLookup(fn: (table: string) => Row[]) {
    this.embedRows = fn;
    return this;
  }

  then<TResult1 = { data: Row[] | null; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: Row[] | null; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.resolve(), error: null }).then(onfulfilled, onrejected);
  }
}

export class FakeSupabase {
  readonly queries: RecordedQuery[] = [];

  constructor(
    private readonly tables: Record<string, Row[]>,
    // Maps an embed name used in select() to the table and joining column,
    // e.g. `players(parent_id)` on announcement_player_targets joins
    // players.id === announcement_player_targets.player_id.
    private readonly embeds: Record<string, { table: string; on: string }> = {
      players: { table: "players", on: "player_id" },
    }
  ) {}

  from(table: string) {
    const record: RecordedQuery = { table, select: "", filters: [] };
    this.queries.push(record);
    return new QueryBuilder(this.tables[table] ?? [], record, this.embeds).attachEmbedLookup(
      (t) => this.tables[t] ?? []
    );
  }

  /** Every query issued against a given table, for assertions on filters. */
  queriesFor(table: string): RecordedQuery[] {
    return this.queries.filter((q) => q.table === table);
  }
}
