import { useState, useRef, useCallback } from "react";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Camera, Upload, User, Sparkles, Scissors, Palette, Eye,
  Glasses, Shirt, Heart, Star, ArrowLeft, RotateCcw,
  Download, Share2, Bookmark, CalendarPlus, Wand2,
  Crown, Zap, History, ChevronRight, ImagePlus, X
} from "lucide-react";

// ── Style Categories ─────────────────────────────────────────
const STYLE_CATEGORIES = [
  {
    id: "haircut", label: "Tagli", icon: Scissors, color: "from-violet-500 to-purple-600",
    items: [
      { name: "Fade Moderno", desc: "Sfumatura laterale moderna", premium: false },
      { name: "Pompadour", desc: "Volume e classe", premium: false },
      { name: "Buzz Cut", desc: "Rasato corto e pulito", premium: false },
      { name: "Long Layers", desc: "Scalature lunghe", premium: false },
      { name: "Bob Corto", desc: "Caschetto moderno", premium: false },
      { name: "Pixie Cut", desc: "Corto e audace", premium: false },
      { name: "Undercut", desc: "Disconnesso laterale", premium: true },
      { name: "Capelli Ricci", desc: "Ricci naturali", premium: true },
    ],
  },
  {
    id: "color", label: "Colori", icon: Palette, color: "from-pink-500 to-rose-600",
    items: [
      { name: "Biondo Platino", desc: "Biondo freddo luminoso", premium: false },
      { name: "Rosso Fuoco", desc: "Rosso intenso vibrante", premium: false },
      { name: "Castano Cioccolato", desc: "Marrone caldo naturale", premium: false },
      { name: "Nero Corvino", desc: "Nero profondo lucido", premium: false },
      { name: "Rosa Pastello", desc: "Rosa delicato fantasy", premium: true },
      { name: "Blu Elettrico", desc: "Blu vivace audace", premium: true },
      { name: "Balayage Miele", desc: "Sfumature dorate", premium: true },
      { name: "Silver Grey", desc: "Grigio argento trendy", premium: true },
    ],
  },
  {
    id: "beard", label: "Barba", icon: User, color: "from-amber-500 to-orange-600",
    items: [
      { name: "Barba Curata", desc: "Piena e ordinata", premium: false },
      { name: "Barba Lunga", desc: "Lunga e wild", premium: false },
      { name: "Pizzetto", desc: "Solo mento", premium: false },
      { name: "Stubble", desc: "Barba 3 giorni", premium: false },
      { name: "Baffi", desc: "Solo baffi stilosi", premium: true },
      { name: "Clean Shave", desc: "Completamente rasato", premium: false },
    ],
  },
  {
    id: "makeup", label: "Trucco", icon: Eye, color: "from-fuchsia-500 to-pink-600",
    items: [
      { name: "Naturale", desc: "Leggero e fresco", premium: false },
      { name: "Smokey Eyes", desc: "Occhi sfumati intensi", premium: false },
      { name: "Glam", desc: "Full glam con contour", premium: true },
      { name: "Labbra Rosse", desc: "Classico rossetto rosso", premium: false },
      { name: "Soft Glam", desc: "Toni caldi eleganti", premium: true },
      { name: "No Makeup Look", desc: "Effetto pelle nuda", premium: false },
    ],
  },
  {
    id: "glasses", label: "Occhiali", icon: Glasses, color: "from-cyan-500 to-teal-600",
    items: [
      { name: "Aviator", desc: "Classici aviator", premium: false },
      { name: "Wayfarer", desc: "Stile iconico", premium: false },
      { name: "Round", desc: "Tondi vintage", premium: false },
      { name: "Cat Eye", desc: "Femminili retrò", premium: true },
      { name: "Occhiali da Vista", desc: "Montatura moderna", premium: false },
      { name: "Sport", desc: "Sportivi avvolgenti", premium: true },
    ],
  },
  {
    id: "clothing", label: "Vestiti", icon: Shirt, color: "from-emerald-500 to-green-600",
    items: [
      { name: "Casual Chic", desc: "Comodo ma stiloso", premium: false },
      { name: "Business", desc: "Formale elegante", premium: false },
      { name: "Streetwear", desc: "Urban trendy", premium: false },
      { name: "Elegante", desc: "Sera e gala", premium: true },
      { name: "Sportivo", desc: "Atletico e dinamico", premium: false },
      { name: "Bohemian", desc: "Libero e artistico", premium: true },
    ],
  },
  {
    id: "tattoo", label: "Tattoo", icon: Heart, color: "from-red-500 to-rose-600",
    items: [
      { name: "Braccio Sleeve", desc: "Manica completa artistica", premium: true },
      { name: "Collo Piccolo", desc: "Tatuaggio minimale", premium: false },
      { name: "Mano", desc: "Tatuaggi su mani", premium: true },
      { name: "Geometrico", desc: "Forme geometriche", premium: true },
    ],
  },
  {
    id: "complete", label: "Look Completi", icon: Star, color: "from-yellow-500 to-amber-600",
    items: [
      { name: "Look VIP", desc: "Stile celebrity premium", premium: true },
      { name: "Look Influencer", desc: "Social media trendy", premium: false },
      { name: "Look Elegante", desc: "Raffinato e classico", premium: false },
      { name: "Look Sportivo", desc: "Atletico e fresco", premium: false },
      { name: "Look Casual", desc: "Rilassato e cool", premium: false },
      { name: "Look Moda", desc: "Alta moda avant-garde", premium: true },
    ],
  },
];

