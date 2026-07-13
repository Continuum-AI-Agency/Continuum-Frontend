// In-memory stand-in for the PostgREST query chains the Library routes use.
// The routes' invariants (a comment can never land with a null version_id, v1 is
// materialized exactly once, a brand's default custom fields are seeded exactly
// once) are properties of the ROWS that end up in the table, so a fake that
// actually stores rows — and actually enforces the unique constraints the
// concurrency guards lean on — is the only way to assert them honestly.

export type FakeRow = Record<string, unknown>;
export type FakeError = { code?: string; message: string };

// Fires before a row is inserted. A spec simulates a rival writer that committed
// first by pushing its row into the table here — the unique check below then
// rejects the caller's insert with 23505, exactly as Postgres would. Returning
// an error instead makes the insert fail outright.
export type BeforeInsert = (table: string, row: FakeRow) => FakeError | void;

type Result<T> = { data: T; error: FakeError | null };

const UNIQUE_VIOLATION = '23505';

// The unique constraints the routes actually depend on. Keyed by table; a null
// key means the row is not covered by any of them.
const UNIQUE_KEY: Record<string, (row: FakeRow) => string | null> = {
  'media.asset_versions': (row) => `${String(row.asset_id)}:${String(row.version_number)}`,
  // (brand_id, lower(name)) — "Campaign" and "campaign" are the same field.
  'media.custom_fields': (row) => `${String(row.brand_id)}:${String(row.name).toLowerCase()}`,
  // Primary key (asset_id, field_id).
  'media.asset_field_values': (row) => `${String(row.asset_id)}:${String(row.field_id)}`,
};

function uniqueKeyOf(table: string, row: FakeRow): string | null {
  return UNIQUE_KEY[table]?.(row) ?? null;
}

function uniqueViolation(): FakeError {
  return { code: UNIQUE_VIOLATION, message: 'duplicate key value violates unique constraint' };
}

export class FakeDb {
  readonly tables: Record<string, FakeRow[]>;
  private sequence = 0;
  private beforeInsert: BeforeInsert | null = null;

  constructor(tables: Record<string, FakeRow[]> = {}) {
    this.tables = tables;
  }

  rows(table: string): FakeRow[] {
    this.tables[table] ??= [];
    return this.tables[table];
  }

  onBeforeInsert(hook: BeforeInsert | null): void {
    this.beforeInsert = hook;
  }

  nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  private materialize(table: string, row: FakeRow): FakeRow {
    return {
      id: row.id ?? this.nextId(table.split('.')[1] ?? 'row'),
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
      deleted_at: null,
      ...row,
    };
  }

  insert(table: string, row: FakeRow): Result<FakeRow | null> {
    const { data, error } = this.insertMany(table, [row]);
    return { data: data[0] ?? null, error };
  }

  // One statement, all-or-nothing — exactly how Postgres treats a multi-row
  // INSERT. The default-custom-field seed leans on this: the loser of a seeding
  // race writes NOTHING, so no half-seeded vocabulary can exist.
  insertMany(table: string, rows: FakeRow[]): Result<FakeRow[]> {
    const staged: FakeRow[] = [];
    const stagedKeys = new Set<string>();

    for (const row of rows) {
      const forced = this.beforeInsert?.(table, row);
      if (forced) return { data: [], error: forced };

      const key = uniqueKeyOf(table, row);
      if (key !== null) {
        // Re-read the table on every row: the hook above models a rival writer,
        // and it may have just landed the very key this row wants.
        const taken =
          stagedKeys.has(key) ||
          this.rows(table).some((existing) => uniqueKeyOf(table, existing) === key);
        if (taken) return { data: [], error: uniqueViolation() };
        stagedKeys.add(key);
      }
      staged.push(this.materialize(table, row));
    }

    this.rows(table).push(...staged);
    return { data: staged, error: null };
  }

  upsert(table: string, row: FakeRow): Result<FakeRow | null> {
    const key = uniqueKeyOf(table, row);
    const existing =
      key === null ? undefined : this.rows(table).find((r) => uniqueKeyOf(table, r) === key);
    if (existing) {
      Object.assign(existing, row);
      return { data: existing, error: null };
    }
    return this.insert(table, row);
  }
}

class FakeQuery implements PromiseLike<Result<FakeRow[]>> {
  private filters: ((row: FakeRow) => boolean)[] = [];
  // Chained .order() calls compose left-to-right, as they do in PostgREST.
  private sorts: { column: string; ascending: boolean }[] = [];
  private cap: number | null = null;
  private window: { from: number; to: number } | null = null;
  private action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: FakeRow | FakeRow[] | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(_columns?: string): this {
    return this;
  }

  insert(row: FakeRow | FakeRow[]): this {
    this.action = 'insert';
    this.payload = row;
    return this;
  }

  upsert(row: FakeRow, _options?: { onConflict?: string }): this {
    this.action = 'upsert';
    this.payload = row;
    return this;
  }

  update(patch: FakeRow): this {
    this.action = 'update';
    this.payload = patch;
    return this;
  }

