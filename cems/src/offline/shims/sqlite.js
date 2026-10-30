// node:sqlite's DatabaseSync on sql.js (SQLite compiled to WebAssembly). The host opens the sql.js
// database before the server starts, and is told about writes so it can persist the database.
let opened = null;
let onWrite = () => {};
let instance = null;

export function attach(db, writeHook) {
  opened = db;
  onWrite = writeHook || (() => {});
}

// sql.js frees prepared statements when it exports, so the statement cache is dropped first.
export function exportBytes() {
  instance?.clearCache();
  return opened.export();
}

const READ = /^\s*select\b/i;
const bindable = (params) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v));

class StatementSync {
  constructor(owner, sql) {
    this.owner = owner;
    this.sql = sql;
    this.write = !READ.test(sql);
  }

  run(...params) {
    const st = this.owner.statement(this.sql);
    try {
      st.bind(bindable(params));
      st.step();
    } finally {
      st.reset();
    }
    const changes = this.owner.db.getRowsModified();
    if (this.write) onWrite();
    return { changes, lastInsertRowid: 0 };
  }

  get(...params) {
    const st = this.owner.statement(this.sql);
    try {
      st.bind(bindable(params));
      return st.step() ? st.getAsObject() : undefined;
    } finally {
      st.reset();
    }
  }

  all(...params) {
    const st = this.owner.statement(this.sql);
    const rows = [];
    try {
      st.bind(bindable(params));
      while (st.step()) rows.push(st.getAsObject());
    } finally {
      st.reset();
    }
    return rows;
  }

  iterate(...params) {
    return this.all(...params)[Symbol.iterator]();
  }
}

export class DatabaseSync {
  constructor() {
    if (!opened) throw new Error('The offline database is not open');
    this.db = opened;
    this.cache = new Map();
    instance = this;
  }

  statement(sql) {
    let st = this.cache.get(sql);
    if (!st) {
      if (this.cache.size >= 500) this.clearCache();
      st = this.db.prepare(sql);
      this.cache.set(sql, st);
    }
    return st;
  }

  clearCache() {
    for (const st of this.cache.values()) {
      try { st.free(); } catch { /* already freed by an export */ }
    }
    this.cache.clear();
  }

  prepare(sql) {
    return new StatementSync(this, sql);
  }

  exec(sql) {
    this.db.exec(sql);
    if (!READ.test(sql)) onWrite();
  }

  close() {
    this.clearCache();
  }
}

export default { DatabaseSync };
