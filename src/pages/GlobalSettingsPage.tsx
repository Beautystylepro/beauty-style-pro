import { useState, useEffect } from "react";
import { ArrowLeft, Globe, Languages, DollarSign, Shield, Map, Check, ChevronRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SETTINGS_KEY = "global_config";

interface GlobalConfig {
  defaultLang: string;
  defaultCurrency: string;
  enabledLangs: string[];
  enabledCurrencies: string[];
  compliance: { id: string; enabled: boolean }[];
  autoTranslate: boolean;
  autoDetectLocation: boolean;
}

const LANGUAGES = [
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
];

const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal" },
];

const COMPLIANCE_REGIONS = [
  { id: "eu", name: "EU (GDPR)", enabled: true, icon: "🇪🇺" },
  { id: "us", name: "USA (CCPA)", enabled: false, icon: "🇺🇸" },
  { id: "uk", name: "UK (UK-GDPR)", enabled: false, icon: "🇬🇧" },
  { id: "br", name: "Brazil (LGPD)", enabled: false, icon: "🇧🇷" },
  { id: "au", name: "Australia (APPs)", enabled: false, icon: "🇦🇺" },
  { id: "jp", name: "Japan (APPI)", enabled: false, icon: "🇯🇵" },
];

export default function GlobalSettingsPage() {
  const navigate = useNavigate();
  const [defaultLang, setDefaultLang] = useState("it");
  const [defaultCurrency, setDefaultCurrency] = useState("EUR");
  const [enabledLangs, setEnabledLangs] = useState<string[]>(["it", "en"]);
  const [enabledCurrencies, setEnabledCurrencies] = useState<string[]>(["EUR", "USD"]);
  const [compliance, setCompliance] = useState(COMPLIANCE_REGIONS);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [autoDetectLocation, setAutoDetectLocation] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Errore nel caricamento delle impostazioni globali:", error);
        toast.error("Impossibile caricare le impostazioni globali, uso i valori predefiniti");
      } else if (data?.value) {
        const cfg = data.value as unknown as GlobalConfig;
        if (cfg.defaultLang) setDefaultLang(cfg.defaultLang);
        if (cfg.defaultCurrency) setDefaultCurrency(cfg.defaultCurrency);
        if (cfg.enabledLangs) setEnabledLangs(cfg.enabledLangs);
        if (cfg.enabledCurrencies) setEnabledCurrencies(cfg.enabledCurrencies);
        if (cfg.compliance) {
          setCompliance(prev =>
            prev.map(r => {
              const saved = cfg.compliance.find(c => c.id === r.id);
              return saved ? { ...r, enabled: saved.enabled } : r;
            })
          );
        }
        if (typeof cfg.autoTranslate === "boolean") setAutoTranslate(cfg.autoTranslate);
        if (typeof cfg.autoDetectLocation === "boolean") setAutoDetectLocation(cfg.autoDetectLocation);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleLang = (code: string) => {
    setEnabledLangs(prev =>
      prev.includes(code) ? prev.filter(l => l !== code) : [...prev, code]
    );
  };

  const toggleCurrency = (code: string) => {
    setEnabledCurrencies(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const toggleCompliance = (id: string) => {
    setCompliance(prev =>
      prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const config: GlobalConfig = {
      defaultLang,
      defaultCurrency,
      enabledLangs,
      enabledCurrencies,
      compliance: compliance.map(({ id, enabled }) => ({ id, enabled })),
      autoTranslate,
      autoDetectLocation,
    };

    const { error } = await supabase
      .from("platform_settings")
      .upsert({ key: SETTINGS_KEY, value: config as any }, { onConflict: "key" });

    setSaving(false);

    if (error) {
      console.error("Errore nel salvataggio delle impostazioni globali:", error);
      toast.error("Salvataggio fallito, riprova");
      return;
    }
    toast.success("Impostazioni globali salvate!");
  };

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur p-4 flex items-center gap-3 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Torna indietro">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Globe className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">Impostazioni Globali</h1>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
        <Tabs defaultValue="languages">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="languages" className="text-xs"><Languages className="w-3 h-3 mr-1" />Lingue</TabsTrigger>
            <TabsTrigger value="currencies" className="text-xs"><DollarSign className="w-3 h-3 mr-1" />Valute</TabsTrigger>
            <TabsTrigger value="compliance" className="text-xs"><Shield className="w-3 h-3 mr-1" />Compliance</TabsTrigger>
          </TabsList>

          {/* LANGUAGES */}
          <TabsContent value="languages" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lingua Predefinita</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={defaultLang} onValueChange={setDefaultLang}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => (
                      <SelectItem key={l.code} value={l.code}>{l.flag} {l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Traduzione Automatica AI</CardTitle>
                  <Switch checked={autoTranslate} onCheckedChange={setAutoTranslate} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Traduce automaticamente contenuti, notifiche e interfaccia nella lingua dell'utente
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Lingue Attive</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {LANGUAGES.map(l => (
                  <div key={l.code} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm">{l.flag} {l.name}</span>
                    <div className="flex items-center gap-2">
                      {l.code === defaultLang && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                      <Switch
                        checked={enabledLangs.includes(l.code)}
                        onCheckedChange={() => toggleLang(l.code)}
                        disabled={l.code === defaultLang}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CURRENCIES */}
          <TabsContent value="currencies" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Valuta Predefinita</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.symbol} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Auto-Detect Posizione</CardTitle>
                  <Switch checked={autoDetectLocation} onCheckedChange={setAutoDetectLocation} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Rileva automaticamente paese e valuta dell'utente tramite geolocalizzazione
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Valute Attive</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {CURRENCIES.map(c => (
                  <div key={c.code} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm">{c.symbol} {c.name} ({c.code})</span>
                    <div className="flex items-center gap-2">
                      {c.code === defaultCurrency && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                      <Switch
                        checked={enabledCurrencies.includes(c.code)}
                        onCheckedChange={() => toggleCurrency(c.code)}
                        disabled={c.code === defaultCurrency}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* COMPLIANCE */}
          <TabsContent value="compliance" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Conformità Regionale
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {compliance.map(r => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <span>{r.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {r.enabled ? "Conforme" : "Non attivo"}
                        </p>
                      </div>
                    </div>
                    <Switch checked={r.enabled} onCheckedChange={() => toggleCompliance(r.id)} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 space-y-3">
                <h3 className="text-sm font-semibold">Funzionalità Compliance</h3>
                {[
                  { label: "Cookie Banner Automatico", desc: "Mostra banner consenso cookie per regione" },
                  { label: "Data Residency", desc: "Archiviazione dati nel paese dell'utente" },
                  { label: "Right to Deletion", desc: "Cancellazione automatica dati su richiesta" },
                  { label: "Audit Log", desc: "Tracciamento accessi e modifiche dati sensibili" },
                ].map((f, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">{f.label}</p>
                      <p className="text-[10px] text-muted-foreground">{f.desc}</p>
                    </div>
                    <Switch defaultChecked={i === 0} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        )}

        <Button className="w-full" onClick={handleSave} disabled={saving || loading}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          Salva Impostazioni Globali
        </Button>
      </div>
    </div>
  );
}
