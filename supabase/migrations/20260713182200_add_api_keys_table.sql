-- EnterpriseAPIPage previously used hardcoded MOCK_KEYS with zero persistence:
-- "generating" or "deleting" a key only mutated local React state and reverted
-- on every page refresh. This table makes it real.

CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL, -- e.g. "sk_live_abc1" — safe to display, full key shown once at creation
  key_hash TEXT NOT NULL,   -- sha256 hash of the full secret; the raw key is never stored
  active BOOLEAN NOT NULL DEFAULT TRUE,
  calls_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API keys"
  ON public.api_keys FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can create their own API keys"
  ON public.api_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own API keys"
  ON public.api_keys FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own API keys"
  ON public.api_keys FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE INDEX idx_api_keys_owner ON public.api_keys(owner_id);
