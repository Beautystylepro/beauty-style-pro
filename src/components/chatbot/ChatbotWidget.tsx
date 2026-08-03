import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, X, Send, Sparkles, Minimize2, Maximize2,
  Calendar, MapPin, ShoppingBag, Video, Wallet, Briefcase,
  Star, Radio, Bot, User, Loader2, Mic, MicOff, Phone, PhoneOff, HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import useChatbot from "@/hooks/useChatbot";
import { streamChat } from "@/lib/streamChat";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceRecognition } from "@/hooks/useVoiceRecognition";
import { useStellaVoiceActions } from "@/hooks/useStellaVoiceActions";
import { useVoiceSynthesis } from "@/hooks/useVoiceSynthesis";
import { useTheme } from "@/hooks/useTheme";
import { toast } from "sonner";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const quickActions = [
  { icon: Calendar, label: "Prenota", desc: "Trova professionisti", path: "/booking", color: "text-pink-400" },
  { icon: MapPin, label: "Mappa", desc: "Cerca vicino a te", path: "/map-search", color: "text-blue-400" },
  { icon: ShoppingBag, label: "Shop", desc: "Prodotti beauty", path: "/shop", color: "text-amber-400" },
  { icon: Video, label: "Live", desc: "Streaming beauty", path: "/go-live", color: "text-red-400" },
  { icon: Wallet, label: "Wallet", desc: "Saldo e pagamenti", path: "/wallet", color: "text-green-400" },
  { icon: Briefcase, label: "Lavoro", desc: "Offerte beauty", path: "/hr", color: "text-purple-400" },
  { icon: Star, label: "Sfide", desc: "Missioni e premi", path: "/challenges", color: "text-yellow-400" },
  { icon: Radio, label: "Radio", desc: "Musica beauty", path: "/radio", color: "text-cyan-400" },
];

interface Props {
  className?: string;
}

