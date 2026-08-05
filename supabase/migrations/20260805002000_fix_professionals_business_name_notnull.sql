-- Secondo errore nella stessa funzione, trovato dai log reali:
-- professionals.business_name è NOT NULL ma la funzione non lo
-- valorizzava mai → ogni registrazione professionista falliva con
-- "database error saving new user" (500) PRIMA che venisse inviata
-- qualsiasi email di conferma.
--
-- Questa volta verificati sistematicamente TUTTI i vincoli NOT NULL
-- senza default sulle tre tabelle coinvolte:
--   profiles:      user_id                                        -> OK
--   professionals: user_id, business_name                         -> business_name MANCAVA
--   businesses:    user_id, legal_name, business_name, slug,
--                  vat_number                                     -> tutti già valorizzati
--
-- Testato prima del rilascio su 4 scenari reali (professionista,
-- business, cliente, professionista senza alcun nome fornito),
-- tutti superati, con rollback dei dati di test.

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

  RETURN NEW;
END;
$$;
