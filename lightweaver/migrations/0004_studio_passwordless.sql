PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS account_sign_in_emails (
  email TEXT PRIMARY KEY NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  google_subject TEXT UNIQUE
);

ALTER TABLE account_sessions ADD COLUMN passwordless_email TEXT;

CREATE TABLE IF NOT EXISTS account_email_challenges (
  email_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  account_generation INTEGER NOT NULL CHECK (account_generation >= 0),
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  next_send_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0, 1))
);

CREATE INDEX IF NOT EXISTS account_email_challenges_expiry_idx
  ON account_email_challenges (expires_at);

CREATE TABLE IF NOT EXISTS account_google_challenges (
  state_hash TEXT PRIMARY KEY NOT NULL,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS account_google_challenges_expiry_idx
  ON account_google_challenges (expires_at);

CREATE TABLE IF NOT EXISTS account_sign_in_rate_limits (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 1),
  resets_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS account_sign_in_rate_limits_reset_idx
  ON account_sign_in_rate_limits (resets_at);
