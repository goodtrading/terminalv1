CREATE TABLE IF NOT EXISTS goodtrading_accounts (
  id serial PRIMARY KEY,
  account_uid text NOT NULL UNIQUE,
  user_id integer NOT NULL UNIQUE REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
