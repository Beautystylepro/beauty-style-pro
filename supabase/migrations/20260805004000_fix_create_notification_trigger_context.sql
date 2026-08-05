-- BUG CRITICO trovato con screenshot reali dall'utente: la correzione
-- di sicurezza precedente su create_notification controllava
-- auth.uid() per bloccare chiamate dirette non autorizzate — ma
-- auth.uid() resta quello dell'utente vero anche quando la funzione
-- viene chiamata da un meccanismo automatico del server (un trigger
-- dopo una prenotazione, un like, un trasferimento QR Coins).
-- Risultato: OGNI prenotazione (e probabilmente molte altre azioni
-- normali che generano notifiche) falliva con "Not authorized to
-- create notifications directly", perché il trigger automatico
-- veniva trattato come se fosse un tentativo di abuso da parte di un
-- utente malintenzionato.
--
-- Corretto usando pg_trigger_depth(): questa funzione dice
-- realmente se il codice sta eseguendo dentro un trigger del server
-- (>0) oppure è stato chiamato direttamente da un utente/client (0)
-- — a differenza di auth.uid(), che non cambia mai in base al
-- contesto di chiamata. Ora: dentro un trigger reale è sempre
-- permesso (è il server stesso, non un utente); una chiamata diretta
-- dall'esterno resta bloccata a meno che non sia un admin.
--
-- Testato prima del rilascio con una prenotazione reale simulata
-- (cliente non admin): la prenotazione ora riesce, la notifica viene
-- creata correttamente dal trigger, e un tentativo di chiamata
-- diretta sospetta resta bloccato come deve essere.

CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id uuid, _title text, _message text, _type text, _data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() = 0 AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized to create notifications directly';
  END IF;
  INSERT INTO public.notifications (user_id, title, message, type, data)
  VALUES (_user_id, _title, _message, _type, _data);
END;
$$;
