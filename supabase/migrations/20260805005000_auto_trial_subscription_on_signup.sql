-- Richiesta chiarita: il primo mese gratis deve partire dalla
-- REGISTRAZIONE, automaticamente per tutti, non solo per chi passa
-- da un pagamento Stripe con carta — un salone che vuole provare
-- l'app deve poter usare tutto gratis per 30 giorni senza inserire
-- nessuna carta di credito.
--
-- Ogni nuovo account riceve ora in automatico un abbonamento di prova
-- al piano più completo per il proprio tipo, valido 30 giorni dalla
-- registrazione — nessuna azione richiesta, nessuna carta necessaria.
--
-- Testato prima del rilascio con 3 registrazioni simulate (cliente,
-- professionista, business): tutte ricevono correttamente il piano
-- più completo del proprio tipo, stato attivo, contrassegnato come
-- prova. Applicato anche retroattivamente a chi si era già
-- registrato prima di questa correzione.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
  new_user_type text;
  resolved_display_name text;
  resolved_business_name text;
  trial_plan_slug text;
  trial_plan_id uuid;
BEGIN
  meta := NEW.raw_user_meta_data;
  new_user_type := COALESCE(meta->>'user_type', 'client');
  resolved_display_name := COALESCE(
    meta->>'display_name',
    meta->>'full_name',
    meta->>'name',
    NEW.email
  );
  resolved_business_name := COALESCE(
    NULLIF(TRIM(meta->>'business_name'), ''),
    NULLIF(TRIM(meta->>'company_name'), ''),
    NULLIF(TRIM(resolved_display_name), ''),
    NEW.email
  );

  INSERT INTO public.profiles (
    user_id, display_name, avatar_url, user_type, country, gender, color_theme,
    phone, city, bio, surname, username, whatsapp, interests,
    instagram, tiktok, facebook, latitude, longitude, preferred_language
  ) VALUES (
    NEW.id, resolved_display_name, meta->>'avatar_url', new_user_type,
    COALESCE(meta->>'country', 'Italia'), meta->>'gender', COALESCE(meta->>'color_theme', 'female'),
    meta->>'phone', meta->>'city', meta->>'bio', meta->>'surname', meta->>'username', meta->>'whatsapp',
    CASE WHEN meta->'interests' IS NOT NULL AND jsonb_typeof(meta->'interests') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(meta->'interests')) ELSE NULL END,
    meta->>'instagram', meta->>'tiktok', meta->>'facebook',
    CASE WHEN meta->>'latitude' IS NOT NULL THEN (meta->>'latitude')::double precision ELSE NULL END,
    CASE WHEN meta->>'longitude' IS NOT NULL THEN (meta->>'longitude')::double precision ELSE NULL END,
    COALESCE(meta->>'preferred_language', 'it')
  );

  IF new_user_type = 'professional' THEN
    INSERT INTO public.professionals (
      user_id, business_name, category, description, price_min, price_max, city, whatsapp
    ) VALUES (
      NEW.id,
      resolved_business_name,
      COALESCE(meta->>'category', 'Hairstylist'),
      meta->>'description',
      CASE WHEN meta->>'price_min' IS NOT NULL THEN (meta->>'price_min')::numeric ELSE NULL END,
      CASE WHEN meta->>'price_max' IS NOT NULL THEN (meta->>'price_max')::numeric ELSE NULL END,
      meta->>'city',
      meta->>'phone'
    );
  END IF;

  IF new_user_type = 'business' THEN
    INSERT INTO public.businesses (
      user_id, business_name, legal_name, vat_number, tax_code, slug,
      address, zip_code, city, phone, website, business_type, description
    ) VALUES (
      NEW.id,
      resolved_business_name,
      resolved_business_name,
      COALESCE(meta->>'vat_number', ''),
      meta->>'tax_code',
      COALESCE(NULLIF(LOWER(REGEXP_REPLACE(resolved_business_name, '[^a-zA-Z0-9]+', '-', 'g')), ''), 'biz') || '-' || SUBSTRING(NEW.id::text, 1, 8),
      meta->>'address', meta->>'zip_code', meta->>'city', meta->>'phone', meta->>'website',
      COALESCE(meta->>'biz_category', 'salone'), meta->>'description'
    );
  END IF;

  -- Prova gratuita automatica di 30 giorni, dalla registrazione,
  -- nessuna carta richiesta: piano più completo per il tipo di account.
  trial_plan_slug := CASE WHEN new_user_type IN ('professional', 'business') THEN 'premium' ELSE 'client_unlimited' END;
  SELECT id INTO trial_plan_id FROM public.subscription_plans WHERE slug = trial_plan_slug;
  IF trial_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status, is_trial, started_at, expires_at, payment_method)
    VALUES (NEW.id, trial_plan_id, 'active', true, now(), now() + interval '30 days', 'trial')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Applicato retroattivamente a chi si era già registrato prima di
-- questa correzione, così anche loro hanno subito i 30 giorni di prova.
INSERT INTO public.user_subscriptions (user_id, plan_id, status, is_trial, started_at, expires_at, payment_method)
SELECT
  p.user_id,
  (SELECT id FROM subscription_plans WHERE slug = CASE WHEN p.user_type IN ('professional','business') THEN 'premium' ELSE 'client_unlimited' END),
  'active', true, now(), now() + interval '30 days', 'trial'
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM user_subscriptions us WHERE us.user_id = p.user_id)
ON CONFLICT (user_id) DO NOTHING;