type StyleSelection = { category: string; name: string };

const AILookGeneratorPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [step, setStep] = useState<"upload" | "styles" | "generating" | "result">("upload");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [selectedStyles, setSelectedStyles] = useState<StyleSelection[]>([]);
  const [activeCategory, setActiveCategory] = useState("haircut");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [autoSuggestions, setAutoSuggestions] = useState<any[] | null>(null);
  const [showAutoLook, setShowAutoLook] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  // ── Photo Upload ───────────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Seleziona un'immagine valida", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Immagine troppo grande (max 10MB)", variant: "destructive" });
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoUrl(reader.result as string);
      setStep("styles");
    };
    reader.readAsDataURL(file);
  }, []);

  const useProfilePhoto = useCallback(async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.avatar_url) {
      setPhotoUrl(profile.avatar_url);
      setStep("styles");
    } else {
      toast({ title: "Nessuna foto profilo trovata", variant: "destructive" });
    }
  }, [user]);

  // ── Style Selection ────────────────────────────────────────
  const toggleStyle = (category: string, name: string) => {
    setSelectedStyles((prev) => {
      const exists = prev.find((s) => s.category === category && s.name === name);
      if (exists) return prev.filter((s) => !(s.category === category && s.name === name));
      // Replace within same category
      const filtered = prev.filter((s) => s.category !== category);
      return [...filtered, { category, name }];
    });
  };

  const isSelected = (category: string, name: string) =>
    selectedStyles.some((s) => s.category === category && s.name === name);

  // ── Generation ─────────────────────────────────────────────
  const generateLook = async (styles?: StyleSelection[]) => {
    if (!photoUrl) return;
    setStep("generating");
    setIsGenerating(true);
    setProgress(0);

    // Progress animation
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 8, 90));
    }, 500);

    try {
      // Un tentativo fallito non deve mai diventare un errore visibile
      // subito — si riprova automaticamente una volta prima di
      // arrendersi, dato che spesso basta un istante di sovraccarico
      // momentaneo del servizio AI.
      let data: any, error: any;
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await supabase.functions.invoke("ai-look-generator", {
          body: {
            action: "generate",
            imageUrl: photoUrl,
            styles: styles || selectedStyles,
            autoMode: !!styles,
          },
        });
        data = result.data; error = result.error;
        if (!error && !data?.error) break;
        if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
      }

      clearInterval(interval);

      if (error) throw error;
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
        setStep("styles");
        setIsGenerating(false);
        return;
      }

      setProgress(100);
      setTimeout(() => {
        setGeneratedUrl(data.generated_url);
        setGenerationId(data.generation_id);
        setStep("result");
        setIsGenerating(false);
      }, 500);
    } catch (err: any) {
      clearInterval(interval);
      console.error("Generation error:", err);
      toast({
        title: "Errore nella generazione",
        description: err.message || "Riprova tra qualche secondo",
        variant: "destructive",
      });
      setStep("styles");
      setIsGenerating(false);
    }
  };

  // ── Auto Look AI ───────────────────────────────────────────
  const getAutoSuggestions = async () => {
    if (!photoUrl) return;
    setShowAutoLook(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-look-generator", {
        body: { action: "auto_suggest", imageUrl: photoUrl },
      });
      if (error) throw error;
      setAutoSuggestions(data?.suggestions || []);
    } catch {
      toast({ title: "Errore analisi AI", variant: "destructive" });
    }
  };

  // ── Actions ────────────────────────────────────────────────
  const toggleFavorite = async () => {
    if (!generationId) return;
    const newVal = !isFavorite;
    setIsFavorite(newVal);
    await supabase
      .from("look_generations")
      .update({ is_favorite: newVal })
      .eq("id", generationId);
    toast({ title: newVal ? "Aggiunto ai preferiti ⭐" : "Rimosso dai preferiti" });
  };

  const setAsProfile = async () => {
    if (!generatedUrl || !user) return;
    await supabase
      .from("profiles")
      .update({ avatar_url: generatedUrl })
      .eq("user_id", user.id);
    toast({ title: "Foto profilo aggiornata! ✨" });
  };

  const shareResult = async () => {
    if (!generatedUrl) return;
    if (navigator.share) {
      await navigator.share({
        title: "Il mio nuovo look - STYLE",
        text: "Guarda il mio nuovo look generato con AI!",
        url: generatedUrl,
      });
    } else {
      await navigator.clipboard.writeText(generatedUrl);
      toast({ title: "Link copiato!" });
    }
  };

  const downloadResult = () => {
    if (!generatedUrl) return;
    const a = document.createElement("a");
    a.href = generatedUrl;
    a.download = "my-look-style.png";
    a.click();
  };

  const loadHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("look_generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory(data || []);
    setShowHistory(true);
  };

  const resetAll = () => {
    setStep("upload");
    setPhotoUrl(null);
    setPhotoFile(null);
    setSelectedStyles([]);
    setGeneratedUrl(null);
    setGenerationId(null);
    setProgress(0);
    setIsFavorite(false);
    setAutoSuggestions(null);
  };

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-24">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => (step === "upload" ? navigate(-1) : resetAll())}
                className="text-primary"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-bold flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-primary" />
                  AI Look Generator
                </h1>
                <p className="text-xs text-muted-foreground">Prova il tuo nuovo stile</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={loadHistory} className="text-primary">
              <History className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* ── STEP 1: Upload ───────────────────────────────── */}
        {step === "upload" && (
          <div className="p-4 space-y-6">
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-10 h-10 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-bold mb-2">Crea il tuo Look perfetto</h2>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                Carica una foto e l'AI genererà anteprime realistiche con il nuovo stile
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="grid grid-cols-2 gap-3">
              <Card
                className="p-6 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 transition-all active:scale-95"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.setAttribute("capture", "user");
                    fileInputRef.current.click();
                  }
                }}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Camera className="w-6 h-6 text-primary" />
                </div>
                <span className="text-sm font-medium">Scatta Foto</span>
              </Card>

              <Card
                className="p-6 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 transition-all active:scale-95"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute("capture");
                    fileInputRef.current.click();
                  }
                }}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <span className="text-sm font-medium">Carica Foto</span>
              </Card>

              <Card
                className="p-6 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 transition-all active:scale-95"
                onClick={useProfilePhoto}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <span className="text-sm font-medium">Foto Profilo</span>
              </Card>

              <Card
                className="p-6 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 transition-all active:scale-95"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute("capture");
                    fileInputRef.current.click();
                  }
                }}
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <ImagePlus className="w-6 h-6 text-primary" />
                </div>
                <span className="text-sm font-medium">Galleria</span>
              </Card>
            </div>

            {/* Features */}
            <div className="space-y-2 pt-4">
              {[
                "Taglio capelli, colore, barba, trucco",
                "Occhiali, vestiti, tatuaggi, accessori",
                "Look completi VIP, Influencer, Elegante",
                "Auto Look AI – l'AI sceglie per te",
                "Prenota direttamente il look scelto",
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 2: Style Selection ──────────────────────── */}
        {step === "styles" && (
          <div className="flex flex-col">
            {/* Photo preview */}
            <div className="relative h-48 bg-muted flex items-center justify-center overflow-hidden">
              {photoUrl && (
                <img
                  src={photoUrl}
                  alt="Your photo"
                  className="h-full w-full object-cover"
                />
              )}
              <div className="absolute bottom-2 right-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-background/80 backdrop-blur-sm text-xs"
                  onClick={getAutoSuggestions}
                >
                  <Zap className="w-3.5 h-3.5 mr-1" />
                  Auto Look AI
                </Button>
              </div>
              {selectedStyles.length > 0 && (
                <div className="absolute top-2 right-2">
                  <Badge className="bg-primary text-primary-foreground">
                    {selectedStyles.length} selezionati
                  </Badge>
                </div>
              )}
            </div>

            {/* Category tabs */}
            <Tabs value={activeCategory} onValueChange={setActiveCategory} className="flex-1">
              <div className="overflow-x-auto border-b border-border">
                <TabsList className="bg-transparent h-auto p-1 gap-1 w-max">
                  {STYLE_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const hasSelection = selectedStyles.some((s) => s.category === cat.id);
                    return (
                      <TabsTrigger
                        key={cat.id}
                        value={cat.id}
                        className={`text-xs px-3 py-2 flex items-center gap-1.5 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground ${
                          hasSelection ? "ring-2 ring-primary/50" : ""
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {cat.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              {STYLE_CATEGORIES.map((cat) => (
                <TabsContent key={cat.id} value={cat.id} className="p-3 m-0">
                  <div className="grid grid-cols-2 gap-2">
                    {cat.items.map((item) => (
                      <Card
                        key={item.name}
                        className={`p-3 cursor-pointer transition-all active:scale-95 ${
                          isSelected(cat.id, item.name)
                            ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                            : "hover:border-primary/30"
                        }`}
                        onClick={() => toggleStyle(cat.id, item.name)}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div
                            className={`w-8 h-8 rounded-lg bg-gradient-to-br ${cat.color} flex items-center justify-center`}
                          >
                            <cat.icon className="w-4 h-4 text-white" />
                          </div>
                          {item.premium && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 border-yellow-500/50 text-yellow-600">
                              <Crown className="w-2.5 h-2.5 mr-0.5" /> PRO
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium mt-1">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            {/* Generate button */}
            <div className="sticky bottom-16 p-3 bg-background/95 backdrop-blur-sm border-t border-border">
              <Button
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80"
                disabled={selectedStyles.length === 0}
                onClick={() => generateLook()}
              >
                <Wand2 className="w-5 h-5 mr-2" />
                Genera Look ({selectedStyles.length} stili)
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Generating ───────────────────────────── */}
        {step === "generating" && (
          <div className="flex flex-col items-center justify-center p-8 min-h-[60vh]">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center mb-6 animate-pulse">
              <Wand2 className="w-12 h-12 text-primary-foreground animate-spin" style={{ animationDuration: "3s" }} />
            </div>
            <h2 className="text-lg font-bold mb-2">Generazione in corso...</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              L'AI sta creando il tuo nuovo look
            </p>
            <div className="w-full max-w-xs space-y-2">
              <Progress value={progress} className="h-3" />
              <p className="text-xs text-center text-muted-foreground">{Math.round(progress)}%</p>
            </div>
            <div className="mt-8 space-y-2 text-xs text-muted-foreground">
              {progress > 10 && <p className="animate-fade-in">🔍 Analisi volto...</p>}
              {progress > 30 && <p className="animate-fade-in">✂️ Applicazione stili...</p>}
              {progress > 50 && <p className="animate-fade-in">🎨 Adattamento colori e luce...</p>}
              {progress > 70 && <p className="animate-fade-in">✨ Rifinitura realistica...</p>}
              {progress > 85 && <p className="animate-fade-in">📸 Rendering finale...</p>}
            </div>
          </div>
        )}

        {/* ── STEP 4: Result ───────────────────────────────── */}
        {step === "result" && generatedUrl && (
          <div className="space-y-4">
            {/* Result Image */}
            <div className="relative">
              <img
                src={generatedUrl}
                alt="Generated look"
                className="w-full max-h-[60vh] object-contain bg-muted"
              />
              <div className="absolute top-3 right-3 flex gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  className="bg-background/80 backdrop-blur-sm w-9 h-9"
                  onClick={toggleFavorite}
                >
                  <Bookmark className={`w-4 h-4 ${isFavorite ? "fill-primary text-primary" : ""}`} />
                </Button>
              </div>
              <div className="absolute bottom-3 left-3">
                <Badge className="bg-primary/90 text-primary-foreground backdrop-blur-sm">
                  <Sparkles className="w-3 h-3 mr-1" /> AI Generated
                </Badge>
              </div>
            </div>

            {/* Selected styles recap */}
            <div className="px-4">
              <div className="flex flex-wrap gap-1.5">
                {selectedStyles.map((s) => (
                  <Badge key={`${s.category}-${s.name}`} variant="outline" className="text-xs">
                    {s.name}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="px-4 grid grid-cols-2 gap-2">
              <Button onClick={() => setShowCompare(true)} variant="outline" className="border-primary/30">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Prima / Dopo
              </Button>
              <Button onClick={() => generateLook()} variant="outline" className="border-primary/30">
                <RotateCcw className="w-4 h-4 mr-1" />
                Rigenera
              </Button>
              <Button onClick={downloadResult} variant="outline" className="border-primary/30">
                <Download className="w-4 h-4 mr-1" />
                Salva
              </Button>
              <Button onClick={shareResult} variant="outline" className="border-primary/30">
                <Share2 className="w-4 h-4 mr-1" />
                Condividi
              </Button>
              <Button onClick={setAsProfile} className="bg-primary/10 text-primary hover:bg-primary/20">
                <User className="w-4 h-4 mr-1" />
                Usa come Profilo
              </Button>
              <Button
                onClick={() => navigate("/stylists")}
                className="bg-primary text-primary-foreground"
              >
                <CalendarPlus className="w-4 h-4 mr-1" />
                Prenota Look
              </Button>
            </div>

            {/* New look */}
            <div className="px-4 pb-4">
              <Button
                variant="outline"
                className="w-full border-primary/30 text-primary"
                onClick={resetAll}
              >
                <Wand2 className="w-4 h-4 mr-1" />
                Nuovo Look
              </Button>
            </div>
          </div>
        )}

        {/* ── Compare Dialog ──────────────────────────────── */}
        <Dialog open={showCompare} onOpenChange={setShowCompare}>
          <DialogContent className="max-w-sm p-0 overflow-hidden">
            <DialogHeader className="p-4 pb-2">
              <DialogTitle className="text-center">Prima / Dopo</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-0.5 p-2">
              <div className="relative">
                <img src={photoUrl || ""} alt="Before" className="w-full aspect-square object-cover rounded-l-lg" />
                <Badge className="absolute bottom-2 left-2 bg-background/80 text-foreground text-xs">Prima</Badge>
              </div>
              <div className="relative">
                <img src={generatedUrl || ""} alt="After" className="w-full aspect-square object-cover rounded-r-lg" />
                <Badge className="absolute bottom-2 right-2 bg-primary/80 text-primary-foreground text-xs">Dopo</Badge>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Auto Look Dialog ────────────────────────────── */}
        <Dialog open={showAutoLook} onOpenChange={setShowAutoLook}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Auto Look AI
              </DialogTitle>
            </DialogHeader>
            {!autoSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="space-y-3">
                {autoSuggestions.map((sug, i) => (
                  <Card
                    key={i}
                    className="p-3 cursor-pointer hover:border-primary/50 transition-all active:scale-[0.98]"
                    onClick={() => {
                      setSelectedStyles(sug.styles);
                      setShowAutoLook(false);
                      generateLook(sug.styles);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{sug.name}</p>
                        <p className="text-xs text-muted-foreground">{sug.description}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {sug.styles.map((s: any, j: number) => (
                            <Badge key={j} variant="outline" className="text-xs">
                              {s.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── History Dialog ──────────────────────────────── */}
        <Dialog open={showHistory} onOpenChange={setShowHistory}>
          <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Cronologia Look
              </DialogTitle>
            </DialogHeader>
            {history.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Nessun look generato ancora
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {history.map((gen) => (
                  <Card
                    key={gen.id}
                    className="overflow-hidden cursor-pointer hover:border-primary/50 transition-all"
                    onClick={() => {
                      setGeneratedUrl(gen.generated_photo_url);
                      setPhotoUrl(gen.original_photo_url);
                      setGenerationId(gen.id);
                      setIsFavorite(gen.is_favorite);
                      setStep("result");
                      setShowHistory(false);
                    }}
                  >
                    <img
                      src={gen.generated_photo_url}
                      alt="Generated"
                      className="w-full aspect-square object-cover"
                    />
                    <div className="p-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {(gen.categories || []).slice(0, 2).map((c: string) => (
                          <Badge key={c} variant="outline" className="text-xs px-1">
                            {c}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(gen.created_at).toLocaleDateString("it")}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MobileLayout>
  );
};

export default AILookGeneratorPage;