  delete(): this {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  in(column: string, values: readonly unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  // Only the operators the library routes use: `cs` (array contains) and `in`.
  not(column: string, operator: string, value: unknown): this {
    if (operator === 'cs') {
      const wanted = parsePostgrestArray(value);
      this.filters.push((row) => !containsAll(row[column], wanted));
      return this;
    }
    if (operator === 'in') {
      const excluded = parsePostgrestArray(value);
      this.filters.push((row) => !excluded.includes(String(row[column])));
      return this;
    }
    throw new Error(`FakeQuery.not does not model operator "${operator}"`);
  }

  contains(column: string, values: readonly string[]): this {
    this.filters.push((row) => containsAll(row[column], values));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.sorts.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number): this {
    this.cap = count;
    return this;
  }

  range(from: number, to: number): this {
    this.window = { from, to };
    return this;
  }

  private matched(): FakeRow[] {
    return this.db.rows(this.table).filter((row) => this.filters.every((match) => match(row)));
  }

  private run(): Result<FakeRow[]> {
    if (this.action === 'insert' && this.payload) {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      return this.db.insertMany(this.table, rows);
    }
    if (this.action === 'upsert' && this.payload && !Array.isArray(this.payload)) {
      const { data, error } = this.db.upsert(this.table, this.payload);
      return { data: data ? [data] : [], error };
    }
    if (this.action === 'update' && this.payload && !Array.isArray(this.payload)) {
      const rows = this.matched();
      const patch = this.payload;
      // A rename can collide with a sibling exactly as an insert can.
      for (const row of rows) {
        const key = uniqueKeyOf(this.table, { ...row, ...patch });
        if (key === null) continue;
        const clash = this.db
          .rows(this.table)
          .some((other) => other !== row && uniqueKeyOf(this.table, other) === key);
        if (clash) return { data: [], error: uniqueViolation() };
      }
      for (const row of rows) Object.assign(row, patch);
      return { data: rows, error: null };
    }
    if (this.action === 'delete') {
      const doomed = new Set(this.matched());
      const rows = this.db.rows(this.table);
      const kept = rows.filter((row) => !doomed.has(row));
      rows.length = 0;
      rows.push(...kept);
      return { data: [...doomed], error: null };
    }

    let rows = this.matched();
    if (this.sorts.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const sort of this.sorts) {
          const delta = compareColumn(a[sort.column], b[sort.column]);
          if (delta !== 0) return sort.ascending ? delta : -delta;
        }
        return 0;
      });
    }
    if (this.window) rows = rows.slice(this.window.from, this.window.to + 1);
    if (this.cap !== null) rows = rows.slice(0, this.cap);
    return { data: rows, error: null };
  }

  async maybeSingle(): Promise<Result<FakeRow | null>> {
    const { data, error } = this.run();
    return { data: data[0] ?? null, error };
  }

  async single(): Promise<Result<FakeRow | null>> {
    const { data, error } = this.run();
    if (!error && data.length === 0) {
      return { data: null, error: { message: 'no rows returned' } };
    }
    return { data: data[0] ?? null, error };
  }

  then<TResult1 = Result<FakeRow[]>, TResult2 = never>(
    onfulfilled?: ((value: Result<FakeRow[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

function compareColumn(left: unknown, right: unknown): number {
  const a = String(left ?? '');
  const b = String(right ?? '');
  const numeric = Number(a) - Number(b);
  return Number.isNaN(numeric) ? a.localeCompare(b) : numeric;
}

// PostgREST passes list/array operands as a serialized literal — `{"tag"}` for a
// `cs` array and `(id1,id2)` for an `in` list.
function parsePostgrestArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  const raw = String(value).trim();
  const inner = raw.replace(/^[{(]/, '').replace(/[})]$/, '');
  if (inner.length === 0) return [];
  return inner.split(',').map((entry) => entry.trim().replace(/^"|"$/g, ''));
}

function containsAll(column: unknown, wanted: readonly string[]): boolean {
  if (!Array.isArray(column)) return false;
  const held = column.map(String);
  return wanted.every((entry) => held.includes(entry));
}

export type FakeClientOptions = {
  db: FakeDb;
  userId?: string;
  userEmail?: string | null;
  hasBrandAccess?: boolean;
};

// Shaped like the surface the routes touch: auth, schema().from() chains, and
// the brand_profiles has_brand_access RPC the real callerHasBrandAccess calls.
export function createFakeSupabaseClient(options: FakeClientOptions) {
  const { db, userId = 'user-1', userEmail = 'member@brand.test', hasBrandAccess = true } = options;

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId, email: userEmail } }, error: null }),
    },
    schema: (schemaName: string) => ({
      rpc: async (fn: string) =>
        fn === 'has_brand_access'
          ? { data: hasBrandAccess, error: null }
          : { data: null, error: { message: `unknown rpc ${fn}` } },
      from: (table: string) => new FakeQuery(db, `${schemaName}.${table}`),
    }),
  };
}
