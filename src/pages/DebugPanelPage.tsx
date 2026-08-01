import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { runFullStressTest, testRapidFire } from "@/lib/stressTest";
import { useNavigate } from "react-router-dom";
import {
  Activity, AlertTriangle, CheckCircle, XCircle, Zap, Database,
  Radio, HardDrive, MessageSquare, Shield, ShieldCheck, Clock, RefreshCw, Loader2
} from "lucide-react";

interface TestResult {
  test_name: string;
  test_type: string;
  duration_ms: number;
  success: boolean;
  error_message?: string;
  metadata?: Record<string, any>;
}

interface ErrorLog {
  id: string;
  error_type: string;
  message: string;
  severity: string;
  page_path: string;
  created_at: string;
}

export default function DebugPanelPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("tests");
  const isProduction = import.meta.env.PROD;

  useEffect(() => {
    if (isProduction) return;
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").then(({ data }) => {
      setIsAdmin(data && data.length > 0);
    });
  }, [user, isProduction]);

  const fetchErrors = async () => {
    const { data } = await (supabase as any)
      .from("error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) setErrors(data);
  };

  const fetchPastResults = async () => {
    const { data } = await (supabase as any)
      .from("stress_test_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setResults(data);
  };

  useEffect(() => {
    if (isProduction) return;
    if (isAdmin) {
      fetchErrors();
      fetchPastResults();
    }
  }, [isAdmin, isProduction]);

  if (isProduction) {
    return (
      <MobileLayout>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
          <ShieldCheck className="w-16 h-16 text-muted-foreground" />
          <h1 className="text-xl font-bold">Non disponibile</h1>
          <p className="text-sm text-muted-foreground">Il Debug Panel non è disponibile in produzione.</p>
        </div>
      </MobileLayout>
    );
  }

  if (isAdmin === null) {
    return (
      <MobileLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MobileLayout>
    );
  }

  if (!isAdmin) {
    return (
      <MobileLayout>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
          <ShieldCheck className="w-16 h-16 text-destructive" />
          <h1 className="text-xl font-bold">Accesso Negato</h1>
          <p className="text-sm text-muted-foreground">Solo gli amministratori possono accedere al Debug Panel.</p>
          <Button onClick={() => navigate("/")} variant="outline">Torna alla Home</Button>
        </div>
      </MobileLayout>
    );
  }

  const handleRunAll = async () => {
    setRunning(true);
    try {
      const r = await runFullStressTest();
      setResults(r);
    } finally {
      setRunning(false);
      fetchErrors();
    }
  };

  const handleRapidFire100 = async () => {
    setRunning(true);
    try {
      const r = await testRapidFire(100);
      setResults((prev) => [r, ...prev]);
    } finally {
      setRunning(false);
    }
  };

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const avgTime = results.length
    ? Math.round(results.reduce((a, r) => a + r.duration_ms, 0) / results.length)
    : 0;

  const severityColor: Record<string, string> = {
    info: "bg-blue-500/20 text-blue-400",
    warn: "bg-yellow-500/20 text-yellow-400",
    error: "bg-red-500/20 text-red-400",
    critical: "bg-red-700/20 text-red-300",
  };

  const typeIcon: Record<string, any> = {
    auth: Shield,
    database: Database,
    storage: HardDrive,
    chat: MessageSquare,
    realtime: Radio,
    performance: Zap,
    ui: AlertTriangle,
  };

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Debug Panel
            </h1>
            <p className="text-xs text-muted-foreground">Professional Test Mode</p>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {user ? "AUTH ✓" : "NO AUTH"}
          </Badge>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="p-3 text-center">
            <p className="text-lg font-bold text-green-400">{passed}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-lg font-bold text-red-400">{failed}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-lg font-bold">{avgTime}ms</p>
            <p className="text-xs text-muted-foreground">Avg Time</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-lg font-bold text-orange-400">{errors.length}</p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleRunAll} disabled={running} className="flex-1 gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Run Full Test
          </Button>
          <Button onClick={handleRapidFire100} disabled={running} variant="outline" className="gap-2">
            <Activity className="w-4 h-4" />
            100x Rapid
          </Button>
          <Button onClick={() => { fetchErrors(); fetchPastResults(); }} variant="ghost" size="icon">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="tests">Test Results</TabsTrigger>
            <TabsTrigger value="errors">Error Logs ({errors.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="tests">
            <ScrollArea className="h-[50vh]">
              <div className="space-y-2">
                {results.map((r, i) => {
                  const Icon = typeIcon[r.test_type] || Database;
                  return (
                    <Card key={i} className="p-3 flex items-center gap-3">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.test_name}</p>
                        {r.error_message && (
                          <p className="text-xs text-red-400 truncate">{r.error_message}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {r.duration_ms}ms
                        </span>
                        {r.success ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </Card>
                  );
                })}
                {results.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Premi "Run Full Test" per iniziare
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="errors">
            <ScrollArea className="h-[50vh]">
              <div className="space-y-2">
                {errors.map((e) => (
                  <Card key={e.id} className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-xs ${severityColor[e.severity] || ""}`}>
                        {e.severity}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{e.error_type}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(e.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs truncate">{e.message}</p>
                    {e.page_path && (
                      <p className="text-xs text-muted-foreground">{e.page_path}</p>
                    )}
                  </Card>
                ))}
                {errors.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Nessun errore registrato 🎉
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </MobileLayout>
  );
}
