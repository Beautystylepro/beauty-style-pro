import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import {
  ArrowRight, Building2, Scissors, MapPin, Phone, Globe, Instagram,
  Upload, Shield, CreditCard, CheckCircle2, FileText, Loader2
} from "lucide-react";

export default function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Professional fields
  const [businessName, setBusinessName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");

  // Business fields
  const [legalName, setLegalName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [businessType, setBusinessType] = useState("center");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState(user?.email || "");

  // Phone OTP
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // Documents
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [documents, setDocuments] = useState<{ name: string; url: string }[]>([]);

  // Bank
  const [iban, setIban] = useState("");
  const [bankHolder, setBankHolder] = useState("");

  const userType = profile?.user_type || "client";

  // Client redirect
  if (userType === "client") {
    navigate("/");
    return null;
  }

  const totalSteps = userType === "business" ? 5 : 4;

  const sendOtp = async () => {
    if (!phone || phone.length < 8) {
      toast.error("Inserisci un numero di telefono valido");
      return;
    }
    setSendingOtp(true);
    try {
      // Generate a 6-digit code and store it
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await supabase.from("profiles").update({
        phone,
        otp_code: code,
        otp_expires_at: expiresAt,
      } as any).eq("user_id", user!.id);

      setOtpSent(true);
      toast.success("Codice OTP inviato! Controlla il tuo telefono.");
    } catch {
      toast.error("Errore nell'invio OTP");
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error("Inserisci il codice a 6 cifre");
      return;
    }
    try {
      const { data } = await supabase
        .from("profiles")
        .select("otp_code, otp_expires_at")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!data) throw new Error("Profile not found");

      const profile = data as any;
      if (profile.otp_code !== otpCode) {
        toast.error("Codice OTP non valido");
        return;
      }

      if (new Date(profile.otp_expires_at) < new Date()) {
        toast.error("Codice OTP scaduto. Richiedi un nuovo codice.");
        setOtpSent(false);
        return;
      }

      await supabase.from("profiles").update({
        phone_verified: true,
        otp_code: null,
        otp_expires_at: null,
      } as any).eq("user_id", user!.id);

      setPhoneVerified(true);
      toast.success("Numero verificato! ✅");
    } catch {
      toast.error("Errore nella verifica");
    }
  };

  const uploadDocument = async (file: File) => {
    if (!user) return;
    setUploadingDoc(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("documents").upload(path, file);
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
      setDocuments(prev => [...prev, { name: file.name, url: urlData.publicUrl }]);
      toast.success("Documento caricato!");
    } catch (e: any) {
      toast.error("Errore upload: " + e.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const documentUrls = documents.map(d => d.url);

      if (userType === "professional") {
        if (!businessName.trim() || !city.trim()) {
          toast.error("Inserisci nome attività e città");
          setLoading(false);
          return;
        }

        const { error: profError } = await supabase.from("professionals").insert({
          user_id: user.id,
          business_name: businessName,
          specialty,
          city,
          address,
          description: bio,
        });
        if (profError) throw profError;

        await supabase.from("profiles").update({ bio, city, phone }).eq("user_id", user.id);

        await supabase.from("profiles_private").upsert({
          user_id: user.id,
          iban: iban || null,
          bank_holder_name: bankHolder || null,
          document_urls: documentUrls,
        }, { onConflict: "user_id" });

        if (documents.length > 0) {
          const { error: verifyError } = await supabase.rpc("submit_verification_request");
          if (verifyError) console.error("Errore invio verifica:", verifyError);
        }
      }

      if (userType === "business") {
        if (!legalName.trim() || !vatNumber.trim() || !businessName.trim()) {
          toast.error("Compila ragione sociale, P.IVA e nome attività");
          setLoading(false);
          return;
        }

        const slug = businessName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

        const { error: bizError } = await supabase.from("businesses").insert({
          user_id: user.id,
          legal_name: legalName,
          business_name: businessName,
          slug: `${slug}-${Date.now().toString(36)}`,
          vat_number: vatNumber,
          business_type: businessType,
          city,
          address,
          phone,
          email,
          website,
          instagram: instagramHandle,
        });
        if (bizError) throw bizError;

        await supabase.from("profiles").update({ bio, city, phone }).eq("user_id", user.id);

        await supabase.from("profiles_private").upsert({
          user_id: user.id,
          iban: iban || null,
          bank_holder_name: bankHolder || null,
          document_urls: documentUrls,
        }, { onConflict: "user_id" });

        if (documents.length > 0) {
          const { error: verifyError } = await supabase.rpc("submit_verification_request");
          if (verifyError) console.error("Errore invio verifica:", verifyError);
        }
      }

      await refreshProfile();
      toast.success("Profilo completato! 🎉");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Errore nel salvataggio");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full h-11 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-6">
          <img src={logo} alt="STYLE" className="w-10 h-10" />
          <div>
            <h1 className="text-xl font-display font-bold">Completa il profilo</h1>
            <p className="text-xs text-muted-foreground">
              {userType === "professional" ? "Professionista" : "Business"} • Step {step}/{totalSteps}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 mb-6">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < step ? "gradient-primary" : "bg-muted"}`} />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 space-y-4 overflow-y-auto">
        {/* STEP 1: Business Info */}
        {step === 1 && userType === "professional" && (
          <div className="p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Scissors className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">La tua attività</h3>
            </div>
            <div className="space-y-3">
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Nome Studio / Salone *" className={inputClass} />
              <input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="Specialità (es. Colorista, Barbiere)" className={inputClass} />
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Città *" className={inputClass} />
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Indirizzo" className={inputClass} />
              <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Descrivi la tua attività..." rows={3} className="w-full rounded-xl bg-background border border-border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <input value={instagramHandle} onChange={e => setInstagramHandle(e.target.value)} placeholder="@instagram" className={inputClass} />
            </div>
          </div>
        )}

        {step === 1 && userType === "business" && (
          <div className="p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">Dati Aziendali</h3>
            </div>
            <div className="space-y-3">
              <input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Ragione Sociale *" className={inputClass} />
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Nome Commerciale *" className={inputClass} />
              <input value={vatNumber} onChange={e => setVatNumber(e.target.value)} placeholder="Partita IVA *" className={inputClass} />
              <div className="grid grid-cols-2 gap-2">
                {["center", "barbershop", "spa", "individual"].map(t => (
                  <button key={t} type="button" onClick={() => setBusinessType(t)}
                    className={`py-2 rounded-xl text-xs font-semibold transition-all border ${businessType === t ? "gradient-primary text-primary-foreground border-transparent" : "bg-background border-border text-muted-foreground"}`}>
                    {t === "center" ? "Centro" : t === "barbershop" ? "Barbershop" : t === "spa" ? "Spa" : "Individuale"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 (Business): Location & Contacts */}
        {step === 2 && userType === "business" && (
          <div className="p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">Sede & Contatti</h3>
            </div>
            <div className="space-y-3">
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Città *" className={inputClass} />
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Indirizzo" className={inputClass} />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email aziendale" className={inputClass} />
              <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="Sito web" className={inputClass} />
              <input value={instagramHandle} onChange={e => setInstagramHandle(e.target.value)} placeholder="@instagram" className={inputClass} />
              <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Descrizione attività..." rows={3} className="w-full rounded-xl bg-background border border-border px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
        )}

        {/* PHONE OTP STEP */}
        {((userType === "professional" && step === 2) || (userType === "business" && step === 3)) && (
          <div className="p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Phone className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">Verifica Telefono</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Inserisci il tuo numero per ricevere un codice di verifica OTP.
            </p>

            {phoneVerified ? (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-success/10 border border-success/20">
                <CheckCircle2 className="w-6 h-6 text-success" />
                <div>
                  <p className="text-sm font-semibold text-success">Numero verificato!</p>
                  <p className="text-xs text-muted-foreground">{phone}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+39 333 1234567"
                    type="tel"
                    disabled={otpSent}
                    className={`flex-1 ${inputClass}`}
                  />
                  <button
                    onClick={sendOtp}
                    disabled={sendingOtp || otpSent}
                    className="px-4 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
                  >
                    {sendingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : otpSent ? "Inviato" : "Invia OTP"}
                  </button>
                </div>

                {otpSent && (
                  <>
                    <div className="flex gap-2">
                      <input
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="Codice a 6 cifre"
                        maxLength={6}
                        className={`flex-1 ${inputClass} text-center text-lg tracking-[0.5em] font-mono`}
                      />
                      <button
                        onClick={verifyOtp}
                        className="px-4 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold"
                      >
                        Verifica
                      </button>
                    </div>
                    <button onClick={() => { setOtpSent(false); setOtpCode(""); }} className="text-xs text-primary">
                      Reinvia codice
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* DOCUMENTS STEP */}
        {((userType === "professional" && step === 3) || (userType === "business" && step === 4)) && (
          <div className="p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">Verifica Documenti</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Carica i documenti per la verifica del tuo profilo. I documenti saranno visibili solo all'amministratore.
            </p>

            <div className="space-y-3">
              {/* P.IVA reminder for professionals */}
              {userType === "professional" && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-xs text-primary font-semibold mb-1">📋 Documenti consigliati:</p>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5 ml-4 list-disc">
                    <li>Documento d'identità</li>
                    <li>Partita IVA / Codice Fiscale</li>
                    <li>Certificazioni professionali</li>
                    <li>Attestati / Diplomi</li>
                  </ul>
                </div>
              )}

              {userType === "business" && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-xs text-primary font-semibold mb-1">📋 Documenti richiesti:</p>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5 ml-4 list-disc">
                    <li>Visura camerale</li>
                    <li>Documento legale rappresentante</li>
                    <li>Licenza attività</li>
                    <li>Certificato P.IVA</li>
                  </ul>
                </div>
              )}

              {/* Uploaded docs */}
              {documents.map((doc, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-success/5 border border-success/10">
                  <FileText className="w-5 h-5 text-success flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{doc.name}</p>
                    <p className="text-xs text-success">Caricato ✓</p>
                  </div>
                </div>
              ))}

              {/* Upload button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) uploadDocument(file);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingDoc}
                className="w-full py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors flex items-center justify-center gap-2 text-sm text-muted-foreground"
              >
                {uploadingDoc ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Caricamento...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Carica documento</>
                )}
              </button>

              <p className="text-xs text-muted-foreground text-center">
                Formati: PDF, JPG, PNG. Max 10MB per file.
              </p>
            </div>
          </div>
        )}

        {/* BANK ACCOUNT STEP */}
        {((userType === "professional" && step === 4) || (userType === "business" && step === 5)) && (
          <div className="p-4 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">Conto Bancario</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Aggiungi il tuo IBAN per ricevere i pagamenti. Puoi aggiungerlo anche in seguito.
            </p>
            <div className="space-y-3">
              <input
                value={bankHolder}
                onChange={e => setBankHolder(e.target.value)}
                placeholder="Intestatario conto"
                className={inputClass}
              />
              <input
                value={iban}
                onChange={e => setIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
                placeholder="IBAN (es. IT60X0542811101000000123456)"
                className={`${inputClass} font-mono text-xs`}
              />
              {iban && iban.length >= 2 && !iban.startsWith("IT") && (
                <p className="text-xs text-gold">⚠️ L'IBAN deve iniziare con IT per conti italiani</p>
              )}
              {iban && iban.length > 0 && iban.length !== 27 && (
                <p className="text-xs text-muted-foreground">L'IBAN italiano ha 27 caratteri ({iban.length}/27)</p>
              )}
            </div>

            {/* Summary */}
            <div className="mt-6 p-3 rounded-xl bg-muted/50">
              <p className="text-xs font-semibold mb-2">📋 Riepilogo verifica:</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  {phoneVerified ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <div className="w-3.5 h-3.5 rounded-full border border-border" />}
                  <span className={phoneVerified ? "text-success" : "text-muted-foreground"}>Telefono verificato</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {documents.length > 0 ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <div className="w-3.5 h-3.5 rounded-full border border-border" />}
                  <span className={documents.length > 0 ? "text-success" : "text-muted-foreground"}>Documenti ({documents.length})</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {iban.length === 27 ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <div className="w-3.5 h-3.5 rounded-full border border-border" />}
                  <span className={iban.length === 27 ? "text-success" : "text-muted-foreground"}>IBAN configurato</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 space-y-3">
        <div className="flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="flex-1 h-12 rounded-xl bg-primary/10 text-primary font-semibold text-sm">
              Indietro
            </button>
          )}
          {step < totalSteps ? (
            <button onClick={() => setStep(step + 1)} className="flex-1 h-12 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow flex items-center justify-center gap-2">
              Avanti <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleComplete} disabled={loading} className="flex-1 h-12 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow disabled:opacity-50">
              {loading ? "Salvataggio..." : "Completa Profilo"}
            </button>
          )}
        </div>
        <button onClick={() => navigate("/")} className="w-full text-center text-xs text-muted-foreground">
          Salta per ora
        </button>
      </div>
    </div>
  );
}
