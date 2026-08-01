-- platform_settings currently only has a public SELECT policy.
-- Without an INSERT/UPDATE policy, RLS silently blocks all writes
-- (e.g. the "Salva Impostazioni Globali" button in GlobalSettingsPage
-- and any other admin-configurable platform setting).
-- Only admins should be able to change platform-wide settings.

CREATE POLICY "Admins can insert platform settings"
  ON public.platform_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update platform settings"
  ON public.platform_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
