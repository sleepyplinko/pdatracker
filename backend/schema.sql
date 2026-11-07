-- PDA tracker database. Paste all of this into the D1 console once.
CREATE TABLE IF NOT EXISTS users (
  name     TEXT PRIMARY KEY COLLATE NOCASE,  -- unique, case-insensitive
  display  TEXT NOT NULL,                    -- name as the user typed it
  salt     TEXT NOT NULL,
  hash     TEXT NOT NULL,
  found    TEXT NOT NULL DEFAULT '[]',       -- JSON list of found entry ids
  ver      INTEGER NOT NULL DEFAULT 0,       -- bumps on every save (sync conflicts)
  share    INTEGER NOT NULL DEFAULT 1,       -- count me in rarity stats
  public   INTEGER NOT NULL DEFAULT 1,       -- allow #u=name profile links
  created  INTEGER NOT NULL,
  updated  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token    TEXT PRIMARY KEY,                 -- SHA-256 of the login token
  name     TEXT NOT NULL COLLATE NOCASE,
  created  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  ip       TEXT NOT NULL,
  t        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_ip ON attempts(ip, t);
