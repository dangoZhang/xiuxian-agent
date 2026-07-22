import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { DatabaseSync as NodeDatabaseSync } from 'node:sqlite';
import {
  chronicleEntrySchema,
  gameStateSchema,
  saveFileSchema,
  type ChronicleEntry,
  type GameState,
  type SaveFile,
} from '@xiuxian/protocol';
import { AppError } from './errors.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
type Db = Pick<NodeDatabaseSync, 'exec' | 'prepare' | 'close'>;

export class GameRepository {
  readonly #db: Db;

  constructor(path = ':memory:', database?: Db) {
    if (!database && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#db = database ?? new DatabaseSync(path);
    this.#migrate();
  }

  close(): void { this.#db.close(); }

  create(state: GameState, sessionId: string): void {
    const parsed = gameStateSchema.parse(state);
    this.#transaction(() => {
      this.#db.prepare(`INSERT INTO games (id, session_id, revision, status, state_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(parsed.id, sessionId, parsed.revision, parsed.status, JSON.stringify(parsed), new Date().toISOString(), new Date().toISOString());
      this.#insertEntries(parsed.id, parsed.chronicle);
    });
  }

  restore(state: GameState, sessionId: string): void {
    const parsed = gameStateSchema.parse(state);
    const now = new Date().toISOString();
    this.#transaction(() => {
      this.#db.prepare('DELETE FROM chronicle_entries WHERE game_id = ?').run(parsed.id);
      this.#db.prepare(`INSERT INTO games (id, session_id, revision, status, state_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, revision = excluded.revision,
          status = excluded.status, state_json = excluded.state_json, updated_at = excluded.updated_at`)
        .run(parsed.id, sessionId, parsed.revision, parsed.status, JSON.stringify(parsed), now, now);
      this.#insertEntries(parsed.id, parsed.chronicle);
    });
  }

  get(id: string): GameState {
    const row = this.#db.prepare('SELECT state_json FROM games WHERE id = ?').get(id) as { state_json?: unknown } | undefined;
    if (!row || typeof row.state_json !== 'string') throw new AppError('SAVE_SCHEMA_INVALID', '游戏不存在', 404);
    return gameStateSchema.parse(JSON.parse(row.state_json));
  }

  sessionIdFor(id: string): string {
    const row = this.#db.prepare('SELECT session_id FROM games WHERE id = ?').get(id) as { session_id?: unknown } | undefined;
    if (!row || typeof row.session_id !== 'string') throw new AppError('SAVE_SCHEMA_INVALID', '游戏不存在', 404);
    return row.session_id;
  }

  bindSession(id: string, sessionId: string): void {
    const result = this.#db.prepare('UPDATE games SET session_id = ?, updated_at = ? WHERE id = ?')
      .run(sessionId, new Date().toISOString(), id);
    if (Number(result.changes) !== 1) throw new AppError('SAVE_SCHEMA_INVALID', '游戏不存在', 404);
  }

  commit(id: string, expectedRevision: number, next: GameState, newEntries: readonly ChronicleEntry[]): void {
    const parsed = gameStateSchema.parse(next);
    if (parsed.id !== id || parsed.revision !== expectedRevision + 1) {
      throw new AppError('STALE_REVISION', '提交的存档 revision 不连续', 409);
    }
    this.#transaction(() => {
      const result = this.#db.prepare(`UPDATE games SET revision = ?, status = ?, state_json = ?, updated_at = ?
        WHERE id = ? AND revision = ?`)
        .run(parsed.revision, parsed.status, JSON.stringify(parsed), new Date().toISOString(), id, expectedRevision);
      if (Number(result.changes) !== 1) throw new AppError('STALE_REVISION', '游戏已被其他请求推进，请重新读取', 409);
      this.#insertEntries(id, newEntries.map((entry) => chronicleEntrySchema.parse(entry)));
    });
  }

  import(save: SaveFile, sessionId: string, newId?: string): GameState {
    const parsed = saveFileSchema.parse(save);
    const state = newId ? { ...parsed.game, id: newId } : parsed.game;
    this.create(gameStateSchema.parse(state), sessionId);
    return state;
  }

  #insertEntries(gameId: string, entries: readonly ChronicleEntry[]): void {
    const statement = this.#db.prepare(`INSERT INTO chronicle_entries
      (id, game_id, sequence, day, source, kind, entry_json) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const entry of entries) {
      statement.run(entry.id, gameId, entry.sequence, entry.day, entry.source, entry.kind, JSON.stringify(entry));
    }
  }

  #transaction<T>(operation: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  #migrate(): void {
    this.#db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        status TEXT NOT NULL,
        state_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chronicle_entries (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        day INTEGER NOT NULL,
        source TEXT NOT NULL,
        kind TEXT NOT NULL,
        entry_json TEXT NOT NULL,
        UNIQUE(game_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS chronicle_game_sequence ON chronicle_entries(game_id, sequence);
    `);
  }
}
