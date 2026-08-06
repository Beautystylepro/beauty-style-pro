-- Funzione protetta e specifica: permette di notificare l'altra parte
-- di una prenotazione SOLO a chi è davvero coinvolto in quella
-- prenotazione (il cliente o il professionista proprietario) — non un
-- permesso generico di mandare notifiche a chiunque, che resta
-- bloccato come deve essere.
--
-- Testato prima del rilascio: il professionista reale coinvolto
-- riesce a notificare, un estraneo non coinvolto viene bloccato.

CREATE OR REPLACE FUNCTION public.notify_booking_status_change(
  _booking_id uuid, _title text, _message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
  pro_user_id uuid;
  target_user_id uuid;
BEGIN
  SELECT client_id, professional_id INTO b FROM public.bookings WHERE id = _booking_id;
  IF b IS NULL THEN
    RETURN jsonb_build_object('error', 'Prenotazione non trovata');
  END IF;

  SELECT user_id INTO pro_user_id FROM public.professionals WHERE id = b.professional_id;

  IF auth.uid() != b.client_id AND auth.uid() != pro_user_id THEN
    RETURN jsonb_build_object('error', 'Non autorizzato: non sei coinvolto in questa prenotazione');
  END IF;

  target_user_id := CASE WHEN auth.uid() = b.client_id THEN pro_user_id ELSE b.client_id END;
  IF target_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Destinatario non trovato');
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, data)
  VALUES (target_user_id, _title, _message, 'booking', jsonb_build_object('booking_id', _booking_id));

  RETURN jsonb_build_object('success', true);
END;
$$;
