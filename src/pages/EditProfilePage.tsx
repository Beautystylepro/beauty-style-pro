import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Camera, MapPin, Navigation, User, Scissors, Building2, Lock, ChevronDown, Eye, EyeOff, Bell } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import stylist2 from "@/assets/stylist-2.jpg";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";

const CITIES = ["Milano", "Roma", "Napoli", "Torino", "Firenze", "Bologna", "Palermo", "Genova", "Bari", "Catania"];
const SPECIALTIES = ["Hairstylist", "Colorist", "Barber", "Estetista", "Nail Artist", "Makeup Artist", "Massaggiatore"];

export default function EditProfilePage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("focus") === "avatar") {
      const t = setTimeout(() => fileInputRef.current?.click(), 300);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("focus");
        return next;
      }, { replace: true });
      return () => clearTimeout(t);
    }
  }, [searchParams, setSearchParams]);

  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [city, setCity] = useState(profile?.city || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [userType, setUserType] = useState(profile?.user_type || "client");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url || null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [skills, setSkills] = useState<string[]>(profile?.skills || []);
  const [desiredCategories, setDesiredCategories] = useState<string[]>(profile?.desired_categories || []);
  const [locating, setLocating] = useState(false);
  const [iban, setIban] = useState(profile?.iban || "");
  const [bankHolderName, setBankHolderName] = useState(profile?.bank_holder_name || "");
  const [enableWithdrawals, setEnableWithdrawals] = useState(!!(profile?.iban));
  const [isPublicProfile, setIsPublicProfile] = useState(true);
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp || "");
  const [showWhatsapp, setShowWhatsapp] = useState(!!profile?.show_whatsapp);
  const [showPhone, setShowPhone] = useState(!!profile?.show_phone);
  const [showLocation, setShowLocation] = useState(!!profile?.show_location);
  const [showCv, setShowCv] = useState(!!profile?.show_cv);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleDetectLocation = async () => {
    setLocating(true);
    if (!('geolocation' in navigator)) {
      setLocating(false);
      return;
    }
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const cityCoords: Record<string, [number, number]> = {
        Milano: [45.4642, 9.19], Roma: [41.9028, 12.4964], Napoli: [40.8518, 14.2681],
        Torino: [45.0703, 7.6869], Firenze: [43.7696, 11.2558], Bologna: [44.4949, 11.3426],
        Palermo: [38.1157, 13.3615], Genova: [44.4056, 8.9463], Bari: [41.1171, 16.8719],
        Catania: [37.5079, 15.09],
      };
      let closest = "Milano";
      let minDist = Infinity;
      for (const [name, [clat, clng]] of Object.entries(cityCoords)) {
        const d = Math.sqrt((lat - clat) ** 2 + (lng - clng) ** 2);
        if (d < minDist) { minDist = d; closest = name; }
      }
      setCity(closest);
      if (user) {
        await supabase.from("profiles").update({
          availability: {
            ...(profile?.availability as any || {}),
            latitude: lat, longitude: lng, share_location: true,
          },
        }).eq("user_id", user.id);
      }
      toast.success(`Posizione rilevata: ${closest}`);
    } catch {
      toast.error("Impossibile rilevare la posizione");
    } finally {
      setLocating(false);
    }
  };

  const toggleSkill = (skill: string) => {
    setSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  };

  const toggleCategory = (cat: string) => {
    setDesiredCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    let avatarUrl = profile?.avatar_url;
    if (avatarFile) {
      const fileExt = avatarFile.name.split(".").pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, avatarFile, { upsert: true });
      if (!uploadError) {
        const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
        avatarUrl = data.publicUrl;
      }
    }
    const { error } = await supabase.from("profiles").update({
      display_name: displayName, bio, city, phone,
      user_type: userType, avatar_url: avatarUrl, skills,
      desired_categories: desiredCategories,
      whatsapp,
      show_whatsapp: showWhatsapp,
      show_phone: showPhone,
      show_location: showLocation,
      show_cv: showCv,
    }).eq("user_id", user.id);

    // Save IBAN to profiles_private
    const ibanData = {
      iban: enableWithdrawals ? (iban || null) : null,
      bank_holder_name: enableWithdrawals ? (bankHolderName || null) : null,
    };
    const { data: existingPrivate } = await supabase.from("profiles_private").select("id").eq("user_id", user.id).maybeSingle();
    if (existingPrivate) {
      await supabase.from("profiles_private").update(ibanData).eq("user_id", user.id);
    } else if (enableWithdrawals && iban) {
      await supabase.from("profiles_private").insert({ user_id: user.id, ...ibanData });
    }
    if (error) {
      toast.error("Errore nel salvataggio");
    } else {
      await refreshProfile();
      toast.success("Profilo aggiornato!");
      navigate("/profile");
    }
    setLoading(false);
  };

  if (!user) { navigate("/auth"); return null; }

  const userTypeLabel = userType === "professional" ? "Professionista" : userType === "business" ? "Business" : "Cliente";

  return (
    <MobileLayout>
      {/* Header */}
      <header className="sticky top-0 z-40 glass px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-display font-bold">Modifica profilo</h1>
        </div>
        <button onClick={handleSave} disabled={loading}
          className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 transition-all active:scale-95">
          {loading ? "..." : "Salva"}
        </button>
      </header>

      <div className="px-5 py-6 space-y-7 pb-32">
        {/* Identity Card */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden ring-3 ring-primary/30 ring-offset-2 ring-offset-background">
              <img src={avatarPreview || stylist2} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <button onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center border-2 border-background shadow-lg active:scale-90 transition-transform">
              <Camera className="w-4 h-4 text-primary-foreground" />
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
          <div className="text-center">
            <p className="font-semibold text-foreground">{displayName || "Il tuo nome"}</p>
            <p className="text-xs text-muted-foreground">@{user.email?.split("@")[0] || "username"}</p>
            <span className="inline-flex items-center gap-1 mt-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
              {userType === "professional" ? <Scissors className="w-3 h-3" /> : userType === "business" ? <Building2 className="w-3 h-3" /> : <User className="w-3 h-3" />}
              {userTypeLabel}
            </span>
          </div>
        </div>

        {/* Tipo Account */}
        <Section title="Tipo account">
          <div className="flex gap-1.5">
            {[
              { key: "client", label: "Cliente", Icon: User },
              { key: "professional", label: "Pro", Icon: Scissors },
              { key: "business", label: "Business", Icon: Building2 },
            ].map(t => (
              <button key={t.key} onClick={() => setUserType(t.key)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  userType === t.key ? "bg-primary text-primary-foreground shadow-md" : "bg-card border border-border/50 text-muted-foreground"
                }`}>
                <t.Icon className="w-4 h-4 inline mr-1" /> {t.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Informazioni profilo */}
        <Section title="Informazioni profilo">
          <div className="space-y-4">
            <FieldWithHint hint="Presentati agli altri utenti">
              <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Racconta di te..." rows={3}
                className="w-full rounded-xl bg-card border border-border/50 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </FieldWithHint>

            <FieldWithHint hint="Visibile ai clienti per contattarti">
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefono" type="tel"
                className="w-full h-11 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </FieldWithHint>

            <FieldWithHint hint="Numero WhatsApp (opzionale)">
              <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="WhatsApp" type="tel"
                className="w-full h-11 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </FieldWithHint>

            <FieldWithHint hint="Non modificabile">
              <div className="relative">
                <input value={user.email || ""} disabled
                  className="w-full h-11 rounded-xl bg-muted/50 border border-border/30 px-4 pr-10 text-sm text-muted-foreground cursor-not-allowed" />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              </div>
            </FieldWithHint>
          </div>
        </Section>

        {/* Posizione */}
        <Section title="Posizione">
          <FieldWithHint hint="La città serve per trovare servizi vicino a te">
            <div className="flex gap-2">
              <select value={city} onChange={e => setCity(e.target.value)}
                className="flex-1 h-11 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 appearance-none">
                <option value="">Seleziona città</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={handleDetectLocation} disabled={locating}
                className="h-11 px-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50">
                <MapPin className="w-4 h-4" />
                {locating ? "..." : "Usa posizione"}
              </button>
            </div>
          </FieldWithHint>
        </Section>

        {/* Skills / Preferences */}
        {userType === "professional" && (
          <Section title="Specialità">
            <div className="flex flex-wrap gap-1.5">
              {SPECIALTIES.map(s => (
                <button key={s} onClick={() => toggleSkill(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                    skills.includes(s) ? "bg-primary text-primary-foreground" : "bg-card border border-border/50 text-muted-foreground"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </Section>
        )}

        {userType === "client" && (
          <Section title="Interessi">
            <div className="flex flex-wrap gap-1.5">
              {SPECIALTIES.map(s => (
                <button key={s} onClick={() => toggleCategory(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                    desiredCategories.includes(s) ? "bg-primary text-primary-foreground" : "bg-card border border-border/50 text-muted-foreground"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Wallet - collapsible, solo per pro/business */}
        {(userType === "professional" || userType === "business") && (
          <Collapsible>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between py-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1">Wallet e pagamenti</p>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
                  <div>
                    <p className="text-sm font-medium">Abilita prelievi</p>
                    <p className="text-[11px] text-muted-foreground">Ricevi pagamenti sul tuo conto</p>
                  </div>
                  <Switch checked={enableWithdrawals} onCheckedChange={setEnableWithdrawals} />
                </div>

                {enableWithdrawals && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <input value={bankHolderName} onChange={e => setBankHolderName(e.target.value)} placeholder="Intestatario conto"
                      className="w-full h-11 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
                    <FieldWithHint hint="Usato solo per ricevere pagamenti">
                      <input value={iban} onChange={e => setIban(e.target.value.toUpperCase())} placeholder="IBAN (es. IT60X0542811101000000123456)"
                        className="w-full h-11 rounded-xl bg-card border border-border/50 px-4 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/30" maxLength={34} />
                    </FieldWithHint>
                    {iban && (
                      <p className={`text-[11px] px-1 ${iban.length >= 15 ? "text-green-500" : "text-yellow-500"}`}>
                        {iban.length >= 15 ? "✓ IBAN inserito" : "IBAN troppo corto"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Impostazioni account */}
        <Section title="Impostazioni account">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
              <div className="flex items-center gap-2">
                {isPublicProfile ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium">Profilo pubblico</p>
                  <p className="text-[11px] text-muted-foreground">Visibile a tutti gli utenti</p>
                </div>
              </div>
              <Switch checked={isPublicProfile} onCheckedChange={setIsPublicProfile} />
            </div>
          </div>
        </Section>

        {/* Privacy contatti */}
        <Section title="Privacy contatti">
          <p className="text-[11px] text-muted-foreground/80 mb-2 px-1">
            Scegli quali dati mostrare agli altri utenti. I dati che disattivi restano privati.
          </p>
          <div className="space-y-2">
            <PrivacyRow label="Mostra WhatsApp" hint="Altri utenti possono aprirti WhatsApp" checked={showWhatsapp} onChange={setShowWhatsapp} />
            <PrivacyRow label="Mostra telefono" hint="Numero visibile su profilo e prenotazioni" checked={showPhone} onChange={setShowPhone} />
            <PrivacyRow label="Mostra posizione GPS" hint="Appari sulla mappa con distanza esatta" checked={showLocation} onChange={setShowLocation} />
            <PrivacyRow label="Mostra CV / portfolio" hint="Link CV visibile a professionisti/HR" checked={showCv} onChange={setShowCv} />
          </div>
        </Section>
      </div>
    </MobileLayout>
  );
}

function PrivacyRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2.5 px-1">{title}</p>
      {children}
    </section>
  );
}

function FieldWithHint({ hint, children }: { hint: string; children: React.ReactNode }) {
  return (
    <div>
      {children}
      <p className="text-[11px] text-muted-foreground/70 mt-1 px-1">{hint}</p>
    </div>
  );
}
