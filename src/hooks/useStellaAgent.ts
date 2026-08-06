import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { useVoiceSynthesis } from '@/hooks/useVoiceSynthesis';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { haversineDistance } from '@/hooks/useGeolocation';
import { findNextAvailableSlot } from '@/lib/availability';
import { useStellaLearning } from '@/hooks/useStellaLearning';
import { useCall } from '@/contexts/CallContext';

// ── Rate limits ──────────────────────────────────────────────────────────────
const LIMITS = {
  like: { perHour: 20, cooldownMs: 3000 },
  comment: { perHour: 10, cooldownMs: 5000 },
  message: { perHour: 20, cooldownMs: 3000 },
  follow: { perHour: 15, cooldownMs: 5000 },
  navigate: { perHour: 999, cooldownMs: 0 },
  book: { perHour: 10, cooldownMs: 0 },
  info: { perHour: 999, cooldownMs: 0 },
  search: { perHour: 999, cooldownMs: 0 },
  action: { perHour: 60, cooldownMs: 0 },
} as const;

const CONFIRMATION_REQUIRED = new Set([
  // Solo azioni davvero sensibili: pagamenti, telefonate reali, prenotazioni,
  // eliminazioni, spesa di QR Coin. Like/follow/message vanno via senza conferma.
  'book', 'payment', 'call', 'delete', 'spend_coins',
]);

export interface StellaCommand {
  id: string;
  type: 'navigate' | 'search' | 'message' | 'like' | 'comment' | 'follow' | 'book' | 'info' | 'schedule' | 'call' | 'payment' | 'action';
  text: string;
  response: string;
  requiresConfirmation: boolean;
  execute: () => void | Promise<void>;
  silent?: boolean; // execute without opening panel
  preview?: { kind: 'message' | 'comment' | 'post'; recipient?: string; content: string };
  followups?: Array<{ text: string; command: string }>;
}

interface StellaMessage {
  id: string;
  role: 'user' | 'stella';
  content: string;
  type?: 'text' | 'confirmation' | 'action_result';
  pending?: StellaCommand;
  preview?: { kind: 'message' | 'comment' | 'post'; recipient?: string; content: string };
  followups?: Array<{ text: string; command: string }>;
}

const actionCounts = new Map<string, { count: number; resetAt: number }>();

function normalizeActionLabel(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkLimit(actionType: string): { allowed: boolean; remaining: number } {
  const limit = LIMITS[actionType as keyof typeof LIMITS] ?? { perHour: 30 };
  const now = Date.now();
  let entry = actionCounts.get(actionType);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 3600000 };
    actionCounts.set(actionType, entry);
  }
  return { allowed: limit.perHour - entry.count > 0, remaining: limit.perHour - entry.count };
}

function recordAction(actionType: string) {
  const now = Date.now();
  let entry = actionCounts.get(actionType);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 3600000 };
    actionCounts.set(actionType, entry);
  }
  entry.count++;
}

