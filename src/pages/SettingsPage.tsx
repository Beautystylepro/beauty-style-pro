import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, User, Lock, Bell, Mail, Moon, Sun, Globe, HelpCircle, FileText, Shield, LogOut, MapPin, Navigation, Ruler, ChevronRight, Palette } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useColorTheme, type ColorTheme } from "@/hooks/useColorTheme";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { theme, setTheme, toggleTheme } = useTheme();
  const { colorTheme, setColorTheme } = useColorTheme();
  const [pushNotif, setPushNotif] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);
  const [shareLocation, setShareLocation] = useState(false);
  const [searchDistance, setSearchDistance] = useState(25);
  const [locating, setLocating] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (profile?.availability) {
      const prefs = profile.availability as any;
      if (prefs.share_location) setShareLocation(prefs.share_location);
      if (prefs.search_distance) setSearchDistance(prefs.search_distance);
      if (prefs.latitude && prefs.longitude) setCurrentCoords({ lat: prefs.latitude, lng: prefs.longitude });
    }
  }, [profile]);

  const handleLogout = async () => {
    await signOut();
    toast.success("Disconnesso");
    navigate("/auth");
  };

  const handleShareLocation = async () => {
    if (!user) return;
    if (!shareLocation) {
      setLocating(true);
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
        });
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentCoords(coords);
        setShareLocation(true);

        await supabase.from("profiles").update({
          availability: {
            ...(profile?.availability as any || {}),
            share_location: true,
            latitude: coords.lat,
            longitude: coords.lng,
            search_distance: searchDistance,
          },
        }).eq("user_id", user.id);

        await refreshProfile();
        toast.success("Posizione condivisa!");
      } catch {
        toast.error("Impossibile ottenere la posizione. Controlla i permessi.");
      } finally {
        setLocating(false);
      }
    } else {
      setShareLocation(false);
      setCurrentCoords(null);
      await supabase.from("profiles").update({
        availability: {
          ...(profile?.availability as any || {}),
          share_location: false,
          latitude: null,
          longitude: null,
        },
      }).eq("user_id", user.id);
      await refreshProfile();
      toast.success("Posizione disattivata");
    }
  };

  const handleDistanceChange = async (val: number) => {
    setSearchDistance(val);
    if (!user) return;
    await supabase.from("profiles").update({
      availability: {
        ...(profile?.availability as any || {}),
        search_distance: val,
      },
    }).eq("user_id", user.id);
  };

  const Toggle = ({ value, onChange, loading: l }: { value: boolean; onChange: () => void; loading?: boolean }) => (
    <button
      onClick={onChange}
      disabled={l}
      className={`w-11 h-6 rounded-full transition-all duration-200 relative ${value ? "bg-primary" : "bg-muted"} ${l ? "opacity-50" : ""}`}
    >
      <div className={`w-5 h-5 rounded-full bg-primary-foreground absolute top-0.5 transition-all duration-200 ${value ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );

  const SettingRow = ({ icon: Icon, label, children, onClick }: { icon: any; label: string; children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50 text-left">
      <Icon className="w-4 h-4 text-primary" />
      <span className="flex-1 text-sm">{label}</span>
      {children || <ChevronRight className="w-4 h-4 text-primary/50" />}
    </button>
  );

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-5 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors">
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h1 className="text-lg font-display font-bold">Impostazioni</h1>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Account */}
        <section>
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 px-1">Account</p>
          <div className="space-y-1.5">
            <SettingRow icon={User} label="Modifica Profilo" onClick={() => navigate("/profile/edit")} />
            <SettingRow icon={Lock} label="Cambia Password" />
          </div>
        </section>

        {/* Location & Search */}
        <section>
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 px-1">Posizione & Ricerca</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50">
              <Navigation className="w-4 h-4 text-primary" />
              <div className="flex-1">
                <span className="text-sm">Condividi posizione</span>
                {currentCoords && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currentCoords.lat.toFixed(4)}, {currentCoords.lng.toFixed(4)}
                  </p>
                )}
              </div>
              <Toggle value={shareLocation} onChange={handleShareLocation} loading={locating} />
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border/50">
              <div className="flex items-center gap-3 mb-3">
                <Ruler className="w-4 h-4 text-primary" />
                <span className="flex-1 text-sm">Distanza di ricerca</span>
                <span className="text-xs font-bold text-primary">{searchDistance} km</span>
              </div>
              <input
                type="range"
                min={5}
                max={200}
                step={5}
                value={searchDistance}
                onChange={(e) => handleDistanceChange(Number(e.target.value))}
                className="w-full accent-primary h-1"
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">5 km</span>
                <span className="text-xs text-muted-foreground">200 km</span>
              </div>
            </div>

            <SettingRow icon={MapPin} label={`Città: ${profile?.city || 'Non impostata'}`} onClick={() => navigate("/profile/edit")} />
          </div>
        </section>

        {/* Notifications */}
        <section>
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 px-1">Notifiche</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50">
              <Bell className="w-4 h-4 text-primary" />
              <span className="flex-1 text-sm">Push Notifications</span>
              <Toggle value={pushNotif} onChange={() => setPushNotif(!pushNotif)} />
            </div>
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50">
              <Mail className="w-4 h-4 text-primary" />
              <span className="flex-1 text-sm">Email Notifications</span>
              <Toggle value={emailNotif} onChange={() => setEmailNotif(!emailNotif)} />
            </div>
            <SettingRow icon={Bell} label="Segreteria AI Stella (chiamate)" onClick={() => navigate("/call-auto-answer")} />
            <SettingRow icon={Bell} label="Segreteria AI Stella (chat)" onClick={() => navigate("/chat-secretary")} />
          </div>
        </section>

        {/* Preferences */}
        <section>
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 px-1">Preferenze</p>
          <div className="space-y-1.5">
            {/* Theme Picker */}
            <div className="p-4 rounded-2xl bg-card border border-border/50">
              <div className="flex items-center gap-2 mb-3">
                {theme === "dark" ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-primary" />}
                <span className="text-sm font-medium">Tema Sfondo</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Dark card */}
                <button
                  onClick={() => setTheme("dark")}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 ${
                    theme === "dark"
                      ? "border-primary shadow-[0_0_12px_hsl(var(--primary)/0.35)]"
                      : "border-border/40 opacity-70 hover:opacity-100"
                  }`}
                >
                  {/* Preview */}
                  <div className="w-full h-14 rounded-lg bg-[#0a0a0b] flex flex-col gap-1 p-2 overflow-hidden">
                    <div className="h-1.5 w-10 rounded bg-[#d946ef] opacity-90" />
                    <div className="h-1 w-16 rounded bg-gray-700" />
                    <div className="h-1 w-12 rounded bg-gray-700" />
                    <div className="flex gap-1 mt-1">
                      <div className="h-5 w-5 rounded bg-gray-800" />
                      <div className="h-5 w-5 rounded bg-gray-800" />
                    </div>
                  </div>
                  <span className="text-xs font-semibold">⬛ Scuro</span>
                  {theme === "dark" && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.2 5.7L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </div>
                  )}
                </button>

                {/* Light card */}
                <button
                  onClick={() => setTheme("light")}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 ${
                    theme === "light"
                      ? "border-primary shadow-[0_0_12px_hsl(var(--primary)/0.35)]"
                      : "border-border/40 opacity-70 hover:opacity-100"
                  }`}
                >
                  {/* Preview */}
                  <div className="w-full h-14 rounded-lg bg-[#f8f8f8] flex flex-col gap-1 p-2 overflow-hidden border border-gray-200">
                    <div className="h-1.5 w-10 rounded bg-[#d946ef] opacity-90" />
                    <div className="h-1 w-16 rounded bg-gray-300" />
                    <div className="h-1 w-12 rounded bg-gray-300" />
                    <div className="flex gap-1 mt-1">
                      <div className="h-5 w-5 rounded bg-gray-200" />
                      <div className="h-5 w-5 rounded bg-gray-200" />
                    </div>
                  </div>
                  <span className="text-xs font-semibold">⬜ Chiaro</span>
                  {theme === "light" && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.2 5.7L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </div>
                  )}
                </button>
              </div>
            </div>
            {/* Color Theme Picker */}
            <div className="p-4 rounded-2xl bg-card border border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Palette className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Tema Colori</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Female / Viola */}
                <button
                  onClick={() => setColorTheme("female")}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 ${
                    colorTheme === "female"
                      ? "border-primary shadow-[0_0_12px_hsl(262_80%_62%/0.4)]"
                      : "border-border/40 opacity-70 hover:opacity-100"
                  }`}
                >
                  <div className="w-full h-10 rounded-lg flex gap-1.5 items-center justify-center"
                    style={{ background: "linear-gradient(135deg, hsl(271 82% 36%), hsl(285 75% 52%), hsl(258 78% 44%))" }}>
                    <div className="h-5 w-5 rounded-full bg-white/20" />
                    <div className="h-5 w-5 rounded-full bg-white/30" />
                    <div className="h-5 w-5 rounded-full bg-white/15" />
                  </div>
                  <span className="text-xs font-semibold">💜 Viola Luxury</span>
                  {colorTheme === "female" && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "hsl(271 78% 42%)" }}>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.2 5.7L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </div>
                  )}
                </button>

                {/* Male / Verde Petrolio */}
                <button
                  onClick={() => setColorTheme("male")}
                  className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 ${
                    colorTheme === "male"
                      ? "border-primary shadow-[0_0_12px_hsl(170_100%_20%/0.4)]"
                      : "border-border/40 opacity-70 hover:opacity-100"
                  }`}
                >
                  <div className="w-full h-10 rounded-lg flex gap-1.5 items-center justify-center"
                    style={{ background: "linear-gradient(135deg, hsl(38 80% 38%), hsl(48 96% 58%), hsl(43 90% 46%))" }}>
                    <div className="h-5 w-5 rounded-full bg-white/20" />
                    <div className="h-5 w-5 rounded-full bg-white/30" />
                    <div className="h-5 w-5 rounded-full bg-white/15" />
                  </div>
                  <span className="text-xs font-semibold">🏆 Oro Lingotto</span>
                  {colorTheme === "male" && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "hsl(45 88% 45%)" }}>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.2 5.7L6.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50">
              <Globe className="w-4 h-4 text-primary" />
              <span className="flex-1 text-sm">Lingua</span>
              <span className="text-xs text-primary mr-1">Italiano</span>
            </div>
          </div>
        </section>

        {/* Support */}
        <section>
          <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3 px-1">Supporto</p>
          <div className="space-y-1.5">
            <SettingRow icon={Shield} label="Verifica Account" onClick={() => navigate("/verify-account")} />
            <SettingRow icon={HelpCircle} label="Centro Assistenza" />
            <SettingRow icon={FileText} label="Termini e Condizioni" onClick={() => navigate("/terms")} />
            <SettingRow icon={Shield} label="Privacy Policy" onClick={() => navigate("/privacy")} />
          </div>
        </section>

        {/* Logout */}
        <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/5 transition-colors">
          <LogOut className="w-4 h-4" />
          Logout
        </button>

        <p className="text-center text-xs text-muted-foreground pb-4">STYLE v1.0.0</p>
      </div>
    </MobileLayout>
  );
}