export default function ChatbotWidget({ className = "" }: Props) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { setTheme } = useTheme();
  const {
    suggestions,
    showChatbot,
    setShowChatbot,
    handleSuggestionClick,
    dismissSuggestion,
  } = useChatbot();

  const [isMinimized, setIsMinimized] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "actions" | "tips">("chat");
  const [showVoiceHelp, setShowVoiceHelp] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Ciao${profile?.display_name ? ` ${profile.display_name}` : ""}! 👋 Sono Stella AI. Chiedimi qualsiasi cosa!`,
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isAILoading, setIsAILoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Draggable FAB state
  const [fabPos, setFabPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0, moved: false });
  const fabRef = useRef<HTMLButtonElement>(null);

  // Voice call state
  const [isVoiceCallActive, setIsVoiceCallActive] = useState(false);
  const [voicePhase, setVoicePhase] = useState<"listening" | "processing" | "speaking">("listening");
  const processedVoiceCommandRef = useRef<string | null>(null);
  
  const { processVoiceCommand: executeVoiceCommand } = useStellaVoiceActions();
  const { speak, speaking: isSpeaking } = useVoiceSynthesis({ rate: 1.05, pitch: 1.05 });

  const {
    isListening: isVoiceListening,
    transcript: voiceTranscript,
    interimTranscript,
    isSupported: voiceSupported,
    isWakeWordListening,
    startListening: beginVoiceListening,
    stopListening,
    resetTranscript,
    startWakeWordListening,
    stopWakeWordListening,
  } = useVoiceRecognition({
    continuous: false,
    wakeWordEnabled: true,
    wakeWords: ['stella', 'hey stella', 'ehi stella', 'ciao stella', 'ok stella'],
    onWakeWordDetected: (command) => {
      setIsVoiceCallActive(true);
      if (command?.trim()) {
        processedVoiceCommandRef.current = command.trim();
        setVoicePhase("processing");
        toast(`🎙️ Stella: "${command.trim()}"`, { duration: 2000 });
        return;
      }

      setVoicePhase("listening");
      toast("🎙️ Stella ti ascolta...", { duration: 2000 });
    },
  });

  const fallbackRecorderRef = useRef<MediaRecorder | null>(null);

  // Il riconoscimento vocale nativo del browser (webkitSpeechRecognition)
  // non è disponibile su tutti i dispositivi/browser (es. Firefox, alcuni
  // browser mobili) — prima l'utente vedeva solo un errore e il
  // microfono smetteva di funzionare del tutto. Ora, se non è
  // disponibile, registriamo l'audio grezzo e lo mandiamo a
  // voice-transcribe (Gemini), lo stesso sistema robusto già usato per
  // le chiamate — funziona su qualsiasi dispositivo con un microfono,
  // indipendentemente dal supporto del browser.
  const startFallbackRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsVoiceCallActive(true);
      setVoicePhase("listening");
      toast("🎙️ Stella ti ascolta...", { duration: 4000 });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 2000) {
          toast.error("Non ho sentito nulla, riprova.");
          setIsVoiceCallActive(false);
          return;
        }
        setVoicePhase("processing");
        const reader = new FileReader();
        reader.onloadend = async () => {
          const audioBase64 = String(reader.result).split(",")[1] || "";
          const { data, error } = await supabase.functions.invoke("voice-transcribe", {
            body: { audioBase64, mimeType },
          });
          const spokenText: string = (data?.transcript || "").trim();
          if (error || !spokenText) {
            toast.error("Non sono riuscita a capire, riprova.");
            setIsVoiceCallActive(false);
            return;
          }
          await processVoiceCommand(spokenText);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      fallbackRecorderRef.current = recorder;
      // Automatic stop after 5s of listening — a fixed-duration capture,
      // simplest reliable approach for a single voice command.
      window.setTimeout(() => {
        try { recorder.stop(); } catch { /* already stopped */ }
      }, 5000);
    } catch {
      toast.error("Permesso microfono negato. Attivalo nelle impostazioni del browser.");
      setIsVoiceCallActive(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(() => {
    if (!voiceSupported) {
      void startFallbackRecording();
      return;
    }

    setIsVoiceCallActive(true);
    setVoicePhase("listening");
    resetTranscript();
    stopWakeWordListening();
    window.setTimeout(() => {
      beginVoiceListening();
    }, 250);
  }, [voiceSupported, beginVoiceListening, resetTranscript, stopWakeWordListening, startFallbackRecording]);

  useEffect(() => {
    if (!voiceSupported) return;
    const timer = window.setTimeout(() => {
      try { startWakeWordListening(); } catch { /* ignore */ }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [voiceSupported, startWakeWordListening]);

  useEffect(() => {
    if (isVoiceCallActive || !voiceSupported || isWakeWordListening) return;
    const timer = window.setTimeout(() => {
      try { startWakeWordListening(); } catch { /* ignore */ }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [isVoiceCallActive, voiceSupported, isWakeWordListening, startWakeWordListening]);

  useEffect(() => {
    const directWakeWordCommand = processedVoiceCommandRef.current;

    if (directWakeWordCommand) {
      processedVoiceCommandRef.current = null;
      processVoiceCommand(directWakeWordCommand);
      return;
    }

    if (isVoiceCallActive && voiceTranscript.trim() && !isVoiceListening) {
      processVoiceCommand(voiceTranscript.trim());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVoiceCallActive, voiceTranscript, isVoiceListening]);

  const processVoiceCommand = async (command: string) => {
    if (!command) return;
    setVoicePhase("processing");

    // 1. Try local pattern matching first (instant)
    const result = executeVoiceCommand(command);
    if (result.matched) {
      if (result.action === "theme:light") setTheme("light");
      else if (result.action === "theme:dark") setTheme("dark");
      setVoicePhase("speaking");
      speak(result.response);
      toast.success(`🌟 Stella: ${result.response}`);
      setTimeout(() => endVoiceCall(), Math.max(800, result.response.length * 15));
      return;
    }

    // 2. Call stella-intent AI for smart action parsing
    try {
      const { data, error } = await supabase.functions.invoke('stella-intent', {
        body: {
          text: command,
          context: {
            user_type: profile?.user_type || 'client',
            user_name: profile?.display_name || 'User',
            gender: (profile as any)?.gender || 'unknown',
            color_theme: (profile as any)?.color_theme || 'female',
            qr_coins: profile?.qr_coins || 0,
            current_page: window.location.pathname,
          },
        },
      });

      if (error) throw error;

      const { intent, params, response: aiResponse } = data || {};
      const displayResponse = aiResponse || 'Sono qui per aiutarti!';

      // Execute the AI-parsed intent
      if (intent && intent !== 'chat') {
        setVoicePhase("speaking");
        speak(displayResponse.length > 200 ? displayResponse.substring(0, 200) : displayResponse);
        toast.success(`🌟 Stella: ${displayResponse.substring(0, 100)}`);

        switch (intent) {
          case 'navigate':
            if (params?.route) navigate(params.route);
            break;
          case 'search':
            navigate(`/search?q=${encodeURIComponent(params?.query || command)}`);
            break;
          case 'show_profile':
            if (params?.name) navigate(`/search?q=${encodeURIComponent(params.name)}`);
            else navigate('/profile');
            break;
          case 'like':
            toast.success('❤️ Like aggiunto!');
            break;
          case 'follow':
            if (params?.target_name) navigate(`/search?q=${encodeURIComponent(params.target_name)}`);
            break;
          case 'send_message':
            navigate('/chat');
            break;
          case 'book':
            if (params?.target_name) navigate(`/search?q=${encodeURIComponent(params.target_name)}`);
            else navigate('/stylists');
            break;
          case 'scroll':
            if (params?.direction === 'up') window.scrollBy({ top: -400, behavior: 'smooth' });
            else if (params?.direction === 'down') window.scrollBy({ top: 400, behavior: 'smooth' });
            else if (params?.direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
            else if (params?.direction === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            break;
          case 'theme':
            if (params?.mode === 'dark') setTheme('dark');
            else setTheme('light');
            break;
          case 'share':
            if (navigator.share) navigator.share({ title: 'STYLE', url: window.location.href }).catch(() => {});
            else navigator.clipboard.writeText(window.location.href);
            break;
          case 'refresh':
            setTimeout(() => window.location.reload(), 500);
            break;
          case 'back':
            window.history.back();
            break;
          case 'info':
            if (params?.info_type === 'coins') toast.success(`💰 Hai ${profile?.qr_coins ?? 0} QR Coins`);
            else if (params?.info_type === 'bookings') navigate('/my-bookings');
            break;
          default:
            break;
        }

        // Add to chat for context
        setChatMessages(prev => [
          ...prev,
          { id: Date.now().toString(), role: "user" as const, content: command },
          { id: (Date.now() + 1).toString(), role: "assistant" as const, content: displayResponse },
        ]);

        setTimeout(() => endVoiceCall(), Math.max(800, displayResponse.length * 15));
        return;
      }

      // 3. Pure chat intent — show in panel with streaming
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: "user" as const, content: command }]);
      setChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "assistant" as const, content: displayResponse }]);
      setVoicePhase("speaking");
      speak(displayResponse.length > 300 ? displayResponse.slice(0, 300) + "..." : displayResponse);
      setIsMinimized(false);
      setTimeout(() => endVoiceCall(), Math.max(800, displayResponse.length * 15));

    } catch {
      // Fallback: stream chat if stella-intent fails
      const userMsg: ChatMsg = { id: Date.now().toString(), role: "user", content: command };
      setChatMessages(prev => [...prev, userMsg]);
      setIsMinimized(false);
      setIsAILoading(true);
      setVoicePhase("speaking");

      const history = [...chatMessages.filter(m => m.id !== "welcome"), userMsg].map(m => ({
        role: m.role, content: m.content,
      }));

      let assistantSoFar = "";
      try {
        await streamChat({
          userId: user?.id,
          messages: history as any,
          onDelta: (chunk) => {
            assistantSoFar += chunk;
            const currentContent = assistantSoFar;
            setChatMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && last.id === "streaming") {
                return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: currentContent } : m);
              }
              return [...prev, { id: "streaming", role: "assistant" as const, content: currentContent }];
            });
          },
          onDone: () => {
            setChatMessages(prev => prev.map(m => m.id === "streaming" ? { ...m, id: (Date.now() + 1).toString() } : m));
            if (assistantSoFar) speak(assistantSoFar.length > 300 ? assistantSoFar.slice(0, 300) + "..." : assistantSoFar);
            setIsAILoading(false);
            endVoiceCall();
          },
          onError: () => { speak("Mi dispiace, riprova tra poco!"); setIsAILoading(false); endVoiceCall(); },
        });
      } catch {
        speak("Errore nella risposta. Riprova.");
        setIsAILoading(false);
        endVoiceCall();
      }
    }
  };

  const endVoiceCall = useCallback(() => {
    processedVoiceCommandRef.current = null;
    stopListening();
    resetTranscript();
    setIsVoiceCallActive(false);
    setVoicePhase("listening");
    window.setTimeout(() => {
      try { startWakeWordListening(); } catch { /* ignore */ }
    }, 700);
  }, [stopListening, resetTranscript, startWakeWordListening]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (profile?.display_name) {
      setChatMessages(prev => prev.map(m => 
        m.id === "welcome"
          ? { ...m, content: `Ciao ${profile.display_name}! 👋 Sono Stella AI. Chiedimi qualsiasi cosa!` }
          : m
      ));
    }
  }, [profile?.display_name]);

  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isAILoading) return;

    const userMsg: ChatMsg = { id: Date.now().toString(), role: "user", content: text };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsAILoading(true);

    const history = [...chatMessages.filter(m => m.id !== "welcome"), userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    let assistantSoFar = "";

    const upsertAssistant = (nextChunk: string) => {
      assistantSoFar += nextChunk;
      const currentContent = assistantSoFar;
      setChatMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.id === "streaming") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: currentContent } : m);
        }
        return [...prev, { id: "streaming", role: "assistant" as const, content: currentContent }];
      });
    };

    try {
      await streamChat({
        userId: user?.id,
        messages: history as any,
        onDelta: (chunk) => upsertAssistant(chunk),
        onDone: () => {
          setChatMessages(prev => prev.map(m =>
            m.id === "streaming" ? { ...m, id: (Date.now() + 1).toString() } : m
          ));
          setIsAILoading(false);
        },
        onError: (error) => {
          toast.error(error);
          setChatMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "Mi dispiace, riprova tra poco! 🙏",
          }]);
          setIsAILoading(false);
        },
      });
    } catch (err: any) {
      console.error("AI stream error:", err);
      toast.error("Errore nella risposta AI");
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Mi dispiace, riprova tra poco! 🙏",
      }]);
      setIsAILoading(false);
    }
  }, [chatInput, isAILoading, user, chatMessages]);

  const suggestedQuestions = [
    "Quale taglio va di moda?",
    "Come curare i capelli ricci?",
    "Come funziona il wallet?",
    "Trova un parrucchiere vicino",
    "Come prenotare un servizio?",
    "Come andare in live?",
  ];

  if (!showChatbot && !isMinimized) return null;

  const panelHeight = isFullscreen ? "h-[85vh]" : "h-[28rem]";

  return (
    <div className={`fixed z-50 ${className}`} style={{ bottom: 80, right: 16 }}>
      {/* Voice Call — minimal floating indicator (no full screen) */}
      <AnimatePresence>
        {isVoiceCallActive && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-36 left-1/2 -translate-x-1/2 z-[200] bg-card/95 backdrop-blur-xl border border-primary/30 rounded-2xl shadow-2xl px-5 py-4 flex flex-col items-center gap-2 w-[260px]"
          >
            <div className="flex items-center gap-3 w-full">
              <div className={`w-10 h-10 rounded-full gradient-primary flex items-center justify-center shadow-glow ${isSpeaking ? "animate-pulse" : ""}`}>
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-primary">Stella</p>
                <p className="text-xs text-muted-foreground truncate">
                  {isSpeaking && "🔊 Rispondo..."}
                  {!isSpeaking && voicePhase === "listening" && "🎤 Ti ascolto..."}
                  {!isSpeaking && voicePhase === "processing" && "⚡ Eseguo..."}
                  {!isSpeaking && voicePhase === "speaking" && "✓ Fatto!"}
                </p>
              </div>
              <button onClick={endVoiceCall} className="w-8 h-8 rounded-full bg-destructive flex items-center justify-center">
                <PhoneOff className="w-4 h-4 text-destructive-foreground" />
              </button>
            </div>

            {(voiceTranscript || interimTranscript) && (
              <p className="text-xs text-center text-muted-foreground italic px-2">
                "{voiceTranscript || interimTranscript}"
              </p>
            )}

            {voicePhase === "listening" && (
              <div className="flex items-center gap-0.5">
                {[0, 1, 2, 3, 4].map(i => (
                  <motion.div
                    key={i}
                    animate={{ height: [4, 16, 4] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                    className="w-1 rounded-full bg-primary"
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={`bg-card/98 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl ${
              isFullscreen ? "w-[calc(100vw-2rem)] max-w-md" : "w-80"
            } ${panelHeight} flex flex-col overflow-hidden transition-all duration-300`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-gradient-to-r from-primary/10 to-accent/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">Stella AI</h4>
                  <p className="text-xs text-muted-foreground">
                    {isWakeWordListening ? '🎙️ Dì "Stella" per attivare' : "Assistente STYLE"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Voice commands help */}
                <button
                  onClick={() => setShowVoiceHelp(true)}
                  title="Comandi vocali disponibili"
                  className="w-7 h-7 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                {/* Voice call button */}
                <button 
                  onClick={() => { setIsVoiceCallActive(true); setVoicePhase("listening"); startListening(); }}
                  className="w-7 h-7 rounded-lg bg-primary/20 hover:bg-primary/30 flex items-center justify-center transition-colors"
                >
                  <Mic className="w-3.5 h-3.5 text-primary" />
                </button>
                <button onClick={() => setIsFullscreen(!isFullscreen)}
                  className="w-7 h-7 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors">
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setIsMinimized(true)}
                  className="w-7 h-7 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/50">
              {[
                { key: "chat" as const, label: "💬 Chat AI" },
                { key: "actions" as const, label: "⚡ Azioni" },
                { key: "tips" as const, label: `💡 Tips${suggestions.length > 0 ? ` (${suggestions.length})` : ""}` },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 px-2 py-2 text-[11px] font-semibold transition-colors ${
                    activeTab === tab.key
                      ? "bg-primary/10 text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {activeTab === "chat" && (
                <>
                  <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                    {chatMessages.map(msg => (
                      <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === "assistant" ? "gradient-primary" : "bg-muted"
                        }`}>
                          {msg.role === "assistant" ? (
                            <Bot className="w-3.5 h-3.5 text-primary-foreground" />
                          ) : (
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </div>
                        <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                          msg.role === "user"
                            ? "gradient-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted/60 border border-border/30 rounded-bl-sm"
                        }`}>
                          <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        </div>
                      </div>
                    ))}

                    {isAILoading && chatMessages[chatMessages.length - 1]?.id !== "streaming" && (
                      <div className="flex gap-2">
                        <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                          <Bot className="w-3.5 h-3.5 text-primary-foreground" />
                        </div>
                        <div className="bg-muted/60 border border-border/30 rounded-2xl rounded-bl-sm px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                            <span className="text-[11px] text-muted-foreground">Sto pensando...</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {chatMessages.length <= 2 && !isAILoading && (
                      <div className="pt-1">
                        <p className="text-xs text-muted-foreground font-medium mb-1.5">Prova a chiedere:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {suggestedQuestions.map(q => (
                            <button key={q} onClick={() => setChatInput(q)}
                              className="px-2.5 py-1 rounded-full bg-muted/50 border border-border/30 text-xs hover:border-primary/40 transition-colors">
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t border-border/50 px-3 py-2.5">
                    <div className="flex gap-2">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                        placeholder="Chiedi qualsiasi cosa..."
                        className="flex-1 h-9 rounded-full bg-muted/50 px-3.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                        disabled={isAILoading}
                      />
                      <button onClick={sendMessage} disabled={!chatInput.trim() || isAILoading}
                        className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center shadow-glow disabled:opacity-50 transition-opacity">
                        <Send className="w-4 h-4 text-primary-foreground" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeTab === "actions" && (
                <div className="flex-1 overflow-y-auto p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-3">Cosa vuoi fare?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {quickActions.map(action => (
                      <motion.button key={action.path} whileTap={{ scale: 0.97 }}
                        onClick={() => { navigate(action.path); setIsMinimized(true); }}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/40 border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all">
                        <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center">
                          <action.icon className={`w-5 h-5 ${action.color}`} />
                        </div>
                        <span className="text-xs font-semibold">{action.label}</span>
                        <span className="text-xs text-muted-foreground">{action.desc}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "tips" && (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {suggestions.length === 0 ? (
                    <div className="text-center py-8">
                      <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                      <p className="text-xs text-muted-foreground">Nessun suggerimento al momento</p>
                      <p className="text-xs text-muted-foreground mt-1">Continua a usare l'app!</p>
                    </div>
                  ) : (
                    suggestions.map((suggestion) => (
                      <motion.div key={suggestion.suggestion_id}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        className="bg-muted/40 rounded-xl p-3 border border-border/30">
                        <p className="text-xs mb-2">{suggestion.content}</p>
                        <div className="flex gap-1.5 items-center">
                          {suggestion.action_buttons.map((btn, idx) => (
                            <button key={idx}
                              onClick={() => {
                                handleSuggestionClick(suggestion, btn);
                                if (btn.action === "navigate") setIsMinimized(true);
                              }}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                btn.action === "dismiss"
                                  ? "bg-muted text-muted-foreground hover:bg-muted/80"
                                  : "bg-primary text-primary-foreground hover:bg-primary/90"
                              }`}>
                              {btn.text}
                            </button>
                          ))}
                          <button onClick={() => dismissSuggestion(suggestion)}
                            className="ml-auto w-5 h-5 rounded text-muted-foreground hover:text-foreground flex items-center justify-center">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single Stella AI Floating Button — Draggable */}
      {isMinimized && (
        <motion.button
          ref={fabRef}
          type="button"
          aria-label="Apri Stella AI"
          drag
          dragConstraints={{ left: -300, right: 0, top: -500, bottom: 0 }}
          dragElastic={0.1}
          whileDrag={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setIsMinimized(false)}
          className="fixed z-[9999] right-4 bottom-[88px] w-14 h-14 rounded-full gradient-primary flex items-center justify-center shadow-glow cursor-grab active:cursor-grabbing"
        >
          {/* Rotating sparkle animation */}
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          >
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </motion.div>

          {/* Pulse ring animation */}
          <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" style={{ animationDuration: "3s" }} />

          {/* Suggestions badge */}
          {suggestions.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
              {suggestions.length}
            </span>
          )}
        </motion.button>
      )}

      {/* Voice commands help sheet */}
      <AnimatePresence>
        {showVoiceHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-background/80 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setShowVoiceHelp(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="w-full max-w-md bg-card border border-border rounded-t-3xl shadow-2xl p-5 pb-10"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Comandi Vocali Stella</h3>
                  <p className="text-xs text-muted-foreground">Parla senza toccare lo schermo</p>
                </div>
                <button onClick={() => setShowVoiceHelp(false)} className="ml-auto w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {[
                  { title: "🚀 Attivazione", cmds: ['"Stella" oppure "Hey Stella"', '"Ciao Stella"', '"Ok Stella"'] },
                  { title: "📱 Navigazione", cmds: ['"Vai alla home"', '"Apri chat"', '"Apri mappa"', '"Apri wallet"', '"Apri shop"', '"Torna indietro"', '"Apri profilo"', '"Apri impostazioni"', '"Vai allo shop"', '"Apri live"', '"Apri radio"'] },
                  { title: "💬 Messaggi", cmds: ['"Invia messaggio a [nome]"', '"Scrivi a [nome]: [testo]"', '"Chiama [nome]"'] },
                  { title: "🔍 Ricerca", cmds: ['"Cerca [termine]"', '"Cerca match a 10 km"', '"Trova stilisti vicini"'] },
                  { title: "🎬 Azioni", cmds: ['"Prenota"', '"Crea post"', '"Vai in live"', '"Gira la ruota"', '"Apri notifiche"', '"Le mie prenotazioni"'] },
                  { title: "🎨 Tema", cmds: ['"Tema scuro"', '"Tema chiaro"', '"Dark mode"'] },
                  { title: "❓ AI libero", cmds: ['Dopo "Stella", fai qualsiasi domanda:', '"Quale taglio di capelli va di moda?"', '"Come funziona il wallet?"'] },
                ].map(section => (
                  <div key={section.title}>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{section.title}</p>
                    <div className="space-y-1">
                      {section.cmds.map(cmd => (
                        <div key={cmd} className="px-3 py-1.5 rounded-lg bg-muted/40 border border-border/30">
                          <p className="text-xs font-medium">{cmd}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => { setIsVoiceCallActive(true); setVoicePhase("listening"); startListening(); setShowVoiceHelp(false); }}
                className="w-full mt-4 h-11 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
              >
                <Mic className="w-4 h-4" /> Inizia adesso
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
