CREATE TABLE IF NOT EXISTS anon (device TEXT PRIMARY KEY, found TEXT NOT NULL DEFAULT '[]', updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS anon_updated ON anon(updated);
ALTER TABLE submissions ADD COLUMN token TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS submissions_token ON submissions(token);
