## create the database if needed (in psql):

# DROP DATABASE org_viz;
# CREATE DATABASE org_viz;

## Connect to that database (in psql)
# \connect org_viz

## Run this DDL in either psql or pgadmin:

DROP TABLE IF EXISTS repo_fingerprints;

DROP TYPE IF EXISTS SEVERITY;

DROP TABLE IF EXISTS fingerprints;

DROP TABLE IF EXISTS repo_snapshots;

CREATE TABLE repo_snapshots (
 id varchar NOT NULL PRIMARY KEY,
 workspace_id varchar NOT NULL,
 provider_id text NOT NULL,
 owner text NOT NULL,
 name text NOT NULL,
 url text NOT NULL,
 branch text,
 path text,
 commit_sha varchar NOT NULL,
 analysis jsonb,
 timestamp TIMESTAMP  NOT NULL,
 query text
);

-- One instance for each fingerprint
CREATE TABLE fingerprints (
  name text NOT NULL,
  feature_name text NOT NULL,
  sha varchar NOT NULL,
  data jsonb,
  id varchar NOT NULL PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS repo_fingerprints (
  repo_snapshot_id varchar references repo_snapshots(id),
  fingerprint_id varchar references fingerprints(id),
  PRIMARY KEY (repo_snapshot_id, fingerprint_id)
);

CREATE INDEX ON repo_snapshots (workspace_id);

CREATE INDEX ON fingerprints (name);
CREATE INDEX ON fingerprints (feature_name);
