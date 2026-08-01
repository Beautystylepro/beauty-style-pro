import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Coins, Trophy, Zap, HelpCircle, Timer, Users, Star, Sparkles, ChevronRight, Crown, Gift, Target } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import MobileLayout from "@/components/layout/MobileLayout";
import { toast } from "sonner";

interface Question {
  id: number;
  question: string;
  options: string[];
  correct: number;
  difficulty: "facile" | "medio" | "difficile";
  category: string;
  reward: number;
}

const quizQuestions: Question[] = [
  { id: 1, question: "Qual è il trattamento più richiesto in salone?", options: ["Balayage", "Permanente", "Extension", "Rasatura"], correct: 0, difficulty: "facile", category: "Beauty", reward: 10 },
  { id: 2, question: "Quanto dura in media un trattamento alla cheratina?", options: ["30 min", "1 ora", "2 ore", "3 ore"], correct: 2, difficulty: "medio", category: "Trattamenti", reward: 20 },
  { id: 3, question: "Quale vitamina è essenziale per capelli sani?", options: ["Vitamina A", "Vitamina B7 (Biotina)", "Vitamina C", "Vitamina D"], correct: 1, difficulty: "medio", category: "Scienza", reward: 20 },
  { id: 4, question: "Cos'è il 'balayage'?", options: ["Un taglio corto", "Una tecnica di colorazione", "Un trattamento spa", "Un tipo di piega"], correct: 1, difficulty: "facile", category: "Tecniche", reward: 10 },
  { id: 5, question: "Quale strumento si usa per il 'babyliss'?", options: ["Piastra", "Ferro arricciacapelli", "Phon", "Spazzola rotante"], correct: 1, difficulty: "facile", category: "Strumenti", reward: 10 },
  { id: 6, question: "Quanti strati ha la pelle umana?", options: ["2", "3", "4", "5"], correct: 1, difficulty: "difficile", category: "Scienza", reward: 50 },
  { id: 7, question: "Quale olio è migliore per capelli secchi?", options: ["Olio di cocco", "Olio di oliva", "Olio di argan", "Olio di girasole"], correct: 2, difficulty: "medio", category: "Prodotti", reward: 20 },
  { id: 8, question: "Cosa significa 'ombré' nei capelli?", options: ["Colore uniforme", "Gradazione di colore", "Decolorazione totale", "Tinta temporanea"], correct: 1, difficulty: "facile", category: "Tecniche", reward: 10 },
  { id: 9, question: "Qual è la temperatura ideale della piastra per capelli fini?", options: ["120°C", "150°C", "180°C", "220°C"], correct: 1, difficulty: "difficile", category: "Strumenti", reward: 50 },
  { id: 10, question: "Quale ingrediente è da evitare negli shampoo?", options: ["Pantenolo", "Solfati (SLS)", "Cheratina", "Aloe vera"], correct: 1, difficulty: "medio", category: "Prodotti", reward: 20 },
];

const lifelines = [
  { id: "5050", label: "50:50", icon: HelpCircle, description: "Elimina 2 risposte sbagliate" },
  { id: "skip", label: "Salta", icon: ChevronRight, description: "Passa alla prossima domanda" },
  { id: "hint", label: "Suggerimento", icon: Sparkles, description: "Ricevi un indizio AI" },
];

const prizes = [
  { level: 1, amount: 10, label: "10 QRC" },
  { level: 2, amount: 20, label: "20 QRC" },
  { level: 3, amount: 30, label: "30 QRC" },
  { level: 4, amount: 50, label: "50 QRC" },
  { level: 5, amount: 100, label: "100 QRC" },
  { level: 6, amount: 200, label: "200 QRC" },
  { level: 7, amount: 500, label: "500 QRC + Badge" },
  { level: 8, amount: 1000, label: "1.000 QRC + Sconto 20%" },
  { level: 9, amount: 2000, label: "2.000 QRC + SPA" },
  { level: 10, amount: 5000, label: "5.000 QRC + JACKPOT" },
];

