-- BUG TROVATO: questo trigger mandava SEMPRE "Prenotazione
-- Confermata" al cliente ad ogni nuova prenotazione, indipendentemente
-- dallo stato reale — che di norma resta "pending" (in attesa che il
-- professionista la confermi davvero). La notifica mentiva sullo
-- stato vero della richiesta.
--
-- Testato prima del rilascio con due scenari reali (prenotazione
-- normale in attesa, prenotazione già confermata all'inserimento):
-- messaggi corretti e distinti in entrambi i casi.

CREATE OR REPLACE FUNCTION public.notify_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client_name text;
  pro_user_id uuid;
  is_confirmed boolean;
BEGIN
  SELECT display_name INTO client_name FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;
  SELECT user_id INTO pro_user_id FROM public.professionals WHERE id = NEW.professional_id LIMIT 1;
  is_confirmed := (NEW.status = 'confirmed');

  IF pro_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      pro_user_id,
      'Nuova Prenotazione 📅',
      COALESCE(client_name, 'Un cliente') || ' ha prenotato per il ' || NEW.booking_date,
      'booking',
      jsonb_build_object('booking_id', NEW.id, 'client_id', NEW.client_id)
    );
  END IF;

  PERFORM public.create_notification(
    NEW.client_id,
    CASE WHEN is_confirmed THEN 'Prenotazione Confermata ✅' ELSE 'Richiesta Inviata ⏳' END,
    CASE WHEN is_confirmed
      THEN 'Il tuo appuntamento per il ' || NEW.booking_date || ' è confermato'
      ELSE 'La tua richiesta per il ' || NEW.booking_date || ' è stata inviata, in attesa di conferma dal professionista'
    END,
    'booking',
    jsonb_build_object('booking_id', NEW.id)
  );
  RETURN NEW;
END;
$$;
