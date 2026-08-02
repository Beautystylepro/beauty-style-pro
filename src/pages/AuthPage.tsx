import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Mail, Lock, User, Scissors, Building2, MapPin, Phone, Camera, ChevronRight, ChevronLeft, Globe, Calendar, Briefcase, Upload, Loader2, CheckCircle, Instagram, AtSign, Banknote } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import { languageFromCountry } from "@/lib/languageFromCountry";

// ─── Types ───────────────────────────────────────────────
type AccountType = "client" | "professional" | "business";
type RegistrationResult = { success: boolean; email?: string; accountType?: AccountType } | null;

const CATEGORIES_PRO = [
  "Hairstylist", "Colorist", "Barber", "Estetista", "Nail Artist",
  "Makeup Artist", "Tattoo Artist", "Photographer", "Creator",
];

const CATEGORIES_BIZ = [
  "Salone", "Brand", "Accademia", "Shop", "Agenzia",
];

// ─── Component ───────────────────────────────────────────
export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [step, setStep] = useState(0); // 0=type select, 1+=form steps
  const [registrationResult, setRegistrationResult] = useState<RegistrationResult>(null);
  const navigate = useNavigate();
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next") ?? "";
  // Only allow same-origin relative paths to prevent open redirect.
  const nextPath = /^\/(?!\/)/.test(rawNext) ? rawNext : "/";

  // Phone OTP login state
  const [loginMode, setLoginMode] = useState<"email" | "phone">("email");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Client fields
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Italia");
  const [birthDate, setBirthDate] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [facebook, setFacebook] = useState("");

  // Professional fields
  const [whatsapp, setWhatsapp] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  // Business fields
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [address, setAddress] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [website, setWebsite] = useState("");
  const [bizCategory, setBizCategory] = useState("");

  // IBAN fields
  const [iban, setIban] = useState("");
  const [bankHolder, setBankHolder] = useState("");

  // Location
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) navigate(nextPath);
  }, [user, authLoading, navigate, nextPath]);

  // ─── GPS ─────────────────────────────────────────────
  const requestLocation = async () => {
    setLocating(true);
    if (!('geolocation' in navigator)) {
      setLocating(false);
      return;
    }
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      );
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);

      // Reverse geocode approximation
      const cityCoords: Record<string, [number, number]> = {
        Milano: [45.4642, 9.19], Roma: [41.9028, 12.4964], Napoli: [40.8518, 14.2681],
        Torino: [45.0703, 7.6869], Firenze: [43.7696, 11.2558], Bologna: [44.4949, 11.3426],
        Palermo: [38.1157, 13.3615], Genova: [44.4056, 8.9463], Bari: [41.1171, 16.8719], Catania: [37.5079, 15.09],
      };
      let closest = "Milano";
      let minDist = Infinity;
      for (const [n, [clat, clng]] of Object.entries(cityCoords)) {
        const d = Math.sqrt((pos.coords.latitude - clat) ** 2 + (pos.coords.longitude - clng) ** 2);
        if (d < minDist) { minDist = d; closest = n; }
      }
      if (!city) setCity(closest);
      toast.success(`Posizione rilevata: ${closest}`);
    } catch {
      toast.error("Impossibile ottenere la posizione");
    }
    setLocating(false);
  };

  // ─── Login ───────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) toast.error(error.message);
    else { toast.success("Benvenuto!"); }
    setLoading(false);
  };

  // ─── Phone OTP Login ──────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) { toast.error("Inserisci il numero di telefono"); return; }
    setLoading(true);
    const normalized = phoneNumber.startsWith("+") ? phoneNumber : `+39${phoneNumber}`;
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    if (error) { toast.error(error.message); }
    else { setOtpSent(true); toast.success("Codice OTP inviato via SMS!"); }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) { toast.error("Inserisci il codice OTP"); return; }
    setLoading(true);
    const normalized = phoneNumber.startsWith("+") ? phoneNumber : `+39${phoneNumber}`;
    const { error } = await supabase.auth.verifyOtp({ phone: normalized, token: otpCode, type: "sms" });
    if (error) { toast.error(error.message); }
    else { toast.success("Accesso effettuato!"); navigate(nextPath); }
    setLoading(false);
  };

  // ─── Signup ──────────────────────────────────────────
  const handleSignup = async () => {
    if (!accountType) return;
    setLoading(true);

    const displayName = accountType === "business" ? ownerName : `${name} ${surname}`.trim();
    if (!displayName) { toast.error("Inserisci il tuo nome"); setLoading(false); return; }
    if (!email || !password) { toast.error("Email e password obbligatorie"); setLoading(false); return; }

    const colorTheme = gender === "male" ? "male" : "female";

    // Build extra metadata with all registration fields
    const extraMeta: Record<string, any> = {
      phone: phone || undefined,
      city: city || undefined,
      country: country || "Italia",
      preferred_language: languageFromCountry(country || "Italia"),
      bio: bio || undefined,
      surname: surname || undefined,
      username: username || undefined,
      whatsapp: whatsapp || undefined,
      instagram: instagram || undefined,
      tiktok: tiktok || undefined,
      facebook: facebook || undefined,
      latitude: latitude || undefined,
      longitude: longitude || undefined,
    };

    if (accountType === "client" && interests.length > 0) {
      extraMeta.interests = interests;
    }
    if (accountType === "professional") {
      extraMeta.category = category || undefined;
      extraMeta.description = description || undefined;
      extraMeta.price_min = priceMin || undefined;
      extraMeta.price_max = priceMax || undefined;
    }
    if (accountType === "business") {
      extraMeta.company_name = companyName || undefined;
      extraMeta.vat_number = vatNumber || undefined;
      extraMeta.tax_code = taxCode || undefined;
      extraMeta.address = address || undefined;
      extraMeta.zip_code = zipCode || undefined;
      extraMeta.website = website || undefined;
      extraMeta.biz_category = bizCategory || undefined;
      extraMeta.description = description || undefined;
    }

    // Clean undefined values
    Object.keys(extraMeta).forEach(k => extraMeta[k] === undefined && delete extraMeta[k]);

    const { error, needsEmailVerification } = await signUp(email, password, displayName, accountType, gender || undefined, colorTheme, extraMeta);
    
    if (error) { 
      // Handle duplicate email gracefully
      if (error.message?.includes("already registered") || error.message?.includes("already been registered")) {
        toast.error("Questa email è già registrata. Prova ad accedere.");
      } else {
        toast.error(error.message); 
      }
      setLoading(false); 
      return; 
    }

    if (needsEmailVerification) {
      toast.success("Controlla la tua email per confermare l'account");
      setRegistrationResult({ success: true, email, accountType });
      setLoading(false);
      return;
    }

    toast.success("Account creato con successo! Benvenuto su STYLE 🎉");
    
    // Save IBAN to profiles_private if provided (for professionals)
    if ((accountType === "professional") && (iban || bankHolder)) {
      try {
        const { data: { user: newUser } } = await supabase.auth.getUser();
        if (newUser) {
          await supabase.from("profiles_private").upsert({
            user_id: newUser.id,
            iban: iban || null,
            bank_holder_name: bankHolder || null,
          });
        }
      } catch { /* non-critical */ }
    }

    navigate("/");
    setLoading(false);
  };

  // ─── Step logic per account type ─────────────────────
  const totalSteps = accountType === "client" ? 3 : accountType === "professional" ? 4 : accountType === "business" ? 3 : 0;

  const canProceed = () => {
    if (step === 0) return !!accountType;
    if (step === 1) {
      if (accountType === "client") return !!name && !!email && !!password && !!phone && !!birthDate && !!gender;
      if (accountType === "professional") return !!name && !!email && !!password && !!phone;
      if (accountType === "business") return !!companyName && !!ownerName && !!email && !!password && !!vatNumber;
    }
    if (step === 2 && accountType === "client") return !!city;
    return true;
  };

  const handleNext = () => {
    if (step < totalSteps) setStep(step + 1);
    else handleSignup();
  };

  // ─── RENDER: EMAIL VERIFICATION SUCCESS ──────────────
  if (registrationResult?.success) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-lg mx-auto">
        <div className="w-full">
          <div className="flex flex-col items-center mb-10">
            <img src={logo} alt="STYLE" className="w-16 h-16 mb-3" />
            <h1 className="text-2xl font-display font-bold tracking-tight">STYLE</h1>
            <p className="text-xs text-muted-foreground mt-1">La piattaforma beauty</p>
          </div>

          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-10 h-10 text-primary" />
            </div>
            
            <div>
              <h2 className="text-xl font-display font-bold mb-2">Verifica la tua email</h2>
              <p className="text-sm text-muted-foreground mb-1">
                Ti abbiamo inviato un link di conferma a:
              </p>
              <p className="text-sm font-semibold">{registrationResult.email}</p>
            </div>

            <div className="bg-muted/50 rounded-2xl p-4 text-left">
              <p className="text-xs text-muted-foreground">
                <strong>Importante:</strong> Controlla anche lo spam. Il link è valido per 24h.
                {registrationResult.accountType !== "client" && (
                  <span> Dopo la verifica email potrai completare l'onboarding con verifica telefonica e documenti.</span>
                )}
              </p>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => setRegistrationResult(null)} 
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
              >
                Torna al Login
              </button>
              
              <button 
                onClick={() => {
                  // Trigger email resend
                  supabase.auth.resend({ 
                    type: 'signup', 
                    email: registrationResult.email! 
                  }).then(() => toast.success("Email di verifica rinviata"));
                }}
                className="w-full h-10 rounded-xl bg-muted text-foreground font-medium text-sm"
              >
                Rinvia Email
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8">
            Non hai ricevuto l'email? Controlla lo spam o clicca "Rinvia Email"
          </p>
        </div>
      </div>
    );
  }

  // ─── RENDER: LOGIN ──────────────────────────────────
  if (isLogin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-lg mx-auto">
        <div className="w-full">
          <div className="flex flex-col items-center mb-10">
            <img src={logo} alt="STYLE" className="w-16 h-16 mb-3" />
            <h1 className="text-2xl font-display font-bold tracking-tight">STYLE</h1>
            <p className="text-xs text-muted-foreground mt-1">La piattaforma beauty</p>
          </div>

          <div className="flex gap-1 mb-6 bg-muted rounded-xl p-1">
            <button onClick={() => setIsLogin(true)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-card text-foreground shadow-sm">Accedi</button>
            <button onClick={() => { setIsLogin(false); setStep(0); }} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground">Registrati</button>
          </div>

          {/* Email / Phone login tabs */}
          <div className="flex gap-1 mb-4 bg-muted rounded-xl p-1">
            <button onClick={() => { setLoginMode("email"); setOtpSent(false); }} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${loginMode === "email" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Email</button>
            <button onClick={() => { setLoginMode("phone"); setOtpSent(false); }} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${loginMode === "phone" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              <Phone className="w-3 h-3 inline mr-1" />Telefono
            </button>
          </div>

          {loginMode === "email" ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full h-12 rounded-xl bg-card border border-border/50 pl-11 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type={showPassword ? "text" : "password"} placeholder="Password" value={password}
                  onChange={e => setPassword(e.target.value)} required minLength={6}
                  className="w-full h-12 rounded-xl bg-card border border-border/50 pl-11 pr-11 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
              <button type="submit" disabled={loading}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
                {loading ? "Caricamento..." : "Accedi"}
              </button>
            </form>
          ) : !otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="tel" placeholder="+39 333 123 4567" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} required
                  className="w-full h-12 rounded-xl bg-card border border-border/50 pl-11 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
                {loading ? "Invio OTP..." : "Invia codice SMS"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <p className="text-xs text-muted-foreground text-center">Codice OTP inviato a <strong>{phoneNumber}</strong></p>
              <div className="relative">
                <input type="text" inputMode="numeric" maxLength={6} placeholder="Codice OTP (6 cifre)" value={otpCode} onChange={e => setOtpCode(e.target.value)} required
                  className="w-full h-12 rounded-xl bg-card border border-border/50 px-4 text-sm text-center tracking-widest focus:outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
                {loading ? "Verifica..." : "Verifica e accedi"}
              </button>
              <button type="button" onClick={() => setOtpSent(false)} className="w-full text-center text-xs text-primary font-medium">
                Modifica numero
              </button>
            </form>
          )}
          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">oppure</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={async () => {
              setLoading(true);
              const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: window.location.origin + nextPath },
              });
              if (error) {
                toast.error("Errore con Google: " + error.message);
                setLoading(false);
                return;
              }
              // On success Supabase redirects the browser to Google — no
              // further code here runs until the user comes back.
            }}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-card border border-border/50 text-foreground font-semibold text-sm flex items-center justify-center gap-3 hover:bg-muted transition-colors disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/></svg>
            Continua con Google
          </button>

          <button
            type="button"
            onClick={async () => {
              if (!email.trim()) { toast.error("Inserisci la tua email per recuperare la password"); return; }
              setLoading(true);
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              if (error) toast.error(error.message);
              else toast.success("Ti abbiamo inviato un'email per reimpostare la password");
              setLoading(false);
            }}
            className="w-full text-center mt-4 text-xs text-primary font-medium"
          >
            Password dimenticata?
          </button>
          <p className="text-center text-xs text-muted-foreground mt-8">
            Continuando accetti i <span className="text-primary">Termini</span> e la <span className="text-primary">Privacy Policy</span>
          </p>
        </div>
      </div>
    );
  }

  // ─── RENDER: REGISTRATION ───────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col px-6 max-w-lg mx-auto py-8">
      {/* Header */}
      <div className="flex flex-col items-center mb-6">
        <img src={logo} alt="STYLE" className="w-12 h-12 mb-2" />
        <h1 className="text-xl font-display font-bold tracking-tight">Crea il tuo account</h1>
      </div>

      {/* Tab switch */}
      <div className="flex gap-1 mb-6 bg-muted rounded-xl p-1">
        <button onClick={() => setIsLogin(true)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground">Accedi</button>
        <button className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-card text-foreground shadow-sm">Registrati</button>
      </div>

      {/* Progress bar */}
      {step > 0 && totalSteps > 0 && (
        <div className="flex gap-1.5 mb-6">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i < step ? "bg-primary" : i === step ? "bg-primary/50" : "bg-muted"}`} />
          ))}
        </div>
      )}

      {/* STEP 0: Choose account type */}
      {step === 0 && (
        <div className="space-y-4 fade-in">
          <p className="text-sm text-muted-foreground text-center mb-2">Scegli il tipo di account</p>
          {([
            { key: "client" as AccountType, label: "Cliente", desc: "Scopri, prenota e socializza", Icon: User, color: "from-blue-500 to-cyan-500" },
            { key: "professional" as AccountType, label: "Professionista", desc: "Offri servizi, ricevi prenotazioni", Icon: Scissors, color: "from-purple-500 to-pink-500" },
            { key: "business" as AccountType, label: "Business", desc: "Gestisci salone o attività", Icon: Building2, color: "from-amber-500 to-orange-500" },
          ]).map(t => (
            <button key={t.key} onClick={() => { setAccountType(t.key); setStep(1); }}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 ${
                accountType === t.key ? "border-primary bg-primary/5" : "border-border/50 bg-card hover:border-primary/30"
              }`}>
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center`}>
                <t.Icon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-sm">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {/* ═══ CLIENT STEP 1: Basic Info ═══ */}
      {step === 1 && accountType === "client" && (
        <div className="space-y-4 fade-in">
          <h2 className="text-lg font-display font-bold">I tuoi dati</h2>
          
          {/* Gender selector */}
          <div>
            <p className="text-xs font-semibold mb-2 text-muted-foreground">Genere *</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setGender("female")}
                className={`h-12 rounded-xl text-sm font-semibold transition-all ${
                  gender === "female" ? "bg-primary text-primary-foreground shadow-lg" : "bg-card border border-border/50 text-muted-foreground"
                }`}>
                👩 Donna
              </button>
              <button type="button" onClick={() => setGender("male")}
                className={`h-12 rounded-xl text-sm font-semibold transition-all ${
                  gender === "male" ? "bg-primary text-primary-foreground shadow-lg" : "bg-card border border-border/50 text-muted-foreground"
                }`}>
                👨 Uomo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InputField icon={<User className="w-4 h-4" />} placeholder="Nome *" value={name} onChange={setName} />
            <InputField placeholder="Cognome *" value={surname} onChange={setSurname} />
          </div>
          <InputField placeholder="Username" value={username} onChange={setUsername} />
          <InputField icon={<Mail className="w-4 h-4" />} placeholder="Email *" value={email} onChange={setEmail} type="email" />
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type={showPassword ? "text" : "password"} placeholder="Password *" value={password}
              onChange={e => setPassword(e.target.value)} minLength={6}
              className="w-full h-12 rounded-xl bg-card border border-border/50 pl-11 pr-11 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
          <InputField icon={<Phone className="w-4 h-4" />} placeholder="Telefono *" value={phone} onChange={setPhone} type="tel" />
          <InputField icon={<Calendar className="w-4 h-4" />} placeholder="Data di nascita *" value={birthDate} onChange={setBirthDate} type="date" />
        </div>
      )}

      {/* ═══ CLIENT STEP 2: Città, Bio & Interessi ═══ */}
      {step === 2 && accountType === "client" && (
        <div className="space-y-4 fade-in">
          <h2 className="text-lg font-display font-bold">Dove ti trovi</h2>
          <LocationPicker city={city} setCity={setCity} country={country} setCountry={setCountry}
            locating={locating} requestLocation={requestLocation} latitude={latitude} />
          <InputField placeholder="Parlaci di te... *" value={bio} onChange={setBio} multiline />
          <div>
            <p className="text-xs font-semibold mb-2 text-muted-foreground">I tuoi interessi</p>
            <div className="flex flex-wrap gap-2">
              {["Hair", "Makeup", "Nails", "Skin", "Tattoo", "Fashion", "Fitness", "Barber", "Wellness"].map(i => (
                <button key={i} type="button" onClick={() => setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    interests.includes(i) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>{i}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ CLIENT STEP 3: Social Links ═══ */}
      {step === 3 && accountType === "client" && (
        <div className="space-y-4 fade-in">
          <h2 className="text-lg font-display font-bold">I tuoi social</h2>
          <p className="text-xs text-muted-foreground">Aggiungi i tuoi profili social per farti trovare più facilmente</p>
          <InputField icon={<Instagram className="w-4 h-4" />} placeholder="@instagram" value={instagram} onChange={setInstagram} />
          <InputField icon={<AtSign className="w-4 h-4" />} placeholder="@tiktok" value={tiktok} onChange={setTiktok} />
          <InputField icon={<Globe className="w-4 h-4" />} placeholder="Facebook (link o username)" value={facebook} onChange={setFacebook} />
        </div>
      )}

      {/* ═══ PRO STEP 1: Basic Info ═══ */}
      {step === 1 && accountType === "professional" && (
        <div className="space-y-4 fade-in">
          <h2 className="text-lg font-display font-bold">I tuoi dati</h2>
          {/* Gender selector */}
          <div>
            <p className="text-xs font-semibold mb-2 text-muted-foreground">Genere *</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setGender("female")}
                className={`h-12 rounded-xl text-sm font-semibold transition-all ${
                  gender === "female" ? "bg-primary text-primary-foreground shadow-lg" : "bg-card border border-border/50 text-muted-foreground"
                }`}>👩 Donna</button>
              <button type="button" onClick={() => setGender("male")}
                className={`h-12 rounded-xl text-sm font-semibold transition-all ${
                  gender === "male" ? "bg-primary text-primary-foreground shadow-lg" : "bg-card border border-border/50 text-muted-foreground"
                }`}>👨 Uomo</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InputField icon={<User className="w-4 h-4" />} placeholder="Nome *" value={name} onChange={setName} />
            <InputField placeholder="Cognome" value={surname} onChange={setSurname} />
          </div>
          <InputField icon={<Mail className="w-4 h-4" />} placeholder="Email *" value={email} onChange={setEmail} type="email" />
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type={showPassword ? "text" : "password"} placeholder="Password *" value={password}
              onChange={e => setPassword(e.target.value)} minLength={6}
              className="w-full h-12 rounded-xl bg-card border border-border/50 pl-11 pr-11 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
          <InputField icon={<Phone className="w-4 h-4" />} placeholder="Telefono *" value={phone} onChange={setPhone} type="tel" />
          <InputField icon={<Phone className="w-4 h-4" />} placeholder="WhatsApp *" value={whatsapp} onChange={setWhatsapp} type="tel" />
        </div>
      )}

      {/* ═══ PRO STEP 2: Category & Details ═══ */}
      {step === 2 && accountType === "professional" && (
        <div className="space-y-4 fade-in">
          <h2 className="text-lg font-display font-bold">Professione</h2>
          <div>
            <p className="text-xs font-semibold mb-2 text-muted-foreground">Categoria *</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES_PRO.map(c => (
                <button key={c} type="button" onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>{c}</button>
              ))}
            </div>
          </div>
          <InputField placeholder="Descrizione servizi" value={description} onChange={setDescription} multiline />
          <div className="grid grid-cols-2 gap-3">
            <InputField placeholder="Prezzo min (€)" value={priceMin} onChange={setPriceMin} type="number" />
            <InputField placeholder="Prezzo max (€)" value={priceMax} onChange={setPriceMax} type="number" />
          </div>
        </div>
      )}

      {/* ═══ PRO STEP 3: Location ═══ */}
      {step === 3 && accountType === "professional" && (
        <div className="space-y-4 fade-in">
          <h2 className="text-lg font-display font-bold">Posizione</h2>
          <LocationPicker city={city} setCity={setCity} country={country} setCountry={setCountry}
            locating={locating} requestLocation={requestLocation} latitude={latitude} />
          <InputField placeholder="Bio (opzionale)" value={bio} onChange={setBio} multiline />
        </div>
      )}

      {/* ═══ BUSINESS STEP 1: Company Info ═══ */}
      {step === 1 && accountType === "business" && (
        <div className="space-y-4 fade-in">
          <h2 className="text-lg font-display font-bold">Dati aziendali</h2>
          <InputField icon={<Building2 className="w-4 h-4" />} placeholder="Nome Azienda *" value={companyName} onChange={setCompanyName} />
          <InputField icon={<User className="w-4 h-4" />} placeholder="Nome Titolare *" value={ownerName} onChange={setOwnerName} />
          <InputField icon={<Mail className="w-4 h-4" />} placeholder="Email *" value={email} onChange={setEmail} type="email" />
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type={showPassword ? "text" : "password"} placeholder="Password *" value={password}
              onChange={e => setPassword(e.target.value)} minLength={6}
              className="w-full h-12 rounded-xl bg-card border border-border/50 pl-11 pr-11 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
          <InputField icon={<Briefcase className="w-4 h-4" />} placeholder="P.IVA *" value={vatNumber} onChange={setVatNumber} />
          <InputField placeholder="Codice Fiscale" value={taxCode} onChange={setTaxCode} />
          <InputField icon={<Phone className="w-4 h-4" />} placeholder="Telefono" value={phone} onChange={setPhone} type="tel" />
          <InputField icon={<Phone className="w-4 h-4" />} placeholder="WhatsApp" value={whatsapp} onChange={setWhatsapp} type="tel" />
        </div>
      )}

      {/* ═══ BUSINESS STEP 2: Details ═══ */}
      {step === 2 && accountType === "business" && (
        <div className="space-y-4 fade-in">
          <h2 className="text-lg font-display font-bold">Dettagli attività</h2>
          <div>
            <p className="text-xs font-semibold mb-2 text-muted-foreground">Categoria</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES_BIZ.map(c => (
                <button key={c} type="button" onClick={() => setBizCategory(c.toLowerCase())}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    bizCategory === c.toLowerCase() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>{c}</button>
              ))}
            </div>
          </div>
          <InputField icon={<Globe className="w-4 h-4" />} placeholder="Sito Web" value={website} onChange={setWebsite} />
          <InputField placeholder="Indirizzo" value={address} onChange={setAddress} />
          <div className="grid grid-cols-2 gap-3">
            <InputField placeholder="CAP" value={zipCode} onChange={setZipCode} />
            <InputField placeholder="Descrizione" value={description} onChange={setDescription} multiline />
          </div>
        </div>
      )}

      {/* ═══ BUSINESS STEP 3: Location & KYC notice ═══ */}
      {step === 3 && accountType === "business" && (
        <div className="space-y-4 fade-in">
          <h2 className="text-lg font-display font-bold">Posizione e Verifica</h2>
          <LocationPicker city={city} setCity={setCity} country={country} setCountry={setCountry}
            locating={locating} requestLocation={requestLocation} latitude={latitude} />

          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Verifica KYC</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Dopo la registrazione potrai verificare il tuo account caricando documenti d'identità e aziendali per ottenere il badge <strong>Business Verificato</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 4: Conto Bancario (Professional only) ═══ */}
      {step === 4 && accountType === "professional" && (
        <div className="space-y-4 fade-in">
          <h2 className="text-lg font-display font-bold">Conto Bancario</h2>
          <p className="text-xs text-muted-foreground">
            Collega il tuo conto bancario al Wallet interno per ricevere pagamenti e rimborsi
          </p>
          <InputField icon={<Banknote className="w-4 h-4" />} placeholder="IBAN (es. IT60 X054 2811 1010 0000 0123 456)" value={iban} onChange={setIban} />
          <InputField icon={<User className="w-4 h-4" />} placeholder="Intestatario conto" value={bankHolder} onChange={setBankHolder} />
          <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 space-y-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs font-semibold">Dati protetti con crittografia SSL</p>
            </div>
            <p className="text-[11px] text-muted-foreground pl-6">
              Potrai aggiungere o modificare i dati bancari anche in seguito dal tuo <strong>Wallet</strong>. Il campo è facoltativo.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-muted/50 text-[11px] text-muted-foreground">
            📱 <strong>Verifica numero:</strong> Dopo la registrazione riceverai un SMS di conferma sul numero {phone || "inserito"} per attivare i pagamenti.
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      {step > 0 && (
        <div className="mt-8 space-y-3">
          <button onClick={handleNext} disabled={loading || !canProceed()}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creazione...</> :
              step < totalSteps ? <>Continua <ChevronRight className="w-4 h-4" /></> :
              <>Crea Account <CheckCircle className="w-4 h-4" /></>}
          </button>
          <button onClick={() => setStep(Math.max(0, step - 1))}
            className="w-full h-10 rounded-xl bg-muted text-foreground font-medium text-sm flex items-center justify-center gap-1">
            <ChevronLeft className="w-4 h-4" /> Indietro
          </button>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground mt-6">
        Continuando accetti i <span className="text-primary">Termini</span> e la <span className="text-primary">Privacy Policy</span>
      </p>
    </div>
  );
}

// ─── Reusable Input ───────────────────────────────────
function InputField({ icon, placeholder, value, onChange, type = "text", multiline = false }: {
  icon?: React.ReactNode; placeholder: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean;
}) {
  if (multiline) {
    return (
      <textarea placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} rows={3}
        className="w-full rounded-xl bg-card border border-border/50 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30" />
    );
  }
  return (
    <div className="relative">
      {icon && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
      <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        className={`w-full h-12 rounded-xl bg-card border border-border/50 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 ${icon ? "pl-11" : "pl-4"}`} />
    </div>
  );
}

// ─── Location Picker ──────────────────────────────────
function LocationPicker({ city, setCity, country, setCountry, locating, requestLocation, latitude }: {
  city: string; setCity: (v: string) => void; country: string; setCountry: (v: string) => void;
  locating: boolean; requestLocation: () => void; latitude: number | null;
}) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={requestLocation} disabled={locating}
        className={`w-full h-12 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
          latitude ? "border-primary/30 bg-primary/5 text-primary" : "border-border/50 bg-card text-foreground"
        }`}>
        {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
        {latitude ? "Posizione rilevata ✓" : "Rileva posizione GPS"}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <InputField icon={<MapPin className="w-4 h-4" />} placeholder="Città" value={city} onChange={setCity} />
        <InputField icon={<Globe className="w-4 h-4" />} placeholder="Paese" value={country} onChange={setCountry} />
      </div>
    </div>
  );
}
