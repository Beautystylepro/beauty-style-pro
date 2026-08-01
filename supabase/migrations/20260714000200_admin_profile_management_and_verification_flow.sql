-- BUG: AdminPage tries to verify/suspend/reject users by updating
-- profiles.verification_status directly, but no admin UPDATE policy on
-- profiles ever existed — only the self-service policy, which itself
-- blocks changing verification_status. Result: admin moderation actions
-- always failed silently, and users could never mark their own
-- verification submission as "submitted" either.

CREATE POLICY "Admins can update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Narrow, safe self-service path: a user may move their OWN verification
-- status from unset/pending to "submitted" (uploading documents), but
-- never directly to "verified" (that stays admin-only via the policy
-- above). Kept as a SECURITY DEFINER RPC rather than loosening the
-- blanket self-update policy, so there's no broader hole to misuse.
CREATE OR REPLACE FUNCTION public.submit_verification_request()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET verification_status = 'submitted'
  WHERE user_id = auth.uid()
    AND (verification_status IS NULL OR verification_status IN ('pending', 'rejected'));
END;
$$;

REVOKE ALL ON FUNCTION public.submit_verification_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification_request() TO authenticated;
