import Database from 'better-sqlite3';
import path from 'path';

// Connect to SQLite database (creates file if it doesn't exist)
const dbPath = path.resolve(__dirname, '../../database.sqlite');
export const db = new Database(dbPath);

// Initialize schema
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_language TEXT NOT NULL,
      target_language TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS captions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      language TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions (id)
    );
  `);
}

// Session operations
export function createSession(id: string, title: string, sourceLanguage: string, targetLanguage: string) {
  const stmt = db.prepare(
    'INSERT INTO sessions (id, title, source_language, target_language, status) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(id, title, sourceLanguage, targetLanguage, 'active');
}

export function getSession(id: string) {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  return stmt.get(id);
}

export function endSession(id: string) {
  const stmt = db.prepare("UPDATE sessions SET status = 'ended' WHERE id = ?");
  stmt.run(id);
}

// Caption operations
export function saveCaption(id: string, sessionId: string, language: string, text: string) {
  const stmt = db.prepare(
    'INSERT INTO captions (id, session_id, language, text) VALUES (?, ?, ?, ?)'
  );
  stmt.run(id, sessionId, language, text);
}

export function getCaptions(sessionId: string) {
  const stmt = db.prepare('SELECT * FROM captions WHERE session_id = ? ORDER BY created_at ASC');
  return stmt.all(sessionId);
}
