-- Enables real background/autonomous operation for Stella, independent of
-- whether the app is open on any device:
-- 1) stella-scheduled-actions: executes reminders/messages the user asked
--    Stella to send later ("ricordami di...", "scrivi a X domani alle 9")
-- 2) ai-automation-triggers: daily digest, inactivity nudges, low-balance
--    alerts, live reminders, job matches, premium upsell, engagement boosts
--
-- Both functions already existed and were fully built, but nothing was
-- ever calling them on a schedule — pg_cron was available but not enabled,
-- so they only ran if manually invoked. This was the missing piece for
-- "Stella works even with the app closed": push notifications reach the
-- user's device regardless of whether the app is open, but the automation
-- that DECIDES to send them was never actually running periodically.
--
-- IMPORTANT: the x-internal-secret value below must exactly match the
-- INTERNAL_SECRET Edge Function secret in Supabase, otherwise every
-- scheduled call fails with 403 Forbidden (a custom Postgres setting was
-- tried first but isn't configurable without superuser on managed
-- Supabase — same constraint hit earlier for the push notification
-- trigger — so the value is embedded directly here instead).

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'stella-scheduled-actions-tick',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vmadeboxypvvebkbhzak.supabase.co/functions/v1/stella-scheduled-actions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'p-SnfNRJbCUyDpLjRVwE5cMfaAbMKeENNFGIYZeLH90'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'stella-daily-digest',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vmadeboxypvvebkbhzak.supabase.co/functions/v1/ai-automation-triggers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'p-SnfNRJbCUyDpLjRVwE5cMfaAbMKeENNFGIYZeLH90'
    ),
    body := '{"trigger_type": "daily_digest"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'stella-inactive-nudge',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vmadeboxypvvebkbhzak.supabase.co/functions/v1/ai-automation-triggers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', 'p-SnfNRJbCUyDpLjRVwE5cMfaAbMKeENNFGIYZeLH90'
    ),
    body := '{"trigger_type": "inactive_nudge"}'::jsonb
  );
  $$
);
