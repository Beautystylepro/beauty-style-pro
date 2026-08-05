import { useState } from "react";
import { ArrowLeft, Upload, ShieldCheck, Camera, CreditCard, FileText, Building2, Briefcase, User, Store, Stethoscope, Scissors } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MobileLayout from "@/components/layout/MobileLayout";

const DOC_TYPES = [
  { key: "id_card", label: "Carta d'Identità", Icon: CreditCard },
  { key: "passport", label: "Passaporto", Icon: FileText },
  { key: "drivers_license", label: "Patente", Icon: FileText },
  { key: "selfie", label: "Selfie con Doc", Icon: Camera },
];

const ACCOUNT_TYPES = [
  { key: "client", label: "Utente", Icon: User },
  { key: "professional", label: "Professionista", Icon: Scissors },
  { key: "business", label: "Negozio / Attività", Icon: Store },
  { key: "clinic", label: "Clinica / Studio", Icon: Stethoscope },
  { key: "brand", label: "Brand", Icon: Building2 },
  { key: "influencer", label: "Influencer", Icon: Briefcase },
];

export default function VerifyAccountPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState(profile?.user_type || "client");
  const [docType, setDocType] = useState("id_card");
  const [fullName, setFullName] = useState(profile?.display_name || "");
  const [address, setAddress] = useState(profile?.city || "");
  const [businessName, setBusinessName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [city, setCity] = useState(profile?.city || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [email, setEmail] = useState(user?.email || "");
  const [files, setFiles] = useState<File[]>([]);
  const [licenseFiles, setLicenseFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Prima "isBusiness" includeva anche "professional", rendendo la
  // Partita IVA obbligatoria per QUALSIASI professionista — ma esistono
  // professionisti a domicilio/mobili senza P.IVA. Separato: solo le
  // vere attività commerciali (business/clinic/brand) la richiedono
  // davvero; per i professionisti resta un campo facoltativo.
  const isTrueBusiness = ["business", "clinic", "brand"].includes(accountType);
  const isBusiness = [...["business", "clinic", "brand", "professional"]].includes(accountType);
  const isVerified = profile?.verification_status === "verified";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  const handleLicenseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setLicenseFiles(Array.from(e.target.files));
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!fullName.trim()) { toast.error("Inserisci il nome completo"); return; }
    if (files.length === 0) { toast.error("Carica almeno un documento d'identità"); return; }
    if (isTrueBusiness && !vatNumber.trim()) { toast.error("Inserisci la Partita IVA"); return; }

    setSubmitting(true);
    const docUrls: string[] = [];
    const licUrls: string[] = [];

    for (const file of files) {
      const path = `${user.id}/verify/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("documents").upload(path, file);
      if (!error) docUrls.push(path);
    }

    for (const file of licenseFiles) {
      const path = `${user.id}/licenses/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("documents").upload(path, file);
      if (!error) licUrls.push(path);
    }

    const { error } = await supabase.from("verification_requests").insert({
      user_id: user.id,
      verification_type: isBusiness ? "business" : "identity",
      account_type: accountType,
      document_type: docType,
      document_urls: docUrls,
      license_urls: licUrls.length > 0 ? licUrls : null,
      full_name: fullName,
      address: address || null,
      business_name: isBusiness ? businessName : null,
      vat_number: isBusiness ? vatNumber : null,
      tax_code: taxCode || null,
      city: city || null,
      phone: phone || null,
      email: email || null,
    });

    setSubmitting(false);
    if (error) { toast.error("Errore nell'invio"); return; }
    toast.success("Richiesta inviata! Verrà verificata entro 24-48h.");
    navigate(-1);
  };

  if (isVerified) {
    return (
      <MobileLayout>
        <header className="sticky top-0 z-40 glass px-5 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-display font-bold">Verifica Account</h1>
        </header>
        <div className="px-5 py-6">
          <div className="text-center py-12">
            <ShieldCheck className="w-16 h-16 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-display font-bold mb-2">Account Verificato</h2>
            <p className="text-sm text-muted-foreground">Il tuo account è stato verificato con successo.</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-5 py-3 flex items-center gap-3">
        <button onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold">Verifica Account</h1>
        <span className="ml-auto text-xs text-muted-foreground">Passo {step}/3</span>
      </header>

      {/* Progress bar */}
      <div className="px-5 pt-2">
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>

      <div className="px-5 py-6 space-y-6">
        <div className="rounded-2xl gradient-primary p-5 text-primary-foreground">
          <ShieldCheck className="w-8 h-8 mb-2" />
          <h2 className="font-display font-bold text-lg">Verifica KYC</h2>
          <p className="text-sm opacity-80 mt-1">
            Verifica la tua identità per sbloccare tutte le funzionalità: shop, prenotazioni, pagamenti e badge verificato.
          </p>
        </div>

        {/* STEP 1 — Account Type */}
        {step === 1 && (
          <div className="space-y-5 fade-in">
            <div>
              <p className="text-xs font-semibold mb-3">Tipo di account</p>
              <div className="grid grid-cols-3 gap-2">
                {ACCOUNT_TYPES.map(t => (
                  <button key={t.key} onClick={() => setAccountType(t.key)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-[11px] font-semibold transition-all ${
                      accountType === t.key ? "bg-primary/10 border-primary text-primary" : "bg-card border-border/50 text-muted-foreground"
                    }`}>
                    <t.Icon className="w-5 h-5" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1.5 block">Nome completo</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                className="w-full h-12 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>

            <div>
              <label className="text-xs font-semibold mb-1.5 block">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full h-12 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>

            <div>
              <label className="text-xs font-semibold mb-1.5 block">Telefono</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full h-12 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>

            <button onClick={() => setStep(2)}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
              Continua
            </button>
          </div>
        )}

        {/* STEP 2 — Business Data (if applicable) + Address */}
        {step === 2 && (
          <div className="space-y-5 fade-in">
            {isBusiness && (
              <>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Nome attività</label>
                  <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)}
                    className="w-full h-12 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Partita IVA {isTrueBusiness ? "*" : "(facoltativa)"}</label>
                  <input type="text" value={vatNumber} onChange={e => setVatNumber(e.target.value)} placeholder="IT12345678901"
                    className="w-full h-12 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  {!isTrueBusiness && (
                    <p className="text-[11px] text-muted-foreground mt-1">Se lavori a domicilio o in mobilità senza Partita IVA, puoi lasciare vuoto.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Codice Fiscale</label>
                  <input type="text" value={taxCode} onChange={e => setTaxCode(e.target.value)}
                    className="w-full h-12 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-semibold mb-1.5 block">Città</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)}
                className="w-full h-12 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>

            <div>
              <label className="text-xs font-semibold mb-1.5 block">Indirizzo</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                className="w-full h-12 rounded-xl bg-card border border-border/50 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>

            <button onClick={() => setStep(3)}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
              Continua
            </button>
          </div>
        )}

        {/* STEP 3 — Documents */}
        {step === 3 && (
          <div className="space-y-5 fade-in">
            <div>
              <p className="text-xs font-semibold mb-3">Tipo di documento</p>
              <div className="grid grid-cols-2 gap-2">
                {DOC_TYPES.map(d => (
                  <button key={d.key} onClick={() => setDocType(d.key)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-[11px] font-semibold transition-all ${
                      docType === d.key ? "bg-primary/10 border-primary text-primary" : "bg-card border-border/50 text-muted-foreground"
                    }`}>
                    <d.Icon className="w-5 h-5" />
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1.5 block">Carica documento d'identità *</label>
              <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed border-border/50 cursor-pointer hover:border-primary/30 transition-colors">
                <Upload className="w-7 h-7 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{files.length > 0 ? `${files.length} file selezionati` : "Tocca per caricare"}</span>
                <input type="file" multiple accept="image/*,.pdf" onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            {isBusiness && (
              <div>
                <label className="text-xs font-semibold mb-1.5 block">Visura / Licenza / Certificati</label>
                <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed border-border/50 cursor-pointer hover:border-primary/30 transition-colors">
                  <Building2 className="w-7 h-7 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{licenseFiles.length > 0 ? `${licenseFiles.length} file selezionati` : "Documenti business"}</span>
                  <input type="file" multiple accept="image/*,.pdf" onChange={handleLicenseChange} className="hidden" />
                </label>
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">
              {submitting ? "Invio in corso..." : "Invia Verifica"}
            </button>

            <p className="text-xs text-center text-muted-foreground">
              I tuoi documenti sono protetti e verranno utilizzati solo per la verifica dell'identità. Conforme al GDPR.
            </p>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
