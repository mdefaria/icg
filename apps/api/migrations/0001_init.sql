CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  amount_total INTEGER,
  currency TEXT,
  created_at INTEGER NOT NULL,
  emailed_at INTEGER
);

CREATE TABLE keys (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  issued_at INTEGER NOT NULL,
  devices INTEGER NOT NULL,
  signature TEXT NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX keys_email ON keys(email);

CREATE TABLE devices (
  key_id TEXT NOT NULL REFERENCES keys(id),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  PRIMARY KEY (key_id, id)
);

CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  purchase_id TEXT,
  received_at INTEGER NOT NULL
);
