import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Diretta video REALE tramite WebRTC — prima la pagina "diretta"
// mostrava solo un'immagine statica, nessuna fotocamera reale, nessun
// flusso video vero tra chi trasmette e chi guarda. Riusa lo stesso
// meccanismo di segnalazione già collaudato e sicuro delle
// videochiamate (tabella call_signals), con l'id della diretta al
// posto dell'id chiamata: per ogni spettatore che si collega, chi
// trasmette crea una connessione video dedicata (mesh) — funziona
// bene per il pubblico realistico di una diretta di un salone/
// professionista, non pensato per migliaia di spettatori simultanei.

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

// Stessa cache condivisa usata dalle videochiamate (useWebRTCCall) —
// credenziali TURN Twilio affidabili, con le gratuite come riserva.
let cachedIceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS;
let iceServersFetchedAt = 0;

async function refreshIceServers(): Promise<void> {
  if (Date.now() - iceServersFetchedAt < 45 * 60 * 1000) return;
  try {
    const { data, error } = await supabase.functions.invoke("get-turn-credentials", {});
    if (!error && data?.iceServers?.length > 0) {
      cachedIceServers = [{ urls: "stun:stun.l.google.com:19302" }, ...data.iceServers];
      iceServersFetchedAt = Date.now();
    }
  } catch { /* usa la riserva gratuita, nessun problema */ }
}

export function useLiveBroadcaster(streamId: string | null, active: boolean) {
  const { user } = useAuth();

  useEffect(() => {
    if (user) void refreshIceServers();
  }, [user]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!active || !streamId || !user) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        setError("Permesso fotocamera/microfono negato. Attivalo per andare in diretta con il video.");
        return;
      }

      const createPeerForViewer = async (viewerId: string) => {
        if (peersRef.current.has(viewerId)) return;
        const pc = new RTCPeerConnection({ iceServers: cachedIceServers });
        peersRef.current.set(viewerId, pc);
        setViewerCount(peersRef.current.size);

        localStreamRef.current?.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            void supabase.from("call_signals").insert({
              call_id: streamId, from_user: user.id, to_user: viewerId,
              signal_type: "live-ice", payload: e.candidate.toJSON(), call_kind: "video",
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
            pc.close();
            peersRef.current.delete(viewerId);
            setViewerCount(peersRef.current.size);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await supabase.from("call_signals").insert({
          call_id: streamId, from_user: user.id, to_user: viewerId,
          signal_type: "live-offer", payload: offer, call_kind: "video",
        });
      };

      channel = supabase
        .channel(`live-broadcast-${streamId}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "call_signals",
          filter: `to_user=eq.${user.id}`,
        }, async (payload) => {
          const row = payload.new as any;
          if (row.call_id !== streamId) return;

          if (row.signal_type === "live-join") {
            void createPeerForViewer(row.from_user);
          } else if (row.signal_type === "live-answer") {
            const pc = peersRef.current.get(row.from_user);
            if (pc && !pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(row.payload));
            }
          } else if (row.signal_type === "live-ice") {
            const pc = peersRef.current.get(row.from_user);
            if (pc) { try { await pc.addIceCandidate(new RTCIceCandidate(row.payload)); } catch { /* ignore late candidates */ } }
          } else if (row.signal_type === "live-leave") {
            const pc = peersRef.current.get(row.from_user);
            if (pc) { pc.close(); peersRef.current.delete(row.from_user); setViewerCount(peersRef.current.size); }
          }
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    };
  }, [active, streamId, user]);

  return { localStream, viewerCount, error };
}

export function useLiveViewer(streamId: string | null, broadcasterId: string | null, active: boolean) {
  const { user } = useAuth();

  useEffect(() => {
    if (user) void refreshIceServers();
  }, [user]);

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connecting, setConnecting] = useState(true);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const joinRetryRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !streamId || !broadcasterId || !user) return;
    if (user.id === broadcasterId) return; // the broadcaster views their own local stream directly, not via WebRTC

    let cancelled = false;
    const pc = new RTCPeerConnection({ iceServers: cachedIceServers });
    pcRef.current = pc;

    // Se dopo 25 secondi non è ancora arrivato nessun video, smette di
    // dire "connessione in corso" — evita di restare bloccati su un
    // messaggio fuorviante per sempre se la connessione non riesce.
    const hardTimeout = window.setTimeout(() => {
      if (!cancelled) setConnecting(false);
    }, 25000);

    pc.ontrack = (e) => {
      if (!cancelled) setRemoteStream(e.streams[0]);
      setConnecting(false);
      clearTimeout(hardTimeout);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        void supabase.from("call_signals").insert({
          call_id: streamId, from_user: user.id, to_user: broadcasterId,
          signal_type: "live-ice", payload: e.candidate.toJSON(), call_kind: "video",
        });
      }
    };

    const channel = supabase
      .channel(`live-viewer-${streamId}-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "call_signals",
        filter: `to_user=eq.${user.id}`,
      }, async (payload) => {
        const row = payload.new as any;
        if (row.call_id !== streamId || cancelled) return;

        if (row.signal_type === "live-offer") {
          if (joinRetryRef.current) { clearInterval(joinRetryRef.current); joinRetryRef.current = null; }
          await pc.setRemoteDescription(new RTCSessionDescription(row.payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await supabase.from("call_signals").insert({
            call_id: streamId, from_user: user.id, to_user: broadcasterId,
            signal_type: "live-answer", payload: answer, call_kind: "video",
          });
        } else if (row.signal_type === "live-ice") {
          try { await pc.addIceCandidate(new RTCIceCandidate(row.payload)); } catch { /* ignore late candidates */ }
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const sendJoin = () => {
            void supabase.from("call_signals").insert({
              call_id: streamId, from_user: user.id, to_user: broadcasterId,
              signal_type: "live-join", payload: null, call_kind: "video",
            });
          };
          sendJoin();
          // BUG FIX: prima il segnale "mi sono collegato" veniva inviato
          // una sola volta. Se chi trasmette era ancora in attesa del
          // permesso della fotocamera (può richiedere diversi secondi),
          // il suo canale di ascolto non era ancora pronto — quel
          // segnale andava perso per sempre (Supabase non ripete eventi
          // passati). Risultato: la diretta partiva per chi trasmette
          // ma non arrivava mai a chi guardava. Ora si ripete ogni 3
          // secondi finché non arriva davvero un'offerta video reale.
          joinRetryRef.current = window.setInterval(sendJoin, 3000);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(hardTimeout);
      if (joinRetryRef.current) { clearInterval(joinRetryRef.current); joinRetryRef.current = null; }
      void supabase.from("call_signals").insert({
        call_id: streamId, from_user: user.id, to_user: broadcasterId,
        signal_type: "live-leave", payload: null, call_kind: "video",
      });
      supabase.removeChannel(channel);
      pc.close();
      pcRef.current = null;
      setRemoteStream(null);
    };
  }, [active, streamId, broadcasterId, user]);

  return { remoteStream, connecting };
}
