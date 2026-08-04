-- Estende l'automazione server-side già esistente (pg_cron, già attiva
-- e funzionante architetturalmente) con due capacità di business reali
-- e concrete, costruibili con lo schema che già abbiamo — senza
-- duplicare tabelle: usa direttamente bookings, professionals,
-- notifications già esistenti.

-- 1) Riattivazione clienti: chi ha prenotato in passato con un
--    professionista ma non torna da 30+ giorni, riceve un promemoria
--    (massimo uno ogni 30 giorni per evitare spam).
CREATE OR REPLACE FUNCTION public.stella_reactivate_inactive_clients()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (b.client_id, b.professional_id)
      b.client_id, b.professional_id, p.business_name,
      MAX(b.booking_date) OVER (PARTITION BY b.client_id, b.professional_id) as last_visit,
      pr.display_name as client_name
    FROM public.bookings b
    JOIN public.professionals p ON p.id = b.professional_id
    JOIN public.profiles pr ON pr.user_id = b.client_id
    WHERE b.status = 'completed'
    GROUP BY b.client_id, b.professional_id, p.business_name, pr.display_name, b.booking_date
    HAVING MAX(b.booking_date) < CURRENT_DATE - INTERVAL '30 days'
       AND MAX(b.booking_date) > CURRENT_DATE - INTERVAL '90 days'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = rec.client_id
        AND n.type = 'reactivation'
        AND n.message LIKE '%' || rec.business_name || '%'
        AND n.created_at > now() - INTERVAL '30 days'
    ) THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        rec.client_id,
        '💜 Ci manchi!',
        'Ciao ' || COALESCE(rec.client_name, '') || '! Sono passati più di 30 giorni dalla tua ultima visita da ' || rec.business_name || '. Prenota di nuovo quando vuoi 😊',
        'reactivation'
      );
    END IF;
  END LOOP;
END;
$$;

-- 2) Slot vuoti: se un professionista ha oggi meno del 40% degli slot
--    tipici occupati, lo avvisa (lui decide se lanciare una promo,
--    Stella non manda sconti automatici senza che lui lo sappia).
CREATE OR REPLACE FUNCTION public.stella_notify_empty_slots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  today_bookings integer;
  avg_bookings numeric;
BEGIN
  FOR rec IN SELECT id, user_id, business_name FROM public.professionals LOOP
    SELECT count(*) INTO today_bookings
    FROM public.bookings
    WHERE professional_id = rec.id AND booking_date = CURRENT_DATE AND status <> 'cancelled';

    SELECT COALESCE(AVG(daily_count), 0) INTO avg_bookings
    FROM (
      SELECT booking_date, count(*) as daily_count
      FROM public.bookings
      WHERE professional_id = rec.id
        AND booking_date >= CURRENT_DATE - INTERVAL '28 days'
        AND booking_date < CURRENT_DATE
        AND status <> 'cancelled'
      GROUP BY booking_date
    ) recent;

    IF avg_bookings >= 2 AND today_bookings < avg_bookings * 0.4 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = rec.user_id AND type = 'empty_slots_alert'
          AND created_at > CURRENT_DATE
      ) THEN
        INSERT INTO public.notifications (user_id, title, message, type)
        VALUES (
          rec.user_id,
          '📉 Oggi hai pochi appuntamenti',
          'Solo ' || today_bookings || ' prenotazioni oggi (media: ' || round(avg_bookings) || '). Vuoi lanciare un''offerta lampo per riempire gli slot liberi?',
          'empty_slots_alert'
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'stella-reactivate-clients',
  '0 10 * * *',
  $$SELECT public.stella_reactivate_inactive_clients();$$
);

SELECT cron.schedule(
  'stella-empty-slots-check',
  '0 11 * * *',
  $$SELECT public.stella_notify_empty_slots();$$
);