export function useStellaAgent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { speak, cancel: cancelTTS, speaking } = useVoiceSynthesis();
  const { analyzePatterns, getProactiveSuggestions, trackPageVisit, getTopPages } = useStellaLearning();
  const { status: callStatus, startCall: startRealCall } = useCall();

  const [messages, setMessages] = useState<StellaMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [pendingCommand, setPendingCommand] = useState<StellaCommand | null>(null);
  const pendingCommandRef = useRef<StellaCommand | null>(null);
  useEffect(() => { pendingCommandRef.current = pendingCommand; }, [pendingCommand]);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [proactiveSuggestions, setProactiveSuggestions] = useState<Array<{ text: string; command: string }>>([]);
  const [inlineStatus, setInlineStatus] = useState<string | null>(null);
  const [actionSteps, setActionSteps] = useState<Array<{ id: string; icon: string; label: string; status: 'pending' | 'done' | 'error' }>>([]);
  const actionStepsClearTimerRef = useRef<number | null>(null);
  const scheduleStepsClear = useCallback((delay = 4500) => {
    if (actionStepsClearTimerRef.current) window.clearTimeout(actionStepsClearTimerRef.current);
    actionStepsClearTimerRef.current = window.setTimeout(() => setActionSteps([]), delay);
  }, []);
  const pushStep = useCallback((icon: string, label: string, status: 'pending' | 'done' | 'error' = 'pending') => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    setActionSteps(prev => [...prev, { id, icon, label, status }]);
    if (actionStepsClearTimerRef.current) { window.clearTimeout(actionStepsClearTimerRef.current); actionStepsClearTimerRef.current = null; }
    return id;
  }, []);
  const completeStep = useCallback((id: string, status: 'done' | 'error' = 'done', label?: string) => {
    setActionSteps(prev => prev.map(s => s.id === id ? { ...s, status, label: label ?? s.label } : s));
    scheduleStepsClear();
  }, [scheduleStepsClear]);
  const clearSteps = useCallback(() => {
    if (actionStepsClearTimerRef.current) { window.clearTimeout(actionStepsClearTimerRef.current); actionStepsClearTimerRef.current = null; }
    setActionSteps([]);
  }, []);
  const handleCommandRef = useRef<(text: string) => Promise<void> | void>(() => {});
  const confirmActionRef = useRef<() => Promise<void> | void>(() => {});
  const cancelActionRef = useRef<() => void>(() => {});
  const repeatPendingRef = useRef<() => void>(() => {});
  const pendingRepromptTimerRef = useRef<number | null>(null);
  const pendingRepromptCountRef = useRef(0);
  const restartWakeWordTimeoutRef = useRef<number | null>(null);
  const lastHandledTranscriptRef = useRef({ text: '', at: 0 });
  const speakingRef = useRef(false);
  const clearInlineStatus = useCallback(() => setInlineStatus(null), []);
  const clearWakeWordResumeTimeout = useCallback(() => {
    if (restartWakeWordTimeoutRef.current !== null) {
      window.clearTimeout(restartWakeWordTimeoutRef.current);
      restartWakeWordTimeoutRef.current = null;
    }
  }, []);

  const isOpenRef = useRef(false);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);

  // ── L2: short-term conversational memory (pronoun resolution) ───────────
  const lastTargetRef = useRef<{ name: string; userId?: string; at: number } | null>(null);
  const rememberTarget = useCallback((name: string, userId?: string) => {
    lastTargetRef.current = { name, userId, at: Date.now() };
  }, []);
  const getRememberedTarget = useCallback(() => {
    const t = lastTargetRef.current;
    if (!t) return null;
    // expire after 3 minutes
    if (Date.now() - t.at > 3 * 60 * 1000) { lastTargetRef.current = null; return null; }
    return t;
  }, []);

  // Track page visits for learning
  useEffect(() => {
    trackPageVisit(location.pathname);
  }, [location.pathname, trackPageVisit]);

  // Periodically generate proactive suggestions
  useEffect(() => {
    if (!user) return;
    const loadSuggestions = async () => {
      const suggestions = await getProactiveSuggestions();
      setProactiveSuggestions(suggestions.map(s => ({ text: s.text, command: s.command })));
    };
    loadSuggestions();
    const interval = setInterval(loadSuggestions, 600000); // every 10 min
    return () => clearInterval(interval);
  }, [user, getProactiveSuggestions]);

  // Detect browser language for voice recognition
  const browserLang = typeof navigator !== 'undefined' ? navigator.language || 'it-IT' : 'it-IT';

  const {
    isListening, transcript, interimTranscript,
    startListening, stopListening, resetTranscript,
    isWakeWordListening, startWakeWordListening, stopWakeWordListening, isSupported,
  } = useVoiceRecognition({
    continuous: false,
    interimResults: true,
    language: browserLang,
    wakeWordEnabled: wakeWordActive,
    wakeWords: [
      // Multilingual wake words
      'stella', 'hey stella', 'ehi stella', 'ciao stella',
      'hi stella', 'ok stella', 'hola stella', 'oi stella',
      'hé stella', 'hallo stella', 'привет стелла',
    ],
    onWakeWordDetected: (command?: string) => {
      cancelTTS();
      const trimmedCommand = command?.trim();

      if (trimmedCommand) {
        setInlineStatus(`Eseguo: ${trimmedCommand}`);
        void Promise.resolve(handleCommandRef.current(trimmedCommand));
        return;
      }

      setInlineStatus('Ti ascolto...');
    },
  });

  const wakeWordActiveRef = useRef(wakeWordActive);
  useEffect(() => { wakeWordActiveRef.current = wakeWordActive; }, [wakeWordActive]);
  const isListeningRef = useRef(isListening);
  const isWakeWordListeningRef = useRef(isWakeWordListening);

  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { isWakeWordListeningRef.current = isWakeWordListening; }, [isWakeWordListening]);

  const scheduleWakeWordResume = useCallback((delayMs = 1400) => {
    if (!wakeWordActiveRef.current) return;

    clearWakeWordResumeTimeout();

    const resumeWakeWord = () => {
      const speechStillActive = speakingRef.current || (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking);

      if (!wakeWordActiveRef.current) return;

      if (speechStillActive || isListeningRef.current) {
        restartWakeWordTimeoutRef.current = window.setTimeout(resumeWakeWord, 600);
        return;
      }

      if (!isWakeWordListeningRef.current) {
        startWakeWordListening();
      }
    };

    restartWakeWordTimeoutRef.current = window.setTimeout(resumeWakeWord, delayMs);
  }, [clearWakeWordResumeTimeout, startWakeWordListening]);

  useEffect(() => () => clearWakeWordResumeTimeout(), [clearWakeWordResumeTimeout]);

  // Auto-start wake word listening on mount (once). Attempts the real
  // browser microphone request directly — this shows the BROWSER's own
  // native "Allow microphone?" prompt automatically, no extra tap on
  // anything of ours required first. The only case where we ask for an
  // explicit tap is if this automatic attempt actually gets denied
  // (some browsers won't show a prompt again after a prior denial
  // without a fresh user gesture) — that's a real browser security
  // limit, not something any app code can bypass.
  const wakeWordStartedRef = useRef(false);
  const [needsMicPermissionPrompt, setNeedsMicPermissionPrompt] = useState(false);
  useEffect(() => {
    if (!isSupported || !wakeWordActive || wakeWordStartedRef.current) return;
    if (isWakeWordListening || isListening) return;

    wakeWordStartedRef.current = true;
    window.setTimeout(async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
          const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (status.state === 'denied') {
            // A prior denial means the browser won't show its prompt
            // again without a fresh user gesture — this is the one
            // real case that needs an explicit tap.
            setNeedsMicPermissionPrompt(true);
            return;
          }
        }
      } catch { /* Permissions API unsupported — attempt anyway below */ }

      startWakeWordListening();
      try {
        const KEY = 'stella_wake_hint_shown_v1';
        if (!window.localStorage.getItem(KEY)) {
          window.setTimeout(() => {
            toast.success('🌟 Stella è in ascolto — dì "Stella" + comando da qualsiasi pagina', { duration: 6000 });
            try { window.localStorage.setItem(KEY, '1'); } catch { /* best-effort, ignore */ }
          }, 1500);
        }
      } catch { /* best-effort, ignore */ }
    }, 800);
  }, [isSupported, wakeWordActive]); // minimal deps to avoid re-trigger loops

  const enableWakeWordNow = useCallback(() => {
    setNeedsMicPermissionPrompt(false);
    wakeWordStartedRef.current = true;
    startWakeWordListening();
    toast.success('🌟 Stella è in ascolto — dì "Stella" + comando da qualsiasi pagina', { duration: 6000 });
    try { window.localStorage.setItem('stella_wake_hint_shown_v1', '1'); } catch { /* best-effort, ignore */ }
  }, [startWakeWordListening]);

  // BUG TROVATO: dopo un periodo di inattività, "Ehi Stella" smetteva
  // di funzionare per sempre finché non si ricaricava la pagina. La
  // causa: iOS e Android sospendono l'esecuzione del codice in
  // background per risparmiare batteria — quando questo succede,
  // l'ascolto vocale si interrompe, e nessun meccanismo lo faceva
  // ripartire al ritorno sull'app. Ora, ogni volta che la pagina torna
  // visibile (l'utente riapre l'app o ci torna sopra), controlla se
  // "Ehi Stella" dovrebbe essere attivo ma non lo è davvero, e lo
  // riattiva da solo.
  useEffect(() => {
    const handleVisibilityRecovery = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isSupported || !wakeWordActive) return;
      if (isWakeWordListening || isListening) return; // già in ascolto, nulla da fare
      startWakeWordListening();
    };
    document.addEventListener('visibilitychange', handleVisibilityRecovery);
    window.addEventListener('focus', handleVisibilityRecovery);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityRecovery);
      window.removeEventListener('focus', handleVisibilityRecovery);
    };
  }, [isSupported, wakeWordActive, isWakeWordListening, isListening, startWakeWordListening]);

  // BUG TROVATO: "Ehi Stella" restava in ascolto anche durante una
  // chiamata attiva, competendo con la chiamata stessa per lo stesso
  // microfono — rischio reale di conflitti audio o falsi comandi
  // captati dalla conversazione. Ora l'ascolto si mette in pausa
  // automaticamente quando una chiamata inizia (squilla, in
  // connessione, o in corso), e riparte da solo quando la chiamata
  // finisce.
  const wasPausedForCallRef = useRef(false);
  useEffect(() => {
    const inCall = callStatus !== 'idle';
    if (inCall && isWakeWordListening) {
      wasPausedForCallRef.current = true;
      stopWakeWordListening();
    } else if (!inCall && wasPausedForCallRef.current) {
      wasPausedForCallRef.current = false;
      if (isSupported && wakeWordActive) startWakeWordListening();
    }
  }, [callStatus, isWakeWordListening, isSupported, wakeWordActive, stopWakeWordListening, startWakeWordListening]);

  // Process transcript when command listening ends
  useEffect(() => {
    const finalTranscript = transcript.trim();
    if (!finalTranscript || isListening) return;

    const normalizedTranscript = finalTranscript.replace(/\s+/g, ' ').trim().toLowerCase();
    const now = Date.now();
    const lastHandled = lastHandledTranscriptRef.current;

    if (normalizedTranscript === lastHandled.text && now - lastHandled.at < 1800) {
      resetTranscript();
      return;
    }

    lastHandledTranscriptRef.current = { text: normalizedTranscript, at: now };
    void Promise.resolve(handleCommandRef.current(finalTranscript));
    resetTranscript();
  }, [transcript, isListening, resetTranscript]);

  const addMessage = useCallback((msg: Omit<StellaMessage, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: Date.now().toString() + Math.random() }]);
  }, []);

  const stellaSpeak = useCallback((text: string) => {
    if (ttsEnabled) speak(text);
  }, [ttsEnabled, speak]);

  const logStellaCommand = useCallback((commandText: string, commandType: string, extra: Record<string, any> = {}) => {
    if (!user) return;

    void supabase.from('stella_commands').insert({
      user_id: user.id,
      command_text: commandText,
      command_type: commandType,
      status: 'completed',
      executed_at: new Date().toISOString(),
      ...extra,
    }).then(({ error }) => {
      if (error) {
        console.warn('Stella command log error:', error);
      }
    });
  }, [user]);

  const clickVisibleAction = useCallback((labels: string[]) => {
    const normalizedLabels = labels.map(normalizeActionLabel).filter(Boolean);
    if (normalizedLabels.length === 0) return false;

    const elements = Array.from(document.querySelectorAll<HTMLElement>(
      'button, a, [role="button"], input[type="button"], input[type="submit"], [data-stella-action]'
    ));

    const target = elements.find((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
        return false;
      }

      const text = normalizeActionLabel([
        element.textContent || '',
        element.getAttribute('aria-label') || '',
        element.getAttribute('title') || '',
        element.getAttribute('value') || '',
        element.dataset?.stellaAction || '',
      ].join(' '));

      return normalizedLabels.some((label) => text.includes(label));
    });

    if (!target) return false;

    target.click();
    return true;
  }, []);

  // ── Helper: search profile by name in DB ──────────────────────────────────
  const findProfileByName = useCallback(async (name: string) => {
    const searchTerms = name.toLowerCase().split(/\s+/);
    const { data } = await supabase
      .from('profiles')
      .select('user_id, display_name, username, avatar_url, user_type')
      .or(searchTerms.map(term => `display_name.ilike.%${term}%,username.ilike.%${term}%`).join(','))
      .limit(5);
    return data || [];
  }, []);

  const callContact = useCallback(async (targetName: string) => {
    const profiles = await findProfileByName(targetName);

    if (profiles.length > 0) {
      const targetUserId = profiles[0].user_id;
      const [{ data: profilePhone }, { data: professionalPhone }, { data: businessPhone }] = await Promise.all([
        supabase.from('profiles').select('display_name, phone').eq('user_id', targetUserId).maybeSingle(),
        supabase.from('professionals').select('business_name, whatsapp').eq('user_id', targetUserId).maybeSingle(),
        supabase.from('businesses_public').select('business_name, phone').eq('user_id', targetUserId).maybeSingle(),
      ]);

      const label = businessPhone?.business_name || professionalPhone?.business_name || profilePhone?.display_name || profiles[0].display_name || profiles[0].username || targetName;
      const phone = profilePhone?.phone || professionalPhone?.whatsapp || businessPhone?.phone;

      if (phone) {
        window.location.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
        return `Sto chiamando ${label}.`;
      }

      navigate('/chat');
      return `Non ho trovato un numero per ${label}, quindi apro la chat.`;
    }

    const { data: business } = await supabase
      .from('businesses_public')
      .select('business_name, phone')
      .ilike('business_name', `%${targetName}%`)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    if (business?.phone) {
      window.location.href = `tel:${business.phone.replace(/[^\d+]/g, '')}`;
      return `Sto chiamando ${business.business_name}.`;
    }

    navigate('/chat');
    return `Non ho trovato ${targetName}, quindi apro la chat.`;
  }, [findProfileByName, navigate]);

  // ── Helper: like a post ───────────────────────────────────────────────────
  const likeLatestPost = useCallback(async (targetName?: string) => {
    if (!user) return 'Devi effettuare il login per mettere like!';
    
    let postId: string | null = null;
    
    if (targetName) {
      const profiles = await findProfileByName(targetName);
      if (profiles.length > 0) {
        const { data: posts } = await supabase
          .from('posts')
          .select('id')
          .eq('user_id', profiles[0].user_id)
          .order('created_at', { ascending: false })
          .limit(1);
        postId = posts?.[0]?.id || null;
      }
    } else {
      const { data: posts } = await supabase
        .from('posts')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);
      postId = posts?.[0]?.id || null;
    }
    
    if (!postId) return 'Non ho trovato post da mettere like.';
    
    const { error } = await supabase.from('post_likes').insert({
      post_id: postId,
      user_id: user.id,
    });
    
    if (error?.code === '23505') return 'Hai già messo like a questo post! ❤️';
    if (error) return 'Errore nel mettere like. Riprova!';
    return 'Like aggiunto! ❤️';
  }, [user, findProfileByName]);

  // ── Helper: comment on a post ─────────────────────────────────────────────
  const commentOnPost = useCallback(async (comment: string, targetName?: string) => {
    if (!user) return 'Devi effettuare il login per commentare!';
    
    let postId: string | null = null;
    
    if (targetName) {
      const profiles = await findProfileByName(targetName);
      if (profiles.length > 0) {
        const { data: posts } = await supabase
          .from('posts')
          .select('id')
          .eq('user_id', profiles[0].user_id)
          .order('created_at', { ascending: false })
          .limit(1);
        postId = posts?.[0]?.id || null;
      }
    } else {
      const { data: posts } = await supabase
        .from('posts')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);
      postId = posts?.[0]?.id || null;
    }
    
    if (!postId) return 'Non ho trovato post da commentare.';
    
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: user.id,
      message: comment,
    });
    
    if (error) return 'Errore nel commentare. Riprova!';
    return `Commento aggiunto: "${comment}" 💬`;
  }, [user, findProfileByName]);

  // ── Helper: create a post ─────────────────────────────────────────────────
  const createPost = useCallback(async (content: string) => {
    if (!user) return 'Devi effettuare il login per pubblicare!';
    
    const { error } = await supabase.from('posts').insert({
      user_id: user.id,
      caption: content,
      post_type: 'image',
    });
    
    if (error) return 'Errore nella pubblicazione. Riprova!';
    return `Post pubblicato: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}" ✅`;
  }, [user]);

  // ── Helper: unfollow a user ───────────────────────────────────────────────
  const unfollowUser = useCallback(async (targetName: string) => {
    if (!user) return 'Devi effettuare il login!';
    
    const profiles = await findProfileByName(targetName);
    if (profiles.length === 0) return `Non ho trovato "${targetName}".`;
    
    const target = profiles[0];
    const { error } = await supabase.from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', target.user_id);
    
    if (error) return 'Errore. Riprova!';
    return `Hai smesso di seguire ${target.display_name || target.username}! ✅`;
  }, [user, findProfileByName]);

  // ── Helper: confirm/cancel booking ────────────────────────────────────────
  const manageBooking = useCallback(async (action: 'confirm' | 'cancel') => {
    if (!user) return 'Devi effettuare il login!';
    
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, booking_date, status')
      .eq('client_id', user.id)
      .eq('status', 'pending')
      .order('booking_date', { ascending: true })
      .limit(1);
    
    if (!bookings?.length) return 'Non hai prenotazioni in sospeso!';
    
    const booking = bookings[0];
    const newStatus = action === 'confirm' ? 'confirmed' : 'cancelled';
    
    const { error } = await supabase.from('bookings')
      .update({ status: newStatus })
      .eq('id', booking.id);
    
    if (error) return `Errore nel ${action === 'confirm' ? 'confermare' : 'cancellare'} la prenotazione.`;
    return action === 'confirm' 
      ? `Prenotazione del ${booking.booking_date} confermata! ✅`
      : `Prenotazione del ${booking.booking_date} cancellata! ❌`;
  }, [user]);

  // ── Helper: parse a spoken relative date into an ISO date string ─────────
  const parseSpokenDate = useCallback((textLower: string): string => {
    const today = new Date();
    const dayNamesIt: Record<string, number> = {
      domenica: 0, lunedì: 1, lunedi: 1, martedì: 2, martedi: 2, mercoledì: 3, mercoledi: 3,
      giovedì: 4, giovedi: 4, venerdì: 5, venerdi: 5, sabato: 6,
    };
    if (/\bdopodomani\b/.test(textLower)) {
      today.setDate(today.getDate() + 2);
      return today.toISOString().split('T')[0];
    }
    if (/\boggi\b/.test(textLower)) {
      return today.toISOString().split('T')[0];
    }
    if (/\bdomani\b/.test(textLower)) {
      today.setDate(today.getDate() + 1);
      return today.toISOString().split('T')[0];
    }
    for (const [name, dow] of Object.entries(dayNamesIt)) {
      if (textLower.includes(name)) {
        const d = new Date();
        const diff = (dow - d.getDay() + 7) % 7 || 7; // next occurrence, always in the future
        d.setDate(d.getDate() + diff);
        return d.toISOString().split('T')[0];
      }
    }
    // Default: tomorrow (never book same-day without an explicit "oggi").
    today.setDate(today.getDate() + 1);
    return today.toISOString().split('T')[0];
  }, []);

  // ── Helper: autonomous end-to-end booking ─────────────────────────────────
  // Finds the professional, checks their real calendar for the next free
  // slot on (or after) the requested date, and creates the booking —
  // exactly like a client would via BookingPage, but voice-driven.
  const autoBookAppointment = useCallback(async (targetName: string, rawText: string) => {
    if (!user) return { message: 'Devi effettuare il login per prenotare!', bookingId: null as string | null };

    const { data: pros } = await supabase
      .from('professionals')
      .select('id, business_name, user_id')
      .ilike('business_name', `%${targetName}%`)
      .limit(1);

    let professionalId = pros?.[0]?.id as string | undefined;
    let businessName = pros?.[0]?.business_name as string | undefined;

    if (!professionalId) {
      const profiles = await findProfileByName(targetName);
      if (profiles.length > 0) {
        const { data: proByUser } = await supabase
          .from('professionals')
          .select('id, business_name')
          .eq('user_id', profiles[0].user_id)
          .maybeSingle();
        professionalId = proByUser?.id;
        businessName = proByUser?.business_name || profiles[0].display_name || targetName;
      }
    }

    if (!professionalId) {
      return { message: `Non ho trovato "${targetName}" tra i professionisti registrati.`, bookingId: null as string | null };
    }

    const { data: services } = await supabase
      .from('services')
      .select('id, name, price, duration_minutes')
      .eq('professional_id', professionalId)
      .eq('active', true)
      .order('price', { ascending: true })
      .limit(1);

    const service = services?.[0];
    const durationMinutes = service?.duration_minutes || 30;
    const requestedDate = parseSpokenDate(rawText.toLowerCase());

    const slot = await findNextAvailableSlot(professionalId, requestedDate, durationMinutes);
    if (!slot) {
      return { message: `${businessName || targetName} non ha orari liberi nei prossimi 14 giorni, prova a chiamare direttamente.`, bookingId: null as string | null };
    }

    const [startH, startM] = slot.time.split(':').map(Number);
    const endTotal = startH * 60 + startM + durationMinutes;
    const endTime = `${Math.floor(endTotal / 60).toString().padStart(2, '0')}:${(endTotal % 60).toString().padStart(2, '0')}`;

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        client_id: user.id,
        professional_id: professionalId,
        service_id: service?.id,
        booking_date: slot.date,
        start_time: slot.time,
        end_time: endTime,
        total_price: service?.price,
      })
      .select('id')
      .single();

    if (error || !booking) {
      console.error('Stella auto-booking error:', error);
      return { message: `Errore nella prenotazione con ${businessName || targetName}, riprova.`, bookingId: null as string | null };
    }

    const dateLabel = new Date(slot.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    const sameAsRequested = slot.date === requestedDate;
    const priceLabel = service?.price ? ` (€${service.price})` : '';
    const message = sameAsRequested
      ? `Prenotato con ${businessName || targetName} ${dateLabel} alle ${slot.time}${priceLabel}! ✅`
      : `Il giorno richiesto era pieno, ho prenotato il primo slot libero: ${dateLabel} alle ${slot.time} con ${businessName || targetName}${priceLabel}! ✅`;

    return { message, bookingId: booking.id as string, price: service?.price };
  }, [user, findProfileByName, parseSpokenDate]);

  // ── Helper: find nearby professionals/salons by city or GPS ─────────────
  const findNearbyProfessionals = useCallback(async (city?: string, specialty?: string) => {
    // Try professionals table
    let query = supabase.from('professionals').select('id, business_name, specialty, city, rating, latitude, longitude');
    if (city) query = query.ilike('city', `%${city}%`);
    if (specialty) query = query.ilike('specialty', `%${specialty}%`);
    const { data: pros } = await query.order('rating', { ascending: false }).limit(10);

    // Try businesses table
    let bizQuery = supabase.from('businesses_public').select('id, business_name, business_type, city, rating, latitude, longitude, phone, address');
    if (city) bizQuery = bizQuery.ilike('city', `%${city}%`);
    bizQuery = bizQuery.eq('active', true);
    const { data: biz } = await bizQuery.order('rating', { ascending: false }).limit(10);

    // Also try profiles table (professional users registered here)
    let profileQuery = supabase.from('profiles').select('user_id, display_name, user_type, city, latitude, longitude')
      .in('user_type', ['professional', 'business']);
    if (city) profileQuery = profileQuery.ilike('city', `%${city}%`);
    const { data: profilePros } = await profileQuery.limit(20);

    const results: Array<{ name: string; type: string; city: string; rating: number | null; distance?: number }> = [];

    // Get user position for distance calc
    let userLat: number | null = null;
    let userLng: number | null = null;
    if (profile && (profile as any).latitude) {
      userLat = (profile as any).latitude;
      userLng = (profile as any).longitude;
    } else if (navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
      } catch { /* ignore */ }
    }

    // Collect unique names to avoid duplicates
    const seenNames = new Set<string>();

    if (pros?.length) {
      for (const p of pros) {
        if (seenNames.has(p.business_name)) continue;
        seenNames.add(p.business_name);
        const dist = userLat && p.latitude ? haversineDistance(userLat, userLng!, p.latitude, p.longitude!) : undefined;
        results.push({ name: p.business_name, type: p.specialty || 'Professionista', city: p.city || '', rating: p.rating, distance: dist });
      }
    }
    if (biz?.length) {
      for (const b of biz) {
        if (seenNames.has(b.business_name)) continue;
        seenNames.add(b.business_name);
        const dist = userLat && b.latitude ? haversineDistance(userLat, userLng!, b.latitude, b.longitude!) : undefined;
        results.push({ name: b.business_name, type: b.business_type || 'Salone', city: b.city || '', rating: b.rating, distance: dist });
      }
    }
    if (profilePros?.length) {
      for (const p of profilePros) {
        const name = p.display_name || 'Professionista';
        if (seenNames.has(name)) continue;
        seenNames.add(name);
        const dist = userLat && p.latitude ? haversineDistance(userLat, userLng!, p.latitude, p.longitude!) : undefined;
        results.push({ name, type: p.user_type === 'business' ? 'Attività' : 'Professionista', city: p.city || '', rating: null, distance: dist });
      }
    }

    // Sort by distance if available, then by rating
    results.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      if (a.distance != null) return -1;
      if (b.distance != null) return 1;
      return (b.rating || 0) - (a.rating || 0);
    });

    if (results.length === 0) {
      return { found: false, message: city 
        ? `Non ho trovato professionisti o saloni a ${city}. Prova a cercare in un'altra città!`
        : 'Non ho trovato professionisti nelle vicinanze. Prova a specificare una città!' };
    }

    const top = results.slice(0, 5);
    const lines = top.map((r, i) => {
      const dist = r.distance != null ? ` (${r.distance.toFixed(1)} km)` : '';
      const stars = r.rating ? ` ⭐${r.rating}` : '';
      return `${i + 1}. ${r.name} — ${r.type}${r.city ? ', ' + r.city : ''}${stars}${dist}`;
    });

    return {
      found: true,
      count: results.length,
      message: `Ho trovato ${results.length} risultat${results.length === 1 ? 'o' : 'i'}${city ? ' a ' + city : ' vicino a te'}:\n${lines.join('\n')}`,
      summary: `Ho trovato ${results.length} professionisti${city ? ' a ' + city : ''}! I migliori: ${top.slice(0, 3).map(r => r.name).join(', ')}`,
    };
  }, [profile]);

  // ── Helper: follow a user ─────────────────────────────────────────────────
  // BUG TROVATO: quando riconosceva "chiama qualcuno", Stella si
  // limitava ad aprire la lista chat generale — ignorava completamente
  // il nome della persona, non avviava mai la chiamata vera. Costruita
  // per davvero: cerca la persona per nome (stesso motore già
  // funzionante di "segui"/"messaggio"), poi avvia davvero la
  // videochiamata o chiamata vocale tramite il sistema di chiamate
  // condiviso in tutta l'app.
  const callUser = useCallback(async (targetName: string, kind: "video" | "voice" = "video") => {
    if (!user) return "Devi effettuare il login per chiamare qualcuno!";
    if (callStatus !== "idle") return "Hai già una chiamata in corso!";

    const profiles = await findProfileByName(targetName);
    if (profiles.length === 0) return `Non ho trovato nessun profilo con il nome "${targetName}".`;

    const target = profiles[0];
    if (target.user_id === user.id) return "Non puoi chiamare te stesso! 😄";

    rememberTarget(target.display_name || target.username || targetName, target.user_id);
    startRealCall(target.user_id, kind, target.display_name || target.username || targetName);
    return `Chiamata ${kind === "video" ? "video" : "vocale"} a ${target.display_name || target.username} in corso... 📞`;
  }, [user, callStatus, findProfileByName, rememberTarget, startRealCall]);

  const followUser = useCallback(async (targetName: string) => {
    if (!user) return 'Devi effettuare il login per seguire qualcuno!';
    
    const profiles = await findProfileByName(targetName);
    if (profiles.length === 0) return `Non ho trovato nessun profilo con il nome "${targetName}".`;
    
    const target = profiles[0];
    if (target.user_id === user.id) return 'Non puoi seguire te stesso! 😄';
    
    const { error } = await supabase.from('follows').insert({
      follower_id: user.id,
      following_id: target.user_id,
    });
    
    if (error?.code === '23505') return `Stai già seguendo ${target.display_name || target.username}!`;
    if (error) return 'Errore nel seguire. Riprova!';
    rememberTarget(target.display_name || target.username || targetName, target.user_id);
    return `Ora segui ${target.display_name || target.username}! ✅`;
  }, [user, findProfileByName, rememberTarget]);

  // ── Helper: send message ──────────────────────────────────────────────────
  const sendMessageTo = useCallback(async (targetName: string, content: string) => {
    if (!user) return 'Devi effettuare il login per inviare messaggi!';
    
    const profiles = await findProfileByName(targetName);
    if (profiles.length === 0) return `Non ho trovato nessun profilo con il nome "${targetName}".`;
    
    const target = profiles[0];
    rememberTarget(target.display_name || target.username || targetName, target.user_id);
    
    // Find or create conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${user.id},participant_2.eq.${target.user_id}),and(participant_1.eq.${target.user_id},participant_2.eq.${user.id})`)
      .limit(1);
    
    let conversationId = existing?.[0]?.id;
    
    if (!conversationId) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ participant_1: user.id, participant_2: target.user_id })
        .select('id')
        .single();
      conversationId = newConv?.id;
    }
    
    if (!conversationId) return 'Errore nella creazione della conversazione.';
    
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
    });
    
    await supabase.from('conversations').update({
      last_message: content,
      last_message_at: new Date().toISOString(),
    }).eq('id', conversationId);
    
    return `Messaggio inviato a ${target.display_name || target.username}! 💬`;
  }, [user, findProfileByName, rememberTarget]);

  // ── Helper: get user stats summary ─────────────────────────────────────────
  const getUserStats = useCallback(async () => {
    if (!user) return 'Devi effettuare il login!';
    const [{ count: postCount }, { count: bookingCount }, { count: followerCount }] = await Promise.all([
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('client_id', user.id),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', user.id),
    ]);
    const coins = profile?.qr_coins ?? 0;
    return `📊 Le tue stats:\n• ${postCount || 0} post pubblicati\n• ${bookingCount || 0} prenotazioni\n• ${followerCount || 0} follower\n• ${coins} QR Coins`;
  }, [user, profile]);

  // ── Helper: get notifications summary ─────────────────────────────────────
  const getNotificationsSummary = useCallback(async () => {
    if (!user) return 'Devi effettuare il login!';
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('read', false);
    if (!count || count === 0) return 'Non hai notifiche non lette! ✅';
    return `Hai ${count} notifiche non lette! 🔔`;
  }, [user]);

  // ── Helper: get upcoming bookings ─────────────────────────────────────────
  const getUpcomingBookings = useCallback(async () => {
    if (!user) return 'Devi effettuare il login!';
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('bookings')
      .select('booking_date, start_time, status')
      .eq('client_id', user.id)
      .gte('booking_date', today)
      .in('status', ['confirmed', 'pending'])
      .order('booking_date', { ascending: true })
      .limit(3);
    if (!data?.length) return 'Non hai appuntamenti in programma! 📅';
    const lines = data.map((b, i) => `${i + 1}. ${b.booking_date} alle ${b.start_time} (${b.status === 'confirmed' ? '✅' : '⏳'})`);
    return `📅 Prossimi appuntamenti:\n${lines.join('\n')}`;
  }, [user]);

  // ── Helper: navigate to specific profile ──────────────────────────────────
  const goToProfile = useCallback(async (name: string) => {
    const profiles = await findProfileByName(name);
    if (profiles.length === 0) {
      navigate(`/search?q=${encodeURIComponent(name)}`);
      return `Non ho trovato "${name}" esattamente, apro la ricerca!`;
    }
    const p = profiles[0];
    rememberTarget(p.display_name || p.username || name, p.user_id);
    navigate(`/profile/${p.user_id}`);
    return `Ecco il profilo di ${p.display_name || p.username}! 👤`;
  }, [findProfileByName, navigate, rememberTarget]);

  // ── FULL COMMAND PARSER ─────────────────────────────────────────────────────
  const parseCommand = useCallback((text: string): StellaCommand | null => {
    const t = text.toLowerCase().trim();

    // ── Strip "stella" prefix if present ──────────────────────────────────
    let stripped = t.replace(/^(?:stella|hey stella|ehi stella|ciao stella)\s*[,.]?\s*/i, '');

    // ── L2: PRONOUN RESOLUTION ─────────────────────────────────────────
    // "chiamalo / scrivigli / seguilo / prenotalo / mostralo" → use last target
    const remembered = getRememberedTarget();
    if (remembered) {
      const pronounMap: Array<{ re: RegExp; replace: string }> = [
        { re: /^chiamal[oa]\b/, replace: `chiama ${remembered.name}` },
        { re: /^scrivigli\b|^scrivile\b|^mandagli un messaggio\b|^mandale un messaggio\b/, replace: `scrivi un messaggio a ${remembered.name}` },
        { re: /^seguil[oa]\b/, replace: `segui ${remembered.name}` },
        { re: /^smetti di seguirl[oa]\b|^non seguirl[oa] piu\b/, replace: `unfollow ${remembered.name}` },
        { re: /^prenotal[oa]\b|^prenota con lui\b|^prenota con lei\b/, replace: `prenota con ${remembered.name}` },
        { re: /^mostral[oa]\b|^aprilo\b|^aprila\b|^vai sul suo profilo\b/, replace: `apri profilo ${remembered.name}` },
        { re: /^metti like al suo post\b|^like al suo post\b|^like ai suoi post\b/, replace: `metti like a ${remembered.name}` },
      ];
      for (const { re, replace } of pronounMap) {
        if (re.test(stripped)) { stripped = stripped.replace(re, replace); break; }
      }
    }

    // ── SHOW LATEST PHOTOS / POSTS ────────────────────────────────────────
    const latestPhotosMatch = stripped.match(/(?:mostrami|mostra|vedi|apri)\s+(?:le\s+)?ultim(?:e|a)\s+foto(?:\s+pubblicat[ae])?\s+(?:di|del|della|de|da)\s+(.+)/);
    if (latestPhotosMatch) {
      const target = latestPhotosMatch[1]?.trim() || '';
      return {
        id: Date.now().toString(), type: 'action', text,
        response: `Ti mostro le ultime foto di ${target}...`, requiresConfirmation: false, silent: true,
        execute: async () => {
          const result = await goToProfile(target);
          const spokenResult = result.includes('Non ho trovato')
            ? result
            : `Ti mostro le ultime foto di ${target}.`;
          toast.success(`🌟 Stella: ${spokenResult}`);
          stellaSpeak(spokenResult);
        },
      };
    }

    // ── SHOW / OPEN PROFILE by name (direct DB lookup) ────────────────────
    // FIX: must explicitly mention "profilo" — otherwise this regex eats every
    // navigation command ("apri mappa" → "profilo di mappa"). Also exclude
    // "il mio profilo" / "profilo mio" (handled by navRoutes).
    const profileMatch = stripped.match(/(?:mostrami|mostra|apri|vedi|fammi vedere|portami a|portami al|vai al|chi è)\s+(?:il\s+)?profilo\s+(?:di\s+)?(.+)/)
      || stripped.match(/^profilo\s+(?:di\s+)?(.+)/);
    if (profileMatch && !stripped.includes('profilo mio') && !stripped.includes('mio profilo') && !/^(?:il\s+)?profilo$/.test(stripped)) {
      const name = profileMatch[1].replace(/\s+(?:profilo)$/, '').trim();
      // Skip if "name" is actually a known route keyword
      const reservedWords = ['mio', 'tuo', 'utente', 'cliente', 'pro', 'professionista', 'business'];
      if (name.length > 1 && !reservedWords.includes(name)) {
        return {
          id: Date.now().toString(), type: 'action', text,
          response: `Cerco il profilo di ${name}...`, requiresConfirmation: false, silent: true,
          execute: async () => {
            const result = await goToProfile(name);
            toast.success(`🌟 Stella: ${result}`);
            stellaSpeak(result);
          },
        };
      }
    }

    // ── NEARBY PROFESSIONALS (with real DB results) ─────────────────────
    const nearbyPatterns = ['professionisti in zona', 'professionisti disponibili', 'professionisti vicini',
      'chi è disponibile', 'saloni vicini', 'stilisti vicini', 'parrucchieri vicini', 'chi c\'è in zona',
      'trova professionisti', 'cerca professionisti vicino', 'saloni a', 'parrucchieri a', 'professionisti a',
      'stilisti a', 'chi c\'è a', 'trova saloni', 'cerca saloni'];
    const cityExtract = stripped.match(/(?:professionisti|saloni|stilisti|parrucchieri|chi c'è)\s+(?:a|in|di|near|vicino a|nella città di)\s+(.+)/);
    const requestedCity = cityExtract?.[1]?.trim();
    
    if (nearbyPatterns.some(p => stripped.includes(p)) || requestedCity) {
      return {
        id: Date.now().toString(), type: 'search', text,
        response: requestedCity ? `Cerco professionisti a ${requestedCity}...` : 'Cerco professionisti vicino a te...', 
        requiresConfirmation: false, silent: true,
        execute: async () => {
          const result = await findNearbyProfessionals(requestedCity || profile?.city || undefined);
          if (result.found) {
            toast.success(`🌟 Stella: ${result.summary}`, { duration: 6000 });
            stellaSpeak(result.summary!);
            // Also navigate to stylists page for full list
            navigate('/stylists');
          } else {
            toast.info(`🌟 Stella: ${result.message}`, { duration: 5000 });
            stellaSpeak(result.message);
            navigate('/map-search');
          }
        },
      };
    }

    // ── NAVIGATION MAP ────────────────────────────────────────────────────
    const navRoutes: Array<{ patterns: string[]; route: string; response: string }> = [
      { patterns: ['vai alla home', 'apri home', 'torna alla home', 'home page', 'torna a casa'], route: '/', response: 'Ti porto alla home!' },
      { patterns: ['apri chat', 'vai alla chat', 'messaggi', 'apri messaggi', 'le mie chat'], route: '/chat', response: 'Apro la chat!' },
      { patterns: ['apri notifiche', 'le notifiche', 'dimmi le notifiche', 'vedi notifiche', 'mostra notifiche'], route: '/notifications', response: 'Ecco le tue notifiche!' },
      { patterns: ['apri profilo', 'vai al profilo', 'il mio profilo', 'profilo mio'], route: '/profile', response: 'Ecco il tuo profilo!' },
      { patterns: ['modifica profilo', 'edit profilo', 'cambia profilo', 'aggiorna profilo'], route: '/profile/edit', response: 'Apro la modifica del profilo!' },
      { patterns: ['cambia foto profilo', 'cambia immagine profilo', 'nuova foto profilo', 'aggiorna foto profilo', 'cambia avatar'], route: '/profile/edit?focus=avatar', response: 'Apro la modifica profilo: tocca la tua foto per sceglierne una nuova dalla galleria!' },
      { patterns: ['apri wallet', 'vai al wallet', 'portafoglio', 'i miei soldi', 'saldo'], route: '/wallet', response: 'Apro il tuo wallet!' },
      { patterns: ['apri mappa', 'cerca sulla mappa', 'mappa', 'dove sono'], route: '/map-search', response: 'Apro la mappa!' },
      { patterns: ['vai allo shop', 'apri shop', 'negozio', 'prodotti', 'compra'], route: '/shop', response: 'Apro lo shop!' },
      { patterns: ['vai alle missioni', 'apri missioni', 'missioni', 'le mie missioni'], route: '/missions', response: 'Ecco le tue missioni!' },
      { patterns: ['gira la ruota', 'ruota della fortuna', 'spin', 'fortuna'], route: '/spin', response: 'Apro la ruota della fortuna!' },
      { patterns: ['vai in live', 'apri live', 'streaming', 'dirette'], route: '/live', response: 'Ti porto nella sezione live!' },
      { patterns: ['apri radio', 'musica', 'radio', 'ascolta musica'], route: '/radio', response: 'Apro la radio!' },
      { patterns: ['impostazioni', 'apri impostazioni', 'settings', 'le impostazioni'], route: '/settings', response: 'Apro le impostazioni!' },
      { patterns: ['risposta automatica chiamate', 'gestione chiamate', 'rispondi tu alle chiamate', 'impostazioni chiamate', 'segreteria'], route: '/call-auto-answer', response: 'Apro le impostazioni di risposta automatica alle chiamate!' },
      { patterns: ['assistente ai', 'apri assistente', 'ai assistant', "l'assistente"], route: '/ai-assistant', response: 'Apro l\'assistente AI!' },
      { patterns: ['crea richiesta servizio', 'nuova richiesta', 'richiedi un servizio'], route: '/marketplace/create-request', response: 'Apro la creazione di una nuova richiesta!' },
      { patterns: ['crea casting', 'nuovo casting', 'pubblica casting'], route: '/marketplace/create-casting', response: 'Apro la creazione di un nuovo casting!' },
      { patterns: ['invita collaboratore', 'invita dipendente', 'aggiungi al team'], route: '/business/team/invite', response: 'Apro gli inviti del team!' },
      { patterns: ['attività team', 'attivita team', 'cosa fa il team'], route: '/business/team/activity', response: 'Apro l\'attività del team!' },
      { patterns: ['privacy', 'informativa privacy'], route: '/privacy', response: 'Apro l\'informativa sulla privacy!' },
      { patterns: ['termini', 'termini e condizioni', 'condizioni di servizio'], route: '/terms', response: 'Apro i termini e condizioni!' },
      { patterns: ['esplora', 'apri esplora', 'scopri'], route: '/explore', response: 'Apro la sezione esplora!' },
      { patterns: ['crea post', 'pubblica', 'nuovo post', 'scrivi post', 'fai un post'], route: '/create-post', response: 'Apro la creazione di un nuovo post!' },
      { patterns: ['le mie prenotazioni', 'mostra prenotazioni', 'i miei appuntamenti', 'appuntamenti'], route: '/my-bookings', response: 'Ecco le tue prenotazioni!' },
      { patterns: ['classifica', 'leaderboard', 'graduatoria'], route: '/leaderboard', response: 'Apro la classifica!' },
      { patterns: ['sfide', 'challenge', 'sfida', 'le sfide'], route: '/challenges', response: 'Ecco le sfide attive!' },
      { patterns: ['shorts', 'video brevi', 'reels', 'i video'], route: '/shorts', response: 'Apro i video shorts!' },
      { patterns: ['eventi', 'apri eventi', 'prossimi eventi'], route: '/events', response: 'Ecco gli eventi!' },
      { patterns: ['marketplace', 'apri marketplace', 'mercato'], route: '/marketplace', response: 'Apro il marketplace!' },
      { patterns: ['spa', 'terme', 'benessere', 'centri spa'], route: '/spa-terme', response: 'Ecco le Spa e Terme!' },
      { patterns: ['quiz', 'gioca al quiz', 'quiz live'], route: '/quiz-live', response: 'Apro il Quiz Live!' },
      { patterns: ['talent', 'gioco talent', 'talent game'], route: '/talent-game', response: 'Apro il Talent Game!' },
      { patterns: ['referral', 'invita amici', 'programma inviti', 'invita un amico'], route: '/referral', response: 'Apro il programma referral!' },
      { patterns: ['abbonamento', 'abbonamenti', 'subscription', 'piano', 'vai premium'], route: '/subscriptions', response: 'Ecco i piani di abbonamento!' },
      { patterns: ['promemoria', 'reminder', 'i miei promemoria'], route: '/reminders', response: 'Ecco i tuoi promemoria!' },
      { patterns: ['stilisti', 'parrucchieri', 'trova stilista'], route: '/stylists', response: 'Ecco i professionisti!' },
      { patterns: ['qr coin', 'le mie monete', 'coins', 'qr coins'], route: '/qr-coins', response: 'Ecco i tuoi QR Coins!' },
      { patterns: ['prima dopo', 'before after', 'trasformazioni'], route: '/before-after', response: 'Apro le trasformazioni!' },
      { patterns: ['offerte', 'promozioni', 'sconti'], route: '/offers', response: 'Ecco le offerte!' },
      { patterns: ['aste', 'asta', 'auction'], route: '/auctions', response: 'Apro le aste!' },
      { patterns: ['ricevute', 'scontrini', 'receipts', 'fatture'], route: '/receipts', response: 'Ecco le tue ricevute!' },
      { patterns: ['verifica account', 'verifica profilo', 'verificami'], route: '/verify-account', response: 'Apro la verifica account!' },
      { patterns: ['dashboard business', 'pannello business', 'gestione attività', 'il mio business'], route: '/business', response: 'Apro la dashboard business!' },
      { patterns: ['gestisci team', 'team dipendenti', 'i miei dipendenti', 'staff'], route: '/business/team', response: 'Apro la gestione del team!' },
      { patterns: ['turni dipendenti', 'gestisci turni', 'orari lavoro', 'turni'], route: '/business/team/shifts', response: 'Apro la gestione turni!' },
      { patterns: ['risorse umane', 'hr', 'assunzioni', 'offerte lavoro'], route: '/hr', response: 'Apro la sezione HR!' },
      { patterns: ['crea annuncio lavoro', 'pubblica offerta lavoro', 'nuovo lavoro'], route: '/hr/create-job', response: 'Creo un nuovo annuncio di lavoro!' },
      { patterns: ['gestisci prodotti', 'i miei prodotti', 'catalogo', 'inventario'], route: '/manage-products', response: 'Apro la gestione prodotti!' },
      { patterns: ['analytics', 'statistiche', 'dati', 'le mie statistiche'], route: '/analytics', response: 'Apro le statistiche!' },
      { patterns: ['affiliato', 'affiliate', 'programma affiliazione', 'affiliati'], route: '/affiliate', response: 'Apro il programma affiliazione!' },
      { patterns: ['dashboard professionale', 'pannello pro', 'i miei guadagni'], route: '/professional-dashboard', response: 'Apro la dashboard professionale!' },
      { patterns: ['boost profilo', 'promuovi profilo', 'sponsorizza', 'potenzia profilo'], route: '/boost', response: 'Apro il boost profilo!' },
      { patterns: ['diventa creator', 'creator', 'applicazione creator', 'candidatura creator'], route: '/become-creator', response: 'Apro l\'applicazione creator!' },
      { patterns: ['ai look', 'prova look', 'genera look', 'cambio look', 'prova taglio', 'prova colore', 'nuovo look'], route: '/ai-look', response: 'Apro il generatore di look AI!' },
      { patterns: ['anteprima ai', 'ai preview', 'prova stile'], route: '/ai-preview', response: 'Apro l\'anteprima AI!' },
      { patterns: ['calendario contenuti', 'content calendar', 'pianifica contenuti', 'piano editoriale'], route: '/content-calendar', response: 'Apro il calendario contenuti!' },
      { patterns: ['analisi predittiva', 'predictive', 'previsioni', 'forecasting', 'predittiva'], route: '/predictive-analytics', response: 'Apro l\'analisi predittiva!' },
      { patterns: ['automazione social', 'social automation', 'gestisci social', 'social media'], route: '/social-automation', response: 'Apro l\'automazione social!' },
      { patterns: ['genera sito', 'website generator', 'crea sito', 'landing page', 'il mio sito'], route: '/website-generator', response: 'Apro il generatore di siti web!' },
      { patterns: ['white label', 'agenzia', 'rivendita', 'reseller', 'whitelabel'], route: '/white-label', response: 'Apro il pannello White Label!' },
      { patterns: ['impostazioni globali', 'multi lingua', 'multi country', 'lingue e valute'], route: '/global-settings', response: 'Apro le impostazioni globali!' },
      { patterns: ['enterprise api', 'api key', 'webhook', 'chiavi api'], route: '/enterprise-api', response: 'Apro la dashboard Enterprise API!' },
      { patterns: ['tenant', 'pannello tenant', 'multi tenant'], route: '/tenant', response: 'Apro il pannello tenant!' },
      { patterns: ['vai live', 'go live', 'inizia streaming', 'avvia diretta'], route: '/go-live', response: 'Ti preparo per andare in diretta!' },
      { patterns: ['battle live', 'sfida live', 'live battle'], route: '/live-battle', response: 'Apro le Live Battle!' },
      { patterns: ['trasformazione', 'challenge trasformazione'], route: '/transformation-challenge', response: 'Apro le sfide di trasformazione!' },
      { patterns: ['checkout', 'paga', 'procedi al pagamento'], route: '/checkout', response: 'Apro il checkout!' },
      { patterns: ['rate', 'pagamento rateale', 'finanziamento'], route: '/installments', response: 'Apro i pagamenti rateali!' },
      { patterns: ['acquisti', 'storico acquisti', 'cronologia acquisti', 'i miei ordini'], route: '/purchases', response: 'Ecco lo storico acquisti!' },
      { patterns: ['ricerca', 'cerca', 'apri ricerca'], route: '/search', response: 'Apro la ricerca!' },
      { patterns: ['admin', 'pannello admin', 'amministrazione'], route: '/admin', response: 'Apro il pannello admin!' },
      { patterns: ['servizio a domicilio', 'a domicilio', 'home service'], route: '/home-service', response: 'Apro i servizi a domicilio!' },
    ];

    for (const nav of navRoutes) {
      if (nav.patterns.some(p => stripped.includes(p))) {
        return {
          id: Date.now().toString(), type: 'navigate', text,
          response: nav.response, requiresConfirmation: false, silent: true,
          execute: () => { navigate(nav.route); toast.success(`🌟 Stella: ${nav.response}`); },
        };
      }
    }

    // ── BACK / SCROLL / REFRESH ────────────────────────────────────────────
    if (stripped.includes('torna indietro') || stripped.includes('vai indietro') || stripped === 'indietro') {
      return { id: Date.now().toString(), type: 'navigate', text, response: 'Torno indietro!', requiresConfirmation: false, silent: true,
        execute: () => { window.history.back(); toast.success('🌟 Stella: Torno indietro!'); } };
    }
    if (stripped.includes('scorri su') || stripped.includes('vai su')) {
      return { id: Date.now().toString(), type: 'navigate', text, response: 'Scorro verso l\'alto!', requiresConfirmation: false, silent: true,
        execute: () => { window.scrollBy({ top: -400, behavior: 'smooth' }); } };
    }
    if (stripped.includes('scorri giù') || stripped.includes('vai giù') || stripped.includes('scorri in basso')) {
      return { id: Date.now().toString(), type: 'navigate', text, response: 'Scorro verso il basso!', requiresConfirmation: false, silent: true,
        execute: () => { window.scrollBy({ top: 400, behavior: 'smooth' }); } };
    }
    if (stripped.includes('vai in cima') || stripped.includes('torna su') || stripped.includes('inizio pagina')) {
      return { id: Date.now().toString(), type: 'navigate', text, response: 'Torno all\'inizio!', requiresConfirmation: false, silent: true,
        execute: () => { window.scrollTo({ top: 0, behavior: 'smooth' }); } };
    }
    if (stripped.includes('vai in fondo') || stripped.includes('fine pagina')) {
      return { id: Date.now().toString(), type: 'navigate', text, response: 'Scorro in fondo!', requiresConfirmation: false, silent: true,
        execute: () => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); } };
    }
    if (stripped.includes('ricarica') || stripped.includes('aggiorna pagina') || stripped.includes('refresh')) {
      return { id: Date.now().toString(), type: 'navigate', text, response: 'Ricarico la pagina!', requiresConfirmation: false, silent: true,
        execute: () => { toast.success('🌟 Stella: Ricarico!'); setTimeout(() => window.location.reload(), 500); } };
    }

    // ── THEME ──────────────────────────────────────────────────────────────
    if (stripped.includes('tema chiaro') || stripped.includes('light mode') || stripped.includes('modalità chiara')) {
      return { id: Date.now().toString(), type: 'action', text, response: 'Attivo il tema chiaro! ☀️', requiresConfirmation: false, silent: true,
        execute: () => { document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light'); toast.success('🌟 Stella: Tema chiaro attivato! ☀️'); } };
    }
    if (stripped.includes('tema scuro') || stripped.includes('dark mode') || stripped.includes('modalità scura')) {
      return { id: Date.now().toString(), type: 'action', text, response: 'Attivo il tema scuro! 🌙', requiresConfirmation: false, silent: true,
        execute: () => { document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark'); toast.success('🌟 Stella: Tema scuro attivato! 🌙'); } };
    }

    // ── DIRECT LIKE (with optional target) ────────────────────────────────
    const likeMatch = stripped.match(/(?:metti|dai|fai)\s+(?:un\s+)?like\s+(?:a|al post di|alla foto di|al|alla)\s+(.+)/);
    if (likeMatch) {
      const target = likeMatch[1].trim();
      return {
        id: Date.now().toString(), type: 'like', text,
        response: `Metto like a ${target}...`, requiresConfirmation: false, silent: true,
        execute: async () => {
          const result = await likeLatestPost(target);
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }
    if (stripped.match(/metti\s+like|dai\s+like|mi\s+piace|metti un like/)) {
      return {
        id: Date.now().toString(), type: 'like', text,
        response: 'Metto like! ❤️', requiresConfirmation: false, silent: true,
        execute: async () => {
          const result = await likeLatestPost();
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }

    // ── DIRECT FOLLOW ─────────────────────────────────────────────────────
    // FIX: "aggiungi" was too broad ("aggiungi al carrello" → tried to follow user "al carrello").
    // Restrict to explicit follow verbs only.
    const followMatch = stripped.match(/^(?:segui|inizia a seguire|follow)\s+(.+)/);
    if (followMatch) {
      const target = followMatch[1].trim();
      return {
        id: Date.now().toString(), type: 'follow', text,
        response: `Seguo ${target}...`, requiresConfirmation: false, silent: true,
        execute: async () => {
          const result = await followUser(target);
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }

    // ── DIRECT MESSAGE (with content) ─────────────────────────────────────
    const msgMatch = stripped.match(/(?:invia|scrivi|manda)\s+(?:un\s+)?messaggio\s+a\s+([^:,]+?)(?:\s*[,:]\s*|\s+(?:che|dicendo|scrivendo|con scritto|con testo)\s+)(.+)/);
    if (msgMatch) {
      const recipient = msgMatch[1].trim();
      const content = msgMatch[2].trim();
      return {
        id: Date.now().toString(), type: 'message', text,
        response: `Conferma invio a ${recipient}: "${content}"`,
        requiresConfirmation: true, silent: false,
        preview: { kind: 'message', recipient, content },
        execute: async () => {
          const result = await sendMessageTo(recipient, content);
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }
    // Message without content — open chat
    const msgSimple = stripped.match(/(?:invia|scrivi|manda)\s+(?:un\s+)?messaggio\s+a\s+(.+)/);
    if (msgSimple) {
      const recipient = msgSimple[1].trim();
      return {
        id: Date.now().toString(), type: 'action', text,
        response: `Apro la chat con ${recipient}...`, requiresConfirmation: false, silent: true,
        execute: async () => {
          const profiles = await findProfileByName(recipient);
          if (profiles.length > 0) {
            navigate('/chat');
            toast.success(`🌟 Stella: Apro la chat con ${profiles[0].display_name || profiles[0].username}!`);
          } else {
            navigate('/chat');
            toast.info(`🌟 Stella: Non ho trovato "${recipient}", apro la chat.`);
          }
        },
      };
    }

    // ── CLICK / PRESS CURRENT UI ACTIONS ──────────────────────────────────
    const quickActionButtons: Record<string, string[]> = {
      prenota: ['prenota', 'book', 'book now'],
      conferma: ['conferma', 'confirm'],
      continua: ['continua', 'continue', 'prosegui'],
      salva: ['salva', 'save'],
      invia: ['invia', 'send'],
    };

    if (quickActionButtons[stripped]) {
      const targetLabel = stripped;
      return {
        id: Date.now().toString(), type: 'action', text,
        response: `Eseguo "${targetLabel}" qui nella pagina...`, requiresConfirmation: false, silent: true,
        execute: () => {
          const clicked = clickVisibleAction(quickActionButtons[targetLabel]);
          const result = clicked
            ? `Ho premuto "${targetLabel}".`
            : `Qui non vedo un pulsante "${targetLabel}".`;

          if (clicked) toast.success(`🌟 Stella: ${result}`);
          else toast.info(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }

    const clickActionMatch = stripped.match(/(?:clicca|premi|tocca|seleziona)\s+(.+)/);
    if (clickActionMatch) {
      const targetLabel = clickActionMatch[1].trim();
      return {
        id: Date.now().toString(), type: 'action', text,
        response: `Cerco il pulsante "${targetLabel}"...`, requiresConfirmation: false, silent: true,
        execute: () => {
          const clicked = clickVisibleAction([targetLabel]);
          const result = clicked
            ? `Ho premuto "${targetLabel}".`
            : `Qui non vedo un pulsante "${targetLabel}".`;

          if (clicked) toast.success(`🌟 Stella: ${result}`);
          else toast.info(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }

    // ── BOOKING ────────────────────────────────────────────────────────────
    // Stella now performs a real end-to-end booking: finds the professional,
    // checks their actual calendar for the next free slot, and books it —
    // not just a navigation shortcut like before.
    const bookMatch = stripped.match(/(?:prenota|prenotazione|appuntamento)\s+(?:con|da|per)\s+(.+)/);
    if (bookMatch) {
      const target = bookMatch[1].trim();
      return {
        id: Date.now().toString(), type: 'book', text,
        response: `Vuoi che prenoti il primo orario libero con ${target}?`,
        requiresConfirmation: true, silent: false,
        execute: async () => {
          const result = await autoBookAppointment(target, text);
          if (result.bookingId) {
            addMessage({ role: 'stella', content: result.message, type: 'action_result' });
            toast.success(`🌟 Stella: ${result.message}`);
            stellaSpeak(result.message);
            navigate(`/checkout?amount=${result.price || 0}&desc=${encodeURIComponent(`Prenotazione con ${target}`)}&type=booking&ref=${result.bookingId}`);
          } else {
            addMessage({ role: 'stella', content: result.message, type: 'action_result' });
            toast.info(`🌟 Stella: ${result.message}`);
            stellaSpeak(result.message);
            navigate('/stylists');
          }
        },
      };
    }
    // FIX: only trigger if the verb stands alone (not "conferma prenotazione",
    // "annulla prenotazione" — those are handled below).
    if (
      (stripped.startsWith('prenota') || stripped === 'prenotazione' || stripped === 'appuntamento' || stripped === 'fissa appuntamento')
      && !stripped.includes('conferma') && !stripped.includes('annulla') && !stripped.includes('cancella') && !stripped.includes('disdici')
    ) {
      return {
        id: Date.now().toString(), type: 'navigate', text,
        response: 'Ti mostro i professionisti disponibili!', requiresConfirmation: false, silent: true,
        execute: () => { navigate('/stylists'); toast.success('🌟 Stella: Ecco i professionisti!'); },
      };
    }

    // ── SEARCH ────────────────────────────────────────────────────────────
    const searchMatch = stripped.match(/^cerca\s+(.+)$/);
    if (searchMatch) {
      const q = searchMatch[1].trim();
      return {
        id: Date.now().toString(), type: 'search', text,
        response: `Cerco "${q}"!`, requiresConfirmation: false, silent: true,
        execute: () => { navigate(`/search?q=${encodeURIComponent(q)}`); toast.success(`🌟 Stella: Cerco "${q}"!`); },
      };
    }

    // ── MAP SEARCH ────────────────────────────────────────────────────────
    const mapMatch = stripped.match(/cerca\s+(?:match|amici|persone|stilisti)\s+(?:a|entro|vicino|nel\s+raggio\s+di)\s*(\d+)\s*km/);
    if (mapMatch) {
      return { id: Date.now().toString(), type: 'search', text, response: `Cerco match entro ${mapMatch[1]} km!`, requiresConfirmation: false, silent: true,
        execute: () => { navigate(`/map-search?radius=${mapMatch[1]}`); toast.success(`🌟 Stella: Cerco entro ${mapMatch[1]} km!`); } };
    }
    if (stripped.includes('cerca match') || stripped.includes('match vicini') || stripped.includes('chi c\'è vicino')) {
      return { id: Date.now().toString(), type: 'search', text, response: 'Apro la mappa!', requiresConfirmation: false, silent: true,
        execute: () => { navigate('/map-search'); toast.success('🌟 Stella: Apro la mappa!'); } };
    }

    // ── INFO ──────────────────────────────────────────────────────────────
    if (stripped.includes('quanti coin') || stripped.includes('quante monete') || stripped.includes('il mio saldo')) {
      const coins = profile?.qr_coins ?? 0;
      const msg = `Hai ${coins} QR Coins nel tuo wallet!`;
      return { id: Date.now().toString(), type: 'info', text, response: msg, requiresConfirmation: false, silent: true,
        execute: () => { toast.success(`🌟 Stella: ${msg}`); } };
    }
    if (stripped.includes('prossimo appuntamento') || stripped.includes('prossima prenotazione') || stripped.includes('i miei appuntamenti')) {
      return { id: Date.now().toString(), type: 'info', text, response: 'Verifico le tue prenotazioni...', requiresConfirmation: false,
        execute: async () => {
          const result = await getUpcomingBookings();
          addMessage({ role: 'stella', content: result, type: 'action_result' });
          stellaSpeak(result.split('\n')[0]);
          toast.success(`🌟 Stella: ${result.split('\n')[0]}`);
        } };
    }
    if (stripped.includes('le mie statistiche') || stripped.includes('i miei dati') || stripped.includes('quanto ho') || stripped.includes('come va')) {
      return { id: Date.now().toString(), type: 'info', text, response: 'Carico le tue statistiche...', requiresConfirmation: false,
        execute: async () => {
          const result = await getUserStats();
          addMessage({ role: 'stella', content: result, type: 'action_result' });
          stellaSpeak(result.replace(/[•📊\n]/gu, ', '));
          toast.success(`🌟 Stella: Ecco le tue stats!`);
        } };
    }
    if (stripped.includes('notifiche non lette') || stripped.includes('ho notifiche') || stripped.includes('quante notifiche')) {
      return { id: Date.now().toString(), type: 'info', text, response: 'Controllo le notifiche...', requiresConfirmation: false,
        execute: async () => {
          const result = await getNotificationsSummary();
          addMessage({ role: 'stella', content: result, type: 'action_result' });
          stellaSpeak(result);
          toast.success(`🌟 Stella: ${result}`);
        } };
    }

    // ── CALL ──────────────────────────────────────────────────────────────
    const callMatch = stripped.match(/(?:chiama|telefona|videochiama)\s+(.+)/);
    if (callMatch) {
      return {
        id: Date.now().toString(), type: 'call', text,
        response: `Vuoi che chiami ${callMatch[1]}? Conferma per procedere.`,
        requiresConfirmation: true,
        silent: false,
        execute: async () => {
          const result = await callContact(callMatch[1].trim());
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }

    // ── SHARE ─────────────────────────────────────────────────────────────
    if (stripped.includes('condividi') || stripped.includes('share') || stripped.includes('invia link')) {
      return { id: Date.now().toString(), type: 'action', text, response: 'Condivido la pagina!', requiresConfirmation: false, silent: true,
        execute: () => {
          if (navigator.share) {
            navigator.share({ title: 'STYLE', url: window.location.href }).catch(() => {});
          } else {
            navigator.clipboard.writeText(window.location.href);
          }
          toast.success('🌟 Stella: Link condiviso!');
        } };
    }

    // ── SCHEDULING ────────────────────────────────────────────────────────
    const scheduleMatch = stripped.match(/(?:ricordami|promemoria|schedula|programma)\s+(?:di\s+)?(.+?)(?:\s+(?:tra|fra|per|il|domani|dopodomani)\s+(.+))?$/);
    if (scheduleMatch && user) {
      const actionDesc = scheduleMatch[1]?.trim() || 'azione programmata';
      const timeDesc = scheduleMatch[2]?.trim() || 'domani';
      const scheduledDate = new Date();
      if (timeDesc.includes('domani')) scheduledDate.setDate(scheduledDate.getDate() + 1);
      else if (timeDesc.includes('dopodomani')) scheduledDate.setDate(scheduledDate.getDate() + 2);
      else if (timeDesc.match(/(\d+)\s*(?:ore|ora|h)/)) {
        scheduledDate.setHours(scheduledDate.getHours() + parseInt(timeDesc.match(/(\d+)\s*(?:ore|ora|h)/)![1]));
      } else if (timeDesc.match(/(\d+)\s*(?:minuti|min)/)) {
        scheduledDate.setMinutes(scheduledDate.getMinutes() + parseInt(timeDesc.match(/(\d+)\s*(?:minuti|min)/)![1]));
      } else if (timeDesc.match(/(\d+)\s*(?:giorni|giorno|gg)/)) {
        scheduledDate.setDate(scheduledDate.getDate() + parseInt(timeDesc.match(/(\d+)\s*(?:giorni|giorno|gg)/)![1]));
      }
      return {
        id: Date.now().toString(), type: 'schedule' as StellaCommand['type'], text,
        response: `Programmato "${actionDesc}" per ${scheduledDate.toLocaleDateString('it-IT')}!`, requiresConfirmation: false, silent: true,
        execute: () => {
          supabase.from('stella_scheduled_actions').insert({
            user_id: user.id, action_type: 'booking_reminder',
            action_params: { message: actionDesc },
            scheduled_for: scheduledDate.toISOString(),
          }).then(({ error }) => {
            if (error) toast.error('🌟 Stella: Errore nella programmazione');
            else toast.success(`🌟 Stella: Promemoria programmato!`);
          });
        },
      };
    }

    // ── COMMENT ─────────────────────────────────────────────────────────
    const commentMatch = stripped.match(/(?:commenta|scrivi un commento|lascia un commento)\s+(?:a|al post di|sulla foto di|su)\s+([^:,]+?)(?:\s*[,:]\s*|\s+(?:che|dicendo|scrivendo|con)\s+)(.+)/);
    if (commentMatch) {
      const target = commentMatch[1].trim();
      const comment = commentMatch[2].trim();
      return {
        id: Date.now().toString(), type: 'action' as StellaCommand['type'], text,
        response: `Conferma commento sul post di ${target}: "${comment}"`,
        requiresConfirmation: true, silent: false,
        preview: { kind: 'comment', recipient: target, content: comment },
        execute: async () => {
          const result = await commentOnPost(comment, target);
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }
    const commentSimple = stripped.match(/(?:commenta|scrivi)\s+["']?(.+?)["']?\s+(?:sull'ultimo|sul primo|sul post)/);
    if (commentSimple) {
      const comment = commentSimple[1].trim();
      return {
        id: Date.now().toString(), type: 'action' as StellaCommand['type'], text,
        response: `Conferma commento: "${comment}"`,
        requiresConfirmation: true, silent: false,
        preview: { kind: 'comment', content: comment },
        execute: async () => {
          const result = await commentOnPost(comment);
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }

    // ── CREATE POST ───────────────────────────────────────────────────────
    const postMatch = stripped.match(/(?:pubblica|posta|scrivi un post|crea un post)\s+(?:che\s+)?(?:dice\s+)?["']?(.+?)["']?$/);
    if (postMatch) {
      const content = postMatch[1].trim();
      return {
        id: Date.now().toString(), type: 'action' as StellaCommand['type'], text,
        response: `Conferma pubblicazione: "${content}"`,
        requiresConfirmation: true, silent: false,
        preview: { kind: 'post', content },
        execute: async () => {
          const result = await createPost(content);
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }

    // ── UNFOLLOW ──────────────────────────────────────────────────────────
    const unfollowMatch = stripped.match(/(?:smetti di seguire|non seguire più|unfollow)\s+(.+)/);
    if (unfollowMatch) {
      const target = unfollowMatch[1].trim();
      return {
        id: Date.now().toString(), type: 'action' as StellaCommand['type'], text,
        response: `Smetto di seguire ${target}...`, requiresConfirmation: false, silent: true,
        execute: async () => {
          const result = await unfollowUser(target);
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }

    // ── CONFIRM / CANCEL BOOKING ─────────────────────────────────────────
    if (stripped.includes('conferma prenotazione') || stripped.includes('conferma appuntamento') || stripped.includes('conferma il mio appuntamento')) {
      return {
        id: Date.now().toString(), type: 'action' as StellaCommand['type'], text,
        response: 'Confermo la prenotazione...', requiresConfirmation: false, silent: true,
        execute: async () => {
          const result = await manageBooking('confirm');
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }
    if (stripped.includes('cancella prenotazione') || stripped.includes('annulla prenotazione') || stripped.includes('annulla appuntamento') || stripped.includes('disdici')) {
      return {
        id: Date.now().toString(), type: 'action' as StellaCommand['type'], text,
        response: 'Annullo la prenotazione...', requiresConfirmation: false, silent: true,
        execute: async () => {
          const result = await manageBooking('cancel');
          toast.success(`🌟 Stella: ${result}`);
          stellaSpeak(result);
        },
      };
    }

    // ── HELP ──────────────────────────────────────────────────────────────
    if (stripped.includes('aiuto') || stripped.includes('help') || stripped.includes('cosa puoi fare') || stripped.includes('comandi')) {
      return {
        id: Date.now().toString(), type: 'info', text,
        response: '🌟 Sono Stella, faccio TUTTO per te come Alexa & Siri!\n\n' +
          '👤 "mostrami profilo Mario Rossi"\n' +
          '📍 "professionisti vicini" · "cerca sulla mappa"\n' +
          '❤️ "metti like a Anna" · "segui Marco" · "smetti di seguire"\n' +
          '💬 "invia messaggio a Sara: ciao!" · "commenta bello su post di Anna"\n' +
          '📝 "pubblica: sono dal parrucchiere!" · "crea post"\n' +
          '✂️ "prenota con Studio Bella" · "conferma prenotazione" · "annulla appuntamento"\n' +
          '📱 "apri shop" · "vai alla home" · "apri wallet"\n' +
          '🎨 "prova look" · "genera sito" · "tema scuro"\n' +
          '🔍 "cerca parrucchiere" · "scorri giù" · "condividi"\n' +
          '⏰ "ricordami taglio domani" · "quanti coin ho?"\n\n' +
          'Dì "Stella" + comando — agisco SUBITO senza aprire niente! 🚀',
        requiresConfirmation: false,
        execute: () => {},
      };
    }

    // ── LOGOUT ────────────────────────────────────────────────────────────
    if (stripped.includes('esci') || stripped.includes('logout') || stripped.includes('disconnetti')) {
      return { id: Date.now().toString(), type: 'navigate', text, response: 'Per sicurezza, vai nelle impostazioni per uscire.', requiresConfirmation: false, silent: true,
        execute: () => { navigate('/settings'); toast.info('🌟 Stella: Vai nelle impostazioni per uscire.'); } };
    }

    // ── OPEN STELLA PANEL ─────────────────────────────────────────────────
    if (stripped.includes('apri stella') || stripped.includes('apri pannello') || stripped.includes('apri assistente')) {
      return { id: Date.now().toString(), type: 'action', text, response: 'Apro il mio pannello!', requiresConfirmation: false,
        execute: () => setIsOpen(true) };
    }

    return null;
  }, [navigate, profile, user, goToProfile, likeLatestPost, followUser, unfollowUser, sendMessageTo, findProfileByName, stellaSpeak, commentOnPost, createPost, manageBooking, autoBookAppointment, findNearbyProfessionals, addMessage, getUserStats, getNotificationsSummary, getUpcomingBookings, clickVisibleAction, callContact]);

  // ── AI Intent Parsing (multilingual — understands every language) ──────
  const executeAIIntent = useCallback(async (intent: string, params: any, response: string) => {
    const actionFeedback = (msg: string, icon = '🌟') => {
      toast.success(`${icon} Stella: ${msg}`, { duration: 4000 });
    };

    // Helper: delay navigation so user sees the response first
    const delayedNavigate = (route: string, delayMs = 1200) => {
      setTimeout(() => navigate(route), delayMs);
    };

    switch (intent) {
      case 'navigate':
        if (params?.route) {
          actionFeedback(response, '🚀');
          delayedNavigate(params.route);
        } else {
          actionFeedback(response, '📍');
          delayedNavigate('/map-search');
        }
        break;
      case 'search':
        actionFeedback(response, '🔍');
        delayedNavigate(`/search?q=${encodeURIComponent(params?.query || '')}`);
        break;
      case 'show_profile': {
        if (params?.name) {
          const result = await goToProfile(params.name);
          actionFeedback(result, '👤');
        }
        break;
      }
      case 'like': {
        const likeResult = await likeLatestPost(params?.target_name);
        actionFeedback(likeResult, '❤️');
        break;
      }
      case 'comment': {
        const commentResult = await commentOnPost(params?.comment_text || params?.content || 'Bellissimo! 🔥', params?.target_name);
        actionFeedback(commentResult, '💬');
        break;
      }
      case 'follow': {
        if (params?.target_name) {
          const followResult = await followUser(params.target_name);
          actionFeedback(followResult, '✅');
        }
        break;
      }
      case 'unfollow': {
        if (params?.target_name) {
          const unfollowResult = await unfollowUser(params.target_name);
          actionFeedback(unfollowResult, '🚫');
        }
        break;
      }
      case 'send_message':
        if (params?.recipient && params?.content) {
          const msgResult = await sendMessageTo(params.recipient, params.content);
          actionFeedback(msgResult, '💬');
        } else if (params?.recipient) {
          await findProfileByName(params.recipient);
          actionFeedback(response, '💬');
          delayedNavigate('/chat');
        }
        break;
      case 'create_post': {
        if (params?.content) {
          const postResult = await createPost(params.content);
          actionFeedback(postResult, '📝');
        } else {
          actionFeedback(response, '📝');
          delayedNavigate('/create-post');
        }
        break;
      }
      case 'book':
        if (params?.target_name) {
          const profiles = await findProfileByName(params.target_name);
          actionFeedback(response, '✂️');
          if (profiles.length > 0) delayedNavigate(`/stylist/${profiles[0].user_id}`);
          else delayedNavigate('/stylists');
        } else {
          actionFeedback(response, '✂️');
          delayedNavigate('/stylists');
        }
        break;
      case 'confirm_booking': {
        const confirmResult = await manageBooking('confirm');
        actionFeedback(confirmResult, '✅');
        break;
      }
      case 'cancel_booking': {
        const cancelResult = await manageBooking('cancel');
        actionFeedback(cancelResult, '❌');
        break;
      }
      case 'call': {
        if (params?.target_name) {
          const isVideo = params?.call_type !== 'voice';
          const callResult = await callUser(params.target_name, isVideo ? 'video' : 'voice');
          actionFeedback(callResult, '📞');
        } else {
          actionFeedback('Dimmi chi vuoi chiamare, per esempio "chiama Marco"', '📞');
        }
        break;
      }
      case 'scroll':
        if (params?.direction === 'up') window.scrollBy({ top: -400, behavior: 'smooth' });
        else if (params?.direction === 'down') window.scrollBy({ top: 400, behavior: 'smooth' });
        else if (params?.direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
        else if (params?.direction === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        break;
      case 'theme':
        if (params?.mode === 'dark') { document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark'); }
        else { document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light'); }
        actionFeedback(response, params?.mode === 'dark' ? '🌙' : '☀️');
        break;
      case 'share':
        if (navigator.share) navigator.share({ title: 'STYLE', url: window.location.href }).catch(() => {});
        else navigator.clipboard.writeText(window.location.href);
        actionFeedback(response, '🔗');
        break;
      case 'refresh':
        actionFeedback(response, '🔄');
        setTimeout(() => window.location.reload(), 1500);
        break;
      case 'back':
        actionFeedback(response, '⬅️');
        setTimeout(() => window.history.back(), 800);
        break;
      case 'info':
        if (params?.info_type === 'coins') {
          const coins = profile?.qr_coins ?? 0;
          actionFeedback(`Hai ${coins} QR Coins`, '💰');
        } else if (params?.info_type === 'bookings') {
          const bookingsInfo = await getUpcomingBookings();
          addMessage({ role: 'stella', content: bookingsInfo, type: 'action_result' });
          actionFeedback(bookingsInfo.split('\n')[0], '📅');
        } else if (params?.info_type === 'general') {
          const stats = await getUserStats();
          addMessage({ role: 'stella', content: stats, type: 'action_result' });
          actionFeedback('Ecco le tue statistiche!', '📊');
        } else {
          actionFeedback(response, 'ℹ️');
        }
        break;
      case 'reminder':
        if (user && params?.description) {
          const scheduledDate = new Date();
          scheduledDate.setDate(scheduledDate.getDate() + 1);
          await supabase.from('stella_scheduled_actions').insert({
            user_id: user.id, action_type: 'booking_reminder',
            action_params: { message: params.description },
            scheduled_for: scheduledDate.toISOString(),
          });
          actionFeedback(response, '⏰');
        }
        break;
      case 'suggest': {
        // Proactive suggestion based on type
        const suggestions: Record<string, { route: string; msg: string }> = {
          beauty: { route: '/ai-look', msg: 'Prova un nuovo look con l\'AI! 🎨' },
          social: { route: '/explore', msg: 'Scopri cosa c\'è di nuovo! 🔥' },
          business: { route: '/analytics', msg: 'Controlla le tue statistiche! 📊' },
          fun: { route: '/spin', msg: 'Gira la ruota della fortuna! 🎰' },
        };
        const s = suggestions[params?.suggestion_type || 'beauty'] || suggestions.beauty;
        actionFeedback(s.msg, '💡');
        delayedNavigate(s.route);
        break;
      }
      case 'find_nearby': {
        const nearbyResult = await findNearbyProfessionals(params?.city, params?.specialty);
        if (nearbyResult.found) {
          addMessage({ role: 'stella', content: nearbyResult.message, type: 'action_result' });
          actionFeedback(nearbyResult.summary!, '📍');
          delayedNavigate('/stylists', 2500);
        } else {
          addMessage({ role: 'stella', content: nearbyResult.message, type: 'action_result' });
          actionFeedback(nearbyResult.message, '📍');
          delayedNavigate('/map-search', 2500);
        }
        break;
      }
      default:
        actionFeedback(response.substring(0, 120) + (response.length > 120 ? '...' : ''), '💬');
        break;
    }
  }, [navigate, profile, user, goToProfile, likeLatestPost, followUser, unfollowUser, sendMessageTo, findProfileByName, commentOnPost, createPost, manageBooking, findNearbyProfessionals, addMessage, getUserStats, getUpcomingBookings]);

  const askAI = useCallback(async (text: string) => {
    setIsAIThinking(true);
    setInlineStatus('Sto pensando...');
    const thinkId = pushStep('🧠', `Capisco: "${text}"`, 'pending');
    try {
      const patterns = await analyzePatterns();
      const topActions = patterns.slice(0, 5).map(p => `${p.action}(${p.count}x)`).join(', ');
      const topPages = getTopPages().slice(0, 3).join(', ');

      // "DNA beauty" reale: prima Stella imparava solo COME usi l'app
      // (quali pagine visiti, a che ora) — non le tue PREFERENZE beauty
      // vere (che servizi prenoti di più, quali professionisti scegli).
      // Senza questo, non poteva dare consigli davvero personalizzati
      // su tagli/trattamenti/promozioni, solo suggerimenti generici a
      // template. Ora legge le prenotazioni completate reali.
      let beautyProfile = 'nessuna prenotazione ancora';
      if (user) {
        const { data: history } = await supabase
          .from('bookings')
          .select('service:services(name, category), professional:professionals(business_name), booking_date')
          .eq('client_id', user.id)
          .eq('status', 'completed')
          .order('booking_date', { ascending: false })
          .limit(20);
        if (history?.length) {
          const categoryCounts: Record<string, number> = {};
          const proCounts: Record<string, number> = {};
          for (const h of history as any[]) {
            const cat = h.service?.category;
            const pro = h.professional?.business_name;
            if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            if (pro) proCounts[pro] = (proCounts[pro] || 0) + 1;
          }
          const topCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
          const topPros = Object.entries(proCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p]) => p);
          const daysSinceLast = Math.floor((Date.now() - new Date((history[0] as any).booking_date).getTime()) / 86400000);
          beautyProfile = `${history.length} prenotazioni completate, categorie preferite: ${topCategories.join(', ') || 'varie'}, professionisti preferiti: ${topPros.join(', ') || 'vari'}, ultima visita ${daysSinceLast} giorni fa`;
        }
      }

      const { data, error } = await supabase.functions.invoke('stella-intent', {
        body: {
          text,
          context: {
            user_type: profile?.user_type || 'client',
            user_name: profile?.display_name || 'User',
            gender: (profile as any)?.gender || 'unknown',
            color_theme: (profile as any)?.color_theme || 'female',
            qr_coins: profile?.qr_coins || 0,
            current_page: window.location.pathname,
            frequent_actions: topActions || 'none',
            favorite_pages: topPages || 'none',
            beauty_profile: beautyProfile,
          },
        },
      });

      if (error) { console.error('Stella AI invoke error:', error); throw error; }
      if (!data) { console.error('Stella AI: empty response'); throw new Error('Empty AI response'); }

      const { intent, params, response: aiResponse } = data;
      const lang = (data?.detected_language || 'it').toLowerCase();
      const notUnderstood: Record<string, string> = {
        it: 'Non ho capito, puoi ripetere per favore?',
        en: "Sorry, I didn't catch that. Could you repeat?",
        es: 'No te he entendido, ¿puedes repetir?',
        fr: "Je n'ai pas compris, tu peux répéter ?",
        de: 'Ich habe dich nicht verstanden, kannst du das wiederholen?',
        pt: 'Não entendi, pode repetir?',
      };
      if (intent === 'unknown') {
        const msg = notUnderstood[lang] || notUnderstood.it;
        addMessage({ role: 'stella', content: msg, type: 'text' });
        stellaSpeak(msg);
        setInlineStatus(msg);
        completeStep(thinkId, 'error', msg);
        scheduleStepsClear(5000);
        // Re-open the mic quickly so the user can repeat hands-free
        scheduleWakeWordResume(600);
        setIsAIThinking(false);
        return;
      }
      const displayResponse = aiResponse || notUnderstood[lang] || notUnderstood.it;

      addMessage({ role: 'stella', content: displayResponse, type: intent && intent !== 'chat' ? 'action_result' : 'text' });
      stellaSpeak(displayResponse.length > 200 ? displayResponse.substring(0, 200) + '...' : displayResponse);

      if (intent && intent !== 'chat') {
        // Siri-like: show inline status, don't open panel
        setInlineStatus(displayResponse.substring(0, 100));
        completeStep(thinkId, 'done', `Intento: ${intent}`);
        const doId = pushStep('⚡', displayResponse.substring(0, 60), 'pending');
        await executeAIIntent(intent, params || {}, displayResponse);
        completeStep(doId, 'done');
        pushStep('✅', 'Fatto', 'done');
        scheduleStepsClear();
        logStellaCommand(text, intent);
      } else {
        // Chat response: show in panel
        setIsOpen(true);
        setInlineStatus(null);
        completeStep(thinkId, 'done', 'Risposta in chat');
        scheduleStepsClear();
      }
    } catch (err) {
      console.error('Stella AI error:', err);
      const fallback = 'Stella AI è temporaneamente offline. Dì "aiuto" per i comandi disponibili!';
      addMessage({ role: 'stella', content: fallback, type: 'text' });
      stellaSpeak(fallback);
      toast.info(`🌟 ${fallback}`);
      completeStep(thinkId, 'error', fallback);
      scheduleStepsClear(6000);
    } finally {
      setIsAIThinking(false);
      scheduleWakeWordResume(1800);
    }
  }, [addMessage, stellaSpeak, profile, user, executeAIIntent, analyzePatterns, getTopPages, logStellaCommand, scheduleWakeWordResume, pushStep, completeStep, scheduleStepsClear]);



  // ── Handle command (works in background or with panel open) ────────────
  const handleCommand = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;

    // ── L2: VOICE CONFIRM/CANCEL while a command is pending ─────────────
    const lower = text.toLowerCase().trim();
    if (pendingCommandRef.current) {
      // Normalizza: rimuovi accenti, punteggiatura, prefissi vocativi, filler.
      const normalized = lower
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
        .replace(/[.,!?;:¡¿"«»()\-–—]/g, ' ')
        .replace(/^(stella|hey stella|ehi stella|ciao stella|ok stella|allora|beh|mmm|ehm|uhm|si si|no no)\s+/i, '')
        .replace(/^(per favore|grazie|dai|allora|forza|certo che)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      const first = normalized.split(' ')[0] || '';
      const yesWords = new Set([
        'si','sii','sisi','sissi','sisignora','certo','certamente','assolutamente','ovvio','ovviamente',
        'conferma','confermo','confermato','confermare','ok','okay','okei','oki','okk','va','vabbe','vabbene','vabene',
        'vai','procedi','esegui','eseguilo','fallo','falla','invia','inviala','manda','mandalo','pubblica','pubblicalo',
        'daccordo','accordo','perfetto','bene','benissimo','approvato','approvo','autorizzo','procedere',
        'yes','yep','yeah','yup','sure','confirm','do','send','go',
        'oui','ja','jawohl','claro','vale','dale'
      ]);
      const noWords = new Set([
        'no','nope','nah','annulla','annullato','annullare','cancella','cancellato','cancellare','cancel',
        'stop','ferma','fermati','fermo','lascia','dimentica','dimenticalo','niente','nulla','nada',
        'aspetta','attendi','non','nessuno','negativo','negative','denied','non importa',
        'nein','non','no no'
      ]);
      const repeatWords = new Set([
        'ripeti','ripetilo','ripetimi','cosa','come','non','rip','again','repeat','riascolta','rileggi','che','what'
      ]);
      const isRepeat = /^(ripeti|ripetilo|ripetimi|riascolta|rileggi|cosa hai detto|che hai detto|come|cosa|che cosa|non ho capito|non ho sentito|repeat|again|what)\b/.test(normalized)
        || repeatWords.has(first);
      const yes = yesWords.has(first) || /^(va\s+bene|d\s*accordo|ok\s+vai|si\s+si|certo\s+che\s+si|si\s+grazie|si\s+conferma)/.test(normalized);
      const no  = noWords.has(first) || /^(non\s+(va|importa|mi\s+va|farlo|inviare|fare))/.test(normalized) || /^(no\s+grazie|no\s+annulla|lascia\s+(stare|perdere))/.test(normalized);
      if (isRepeat && !yes && !no) {
        addMessage({ role: 'user', content: text });
        repeatPendingRef.current();
        return;
      }
      if (yes) { addMessage({ role: 'user', content: text }); await confirmActionRef.current(); return; }
      if (no)  { addMessage({ role: 'user', content: text }); cancelActionRef.current(); return; }
      // Non riconosciuto mentre c'è un pending: ricorda all'utente cosa è in attesa.
      addMessage({ role: 'user', content: text });
      repeatPendingRef.current();
      return;
    }

    addMessage({ role: 'user', content: text });

    const cmd = parseCommand(text);
    if (!cmd) {
      // Prima di chiedere all'AI, prova ad eseguire l'azione direttamente sulla
      // pagina visibile: Stella cerca un pulsante/link col testo del comando.
      // Questo copre TUTTE le azioni di tutte le pagine (anche quelle non mappate).
      const cleaned = text
        .toLowerCase()
        .replace(/^(stella|hey stella|ehi stella|ciao stella|ok stella)[,\s]*/i, '')
        .replace(/^(per favore|puoi|vuoi|adesso|ora)\s+/i, '')
        .replace(/^(clicca|premi|tocca|seleziona|apri|attiva|vai a|vai su)\s+/i, '')
        .trim();
      if (cleaned && clickVisibleAction([cleaned])) {
        const ok = `Ho premuto "${cleaned}".`;
        addMessage({ role: 'stella', content: ok, type: 'action_result' });
        setInlineStatus(ok);
        pushStep('🎯', `Comando: ${text}`, 'done');
        pushStep('👆', `Tap su "${cleaned}"`, 'done');
        pushStep('✅', 'Fatto', 'done');
        scheduleStepsClear();
        stellaSpeak(ok);
        logStellaCommand(text, 'action');
        scheduleWakeWordResume();
        return;
      }
      await askAI(text);
      return;
    }

    const limit = checkLimit(cmd.type);
    if (!limit.allowed) {
      const msg = `Hai raggiunto il limite di ${cmd.type} per quest'ora.`;
      addMessage({ role: 'stella', content: msg });
      stellaSpeak(msg);
      toast.warning(`🌟 Stella: ${msg}`);
      scheduleWakeWordResume();
      return;
    }

    if (cmd.requiresConfirmation && !cmd.silent) {
      setPendingCommand(cmd);
      addMessage({ role: 'stella', content: cmd.response, type: 'confirmation', pending: cmd, preview: cmd.preview });
      stellaSpeak(cmd.response + ' Dì "sì" per confermare o "no" per annullare.');
      pendingRepromptCountRef.current = 0;
      if (pendingRepromptTimerRef.current) window.clearTimeout(pendingRepromptTimerRef.current);
      const scheduleReprompt = () => {
        pendingRepromptTimerRef.current = window.setTimeout(() => {
          if (!pendingCommandRef.current) return;
          pendingRepromptCountRef.current += 1;
          if (pendingRepromptCountRef.current >= 2) {
            // Auto-cancel dopo 2 reprompt senza risposta
            cancelActionRef.current();
            return;
          }
          stellaSpeak('Sei ancora lì? Dì sì per confermare o no per annullare.');
          setInlineStatus('⏳ In attesa di conferma — dì "sì" o "no"');
          scheduleReprompt();
        }, 8000);
      };
      scheduleReprompt();
      // Open panel for confirmations
      setIsOpen(true);
    } else {
      try {
        // Siri-like: execute silently with inline status, no panel
        const goalId = pushStep('🎯', `Comando: ${text}`, 'done');
        const doingId = pushStep('⚡', cmd.response, 'pending');
        await Promise.resolve(cmd.execute());
        recordAction(cmd.type);
        const followups = computeFollowups(cmd);
        addMessage({ role: 'stella', content: cmd.response, type: 'action_result', followups });
        setInlineStatus(cmd.response);
        completeStep(doingId, 'done');
        pushStep('✅', 'Fatto', 'done');
        scheduleStepsClear();
        stellaSpeak(cmd.response);
        logStellaCommand(text, cmd.type);
      } catch (error) {
        console.error('Stella direct command error:', error);
        const failureMessage = 'Non sono riuscita a completare l’azione richiesta.';
        addMessage({ role: 'stella', content: failureMessage, type: 'text' });
        setInlineStatus(failureMessage);
        pushStep('⚠️', failureMessage, 'error');
        scheduleStepsClear(6000);
        stellaSpeak(failureMessage);
        toast.error(`🌟 Stella: ${failureMessage}`);
      } finally {
        scheduleWakeWordResume();
      }
    }
  }, [addMessage, parseCommand, stellaSpeak, askAI, logStellaCommand, scheduleWakeWordResume, clickVisibleAction, pushStep, completeStep, scheduleStepsClear]);

  handleCommandRef.current = handleCommand;

  // ── L2: contextual followup chips after each action ─────────────────────
  const computeFollowups = useCallback((cmd: StellaCommand): Array<{ text: string; command: string }> => {
    const t = cmd.text.toLowerCase();
    const remembered = lastTargetRef.current;
    const named = remembered?.name;
    if (cmd.type === 'follow' && named) {
      return [
        { text: `💬 Scrivi a ${named}`, command: `scrivigli` },
        { text: `📞 Chiama ${named}`, command: `chiamalo` },
        { text: `👤 Apri profilo`, command: `aprilo` },
      ];
    }
    if (cmd.type === 'message' || /scrivi|messaggio|invia/.test(t)) {
      return [
        { text: '✉️ Apri tutte le chat', command: 'apri chat' },
        { text: '🔔 Notifiche', command: 'apri notifiche' },
      ];
    }
    if (cmd.type === 'book' || /prenota/.test(t)) {
      return [
        { text: '📅 Le mie prenotazioni', command: 'i miei appuntamenti' },
        { text: '💳 Wallet', command: 'apri wallet' },
      ];
    }
    if (/profilo/.test(t) && named) {
      return [
        { text: `📞 Chiama`, command: 'chiamalo' },
        { text: `💬 Scrivi`, command: 'scrivigli' },
        { text: `➕ Segui`, command: 'seguilo' },
      ];
    }
    if (cmd.type === 'like') {
      return [
        { text: '💬 Commenta', command: 'commenta bellissimo sull\'ultimo post' },
        { text: '🔍 Esplora', command: 'esplora' },
      ];
    }
    if (cmd.type === 'navigate') {
      return [
        { text: '🔍 Cerca', command: 'cerca ' },
        { text: '🗺️ Mappa', command: 'apri mappa' },
      ];
    }
    return [];
  }, []);

  // ── Confirm / Cancel pending action ─────────────────────────────────────
  const confirmAction = useCallback(async () => {
    if (!pendingCommand) return;
    const cmd = pendingCommand;
    if (pendingRepromptTimerRef.current) { window.clearTimeout(pendingRepromptTimerRef.current); pendingRepromptTimerRef.current = null; }
    try {
      await Promise.resolve(cmd.execute());
      recordAction(cmd.type);
      const followups = computeFollowups(cmd);
      addMessage({ role: 'stella', content: 'Fatto! ✅', type: 'action_result', followups });
      stellaSpeak('Fatto!');
      toast.success('🌟 Stella: Fatto! ✅');
      logStellaCommand(cmd.text, cmd.type, {
        requires_confirmation: true,
        confirmed_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Stella confirmation error:', error);
      const failureMessage = 'Non sono riuscita a completare l’azione confermata.';
      addMessage({ role: 'stella', content: failureMessage, type: 'text' });
      stellaSpeak(failureMessage);
      toast.error(`🌟 Stella: ${failureMessage}`);
    } finally {
      setPendingCommand(null);
      scheduleWakeWordResume();
    }
  }, [pendingCommand, addMessage, stellaSpeak, logStellaCommand, scheduleWakeWordResume, computeFollowups]);

  // expose latest confirm/cancel via refs (used by voice "sì/no")
  useEffect(() => { confirmActionRef.current = confirmAction; }, [confirmAction]);

  const cancelAction = useCallback(() => {
    if (pendingRepromptTimerRef.current) { window.clearTimeout(pendingRepromptTimerRef.current); pendingRepromptTimerRef.current = null; }
    setPendingCommand(null);
    addMessage({ role: 'stella', content: 'Azione annullata.' });
    stellaSpeak('Annullato.');
    scheduleWakeWordResume(800);
  }, [addMessage, stellaSpeak, scheduleWakeWordResume]);
  useEffect(() => { cancelActionRef.current = cancelAction; }, [cancelAction]);

  // Ripete il comando in attesa, mostrando di nuovo l'anteprima e leggendolo a voce.
  const repeatPending = useCallback(() => {
    const cmd = pendingCommandRef.current;
    if (!cmd) return;
    const reminder = `Sto aspettando conferma per: "${cmd.response}". Dì sì per confermare o no per annullare.`;
    addMessage({ role: 'stella', content: reminder, type: 'confirmation', pending: cmd, preview: cmd.preview });
    stellaSpeak(reminder);
    setInlineStatus('⏳ In attesa di conferma');
  }, [addMessage, stellaSpeak]);
  useEffect(() => { repeatPendingRef.current = repeatPending; }, [repeatPending]);

  const sendTextCommand = useCallback((text: string) => {
    if (!text.trim()) return;
    void handleCommand(text.trim());
  }, [handleCommand]);

  const toggleWakeWord = useCallback(() => {
    clearWakeWordResumeTimeout();

    if (wakeWordActive) {
      stopWakeWordListening();
      setWakeWordActive(false);
      setInlineStatus('Attivazione vocale disattivata.');
      return;
    }

    setWakeWordActive(true);
    setInlineStatus('Attivazione vocale attivata.');
  }, [wakeWordActive, clearWakeWordResumeTimeout, stopWakeWordListening]);

  const toggleTTS = useCallback(() => setTtsEnabled(prev => !prev), []);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening(); else startListening();
  }, [isListening, startListening, stopListening]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    messages, isOpen, setIsOpen, wakeWordActive, ttsEnabled,
    isListening, isWakeWordListening, interimTranscript, speaking,
    pendingCommand, isSupported, isAIThinking, proactiveSuggestions,
    inlineStatus, clearInlineStatus,
    actionSteps, clearSteps,
    needsMicPermissionPrompt, enableWakeWordNow,
    toggleWakeWord, toggleTTS, toggleListening,
    sendTextCommand, confirmAction, cancelAction,
    repeatPending,
    clearMessages, addMessage,
  };
}