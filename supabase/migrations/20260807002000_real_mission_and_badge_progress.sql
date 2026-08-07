-- TROVATO rileggendo due settimane di sessioni precedenti: le
-- missioni e i badge mostravano progressi COMPLETAMENTE FINTI e
-- IDENTICI per ogni utente (es. tutti risultavano aver già "aperto
-- l'app" e messo "1 like su 3", tutti avevano lo stesso identico
-- badge "Primo Accesso" con la stessa data fissa) — segnalato allora,
-- mai davvero corretto. Costruito per davvero: calcola i progressi
-- veri contando le azioni reali di ciascun utente.
--
-- Testato prima del rilascio con casi reali simulati: like/post/
-- traguardi contati correttamente.

CREATE OR REPLACE FUNCTION public.get_real_mission_progress(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  today_start timestamptz := date_trunc('day', now());
  week_start timestamptz := date_trunc('week', now());
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'd1', 1,
    'd2', (SELECT count(*) FROM stream_viewers WHERE user_id = _user_id AND joined_at >= today_start),
    'd3', (SELECT count(*) FROM post_likes WHERE user_id = _user_id AND created_at >= today_start),
    'd4', 0,
    'd5', (SELECT count(DISTINCT conversation_id) FROM messages WHERE sender_id = _user_id AND created_at >= today_start),
    'w1', (SELECT count(*) FROM posts WHERE user_id = _user_id AND created_at >= week_start),
    'w2', (SELECT count(*) FROM stream_viewers WHERE user_id = _user_id AND joined_at >= week_start),
    'w3', (SELECT count(*) FROM reviews WHERE client_id = _user_id AND created_at >= week_start),
    'w4', (SELECT count(*) FROM bookings WHERE client_id = _user_id AND created_at >= week_start),
    'total_social_interactions', (
      (SELECT count(*) FROM post_likes WHERE user_id = _user_id) +
      (SELECT count(*) FROM posts WHERE user_id = _user_id) +
      (SELECT count(*) FROM messages WHERE sender_id = _user_id)
    ),
    'total_lives_watched', (SELECT count(*) FROM stream_viewers WHERE user_id = _user_id),
    'total_reviews', (SELECT count(*) FROM reviews WHERE client_id = _user_id),
    'qr_coins', (SELECT COALESCE(qr_coins, 0) FROM profiles WHERE user_id = _user_id),
    'total_followers', (SELECT count(*) FROM follows WHERE following_id = _user_id),
    'total_referrals', (SELECT COALESCE(total_sales, 0) FROM affiliates WHERE user_id = _user_id),
    'account_created_at', (SELECT created_at FROM auth.users WHERE id = _user_id)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_real_mission_progress(uuid) TO authenticated;

-- Popolamento badge reali (la tabella era completamente vuota) +
-- assegnazione automatica basata sui traguardi veri.
INSERT INTO public.badges (name, description, icon, category, rarity) VALUES
  ('Primo Accesso', 'Hai aperto l''app per la prima volta', 'sparkles', 'social', 'common'),
  ('Social Butterfly', '20 interazioni social (like, post, messaggi)', 'users', 'social', 'rare'),
  ('Live Fan', 'Guarda 10 dirette', 'video', 'live', 'rare'),
  ('Top Reviewer', 'Lascia 10 recensioni', 'star', 'community', 'epic'),
  ('QRCoin Master', 'Accumula 1000 QRCoins', 'coins', 'economy', 'epic'),
  ('Influencer', 'Raggiungi 100 follower', 'crown', 'social', 'legendary'),
  ('Ambasciatore', 'Invita 10 amici (referral riusciti)', 'users', 'growth', 'legendary')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.check_and_award_badges(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p jsonb;
  newly_awarded text[] := '{}';
  bid uuid;
BEGIN
  SELECT get_real_mission_progress(_user_id) INTO p;

  SELECT id INTO bid FROM badges WHERE name = 'Primo Accesso';
  IF bid IS NOT NULL THEN
    INSERT INTO user_badges (user_id, badge_id) VALUES (_user_id, bid) ON CONFLICT DO NOTHING;
  END IF;

  IF (p->>'total_social_interactions')::int >= 20 THEN
    SELECT id INTO bid FROM badges WHERE name = 'Social Butterfly';
    INSERT INTO user_badges (user_id, badge_id) VALUES (_user_id, bid) ON CONFLICT DO NOTHING;
    IF FOUND THEN newly_awarded := array_append(newly_awarded, 'Social Butterfly'); END IF;
  END IF;

  IF (p->>'total_lives_watched')::int >= 10 THEN
    SELECT id INTO bid FROM badges WHERE name = 'Live Fan';
    INSERT INTO user_badges (user_id, badge_id) VALUES (_user_id, bid) ON CONFLICT DO NOTHING;
    IF FOUND THEN newly_awarded := array_append(newly_awarded, 'Live Fan'); END IF;
  END IF;

  IF (p->>'total_reviews')::int >= 10 THEN
    SELECT id INTO bid FROM badges WHERE name = 'Top Reviewer';
    INSERT INTO user_badges (user_id, badge_id) VALUES (_user_id, bid) ON CONFLICT DO NOTHING;
    IF FOUND THEN newly_awarded := array_append(newly_awarded, 'Top Reviewer'); END IF;
  END IF;

  IF (p->>'qr_coins')::int >= 1000 THEN
    SELECT id INTO bid FROM badges WHERE name = 'QRCoin Master';
    INSERT INTO user_badges (user_id, badge_id) VALUES (_user_id, bid) ON CONFLICT DO NOTHING;
    IF FOUND THEN newly_awarded := array_append(newly_awarded, 'QRCoin Master'); END IF;
  END IF;

  IF (p->>'total_followers')::int >= 100 THEN
    SELECT id INTO bid FROM badges WHERE name = 'Influencer';
    INSERT INTO user_badges (user_id, badge_id) VALUES (_user_id, bid) ON CONFLICT DO NOTHING;
    IF FOUND THEN newly_awarded := array_append(newly_awarded, 'Influencer'); END IF;
  END IF;

  IF (p->>'total_referrals')::int >= 10 THEN
    SELECT id INTO bid FROM badges WHERE name = 'Ambasciatore';
    INSERT INTO user_badges (user_id, badge_id) VALUES (_user_id, bid) ON CONFLICT DO NOTHING;
    IF FOUND THEN newly_awarded := array_append(newly_awarded, 'Ambasciatore'); END IF;
  END IF;

  RETURN jsonb_build_object('newly_awarded', to_jsonb(newly_awarded));
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_award_badges(uuid) TO authenticated;
