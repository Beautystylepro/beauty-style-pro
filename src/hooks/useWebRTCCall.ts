import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type CallKind = "audio" | "video";
export type CallStatus = "idle" | "ringing-out" | "ringing-in" | "connecting" | "in-call" | "ended";

export interface IncomingCall {
  callId: string;
  fromUser: string;
  fromName?: string;
  fromAvatar?: string;
  kind: CallKind;
}

// BUG TROVATO: prima c'erano solo server STUN, nessun server TURN.
// STUN aiuta a scoprire il proprio indirizzo pubblico, ma su reti
// mobili (molto comuni in Italia) o wifi con restrizioni, una
// connessione diretta tra due telefoni spesso non si riesce proprio a
// stabilire — serve un server TURN che faccia da tramite. Senza,
// circa 1 connessione su 4-5 resta bloccata su "Connessione..." per
// sempre, senza nessun errore visibile.
//
// Le credenziali TURN gratuite pubbliche (openrelayproject) sono una
// rete di sicurezza sempre presente, ma la loro affidabilità nel
// tempo non è garantita (servizio di terzi senza account). Dato che
// l'account Twilio è già configurato con credito vero, si tenta
// PRIMA di ottenere credenziali TURN reali e affidabili da Twilio; se
// non disponibili, si ricade su quelle gratuite senza mai restare
// senza alcun server TURN.
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

// Cache condivisa a livello di modulo: recuperata una volta, riusata
// per tutte le chiamate finché valida (i token Twilio durano 1 ora).
let cachedIceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS;
let iceServersFetchedAt = 0;

async function refreshIceServers(): Promise<void> {
  if (Date.now() - iceServersFetchedAt < 45 * 60 * 1000) return; // ancora valide
  try {
    const { data, error } = await supabase.functions.invoke("get-turn-credentials", {});
    if (!error && data?.iceServers?.length > 0) {
      cachedIceServers = [
        { urls: "stun:stun.l.google.com:19302" },
        ...data.iceServers,
      ];
      iceServersFetchedAt = Date.now();
      console.log("[CALL] Usando server TURN Twilio (affidabili)");
    } else {
      console.log("[CALL] Twilio non disponibile, uso server TURN gratuiti di riserva");
    }
  } catch (e) {
    console.error("[CALL] Errore recupero credenziali TURN, uso riserva", e);
  }
}

interface SignalRow {
  id: string;
  call_id: string;
  from_user: string;
  to_user: string;
  signal_type: string;
  payload: any;
  call_kind: string;
  created_at: string;
}

