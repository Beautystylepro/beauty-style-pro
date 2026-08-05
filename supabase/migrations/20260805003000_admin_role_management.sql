-- Funzione protetta per gestire lo staff: solo chi è GIA' admin può
-- usarla, verificato server-side (non fidandosi di nessun controllo
-- lato client) — impossibile per chiunque altro auto-assegnarsi un
-- ruolo, anche modificando il codice del browser.
--
-- Testato prima del rilascio: email inesistente (bloccato), ruolo
-- non valido (bloccato), utente non-admin che tenta di assegnare
-- ruoli (bloccato), assegnazione reale riuscita e verificata.

CREATE OR REPLACE FUNCTION public.admin_set_user_role(target_email text, new_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
  caller_is_admin boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') INTO caller_is_admin;
  IF NOT caller_is_admin THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN: solo un admin può gestire lo staff');
  END IF;

  IF new_role NOT IN ('admin', 'moderator', 'user') THEN
    RETURN jsonb_build_object('error', 'Ruolo non valido');
  END IF;

  SELECT id INTO target_id FROM auth.users WHERE lower(email) = lower(target_email);
  IF target_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Nessun utente registrato con questa email');
  END IF;

  IF new_role = 'user' THEN
    DELETE FROM public.user_roles WHERE user_id = target_id AND role != 'user';
    RETURN jsonb_build_object('success', true, 'message', 'Ruoli staff rimossi');
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (target_id, new_role::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'message', 'Ruolo assegnato');
END;
$$;

-- Funzione per elencare lo staff attuale (solo admin)
CREATE OR REPLACE FUNCTION public.admin_list_staff()
RETURNS TABLE(user_id uuid, email text, display_name text, role text, granted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_roles ur2 WHERE ur2.user_id = auth.uid() AND ur2.role = 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  SELECT ur.user_id, au.email::text, p.display_name, ur.role::text, ur.created_at
  FROM public.user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role IN ('admin', 'moderator')
  ORDER BY ur.created_at DESC;
END;
$$;
