import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Mic, MicOff, Volume2, VolumeX, Send, Check, XCircle, Radio, Loader2, ChevronUp, RotateCcw } from 'lucide-react';
import { useStellaAgent } from '@/hooks/useStellaAgent';
import { motion, AnimatePresence } from 'framer-motion';

export default function StellaVoiceAgent() {
  const {
    messages, isOpen, setIsOpen,
    wakeWordActive, ttsEnabled,
    isListening, isWakeWordListening, interimTranscript, speaking,
    pendingCommand, isSupported, isAIThinking, proactiveSuggestions,
    inlineStatus, clearInlineStatus,
    actionSteps, clearSteps,
    needsMicPermissionPrompt, enableWakeWordNow,
    toggleWakeWord, toggleTTS, toggleListening,
    sendTextCommand, confirmAction, cancelAction, repeatPending, clearMessages,
  } = useStellaAgent();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAIThinking]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    sendTextCommand(input);
    setInput('');
  }, [input, sendTextCommand]);

  // Auto-dismiss inline status after 4s
  useEffect(() => {
    if (inlineStatus && !isAIThinking) {
      const timer = setTimeout(clearInlineStatus, 4000);
      return () => clearTimeout(timer);
    }
  }, [inlineStatus, isAIThinking, clearInlineStatus]);

  const statusText = !isSupported
    ? '⌨️ Scrivimi qui sotto'
    : isAIThinking
      ? '🧠 Sto pensando...'
      : isListening
        ? '🔴 Ti ascolto...'
        : isWakeWordListening
          ? '🎤 Dì "Stella"...'
          : speaking
            ? '🔊 Sto parlando...'
            : 'Assistente vocale super AI';

  return (
    <>
      <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[9998]" />

      {/* ═══ SIRI-STYLE ACTION STEPS OVERLAY ═══ */}
      <AnimatePresence>
        {!isOpen && actionSteps.length > 0 && (
          <motion.div
            initial={{ y: -20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="fixed top-4 left-4 right-4 z-[9999] pointer-events-auto max-w-md mx-auto"
          >
            <div className="bg-background/95 backdrop-blur-xl border border-primary/30 rounded-2xl shadow-2xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                    <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                  <p className="text-xs font-bold text-gradient-primary">Stella sta lavorando</p>
                </div>
                <button
                  type="button"
                  aria-label="Chiudi steps"
                  onClick={clearSteps}
                  className="w-6 h-6 rounded-full bg-muted flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <ul className="space-y-1.5">
                {actionSteps.map((s, idx) => (
                  <motion.li
                    key={s.id}
                    initial={{ x: -8, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.04 }}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="text-base leading-none w-5 text-center">{s.icon}</span>
                    <span className={`flex-1 ${s.status === 'error' ? 'text-red-500' : s.status === 'done' ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {s.label}
                    </span>
                    {s.status === 'pending' ? (
                      <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                    ) : s.status === 'done' ? (
                      <Check className="w-3 h-3 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                    )}
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SIRI-LIKE INLINE STATUS BAR ═══ */}
      <AnimatePresence>
        {!isOpen && (inlineStatus || isAIThinking || isListening) && (
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed bottom-24 left-4 right-20 z-[9999] pointer-events-auto"
          >
            <div
              className="bg-background/95 backdrop-blur-xl border border-primary/30 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 cursor-pointer"
              onClick={() => clearInlineStatus()}
            >
              <div className={`w-9 h-9 rounded-full gradient-primary flex items-center justify-center shrink-0 ${isListening || isAIThinking ? 'shadow-glow' : ''}`}>
                {isAIThinking ? (
                  <Loader2 className="w-4.5 h-4.5 text-primary-foreground animate-spin" />
                ) : isListening ? (
                  <Mic className="w-4.5 h-4.5 text-primary-foreground animate-pulse" />
                ) : (
                  <Sparkles className="w-4.5 h-4.5 text-primary-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary">Stella</p>
                <p className="text-xs text-foreground truncate">
                  {isAIThinking
                    ? 'Sto pensando...'
                    : isListening
                      ? (interimTranscript || 'Ti ascolto...')
                      : inlineStatus || ''}
                </p>
              </div>
              {isListening && (
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map(i => (
                    <motion.div
                      key={i}
                      className="w-1 bg-primary rounded-full"
                      animate={{ height: [8, 16, 8] }}
                      transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                aria-label="Apri pannello"
                onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
                className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ FLOATING BUTTON ═══ */}
      <AnimatePresence>
        {!isOpen && needsMicPermissionPrompt && (
          <motion.button
            type="button"
            onClick={enableWakeWordNow}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-[164px] right-4 z-[9999] max-w-[220px] rounded-2xl bg-card border border-primary/40 shadow-lg px-3 py-2.5 flex items-center gap-2 text-left pointer-events-auto"
          >
            <Mic className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[11px] font-semibold leading-snug">Tocca per attivare "Ehi Stella" in ascolto continuo</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isOpen && (
          <motion.button
            type="button"
            aria-label="Apri Stella AI"
            drag
            dragConstraints={constraintsRef}
            dragElastic={0.1}
            onClick={() => {
              // Se il wake word non è partito (permesso microfono negato o non
              // ancora concesso), il tap dell'utente lo autorizza e avvia
              // subito l'ascolto continuo stile Siri.
              if (needsMicPermissionPrompt) {
                enableWakeWordNow();
              } else if (isSupported && wakeWordActive && !isWakeWordListening && !isListening) {
                toggleWakeWord();
                setTimeout(() => toggleWakeWord(), 50);
              }
              setIsOpen(true);
            }}
            className="fixed bottom-24 right-4 z-[9999] w-14 h-14 rounded-full gradient-primary shadow-glow flex items-center justify-center pointer-events-auto"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: [0, 5, -5, 0] }}
            exit={{ scale: 0, opacity: 0 }}
            whileTap={{ scale: 0.9 }}
            transition={{ rotate: { repeat: Infinity, duration: 4, ease: 'easeInOut' } }}
          >
            <Sparkles className="w-6 h-6 text-primary-foreground" />
            {isSupported && (isWakeWordListening || isListening) && (
              <span className="absolute -inset-1 rounded-full border-2 border-primary/60 animate-ping" />
            )}
            {speaking && (
              <span className="absolute -inset-0.5 rounded-full border-2 border-accent/60 animate-pulse" />
            )}
            {/* Badge persistente: mostra che Stella sta davvero ascoltando */}
            {isSupported && isWakeWordListening && !isListening && (
              <span className="absolute -top-1 -left-1 px-1.5 py-0.5 rounded-full bg-green-500 text-[9px] font-bold text-white shadow-lg whitespace-nowrap">
                LIVE
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ═══ FULL CHAT PANEL ═══ */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[9999] max-w-lg mx-auto pointer-events-auto"
          >
            <div className="bg-background/95 backdrop-blur-xl border-t border-primary/20 rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '75vh' }}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
                <div className={`w-10 h-10 rounded-full gradient-primary flex items-center justify-center shrink-0 ${isListening ? 'shadow-glow' : ''}`}>
                  <Sparkles className={`w-5 h-5 text-primary-foreground ${isListening ? 'animate-pulse' : ''}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gradient-primary">Stella AI</h3>
                  <p className="text-xs text-muted-foreground truncate">{statusText}</p>
                </div>

                <button
                  type="button"
                  aria-label={wakeWordActive ? 'Disabilita wake word' : 'Abilita wake word'}
                  onClick={toggleWakeWord}
                  disabled={!isSupported}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${wakeWordActive ? 'bg-primary/20 text-primary ring-1 ring-primary/30' : 'bg-muted text-muted-foreground'} ${!isSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Radio className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label={ttsEnabled ? 'Disabilita voce' : 'Abilita voce'}
                  onClick={toggleTTS}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${ttsEnabled ? 'bg-primary/20 text-primary ring-1 ring-primary/30' : 'bg-muted text-muted-foreground'}`}
                >
                  {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  aria-label="Chiudi Stella"
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!isSupported ? (
                <div className="mx-4 mt-2 px-3 py-2 rounded-xl bg-muted border border-border/60 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                  <p className="text-xs text-muted-foreground flex-1">
                    Il microfono non è supportato qui, ma Stella funziona se le scrivi.
                  </p>
                </div>
              ) : (isWakeWordListening || isListening) && (
                <div className="mx-4 mt-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shrink-0" />
                  <p className="text-xs text-primary font-medium flex-1">
                    {isListening ? '🎤 Parla ora — ti ascolto!' : '🤖 Mani Libere attiva · Dì "Stella"'}
                  </p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: '200px', maxHeight: '45vh' }}>
                {messages.length === 0 && (
                  <div className="text-center py-6">
                    <Sparkles className="w-10 h-10 text-primary mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">Ciao! Sono Stella 🌟</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Dì "Stella" + un comando e agisco subito come Siri!
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Esempio: "Stella metti like" · "Stella apri profilo" · "Stella prenota"
                    </p>

                    {proactiveSuggestions.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-xs font-semibold text-primary/70">💡 Suggeriti per te:</p>
                        {proactiveSuggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => sendTextCommand(s.command)}
                            className="w-full px-3 py-2 rounded-xl bg-primary/5 border border-primary/15 text-xs text-left text-foreground hover:bg-primary/10 transition-colors"
                          >
                            {s.text}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 justify-center">
                      {[
                        '🗺️ Mappa professionisti',
                        '✂️ Prenota taglio',
                        '🎨 Prova look AI',
                        '💬 Invia messaggio',
                        '❤️ Metti like',
                        '🔍 Cerca',
                        '❓ Aiuto',
                      ].map(cmd => (
                        <button
                          key={cmd}
                          type="button"
                          onClick={() => sendTextCommand(cmd.replace(/^.+?\s/, ''))}
                          className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors"
                        >
                          {cmd}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : msg.type === 'confirmation'
                          ? 'bg-amber-500/10 border border-amber-500/30 text-foreground'
                          : msg.type === 'action_result'
                            ? 'bg-green-500/10 border border-green-500/30 text-foreground'
                            : 'bg-muted text-foreground'
                    }`}>
                      <p className="text-sm whitespace-pre-line">{msg.content}</p>

                      {msg.preview && (
                        <div className="mt-2 rounded-lg bg-background/60 border border-border/40 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                            Anteprima {msg.preview.kind === 'message' ? 'messaggio' : msg.preview.kind === 'comment' ? 'commento' : 'post'}
                            {msg.preview.recipient ? ` → ${msg.preview.recipient}` : ''}
                          </p>
                          <p className="text-sm font-medium">{msg.preview.content}</p>
                        </div>
                      )}

                      {msg.type === 'confirmation' && pendingCommand && (
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            aria-label="Conferma azione"
                            onClick={confirmAction}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-500 text-white text-xs font-semibold hover:bg-green-600 transition-colors"
                          >
                            <Check className="w-3 h-3" /> Conferma
                          </button>
                          <button
                            type="button"
                            aria-label="Annulla azione"
                            onClick={cancelAction}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors"
                          >
                            <XCircle className="w-3 h-3" /> Annulla
                          </button>
                          <button
                            type="button"
                            aria-label="Ripeti il comando in attesa"
                            onClick={repeatPending}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted text-foreground text-xs font-semibold hover:bg-muted/80 transition-colors border border-border"
                          >
                            <RotateCcw className="w-3 h-3" /> Ripeti
                          </button>
                        </div>
                      )}

                      {msg.followups && msg.followups.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {msg.followups.map((f, i) => (
                            <button
                              key={i}
                              type="button"
                              aria-label={f.text}
                              onClick={() => sendTextCommand(f.command)}
                              className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] text-primary hover:bg-primary/20 transition-colors"
                            >
                              {f.text}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isAIThinking && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-3.5 py-2.5 bg-muted flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Stella sta pensando...</p>
                    </div>
                  </div>
                )}

                {interimTranscript && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 bg-primary/30 text-foreground italic">
                      <p className="text-sm">{interimTranscript}...</p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="px-4 py-3 border-t border-border/50 flex items-center gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Scrivi un comando..."
                  className="flex-1 h-10 rounded-full bg-muted px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  disabled={isAIThinking}
                />
                <button
                  type="button"
                  aria-label={isListening ? 'Ferma ascolto' : 'Inizia ascolto'}
                  onClick={toggleListening}
                  disabled={!isSupported || isAIThinking}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                    isListening ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  aria-label="Invia comando"
                  onClick={handleSend}
                  disabled={!input.trim() || isAIThinking}
                  className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center shadow-glow disabled:opacity-50 active:scale-95 transition-transform shrink-0"
                >
                  <Send className="w-4 h-4 text-primary-foreground" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