export function useWebRTCCall() {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (user) void refreshIceServers();
  }, [user]);

  const [status, setStatus] = useState<CallStatus>("idle");

  // BUG TROVATO CON CERTEZZA: se un tentativo di chiamata precedente
  // falliva in un modo che non riportava mai lo stato a "idle" (una
  // pagina mai ricaricata dopo un errore), OGNI nuova chiamata in
  // arrivo veniva rifiutata AUTOMATICAMENTE come "occupato" — senza
  // che l'utente toccasse nulla. Sicurezza aggiuntiva: se lo stato
  // resta bloccato su qualcosa di diverso da "idle" per più di 60
  // secondi senza mai arrivare a "in-call", si ripulisce da solo.
  useEffect(() => {
    if (status === "idle" || status === "in-call") return;
    const stuckTimeout = window.setTimeout(() => {
      console.error("[CALL] Stato bloccato rilevato, ripulito automaticamente:", status);
      cleanupPeer();
      resetCallState();
    }, 60000);
    return () => clearTimeout(stuckTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [activeKind, setActiveKind] = useState<CallKind>("video");
  const [peerName, setPeerName] = useState<string>("");
  const [peerId, setPeerId] = useState<string>("");
  const [incomingTranslation, setIncomingTranslation] = useState<{ text: string; audioBase64: string | null; ts: number } | null>(null);
  const [stellaAnswering, setStellaAnswering] = useState<{
    callId: string;
    peerId: string;
    peerName: string;
    active: boolean;
  } | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callIdRef = useRef<string | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const statusRef = useRef<CallStatus>("idle");
  const incomingRef = useRef<IncomingCall | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedSignalsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  const sendSignal = useCallback(async (
    type: string,
    toUser: string,
    payload: any = null,
    kind: CallKind = "video",
    callId?: string,
  ) => {
    if (!user) return;
    const cid = callId || callIdRef.current;
    if (!cid) return;

    const { error } = await supabase.from("call_signals").insert({
      call_id: cid,
      from_user: user.id,
      to_user: toUser,
      signal_type: type,
      payload,
      call_kind: kind,
    });

    if (error) throw error;
  }, [user]);

  const stopRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current = null;
    }
  }, []);

  const cleanupPeer = useCallback(() => {
    stopRingtone();
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    if (pcRef.current) {
      try { pcRef.current.close(); } catch { /* best-effort, ignore */ }
      pcRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
    pendingIceRef.current = [];
    pendingOfferRef.current = null;
  }, [localStream, stopRingtone]);

  const resetCallState = useCallback(() => {
    callIdRef.current = null;
    peerIdRef.current = null;
    setIncoming(null);
    setPeerName("");
    setPeerId("");
    setStatus("idle");
  }, []);

  const endCall = useCallback(async (notifyPeer = true) => {
    try {
      if (notifyPeer && peerIdRef.current && callIdRef.current) {
        await sendSignal("hangup", peerIdRef.current, null, activeKind, callIdRef.current);
      }
    } catch { /* best-effort, ignore */ }
    cleanupPeer();
    resetCallState();
  }, [activeKind, cleanupPeer, resetCallState, sendSignal]);

  const createPeer = useCallback((toUser: string, callId: string, kind: CallKind) => {
    const pc = new RTCPeerConnection({ iceServers: cachedIceServers });

    // BUG TROVATO: se la negoziazione della connessione non riusciva
    // MAI a concludersi (né "connesso" né "fallito" — capita quando
    // nessun percorso di rete funziona), la chiamata restava bloccata
    // su "Connessione..." per sempre, senza alcun avviso. Ora, se non
    // si connette entro 25 secondi, si ferma da sola con un messaggio
    // chiaro invece di restare appesa.
    const hardTimeout = window.setTimeout(() => {
      if (pc.connectionState !== "connected") {
        toast.error("Connessione non riuscita. Controlla la rete e riprova.");
        cleanupPeer();
        resetCallState();
      }
    }, 25000);
    (pc as any)._hardTimeout = hardTimeout;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal("ice", toUser, event.candidate.toJSON(), kind, callId);
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        clearTimeout((pc as any)._hardTimeout);
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        setStatus("in-call");
      } else if (pc.connectionState === "disconnected") {
        // Don't drop immediately — WebRTC often recovers within seconds
        if (!disconnectTimerRef.current) {
          disconnectTimerRef.current = setTimeout(() => {
            if (pcRef.current?.connectionState !== "connected") {
              cleanupPeer();
              resetCallState();
            }
          }, 8000);
        }
      } else if (["failed", "closed"].includes(pc.connectionState)) {
        clearTimeout((pc as any)._hardTimeout);
        if (pc.connectionState === "failed") {
          toast.error("Connessione non riuscita. Controlla la rete e riprova.");
        }
        cleanupPeer();
        resetCallState();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [cleanupPeer, resetCallState, sendSignal]);

  const getMedia = useCallback(async (kind: CallKind): Promise<MediaStream> => {
    // BUG TROVATO: "facingMode: 'user'" come richiesta RIGIDA — sui
    // computer (a differenza dei telefoni) le webcam spesso non hanno
    // questo concetto di "fotocamera frontale/posteriore", e alcuni
    // browser rifiutano l'intera richiesta invece di usare comunque
    // la webcam disponibile, dando esattamente "dispositivo non
    // trovato" anche quando una webcam perfettamente funzionante
    // esiste. Corretto: ora è una preferenza (usata se disponibile),
    // non un requisito che blocca tutto se assente.
    const constraints: MediaStreamConstraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: kind === "video"
        ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: "user" } }
        : false,
    };
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: any) {
      // Ripiego: se anche con vincoli minimi il video specifico fallisce
      // (dispositivo con una sola webcam non standard, o nessuna scelta
      // possibile), riprova con vincoli video generici senza preferenze,
      // prima di arrendersi davvero.
      if (kind === "video" && (err?.name === "OverconstrainedError" || err?.name === "NotFoundError")) {
        console.error("[CALL] getUserMedia con vincoli specifici fallita, riprovo con vincoli minimi", err);
        return await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: true,
        });
      }
      throw err;
    }
  }, []);

  const hydrateIncoming = useCallback(async (signal: SignalRow) => {
    // Check auto-answer (segreteria Stella) settings first
    try {
      const { data: settings } = await supabase
        .from("call_auto_answer_settings")
        .select("mode, schedule")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (settings && settings.mode !== "off") {
        let stellaShouldAnswer = settings.mode === "always";
        if (settings.mode === "schedule" && settings.schedule) {
          try {
            const sch = settings.schedule as { days: number[]; from: string; to: string };
            const now = new Date();
            const day = now.getDay();
            const mins = now.getHours() * 60 + now.getMinutes();
            const [fh, fm] = sch.from.split(":").map(Number);
            const [th, tm] = sch.to.split(":").map(Number);
            const fromMin = fh * 60 + fm;
            const toMin = th * 60 + tm;
            const dayOk = sch.days?.includes(day) ?? false;
            const inWindow =
              fromMin <= toMin ? mins >= fromMin && mins <= toMin : mins >= fromMin || mins <= toMin;
            stellaShouldAnswer = dayOk && inWindow;
          } catch { /* ignore */ }
        }
        if (stellaShouldAnswer) {
          await supabase.from("call_signals").insert({
            call_id: signal.call_id,
            from_user: user!.id,
            to_user: signal.from_user,
            signal_type: "reject",
            payload: { reason: "stella_ai", targetUserId: user!.id },
            call_kind: signal.call_kind,
          });
          return; // no ring, no UI on recipient side
        }
      }
    } catch { /* fall through: ring normally */ }

    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", signal.from_user)
      .maybeSingle();

    setActiveKind((signal.call_kind as CallKind) || "video");
    setIncoming({
      callId: signal.call_id,
      fromUser: signal.from_user,
      fromName: prof?.display_name || signal.payload?.name || "Sconosciuto",
      fromAvatar: prof?.avatar_url || signal.payload?.avatar || undefined,
      kind: (signal.call_kind as CallKind) || "video",
    });
    setPeerName(prof?.display_name || signal.payload?.name || "Sconosciuto");
    setPeerId(signal.from_user);
    setStatus("ringing-in");

    try {
      const audio = new Audio("data:audio/wav;base64,UklGRkAAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YRwAAAAAAA==");
      audio.loop = true;
      audio.volume = 0.4;
      ringtoneRef.current = audio;
      await audio.play().catch(() => {});
    } catch { /* best-effort, ignore */ }
  }, []);

  const startCall = useCallback(async (toUser: string, kind: CallKind, peerDisplayName?: string) => {
    if (!user) {
      toast.error("Devi essere loggato");
      return;
    }
    if (statusRef.current !== "idle") {
      toast.error("Hai già una chiamata in corso");
      return;
    }
    // BUG TROVATO: statusRef veniva aggiornato solo da un effetto,
    // con un ritardo di un giro di rendering rispetto a setStatus().
    // Un doppio tocco rapido sul pulsante chiamata poteva passare
    // ENTRAMBE le volte questo controllo, prima che il primo tentativo
    // avesse il tempo di aggiornare statusRef — la seconda chiamata
    // chiudeva la connessione della prima proprio mentre stava
    // preparando l'offerta video, causando l'errore
    // "signalingState is 'closed'" riportato. Aggiornato subito, non
    // in ritardo.
    statusRef.current = "ringing-out";

    try {
      const callId = crypto.randomUUID();
      callIdRef.current = callId;
      peerIdRef.current = toUser;
      setActiveKind(kind);
      setPeerName(peerDisplayName || "");
      setPeerId(toUser);
      setStatus("ringing-out");

      const stream = await getMedia(kind);
      setLocalStream(stream);

      const pc = createPeer(toUser, callId, kind);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await sendSignal("ringing", toUser, {
        name: profile?.display_name || user.email || "Utente",
        avatar: profile?.avatar_url || null,
      }, kind, callId);

      // BUG TROVATO nei dati reali: 10 tentativi di chiamata, zero
      // offerte video mai inviate — qualcosa fallisce sempre proprio
      // qui, tra "squillo" e "offerta". Registrazione dettagliata
      // passo-passo per vedere l'errore esatto al prossimo tentativo.
      let offer: RTCSessionDescriptionInit;
      try {
        offer = await pc.createOffer();
      } catch (offerError: any) {
        console.error("[CALL] createOffer failed", { message: offerError?.message, name: offerError?.name, pcState: pc.signalingState });
        throw new Error("Errore nella creazione dell'offerta video: " + (offerError?.message || "sconosciuto"));
      }
      try {
        await pc.setLocalDescription(offer);
      } catch (sdpError: any) {
        console.error("[CALL] setLocalDescription failed", { message: sdpError?.message, name: sdpError?.name, pcState: pc.signalingState });
        throw new Error("Errore nell'impostazione dell'offerta: " + (sdpError?.message || "sconosciuto"));
      }
      try {
        await sendSignal("offer", toUser, { sdp: offer.sdp, type: offer.type }, kind, callId);
      } catch (signalError: any) {
        console.error("[CALL] sendSignal(offer) failed", { message: signalError?.message, code: signalError?.code });
        throw new Error("Errore nell'invio dell'offerta: " + (signalError?.message || "sconosciuto"));
      }
    } catch (error: any) {
      console.error("[CALL] startCall failed", { message: error?.message, name: error?.name });
      toast.error(error?.message || "Impossibile avviare la chiamata");
      cleanupPeer();
      resetCallState();
    }
  }, [cleanupPeer, createPeer, getMedia, profile?.avatar_url, profile?.display_name, resetCallState, sendSignal, user]);

  const acceptCall = useCallback(async () => {
    if (!incoming || !user) return;
    // Stessa protezione contro il doppio tocco applicata a startCall:
    // senza questo controllo, toccare "Accetta" due volte molto
    // velocemente poteva avviare due tentativi di connessione in
    // conflitto tra loro.
    if (statusRef.current !== "ringing-in") return;
    statusRef.current = "connecting";

    try {
      const { callId, fromUser, kind } = incoming;
      callIdRef.current = callId;
      peerIdRef.current = fromUser;
      setActiveKind(kind);
      setPeerName(incoming.fromName || "");
      setPeerId(fromUser);
      setStatus("connecting");
      stopRingtone();
      // BUG TROVATO: la schermata "chiamata in arrivo" restava visibile
      // (incoming non ancora azzerato) mentre lo stato interno era già
      // passato a "connecting" — un'incoerenza che, nella finestra di
      // attesa del permesso della fotocamera (che può richiedere
      // tempo), poteva far apparire l'interfaccia bloccata. Ora la
      // transizione è immediata e pulita, prima di aspettare qualsiasi
      // cosa.
      setIncoming(null);

      const stream = await getMedia(kind);
      setLocalStream(stream);

      const pc = createPeer(fromUser, callId, kind);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // BUG TROVATO: chi trasmette manda "ringing" e SOLO DOPO manda
      // l'offerta video vera e propria (due invii separati, non uno
      // solo). Se chi risponde tocca "Accetta" molto velocemente,
      // l'offerta potrebbe non essere ancora arrivata quando viene
      // creata la connessione qui sopra.
      //
      // Il codice già gestiva un percorso alternativo altrove (dentro
      // handleSignal): se l'offerta arriva DOPO che la connessione
      // esiste già, la applica e risponde da sola. Il bug era che QUI
      // si andava comunque dritti a creare una risposta senza offerta,
      // fallendo subito con un errore — anche se l'offerta sarebbe
      // arrivata un istante dopo e sarebbe stata gestita correttamente
      // dall'altro percorso. Ora, se l'offerta non è ancora arrivata,
      // ci si ferma qui e si lascia che l'altro percorso completi la
      // connessione da solo, con un limite di sicurezza di 15 secondi.
      if (pendingOfferRef.current) {
        await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));
        pendingOfferRef.current = null;

        for (const candidate of pendingIceRef.current) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* best-effort, ignore */ }
        }
        pendingIceRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal("accept", fromUser, null, kind, callId);
        await sendSignal("answer", fromUser, { sdp: answer.sdp, type: answer.type }, kind, callId);
      } else {
        await sendSignal("accept", fromUser, null, kind, callId);
        // Limite di sicurezza: se dopo 15s l'offerta non è mai arrivata
        // e la connessione non si è mai stabilita, avvisa invece di
        // restare bloccati su "connessione..." per sempre.
        setTimeout(() => {
          if (callIdRef.current === callId && statusRef.current === "connecting") {
            toast.error("Connessione non riuscita, riprova");
            cleanupPeer();
            resetCallState();
          }
        }, 15000);
      }

    } catch (error: any) {
      toast.error(error?.message || "Impossibile accettare la chiamata");
      await endCall(true);
    }
  }, [cleanupPeer, createPeer, endCall, getMedia, incoming, resetCallState, sendSignal, stopRingtone, user]);

  const rejectCall = useCallback(async () => {
    if (!incoming) return;
    try {
      await sendSignal("reject", incoming.fromUser, null, incoming.kind, incoming.callId);
    } catch { /* best-effort, ignore */ }
    stopRingtone();
    cleanupPeer();
    resetCallState();
  }, [cleanupPeer, incoming, resetCallState, sendSignal, stopRingtone]);

  const toggleMic = useCallback((enabled?: boolean) => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled ?? !track.enabled;
    });
  }, [localStream]);

  const toggleCamera = useCallback((enabled?: boolean) => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled ?? !track.enabled;
    });
  }, [localStream]);

  useEffect(() => {
    if (!user) return;

    const handleSignal = async (signal: SignalRow) => {
      // Dedupe: realtime + loadPendingSignals may deliver same row twice
      if (processedSignalsRef.current.has(signal.id)) return;
      processedSignalsRef.current.add(signal.id);
      if (processedSignalsRef.current.size > 200) {
        processedSignalsRef.current = new Set(
          Array.from(processedSignalsRef.current).slice(-100),
        );
      }

      const pc = pcRef.current;

      try {
        if (signal.signal_type === "ringing") {
          if (statusRef.current !== "idle") {
            await supabase.from("call_signals").insert({
              call_id: signal.call_id,
              from_user: user.id,
              to_user: signal.from_user,
              signal_type: "reject",
              payload: { reason: "busy" },
              call_kind: signal.call_kind,
            });
            return;
          }
          callIdRef.current = signal.call_id;
          peerIdRef.current = signal.from_user;
          await hydrateIncoming(signal);
          return;
        }

        if (signal.signal_type === "offer") {
          const offer = { type: "offer" as RTCSdpType, sdp: signal.payload?.sdp };
          callIdRef.current = signal.call_id;
          peerIdRef.current = signal.from_user;
          setActiveKind((signal.call_kind as CallKind) || "video");

          if (statusRef.current === "idle" && !incomingRef.current) {
            await hydrateIncoming(signal);
          }

          if (!pc) {
            pendingOfferRef.current = offer;
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(offer));

          // Eventuali candidati ICE arrivati PRIMA che l'offerta fosse
          // applicata restavano bloccati in coda per sempre — questo
          // percorso non li svuotava mai, a differenza dell'altro.
          for (const candidate of pendingIceRef.current) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* best-effort, ignore */ }
          }
          pendingIceRef.current = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal("answer", signal.from_user, { sdp: answer.sdp, type: answer.type }, (signal.call_kind as CallKind) || "video", signal.call_id);
          return;
        }

        if (signal.signal_type === "answer") {
          if (!pc || signal.call_id !== callIdRef.current) return;
          await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.payload?.sdp }));
          for (const candidate of pendingIceRef.current) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* best-effort, ignore */ }
          }
          pendingIceRef.current = [];
          setStatus("connecting");
          return;
        }

        if (signal.signal_type === "ice") {
          if (signal.call_id !== callIdRef.current) return;
          const candidate = signal.payload as RTCIceCandidateInit;
          if (pc && pc.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* best-effort, ignore */ }
          } else {
            pendingIceRef.current.push(candidate);
          }
          return;
        }

        if (signal.signal_type === "accept") {
          setStatus("connecting");
          return;
        }

        if (signal.signal_type === "reject") {
          if (signal.payload?.reason === "stella_ai") {
            // The callee's Stella AI is answering — switch caller UI to Stella session
            const peerId = signal.payload?.targetUserId || peerIdRef.current || signal.from_user;
            setStellaAnswering({
              callId: signal.call_id,
              peerId,
              peerName: peerName || "Stella AI",
              active: true,
            });
          } else {
            toast.info(signal.payload?.reason === "busy" ? "Utente occupato" : "Chiamata rifiutata");
          }
          cleanupPeer();
          resetCallState();
          return;
        }

        if (signal.signal_type === "translation") {
          setIncomingTranslation({
            text: signal.payload?.text || "",
            audioBase64: signal.payload?.audio || null,
            ts: Date.now(),
          });
          return;
        }

        if (signal.signal_type === "hangup") {
          toast.info("Chiamata terminata");
          cleanupPeer();
          resetCallState();
        }
      } catch (error) {
        console.error("[CallSignal]", error);
      }
    };

    const loadPendingSignals = async () => {
      // Extend window to 90s so late accepts (app reopened from background) still connect
      const since = new Date(Date.now() - 90_000).toISOString();
      const { data } = await supabase
        .from("call_signals")
        .select("*")
        .eq("to_user", user.id)
        .gte("created_at", since)
        .in("signal_type", ["ringing", "offer", "ice", "hangup"])
        .order("created_at", { ascending: true })
        .limit(50);

      for (const signal of (data || []) as SignalRow[]) {
        await handleSignal(signal);
      }
    };

    void loadPendingSignals();

    // Re-scan when tab becomes visible again (app returns from background)
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && statusRef.current === "idle") {
        void loadPendingSignals();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    const channel = supabase
      .channel(`call-signals-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_signals",
          filter: `to_user=eq.${user.id}`,
        },
        (payload) => { void handleSignal(payload.new as SignalRow); },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [cleanupPeer, hydrateIncoming, resetCallState, sendSignal, user]);

  useEffect(() => () => cleanupPeer(), [cleanupPeer]);

  return {
    status,
    incoming,
    localStream,
    remoteStream,
    activeKind,
    peerName,
    peerId,
    incomingTranslation,
    sendSignal,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
    stellaAnswering,
    dismissStellaAnswering: () => setStellaAnswering(null),
  };
}
