import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Brain, TrendingUp, TrendingDown, Users, AlertTriangle, Sparkles, Calendar, DollarSign, BarChart3, Target, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

interface InsightCard {
  id: string;
  type: string;
  title: string;
  value: string;
  change: number;
  confidence: number;
  icon: React.ReactNode;
  color: string;
  detail: string;
}

export default function PredictiveAnalyticsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [insufficientDataMsg, setInsufficientDataMsg] = useState<string | null>(null);

  const { data: insights = [], isLoading, refetch } = useQuery({
    queryKey: ["predictive-insights"],
    queryFn: async () => {
      const { data } = await supabase
        .from("predictive_insights")
        .select("*")
        .eq("user_id", user?.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user,
  });

  const handleGenerate = async () => {
    if (!user) return;
    setRefreshing(true);
    setInsufficientDataMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-predictive-insights", {});
      if (error) throw error;
      if (data?.insufficientData) {
        setInsufficientDataMsg(data.message);
      } else {
        await refetch();
      }
    } catch {
      setInsufficientDataMsg("Errore nella generazione dell'analisi. Riprova tra poco.");
    } finally {
      setRefreshing(false);
    }
  };

  const insightIcons: Record<string, React.ReactNode> = {
    revenue: <DollarSign className="w-5 h-5 text-green-400" />,
    churn: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
    busy_period: <Calendar className="w-5 h-5 text-blue-400" />,
    growth: <Users className="w-5 h-5 text-purple-400" />,
  };

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border p-4">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Indietro" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5 text-primary" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Brain className="w-5 h-5 text-primary" /> AI Predictive
              </h1>
              <p className="text-xs text-muted-foreground">Previsioni intelligenti per il tuo business</p>
            </div>
            <Button variant="outline" size="icon" aria-label="Genera analisi" onClick={handleGenerate} disabled={refreshing}>
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {insufficientDataMsg && (
            <Card className="p-4 bg-muted/30 border-dashed">
              <p className="text-sm text-muted-foreground">{insufficientDataMsg}</p>
            </Card>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : insights.length === 0 ? (
            <Card className="p-6 text-center space-y-3">
              <Brain className="w-10 h-10 text-primary mx-auto opacity-60" />
              <p className="text-sm text-muted-foreground">
                Nessuna analisi ancora generata. Tocca il pulsante di aggiornamento in alto per creare la tua prima analisi predittiva, basata sui tuoi dati reali degli ultimi 90 giorni.
              </p>
              <Button onClick={handleGenerate} disabled={refreshing} className="mx-auto">
                {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Genera la mia prima analisi
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {insights.map((insight: any) => (
                <Card key={insight.id} className="p-4 bg-card border-border">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{insightIcons[insight.insight_type] || <Sparkles className="w-5 h-5 text-primary" />}</div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{insight.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-[10px]">{insight.timeframe}</Badge>
                        <div className="flex items-center gap-1 flex-1">
                          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-[80px]">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${insight.confidence_score}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">Affidabilità: {insight.confidence_score}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