type GameState = "lobby" | "playing" | "result" | "wrong";

export default function QuizLivePage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [gameState, setGameState] = useState<GameState>("lobby");
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [totalWon, setTotalWon] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [usedLifelines, setUsedLifelines] = useState<string[]>([]);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [participants, setParticipants] = useState(Math.floor(Math.random() * 200) + 50);

  const question = quizQuestions[currentQ];

  // Timer
  useEffect(() => {
    if (gameState !== "playing" || selectedAnswer !== null) return;
    if (timeLeft <= 0) {
      handleAnswer(-1);
      return;
    }
    const t = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, gameState, selectedAnswer]);

  const startGame = () => {
    if (!user) { toast.error("Accedi per giocare"); navigate("/auth"); return; }
    setGameState("playing");
    setCurrentQ(0);
    setScore(0);
    setTotalWon(0);
    setTimeLeft(30);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setUsedLifelines([]);
    setHiddenOptions([]);
    setStreak(0);
    setShowHint(false);
  };

  const handleAnswer = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    const correct = index === question.correct;
    setIsCorrect(correct);

    if (correct) {
      const reward = question.reward * (streak >= 3 ? 2 : 1);
      setScore(prev => prev + 1);
      setTotalWon(prev => prev + reward);
      setStreak(prev => prev + 1);
      toast.success(`+${reward} QRC! ${streak >= 2 ? "🔥 Combo x" + (streak + 1) : ""}`);

      setTimeout(() => {
        if (currentQ < quizQuestions.length - 1) {
          setCurrentQ(prev => prev + 1);
          setTimeLeft(30 - Math.min(currentQ * 2, 15));
          setSelectedAnswer(null);
          setIsCorrect(null);
          setHiddenOptions([]);
          setShowHint(false);
        } else {
          setGameState("result");
          saveResult(score + 1, totalWon + reward);
        }
      }, 1500);
    } else {
      setStreak(0);
      setTimeout(() => {
        setGameState("wrong");
        saveResult(score, totalWon);
      }, 2000);
    }
  };

  const saveResult = async (finalScore: number, finalWon: number) => {
    if (!user) return;
    try {
      if (finalWon > 0) {
        const { data, error } = await supabase.functions.invoke("qr-coins-transaction", {
          body: { kind: "quiz_win", amount: finalWon },
        });
        if (error || data?.error) {
          console.error("Quiz credit failed:", error || data?.error);
        } else {
          refreshProfile();
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleLifeline = (id: string) => {
    if (usedLifelines.includes(id)) return;
    setUsedLifelines(prev => [...prev, id]);

    if (id === "5050") {
      const wrong = question.options.map((_, i) => i).filter(i => i !== question.correct);
      const toHide = wrong.sort(() => Math.random() - 0.5).slice(0, 2);
      setHiddenOptions(toHide);
    } else if (id === "skip") {
      if (currentQ < quizQuestions.length - 1) {
        setCurrentQ(prev => prev + 1);
        setTimeLeft(30);
        setSelectedAnswer(null);
        setIsCorrect(null);
        setHiddenOptions([]);
        setShowHint(false);
      }
    } else if (id === "hint") {
      setShowHint(true);
    }
  };

  // ===== LOBBY =====
  if (gameState === "lobby") {
    return (
      <MobileLayout>
        <header className="sticky top-0 z-40 glass px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-display font-bold">Quiz Live</h1>
            <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full gradient-gold">
              <Coins className="w-4 h-4 text-gold-foreground" />
              <span className="text-sm font-bold text-gold-foreground">{profile?.qr_coins?.toLocaleString() || "0"}</span>
            </div>
          </div>
        </header>

        <div className="px-4 py-6 space-y-5">
          {/* Hero */}
          <div className="text-center py-8">
            <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center mx-auto mb-4 shadow-glow">
              <Zap className="w-12 h-12 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-display font-black mb-2">Quiz Style</h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Rispondi alle domande sul mondo Beauty & Style per vincere QRCoin e premi esclusivi!
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-card border border-border/50 p-3 text-center">
              <Target className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold">{quizQuestions.length}</p>
              <p className="text-xs text-muted-foreground">Domande</p>
            </div>
            <div className="rounded-2xl bg-card border border-border/50 p-3 text-center">
              <Users className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold">{participants}</p>
              <p className="text-xs text-muted-foreground">Partecipanti</p>
            </div>
            <div className="rounded-2xl bg-card border border-border/50 p-3 text-center">
              <Trophy className="w-5 h-5 text-accent mx-auto mb-1" />
              <p className="text-lg font-bold">5K</p>
              <p className="text-xs text-muted-foreground">QRC in palio</p>
            </div>
          </div>

          {/* Prize Ladder */}
          <div className="rounded-2xl bg-card border border-border/50 p-4">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Crown className="w-4 h-4 text-accent" /> Scala Premi
            </h3>
            <div className="space-y-1.5">
              {prizes.slice().reverse().slice(0, 5).map((p, i) => (
                <div key={p.level} className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${
                  i === 0 ? "gradient-gold text-gold-foreground font-bold" : "bg-muted/50"
                }`}>
                  <span>Livello {p.level}</span>
                  <span className="font-semibold">{p.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Start */}
          <button onClick={startGame}
            className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground text-lg font-bold shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-transform">
            🎮 Inizia il Quiz!
          </button>

          {/* Daily Bonus */}
          <div className="rounded-2xl glass border border-primary/20 p-4 flex items-center gap-3">
            <Gift className="w-8 h-8 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold">Bonus Giornaliero</p>
              <p className="text-[11px] text-muted-foreground">Gioca ogni giorno per un giro ruota bonus gratuito!</p>
            </div>
          </div>
        </div>
      </MobileLayout>
    );
  }

  // ===== RESULT / WRONG =====
  if (gameState === "result" || gameState === "wrong") {
    return (
      <MobileLayout>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${
            gameState === "result" ? "gradient-gold shadow-glow" : "bg-destructive/20"
          }`}>
            {gameState === "result" ? (
              <Trophy className="w-12 h-12 text-gold-foreground" />
            ) : (
              <Zap className="w-12 h-12 text-destructive" />
            )}
          </div>

          <h2 className="text-2xl font-display font-black mb-2">
            {gameState === "result" ? "🎉 Quiz Completato!" : "❌ Risposta Sbagliata!"}
          </h2>
          <p className="text-muted-foreground text-sm mb-6">
            {gameState === "result"
              ? `Hai risposto correttamente a tutte le ${quizQuestions.length} domande!`
              : `Hai risposto correttamente a ${score} domande su ${quizQuestions.length}`
            }
          </p>

          {/* Score Card */}
          <div className="w-full max-w-sm rounded-2xl gradient-card border border-border/50 p-6 mb-6 text-center">
            <p className="text-muted-foreground text-xs mb-1">Hai vinto</p>
            <p className="text-4xl font-display font-black text-primary mb-1">{totalWon} QRC</p>
            <p className="text-[11px] text-muted-foreground">{score}/{quizQuestions.length} risposte corrette</p>
            {streak > 2 && <p className="text-xs text-accent font-semibold mt-2">🔥 Max combo: x{streak}</p>}
          </div>

          <div className="w-full max-w-sm space-y-3">
            <button onClick={startGame}
              className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-bold shadow-glow">
              🔄 Gioca Ancora
            </button>
            <button onClick={() => navigate("/spin")}
              className="w-full py-3 rounded-2xl bg-card border border-border/50 font-semibold text-sm">
              🎡 Gira la Ruota Bonus
            </button>
            <button onClick={() => navigate("/leaderboard")}
              className="w-full py-3 rounded-2xl bg-card border border-border/50 font-semibold text-sm">
              🏆 Classifica
            </button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  // ===== PLAYING =====
  const progress = ((currentQ + 1) / quizQuestions.length) * 100;
  const timerColor = timeLeft <= 5 ? "text-destructive" : timeLeft <= 10 ? "text-accent" : "text-primary";

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-40 glass px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => { setGameState("lobby"); }} className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-xs font-bold">
                <Star className="w-3 h-3 text-primary" /> {score}/{quizQuestions.length}
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full gradient-gold text-xs font-bold text-gold-foreground">
                <Coins className="w-3 h-3" /> {totalWon}
              </span>
            </div>
            <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full glass text-sm font-bold ${timerColor}`}>
              <Timer className="w-4 h-4" /> {timeLeft}s
            </div>
          </div>
          {/* Progress */}
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full gradient-primary transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </header>

        <div className="px-4 py-6">
          {/* Streak */}
          {streak >= 2 && (
            <div className="flex items-center justify-center gap-2 mb-4 animate-fade-in">
              <span className="px-3 py-1.5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center gap-1">
                🔥 Combo x{streak} — Premi Raddoppiati!
              </span>
            </div>
          )}

          {/* Question */}
          <div className="rounded-2xl gradient-card border border-border/50 p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                question.difficulty === "facile" ? "bg-green-500/20 text-green-400" :
                question.difficulty === "medio" ? "bg-accent/20 text-accent" :
                "bg-destructive/20 text-destructive"
              }`}>{question.difficulty}</span>
              <span className="text-xs text-muted-foreground">{question.category}</span>
              <span className="ml-auto text-xs text-primary font-semibold">+{question.reward * (streak >= 3 ? 2 : 1)} QRC</span>
            </div>
            <h2 className="text-lg font-display font-bold leading-tight">{question.question}</h2>
          </div>

          {/* Hint */}
          {showHint && (
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-3 mb-4 animate-fade-in">
              <p className="text-xs text-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> La risposta corretta è tra le prime due opzioni!
              </p>
            </div>
          )}

          {/* Answers */}
          <div className="space-y-3 mb-6">
            {question.options.map((option, i) => {
              if (hiddenOptions.includes(i)) return null;
              const isSelected = selectedAnswer === i;
              const isCorrectAnswer = i === question.correct;
              let bg = "bg-card border border-border/50 hover:border-primary/30";

              if (selectedAnswer !== null) {
                if (isCorrectAnswer) bg = "bg-green-500/20 border border-green-500/50";
                else if (isSelected && !isCorrect) bg = "bg-destructive/20 border border-destructive/50";
              }

              return (
                <button key={i} onClick={() => handleAnswer(i)} disabled={selectedAnswer !== null}
                  className={`w-full text-left px-5 py-4 rounded-2xl transition-all duration-300 ${bg} ${
                    selectedAnswer === null ? "active:scale-[0.98]" : ""
                  }`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      isSelected && isCorrect ? "gradient-primary text-primary-foreground" :
                      isSelected && !isCorrect ? "bg-destructive text-destructive-foreground" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-sm font-medium">{option}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Lifelines */}
          <div className="flex gap-3 justify-center">
            {lifelines.map(l => {
              const used = usedLifelines.includes(l.id);
              return (
                <button key={l.id} onClick={() => handleLifeline(l.id)} disabled={used || selectedAnswer !== null}
                  className={`flex flex-col items-center gap-1 px-4 py-3 rounded-2xl transition-all ${
                    used ? "bg-muted/30 opacity-40" : "glass hover:bg-primary/10"
                  }`}>
                  <l.icon className={`w-5 h-5 ${used ? "text-muted-foreground" : "text-primary"}`} />
                  <span className="text-xs font-semibold">{l.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
