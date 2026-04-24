-- teams_cleanup.sql
-- Only needed if you previously ran the old productions migration and have
-- leftover start_date / end_date columns on the teams table.
-- Safe to skip entirely if teams.sql was the first migration applied (fresh create).
--
-- DO NOT run unless `select start_date from teams limit 1` succeeds without error.

alter table teams
  drop column if exists start_date,
  drop column if exists end_date;
