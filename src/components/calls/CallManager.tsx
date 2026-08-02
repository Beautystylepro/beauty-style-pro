import { useEffect, useRef, useState } from "react";
import { useCall } from "@/contexts/CallContext";
import { supabase } from "@/integrations/supabase/client";
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Globe2, Volume2, Sparkles, Send, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

export default function CallManager() {
  const {
    status, incoming, localStream, remoteStream, activeKind, peerName, peerId,
    incomingTranslation, sendSignal,
    acceptCall, rejectCall, endCall, toggleMic, toggleCamera,
    stellaAnswering, dismissStellaAnswering,
  } = useCall();
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (!user) { setIsPremium(false); return; }
    (async () => {
      const { data } = await supabase
        .from("user_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      setIsPremium(!!data);
    })();
  }, [user]);

  // ---- Stella answering session state (caller side) ----
  const [stellaTranscript, setStellaTranscript] = useState<Array<{ role: "ai" | "caller"; text: string }>>([]);
  const [stellaInput, setStellaInput] = useState("");
  const [stellaBusy, setStellaBusy] = useState(false);
  const stellaAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!stellaAnswering?.active) {
      setStellaTranscript([]);
      setStellaInput("");
      stellaAudioRef.current?.pause();
      stellaAudioRef.current = null;
      return;
    }
    // Greeting
    (async () => {
      setStellaBusy(true);
      try {
        const { data } = await supabase.functions.invoke("stella-call-answer", {
          body: {
            callId: stellaAnswering.callId,
            targetUserId: stellaAnswering.peerId,
            action: "greet",
            language: (navigator.language || "it").slice(0, 2),
          },
        });
        if (data?.reply) {
          setStellaTranscript([{ role: "ai", text: data.reply }]);
          void speakStella(data.reply);
        }
      } catch { /* ignore */ }
      setStellaBusy(false);
    })();
  }, [stellaAnswering?.active, stellaAnswering?.callId, stellaAnswering?.peerId]);

  const speakStella = async (text: string) => {
    try {
      const { data } = await supabase.functions.invoke("elevenlabs-tts", {
        body: { text, voiceId: "EXAVITQu4vr4xnSDxMaL" },
      });
      if (data?.audioContent) {
        stellaAudioRef.current?.pause();
        const audio = new Audio(`data:audio/mpeg;base64,${data.audioContent}`);
        stellaAudioRef.current = audio;
        void audio.play().catch(() => {});
      }
    } catch { /* silent */ }
  };

  const sendToStella = async () => {
    const text = stellaInput.trim();
    if (!text || !stellaAnswering) return;
    setStellaInput("");
    const newT = [...stellaTranscript, { role: "caller" as const, text }];
    setStellaTranscript(newT);
    setStellaBusy(true);
    try {
      const { data } = await supabase.functions.invoke("stella-call-answer", {
        body: {
          callId: stellaAnswering.callId,
          targetUserId: stellaAnswering.peerId,
          userSaid: text,
          transcript: newT,
          action: "reply",
          language: (navigator.language || "it").slice(0, 2),
        },
      });
      if (data?.reply) {
        setStellaTranscript((p) => [...p, { role: "ai", text: data.reply }]);
        void speakStella(data.reply);
        if (data.action === "booking") toast.success("Appuntamento registrato ✅");
        if (data.action === "message") toast.success("Messaggio inviato in chat 💬");
        if (data.action === "end" || data.action === "transfer") {
          setTimeout(() => dismissStellaAnswering?.(), 2500);
        }
      }
    } catch {
      toast.error("Stella non risponde");
    } finally {
      setStellaBusy(false);
    }
  };

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const speechRecRef = useRef<any>(null);
  const translationAudioRef = useRef<HTMLAudioElement | null>(null);
  const isProcessingRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // What I just said, and its translation — shown to me as confirmation
  // that it was actually sent to the other person.
  const [mySpeechTranslation, setMySpeechTranslation] = useState("");
  const [callTranslating, setCallTranslating] = useState(false);
  const [callTargetLang, setCallTargetLang] = useState(
    typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "it",
  );
  const [manualLangOverride, setManualLangOverride] = useState(false);
  // What the OTHER person said, already translated into MY language —
  // this is the subtitle + audio that actually reaches me during the call.
  const [peerTranslationText, setPeerTranslationText] = useState("");
  const lastPlayedTranslationTs = useRef(0);

  // Auto-detect which language to translate INTO: the peer's own
  // preferred language (set at their registration), not a language the
  // local user has to pick manually — "riconoscimento automatico in base
  // a chi parla". A manual override remains available for edge cases.
  useEffect(() => {
    if (!peerId || manualLangOverride) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("preferred_language").eq("user_id", peerId).maybeSingle();
      if (data?.preferred_language) setCallTargetLang(data.preferred_language);
    })();
  }, [peerId, manualLangOverride]);

  // Play + show whatever the peer's device just sent us via the call
  // signaling channel (their speech, already translated into my language).
  useEffect(() => {
    if (!incomingTranslation || incomingTranslation.ts === lastPlayedTranslationTs.current) return;
    lastPlayedTranslationTs.current = incomingTranslation.ts;
    setPeerTranslationText(incomingTranslation.text);
    if (incomingTranslation.audioBase64) {
      try {
        translationAudioRef.current?.pause();
        const audio = new Audio(`data:audio/mpeg;base64,${incomingTranslation.audioBase64}`);
        translationAudioRef.current = audio;
        void audio.play().catch(() => {});
      } catch { /* best-effort, ignore */ }
    }
  }, [incomingTranslation]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (status !== "in-call") {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const stopLiveTranslation = () => {
    speechRecRef.current?.stop?.();
    speechRecRef.current = null;
    if (translationAudioRef.current) {
      translationAudioRef.current.pause();
      translationAudioRef.current = null;
    }
    setMySpeechTranslation("");
    setPeerTranslationText("");
    setCallTranslating(false);
  };

  useEffect(() => {
    if (!["connecting", "in-call", "ringing-out"].includes(status)) {
      stopLiveTranslation();
    }
  }, [status]);

  const startLiveTranslation = () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      toast.error("Traduzione vocale non supportata su questo dispositivo");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    // Web Speech API requires knowing the spoken language in advance —
    // there's no true "auto-detect what's being said" mode in the
    // browser itself. We use the LOCAL user's own registered language as
    // the best available default (more reliable than the browser's
    // generic locale, which is often wrong on shared/travel devices),
    // but if the actual speaker uses a different language than their
    // profile says, transcription quality will suffer — a real
    // limitation of the underlying browser technology, not something we
    // can fully engineer around client-side. The translation step itself
    // (Claude, via ai-translate) still auto-detects the SOURCE language
    // from the transcribed text regardless of this setting.
    const STT_LOCALES: Record<string, string> = {
      it: "it-IT", en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE",
      pt: "pt-PT", ar: "ar-SA", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR",
      ru: "ru-RU", hi: "hi-IN", tr: "tr-TR", nl: "nl-NL", pl: "pl-PL", sv: "sv-SE",
    };
    recognition.lang = STT_LOCALES[profile?.preferred_language || "it"] || "it-IT";

    recognition.onresult = async (event: any) => {
      const lastResult = event.results[event.results.length - 1];
      const spokenText = lastResult?.[0]?.transcript?.trim();
      if (!spokenText) return;

      if (!lastResult.isFinal) {
        setMySpeechTranslation(`${spokenText}...`);
        return;
      }

      if (isProcessingRef.current || spokenText.length < 2) return;
      isProcessingRef.current = true;
      setCallTranslating(true);

      try {
        const { data, error } = await supabase.functions.invoke("elevenlabs-translate-speak", {
          body: { spokenText, targetLanguage: callTargetLang },
        });

        if (error) throw error;

        const translated = data?.translatedText || spokenText;
        setMySpeechTranslation(translated);

        // Send the translated text + voice to the OTHER person in the
        // call, via the same signaling channel already used for WebRTC —
        // this is what makes it useful for two real people speaking
        // different languages, instead of only translating for yourself.
        if (peerId) {
          void sendSignal("translation", peerId, {
            text: translated,
            audio: data?.audioAvailable ? data?.audioBase64 : null,
          }, activeKind).catch(() => {});
        }
      } catch {
        setMySpeechTranslation(spokenText);
      } finally {
        setCallTranslating(false);
        isProcessingRef.current = false;
      }
    };

    recognition.onerror = () => {
      setCallTranslating(false);
      isProcessingRef.current = false;
    };

    recognition.start();
    speechRecRef.current = recognition;
    toast.success("Traduzione vocale realtime attiva");
  };

  if (status === "ringing-in" && incoming) {
    return (
      <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8 animate-in fade-in zoom-in duration-300">
          <Avatar className="w-32 h-32 mx-auto mb-4 ring-4 ring-primary animate-pulse">
            <AvatarImage src={incoming.fromAvatar} />
            <AvatarFallback className="text-3xl">{incoming.fromName?.[0] || "?"}</AvatarFallback>
          </Avatar>
          <h2 className="text-2xl font-bold mb-1">{incoming.fromName || "Sconosciuto"}</h2>
          <p className="text-muted-foreground flex items-center justify-center gap-2">
            {incoming.kind === "video" ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            Chiamata {incoming.kind === "video" ? "video" : "audio"} in arrivo...
          </p>
        </div>
        <div className="flex gap-12">
          <Button size="lg" variant="destructive" className="rounded-full w-16 h-16 p-0" onClick={rejectCall}>
            <PhoneOff className="w-7 h-7" />
          </Button>
          <Button size="lg" className="rounded-full w-16 h-16 p-0" onClick={acceptCall}>
            <Phone className="w-7 h-7" />
          </Button>
        </div>
      </div>
    );
  }

  if (status === "ringing-out" || status === "connecting" || status === "in-call") {
    const isVideo = activeKind === "video";
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col">
        <div className="relative flex-1 overflow-hidden">
          {isVideo && remoteStream ? (
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-white">
              <Avatar className="w-40 h-40 mb-6 ring-4 ring-primary">
                <AvatarFallback className="text-4xl bg-primary/20">{peerName?.[0] || "?"}</AvatarFallback>
              </Avatar>
              <h2 className="text-2xl font-bold">{peerName || "Chiamata"}</h2>
              <p className="text-white/70 mt-2">
                {status === "ringing-out" && "Squillo..."}
                {status === "connecting" && "Connessione..."}
                {status === "in-call" && `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}
              </p>
            </div>
          )}

          {isVideo && localStream && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute top-4 right-4 w-32 h-44 rounded-xl object-cover border-2 border-white/30 shadow-xl"
            />
          )}

          <div className="absolute top-4 left-4 flex items-center gap-2">
            {status === "in-call" && (
              <div className="bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
              </div>
            )}
            <select
              value={callTargetLang}
              onChange={(e) => { setCallTargetLang(e.target.value); setManualLangOverride(true); }}
              title="Lingua rilevata automaticamente dall'altra persona — cambiala solo se necessario"
              className="bg-black/50 text-white border border-white/15 rounded-full px-3 py-1 text-sm"
            >
              <option value="it">IT</option>
              <option value="en">EN</option>
              <option value="es">ES</option>
              <option value="fr">FR</option>
              <option value="de">DE</option>
              <option value="pt">PT</option>
              <option value="ar">AR</option>
              <option value="zh">ZH</option>
              <option value="ja">JA</option>
              <option value="ko">KO</option>
              <option value="ru">RU</option>
              <option value="hi">HI</option>
              <option value="tr">TR</option>
              <option value="nl">NL</option>
              <option value="pl">PL</option>
              <option value="sv">SV</option>
            </select>
          </div>

          {peerTranslationText && (
            <div className="absolute left-4 right-4 bottom-28 bg-black/65 backdrop-blur rounded-2xl px-4 py-3 text-white border border-white/10">
              <div className="flex items-center gap-2 text-xs text-white/70 mb-1">
                <Globe2 className="w-3.5 h-3.5" />
                {peerName || "L'altra persona"} ha detto
              </div>
              <p className="text-sm leading-relaxed">{peerTranslationText}</p>
            </div>
          )}
          {mySpeechTranslation && (
            <div className="absolute left-4 right-4 bottom-14 bg-primary/70 backdrop-blur rounded-2xl px-4 py-2 text-white border border-white/10">
              <div className="flex items-center gap-2 text-[11px] text-white/80 mb-0.5">
                <Globe2 className="w-3 h-3" />
                Tu (tradotto e inviato)
                {callTranslating && <span className="w-2 h-2 rounded-full bg-white animate-pulse" />}
              </div>
              <p className="text-xs leading-relaxed">{mySpeechTranslation}</p>
            </div>
          )}
        </div>

        <div className="bg-black/80 backdrop-blur p-6 flex justify-center gap-4 sm:gap-6">
          <Button
            size="lg"
            variant="secondary"
            className="rounded-full w-14 h-14 p-0"
            onClick={() => {
              const nextMuted = !muted;
              setMuted(nextMuted);
              toggleMic(!nextMuted);
            }}
          >
            {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </Button>

          {isVideo && (
            <Button
              size="lg"
              variant="secondary"
              className="rounded-full w-14 h-14 p-0"
              onClick={() => {
                const nextCamOff = !camOff;
                setCamOff(nextCamOff);
                toggleCamera(!nextCamOff);
              }}
            >
              {camOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </Button>
          )}

          <Button
            size="lg"
            variant={speechRecRef.current ? "default" : "secondary"}
            className="rounded-full w-14 h-14 p-0"
            onClick={() => {
              if (!isPremium) {
                toast.info("Traduzione vocale live disponibile con abbonamento Pro", {
                  action: { label: "Scopri", onClick: () => nav("/subscriptions") },
                });
                return;
              }
              if (speechRecRef.current) stopLiveTranslation();
              else startLiveTranslation();
            }}
          >
            {!isPremium ? <Crown className="w-6 h-6 text-yellow-500" /> : speechRecRef.current ? <Volume2 className="w-6 h-6" /> : <Globe2 className="w-6 h-6" />}
          </Button>

          <Button size="lg" variant="destructive" className="rounded-full w-14 h-14 p-0" onClick={() => endCall(true)}>
            <PhoneOff className="w-6 h-6" />
          </Button>
        </div>
      </div>
    );
  }

  if (stellaAnswering?.active) {
    return (
      <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-md flex flex-col p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold">Stella AI risponde per {stellaAnswering.peerName}</div>
              <div className="text-[11px] text-muted-foreground">Segreteria intelligente</div>
            </div>
          </div>
          <Button type="button" aria-label="Chiudi" size="sm" variant="ghost" onClick={() => dismissStellaAnswering?.()}>
            <PhoneOff className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pb-4">
          {stellaTranscript.map((m, i) => (
            <div key={i} className={`flex ${m.role === "caller" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "caller" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {stellaBusy && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-3 py-2 text-xs text-muted-foreground animate-pulse">Stella sta scrivendo…</div>
            </div>
          )}
        </div>

        <div className="flex gap-2 items-end">
          <textarea
            value={stellaInput}
            onChange={(e) => setStellaInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendToStella(); } }}
            placeholder="Scrivi a Stella (info, appuntamento, messaggio)…"
            rows={2}
            className="flex-1 resize-none rounded-2xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button type="button" aria-label="Invia" onClick={sendToStella} disabled={stellaBusy || !stellaInput.trim()} className="rounded-full w-11 h-11 p-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
