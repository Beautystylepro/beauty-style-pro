-- Reconstructed from the live production schema (this table/function existed in
-- prod but was never captured as a migration file, likely created via the SQL
-- editor directly, before this repository's migration history was fully
-- tracked). Recreated here so a fresh database replay from this repo's
-- migrations has everything the app code expects (RemindersPage shipping
-- promo codes call the apply_shipping_promo RPC).

CREATE TABLE public.shipping_promos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text DEFAULT 'percent', -- 'percent' | 'fixed' | 'free_shipping'
  discount_value numeric,
  min_order_amount numeric DEFAULT 0,
  max_uses integer,
  current_uses integer DEFAULT 0,
  service_types text[], -- NULL/empty = applies to all service types
  active boolean DEFAULT true,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.shipping_promos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active shipping promos are viewable by everyone"
  ON public.shipping_promos FOR SELECT USING (active = true);

CREATE TRIGGER update_shipping_promos_updated_at
  BEFORE UPDATE ON public.shipping_promos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.apply_shipping_promo(_code text, _service_type text, _order_amount numeric DEFAULT 0)
RETURNS TABLE(valid boolean, discount_type text, discount_value numeric, free_shipping boolean, message text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  promo public.shipping_promos;
BEGIN
  SELECT * INTO promo FROM public.shipping_promos sp
  WHERE sp.code = _code AND sp.active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::numeric, false, 'Codice promo non valido'::text;
    RETURN;
  END IF;

  IF promo.valid_until IS NOT NULL AND promo.valid_until < now() THEN
    RETURN QUERY SELECT false, NULL::text, NULL::numeric, false, 'Codice promo scaduto'::text;
    RETURN;
  END IF;

  IF promo.max_uses IS NOT NULL AND promo.current_uses >= promo.max_uses THEN
    RETURN QUERY SELECT false, NULL::text, NULL::numeric, false, 'Codice promo esaurito'::text;
    RETURN;
  END IF;

  IF promo.service_types IS NOT NULL AND array_length(promo.service_types, 1) > 0
     AND NOT (_service_type = ANY(promo.service_types)) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::numeric, false, 'Codice promo non valido per questo servizio'::text;
    RETURN;
  END IF;

  IF promo.min_order_amount IS NOT NULL AND _order_amount < promo.min_order_amount THEN
    RETURN QUERY SELECT false, NULL::text, NULL::numeric, false,
      format('Ordine minimo di €%s richiesto', promo.min_order_amount)::text;
    RETURN;
  END IF;

  UPDATE public.shipping_promos SET current_uses = current_uses + 1 WHERE id = promo.id;

  RETURN QUERY SELECT
    true,
    promo.discount_type,
    promo.discount_value,
    (promo.discount_type = 'free_shipping'),
    CASE
      WHEN promo.discount_type = 'free_shipping' THEN 'Spedizione gratuita applicata!'
      WHEN promo.discount_type = 'percent' THEN format('Sconto del %s%% applicato!', promo.discount_value)
      ELSE format('Sconto di €%s applicato!', promo.discount_value)
    END::text;
END;
$$;
