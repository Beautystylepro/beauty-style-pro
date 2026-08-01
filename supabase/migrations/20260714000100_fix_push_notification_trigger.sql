-- The original trigger relied on custom Postgres settings
-- (app.settings.supabase_url / app.settings.anon_key) that require
-- superuser privileges to set and were never actually configured — so
-- every push attempt built a URL from NULL values. Also, it had no
-- exception handling: if net.http_post ever raised (e.g. malformed URL),
-- it would have rolled back the notification INSERT itself, which is a
-- much worse failure than a missing push.
--
-- Fixed: hardcode the real project URL + publishable key directly (both
-- are meant to be public/client-safe — that's what a publishable key is
-- for), and wrap the call so a push failure can never block the
-- notification from being created.
CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://vmadeboxypvvebkbhzak.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_xr25xfxrF9FO_Vy_0dN3ng_pE2LH98j'
      ),
      body := jsonb_build_object(
        'user_id', NEW.user_id, 'title', NEW.title, 'message', NEW.message,
        'type', NEW.type, 'data', NEW.data, 'notification_id', NEW.id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let a push-delivery problem block the notification row itself.
    RAISE WARNING 'notify_push_on_insert: push dispatch failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
