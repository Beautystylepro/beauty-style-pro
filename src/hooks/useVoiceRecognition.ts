import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface VoiceRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  language?: string;
  wakeWordEnabled?: boolean;
  wakeWords?: string[];
  onWakeWordDetected?: (command?: string) => void;
}

interface VoiceRecognitionHook {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isSupported: boolean;
  isWakeWordListening: boolean;
  wakeWordDetected: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  startWakeWordListening: () => void;
  stopWakeWordListening: () => void;
}

export const useVoiceRecognition = (
  options: VoiceRecognitionOptions = {}
): VoiceRecognitionHook => {
  const {
    continuous = false,
    interimResults = true,
    language = 'it-IT',
    wakeWordEnabled = false,
    wakeWords = ['stella', 'hey stella', 'ehi stella', 'ciao stella'],
    onWakeWordDetected
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);

  const recognitionRef = useRef<any>(null);
  const wakeWordRecognitionRef = useRef<any>(null);
  const nativePartialResultsListenerRef = useRef<PluginListenerHandle | null>(null);
  const nativeListeningStateListenerRef = useRef<PluginListenerHandle | null>(null);
  const isListeningRef = useRef(false);
  const wakeWordActiveRef = useRef(false);
  const onWakeWordRef = useRef(onWakeWordDetected);
  const wakeWordsRef = useRef(wakeWords);
  const handoffToCommandRef = useRef(false);
  const wakeWordCommandTimeoutRef = useRef<number | null>(null);
  const pendingWakeWordCommandRef = useRef('');
  const nativeModeRef = useRef<'idle' | 'wake' | 'command'>('idle');

  useEffect(() => { onWakeWordRef.current = onWakeWordDetected; }, [onWakeWordDetected]);
  useEffect(() => { wakeWordsRef.current = wakeWords; }, [wakeWords]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  const isWebSpeechSupported = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  const isNativeSpeechSupported = typeof window !== 'undefined' && (() => {
    try {
      return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SpeechRecognition');
    } catch {
      return false;
    }
  })();

  // BUG FIX: isSupported previously only checked for native browser/OS
  // speech recognition — on browsers without it (Firefox, some mobile
  // browsers), the mic button was fully disabled with no way to speak a
  // command at all. It's now also true when generic microphone recording
  // is available (virtually universal), since startListening has a
  // working Gemini-based fallback for that case. Wake-word ("Hey Stella"
  // always listening) still genuinely requires native support and is
  // gated separately where it's used.
  const isMicRecordingAvailable = typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  const isSupported = isWebSpeechSupported || isNativeSpeechSupported || isMicRecordingAvailable;
  const permissionDeniedMessage = 'Per attivare Stella consenti l’accesso al microfono nelle impostazioni del dispositivo o del browser.';

  const clearWakeWordCommandTimeout = useCallback(() => {
    if (wakeWordCommandTimeoutRef.current !== null) {
      window.clearTimeout(wakeWordCommandTimeoutRef.current);
      wakeWordCommandTimeoutRef.current = null;
    }
  }, []);

  const removeNativeListeners = useCallback(async () => {
    const listeners = [nativePartialResultsListenerRef.current, nativeListeningStateListenerRef.current];
    nativePartialResultsListenerRef.current = null;
    nativeListeningStateListenerRef.current = null;

    await Promise.all(listeners.map(async (listener) => {
      if (!listener) return;
      try { await listener.remove(); } catch { /* best-effort, ignore */ }
    }));

    try { await SpeechRecognition.removeAllListeners(); } catch { /* best-effort, ignore */ }
  }, []);

  const stopNativeRecognition = useCallback(async () => {
    clearWakeWordCommandTimeout();
    pendingWakeWordCommandRef.current = '';
    nativeModeRef.current = 'idle';

    await removeNativeListeners();

    try { await SpeechRecognition.stop(); } catch { /* best-effort, ignore */ }

    setIsWakeWordListening(false);
    setIsListening(false);
    isListeningRef.current = false;
    setInterimTranscript('');
  }, [clearWakeWordCommandTimeout, removeNativeListeners]);

  const ensureNativePermissions = useCallback(async () => {
    try {
      const current = await SpeechRecognition.checkPermissions();
      if (current.speechRecognition === 'granted') return true;

      const requested = await SpeechRecognition.requestPermissions();
      return requested.speechRecognition === 'granted';
    } catch {
      return false;
    }
  }, []);

  const primeBrowserMicrophone = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return true;
    }

    try {
      // Advanced audio constraints to isolate user voice:
      // - echoCancellation: removes speaker feedback (TTS playback)
      // - noiseSuppression: filters background noise
      // - autoGainControl: normalizes voice volume
      // - channelCount mono + 16kHz sample rate matches speech recognition models
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16000 },
        } as MediaTrackConstraints,
      });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return true;
      } catch {
        return false;
      }
    }
  }, []);

  // Minimum confidence to accept a transcription result (0-1).
  // Filters out background chatter / noise mistakenly transcribed.
  const MIN_CONFIDENCE = 0.55;
  const MIN_WAKE_CONFIDENCE = 0.6;

  const extractCommandAfterWakeWord = useCallback((sourceTranscript: string) => {
    const normalizedTranscript = sourceTranscript.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!normalizedTranscript) return null;

    const matchedWakeWord = [...wakeWordsRef.current]
      .sort((a, b) => b.length - a.length)
      .find((word) => normalizedTranscript.includes(word.toLowerCase()));

    if (!matchedWakeWord) return null;

    const wakeWordIndex = normalizedTranscript.indexOf(matchedWakeWord.toLowerCase());
    const commandStartIndex = wakeWordIndex + matchedWakeWord.length;

    return normalizedTranscript
      .slice(commandStartIndex)
      .replace(/^[\s,.:;!?-]+/, '')
      .trim();
  }, []);

  const stopWakeWordRecognitionInstance = useCallback(() => {
    const ref = wakeWordRecognitionRef.current;
    wakeWordRecognitionRef.current = null;
    if (ref) {
      try { ref.stop(); } catch { /* best-effort, ignore */ }
    }
    setIsWakeWordListening(false);
  }, []);

  const stopListening = useCallback(() => {
    handoffToCommandRef.current = false;

    if (isNativeSpeechSupported) {
      void stopNativeRecognition();
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* best-effort, ignore */ }
      recognitionRef.current = null;
      setIsListening(false);
      isListeningRef.current = false;
      setInterimTranscript('');
    }
  }, [isNativeSpeechSupported, stopNativeRecognition]);

  const stopWakeWordListening = useCallback(() => {
    wakeWordActiveRef.current = false;
    handoffToCommandRef.current = false;
    pendingWakeWordCommandRef.current = '';
    clearWakeWordCommandTimeout();

    if (isNativeSpeechSupported) {
      void stopNativeRecognition();
      return;
    }

    stopWakeWordRecognitionInstance();
  }, [clearWakeWordCommandTimeout, isNativeSpeechSupported, stopNativeRecognition, stopWakeWordRecognitionInstance]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      // BUG FIX: previously this silently did nothing on browsers/devices
      // without native SpeechRecognition (e.g. Firefox, some mobile
      // browsers) — the mic button appeared to do nothing at all, with no
      // error and no fallback. Record a short clip and transcribe it via
      // Gemini instead (the same robust approach already used for calls),
      // so the manual "tap to speak" mic works everywhere with a
      // microphone, regardless of browser support for the Web Speech API.
      void (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setIsListening(true);
          isListeningRef.current = true;
          setError(null);
          setTranscript('');

          const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
          const recorder = new MediaRecorder(stream, { mimeType });
          const chunks: BlobPart[] = [];
          recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
          recorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            setIsListening(false);
            isListeningRef.current = false;
            const blob = new Blob(chunks, { type: mimeType });
            if (blob.size < 2000) return;
            const reader = new FileReader();
            reader.onloadend = async () => {
              const audioBase64 = String(reader.result).split(',')[1] || '';
              const { data, error: fnError } = await supabase.functions.invoke('voice-transcribe', {
                body: { audioBase64, mimeType },
              });
              const spokenText: string = (data?.transcript || '').trim();
              if (fnError || !spokenText) {
                setError('Non sono riuscita a capire, riprova.');
                return;
              }
              setTranscript(spokenText);
            };
            reader.readAsDataURL(blob);
          };
          recorder.start();
          window.setTimeout(() => { try { recorder.stop(); } catch { /* already stopped */ } }, 5000);
        } catch {
          setError(permissionDeniedMessage);
          setIsListening(false);
          isListeningRef.current = false;
        }
      })();
      return;
    }

    if (isNativeSpeechSupported) {
      void (async () => {
        const hasPermission = await ensureNativePermissions();
        if (!hasPermission) {
          setError(permissionDeniedMessage);
          return;
        }

        await stopNativeRecognition();

        nativeModeRef.current = 'command';
        setError(null);
        setTranscript('');
        setInterimTranscript('');
        setIsWakeWordListening(false);
        setIsListening(true);
        isListeningRef.current = true;

        try {
          const { matches } = await SpeechRecognition.start({
            language,
            maxResults: 1,
            partialResults: false,
            popup: false,
            prompt: 'Parla ora',
          });

          const spokenText = matches?.[0]?.trim();
          if (spokenText) {
            setTranscript(spokenText);
          }
        } catch (error: any) {
          const message = typeof error?.message === 'string' ? error.message : 'native';
          if (!String(message).toLowerCase().includes('cancel')) {
            setError(`Speech recognition error: ${message}`);
          }
        } finally {
          nativeModeRef.current = 'idle';
          setIsListening(false);
          isListeningRef.current = false;
          setInterimTranscript('');
          await removeNativeListeners();
        }
      })();
      return;
    }

    handoffToCommandRef.current = true;

    if (wakeWordRecognitionRef.current) {
      const wakeRef = wakeWordRecognitionRef.current;
      wakeWordRecognitionRef.current = null;
      try { wakeRef.stop(); } catch { /* best-effort, ignore */ }
      setIsWakeWordListening(false);
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* best-effort, ignore */ }
      recognitionRef.current = null;
    }

    void (async () => {
      const hasMicAccess = await primeBrowserMicrophone();
      if (!hasMicAccess) {
        handoffToCommandRef.current = false;
        setError(permissionDeniedMessage);
        setIsListening(false);
        isListeningRef.current = false;
        return;
      }

      try {
        const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognitionCtor();
        recognitionRef.current = recognition;

        recognition.continuous = continuous;
        recognition.interimResults = interimResults;
        recognition.lang = language;

        recognition.onstart = () => {
          setIsListening(true);
          isListeningRef.current = true;
          handoffToCommandRef.current = false;
          setError(null);
        };

        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let currentInterimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const alt = result[0];
            const confidence = typeof alt.confidence === 'number' ? alt.confidence : 1;
            if (result.isFinal) {
              // Reject low-confidence final results — likely background noise
              if (confidence >= MIN_CONFIDENCE) {
                finalTranscript += alt.transcript;
              }
            } else {
              currentInterimTranscript += alt.transcript;
            }
          }

          if (finalTranscript) {
            setTranscript(prev => prev + finalTranscript);
          }
          setInterimTranscript(currentInterimTranscript);
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setError(permissionDeniedMessage);
          } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
            setError(`Speech recognition error: ${event.error}`);
          }
          setIsListening(false);
          isListeningRef.current = false;
          handoffToCommandRef.current = false;
        };

        recognition.onend = () => {
          setIsListening(false);
          isListeningRef.current = false;
          handoffToCommandRef.current = false;
          setInterimTranscript('');
          recognitionRef.current = null;
        };

        recognition.start();
      } catch {
        handoffToCommandRef.current = false;
        setError('Speech recognition not supported');
        setIsListening(false);
        isListeningRef.current = false;
      }
    })();
  }, [
    continuous,
    ensureNativePermissions,
    interimResults,
    isNativeSpeechSupported,
    isSupported,
    language,
    permissionDeniedMessage,
    primeBrowserMicrophone,
    removeNativeListeners,
    stopNativeRecognition,
  ]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
    setWakeWordDetected(false);
  }, []);

  const startWakeWordListening = useCallback(() => {
    if (!isSupported || !wakeWordEnabled) return;
    if (isListeningRef.current) return;
    // Wake-word (always-listening "Hey Stella") genuinely needs a real
    // continuous speech recognition API — the Gemini fallback records a
    // fixed short clip on demand and can't reasonably power passive
    // always-on listening. Skip silently rather than crashing on
    // browsers that only have generic mic recording available.
    if (!isNativeSpeechSupported && !isWebSpeechSupported) return;

    if (isNativeSpeechSupported) {
      void (async () => {
        const hasPermission = await ensureNativePermissions();
        if (!hasPermission) {
          setError(permissionDeniedMessage);
          return;
        }

        await stopNativeRecognition();

        wakeWordActiveRef.current = true;
        nativeModeRef.current = 'wake';
        setError(null);
        setIsWakeWordListening(true);
        setInterimTranscript('');

        try {
          nativePartialResultsListenerRef.current = await SpeechRecognition.addListener('partialResults', (data) => {
            const rawTranscript = data.matches?.[0]?.trim() ?? '';
            const normalizedTranscript = rawTranscript.toLowerCase();

            if (!normalizedTranscript || !wakeWordActiveRef.current) return;

            setInterimTranscript(rawTranscript);

            const liveCommand = extractCommandAfterWakeWord(normalizedTranscript);
            const wakeWordFound = wakeWordsRef.current.some((word) =>
              normalizedTranscript.includes(word.toLowerCase())
            );

            if (typeof liveCommand === 'string' && liveCommand.length > 0) {
              pendingWakeWordCommandRef.current = liveCommand;
              clearWakeWordCommandTimeout();
              wakeWordCommandTimeoutRef.current = window.setTimeout(() => {
                const command = pendingWakeWordCommandRef.current.trim();
                if (!command || !wakeWordActiveRef.current) return;

                pendingWakeWordCommandRef.current = '';
                setWakeWordDetected(true);
                onWakeWordRef.current?.(command);
                handoffToCommandRef.current = false;
                wakeWordActiveRef.current = false;
                void stopNativeRecognition();
              }, 850);
              return;
            }

            if (wakeWordFound) {
              clearWakeWordCommandTimeout();
              pendingWakeWordCommandRef.current = '';
              setWakeWordDetected(true);
              onWakeWordRef.current?.();
              handoffToCommandRef.current = true;
              wakeWordActiveRef.current = false;
              void stopNativeRecognition();
              window.setTimeout(() => {
                startListening();
              }, 600);
            }
          });

          nativeListeningStateListenerRef.current = await SpeechRecognition.addListener('listeningState', (data) => {
            if (data.status !== 'stopped') return;

            setIsWakeWordListening(false);

            if (wakeWordActiveRef.current && !isListeningRef.current && !handoffToCommandRef.current) {
              window.setTimeout(() => {
                if (wakeWordActiveRef.current && !isListeningRef.current && !handoffToCommandRef.current) {
                  startWakeWordListening();
                }
              }, 4000);
            }
          });

          await SpeechRecognition.start({
            language,
            maxResults: 1,
            partialResults: true,
            popup: false,
            prompt: 'Di Stella',
          });
        } catch (error: any) {
          nativeModeRef.current = 'idle';
          setIsWakeWordListening(false);
          const message = typeof error?.message === 'string' ? error.message : 'Wake word non disponibile';
          setError(`Wake word detection error: ${message}`);
        }
      })();
      return;
    }

    void (async () => {
      const hasMicAccess = await primeBrowserMicrophone();
      if (!hasMicAccess) {
        setError(permissionDeniedMessage);
        setIsWakeWordListening(false);
        return;
      }

      wakeWordActiveRef.current = true;

      if (wakeWordRecognitionRef.current) {
        try { wakeWordRecognitionRef.current.stop(); } catch { /* best-effort, ignore */ }
        wakeWordRecognitionRef.current = null;
      }

      const createWakeWordRecognition = () => {
        if (!wakeWordActiveRef.current) return;

        try {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          const recognition = new SpeechRecognition();
          wakeWordRecognitionRef.current = recognition;

          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = language;

          recognition.onstart = () => {
            setIsWakeWordListening(true);
            setError(null);
          };

          recognition.onresult = (event: any) => {
            // Compute live transcript + average confidence for wake-word gating.
            // Low-confidence noise is ignored to focus on the user's voice.
            let liveText = '';
            let finalText = '';
            let liveConfSum = 0;
            let liveConfCount = 0;
            let finalConfSum = 0;
            let finalConfCount = 0;

            for (let i = 0; i < event.results.length; i++) {
              const r = event.results[i];
              const alt = r[0];
              const conf = typeof alt.confidence === 'number' ? alt.confidence : 0.7;
              liveText += alt.transcript;
              liveConfSum += conf;
              liveConfCount += 1;
              if (r.isFinal) {
                finalText += alt.transcript + ' ';
                finalConfSum += conf;
                finalConfCount += 1;
              }
            }

            // BUG FIX: previously discarded any result below a 0.6
            // confidence threshold — Chrome's SpeechRecognition
            // confidence scores are well known to be unreliable, often
            // reporting 0 or very low values for INTERIM results even
            // when the transcript itself is accurate (Chrome mostly
            // only computes meaningful confidence for final results,
            // and inconsistently even then). That silently discarded
            // essentially every wake-word attempt on affected setups,
            // with zero visible error — "Ehi Stella" simply never
            // triggered anything. Confidence is no longer used to
            // gate processing at all; the wake-word text match itself
            // (checked below) is what decides whether to react.
            void liveConfSum; void liveConfCount; void finalConfSum; void finalConfCount; void MIN_WAKE_CONFIDENCE;

            const currentTranscript = liveText.toLowerCase();
            const finalTranscript = finalText.toLowerCase();

            const finalCommand = extractCommandAfterWakeWord(finalTranscript);
            const liveCommand = extractCommandAfterWakeWord(currentTranscript);

            const wakeWordFound = wakeWordsRef.current.some(word =>
              currentTranscript.includes(word.toLowerCase())
            );

            if (typeof finalCommand === 'string' && finalCommand.length > 0) {
              clearWakeWordCommandTimeout();
              pendingWakeWordCommandRef.current = '';
              setWakeWordDetected(true);
              onWakeWordRef.current?.(finalCommand);
              handoffToCommandRef.current = false;
              wakeWordActiveRef.current = false;
              stopWakeWordRecognitionInstance();
              return;
            }

            if (typeof liveCommand === 'string' && liveCommand.length > 0) {
              pendingWakeWordCommandRef.current = liveCommand;
              clearWakeWordCommandTimeout();
              wakeWordCommandTimeoutRef.current = window.setTimeout(() => {
                const command = pendingWakeWordCommandRef.current.trim();
                if (!command) return;

                pendingWakeWordCommandRef.current = '';
                setWakeWordDetected(true);
                onWakeWordRef.current?.(command);
                handoffToCommandRef.current = false;
                wakeWordActiveRef.current = false;
                stopWakeWordRecognitionInstance();
              }, 850);
              return;
            }

            if (wakeWordFound) {
              clearWakeWordCommandTimeout();
              pendingWakeWordCommandRef.current = '';
              setWakeWordDetected(true);
              onWakeWordRef.current?.();
              handoffToCommandRef.current = true;
              wakeWordActiveRef.current = false;
              stopWakeWordRecognitionInstance();
              setTimeout(() => {
                startListening();
              }, 600);
            }
          };

          recognition.onerror = (event: any) => {
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
              setError(permissionDeniedMessage);
              wakeWordActiveRef.current = false;
            } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
              setError(`Wake word detection error: ${event.error}`);
            }
            // Don't set isWakeWordListening false on no-speech — continuous mode keeps going
          };

          recognition.onend = () => {
            setIsWakeWordListening(false);
            // Only restart if still active — browser may kill continuous after a while
            if (wakeWordActiveRef.current && !isListeningRef.current && !handoffToCommandRef.current) {
              setTimeout(() => {
                if (wakeWordActiveRef.current && !isListeningRef.current && !handoffToCommandRef.current) {
                  createWakeWordRecognition();
                }
              }, 500);
            }
          };

          recognition.start();
        } catch {
          setError('Wake word recognition not supported');
          setIsWakeWordListening(false);
        }
      };

      createWakeWordRecognition();
    })();
  }, [
    clearWakeWordCommandTimeout,
    ensureNativePermissions,
    extractCommandAfterWakeWord,
    isNativeSpeechSupported,
    isSupported,
    language,
    permissionDeniedMessage,
    primeBrowserMicrophone,
    startListening,
    stopNativeRecognition,
    wakeWordEnabled,
  ]);

  useEffect(() => {
    return () => {
      wakeWordActiveRef.current = false;
      handoffToCommandRef.current = false;
      pendingWakeWordCommandRef.current = '';
      clearWakeWordCommandTimeout();

      if (isNativeSpeechSupported) {
        void stopNativeRecognition();
      }

      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* best-effort, ignore */ }
      }
      if (wakeWordRecognitionRef.current) {
        try { wakeWordRecognitionRef.current.stop(); } catch { /* best-effort, ignore */ }
      }
    };
  }, [clearWakeWordCommandTimeout, isNativeSpeechSupported, stopNativeRecognition]);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    isWakeWordListening,
    wakeWordDetected,
    startListening,
    stopListening,
    resetTranscript,
    startWakeWordListening,
    stopWakeWordListening,
  };
};
