-- Phase A: "Specific days" chore recurrence (e.g. every Tue + Fri)
-- Adds the column backing chore.daysOfWeek (0=Sun … 6=Sat, matches JS getDay()).
-- Existing recurrence types are untouched; rows keep days_of_week NULL.
-- Run in the Supabase SQL editor.

ALTER TABLE chores ADD COLUMN IF NOT EXISTS days_of_week smallint[];
