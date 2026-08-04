import { useState, useRef, useEffect, useCallback } from "react";
import { QrCode, Send, Copy, Check, Users, X, Camera, ArrowLeft, Coins } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QRTransferModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function QRTransferModal({ open, onClose, onComplete }: QRTransferModalProps) {
  const { user, profile, refreshProfile } = useAuth();
  const [mode, setMode] = useState<"menu" | "send" | "receive" | "scan" | "confirm">("menu");
  const [recipientId, setRecipientId] = useState("");
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [receiveAmount, setReceiveAmount] = useState("");
  const [scannedData, setScannedData] = useState<{ userId: string; code: string; name: string; amount?: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!open || !user) return null;

  const myCode = user.id.slice(0, 8).toUpperCase();

  const qrPayload = JSON.stringify({
    type: "qrcoin_transfer",
    userId: user.id,
    code: myCode,
    name: profile?.display_name || "Utente",
    amount: receiveAmount ? parseFloat(receiveAmount) : undefined,
    ts: Date.now(),
  });

  const copyCode = () => {
    navigator.clipboard.writeText(myCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Codice copiato!");
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Start scanning loop
      scanIntervalRef.current = setInterval(() => {
        scanFrame();
      }, 500);
    } catch {
      toast.error("Impossibile accedere alla fotocamera");
      setMode("menu");
    }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== 4) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Use BarcodeDetector if available (Chrome, Edge, Android)
    if ("BarcodeDetector" in window) {
      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      detector.detect(canvas).then((barcodes: any[]) => {
        if (barcodes.length > 0) {
          handleScannedValue(barcodes[0].rawValue);
        }
      }).catch(() => {});
    }
  };

  const handleScannedValue = (value: string) => {
    try {
      const data = JSON.parse(value);
      if (data.type === "qrcoin_transfer" && data.userId && data.userId !== user.id) {
        stopCamera();
        setScannedData({
          userId: data.userId,
          code: data.code,
          name: data.name || "Utente",
          amount: data.amount,
        });
        if (data.amount) {
          setAmount(String(data.amount));
        }
        setMode("confirm");
      }
    } catch {
      // Not a valid QR, could be a plain code
      if (value.length === 8 && /^[A-F0-9]+$/i.test(value)) {
        stopCamera();
        setRecipientId(value.toUpperCase());
        setMode("send");
      }
    }
  };

  const handleSend = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Importo non valido"); return; }
    
    const targetId = scannedData?.userId || "";
    const targetCode = scannedData?.code || recipientId.trim();
    
    if (!targetId && !targetCode) { toast.error("Destinatario non valido"); return; }

    const balance = profile?.qr_coins || 0;
    if (amt > balance) { toast.error("Saldo insufficiente"); return; }

    setSending(true);
    try {
      let recipient: { user_id: string; display_name: string | null } | null = null;

      if (targetId) {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .eq("user_id", targetId)
          .maybeSingle();
        recipient = data;
      } else {
        const { data: recipients } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .ilike("user_id", `${targetCode.toLowerCase()}%`)
          .limit(1);
        recipient = recipients?.[0] || null;
      }

      if (!recipient) { toast.error("Utente non trovato"); setSending(false); return; }
      if (recipient.user_id === user.id) { toast.error("Non puoi inviare a te stesso"); setSending(false); return; }

      const { data: txResult, error: txError } = await supabase.functions.invoke("qr-coins-transaction", {
        body: { kind: "transfer", amount: amt, recipientUserId: recipient.user_id },
      });
      if (txError || txResult?.error) {
        toast.error(txResult?.error || "Errore durante il trasferimento");
        setSending(false);
        return;
      }

      // Notification is now created server-side (inside qr-coins-transaction)
      // right after the real transfer is validated — the client no longer
      // calls create_notification directly, since that RPC previously let
      // any authenticated user notify any other user with arbitrary text.

      await refreshProfile();
      onComplete();
      toast.success(`${amt} QR Coins inviati a ${recipient.display_name || "utente"}! 🎉`);
      resetState();
    } catch {
      toast.error("Errore durante il trasferimento");
    }
    setSending(false);
  };

  const resetState = () => {
    setAmount("");
    setRecipientId("");
    setScannedData(null);
    setReceiveAmount("");
    setMode("menu");
    stopCamera();
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end">
      <div className="w-full rounded-t-3xl bg-card p-6 space-y-5 animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          {mode !== "menu" && (
            <button onClick={() => { stopCamera(); setMode("menu"); }} className="p-2 rounded-full bg-muted">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <h3 className="text-lg font-display font-bold flex-1 text-center">
            {mode === "menu" && "Scambia QR Coins"}
            {mode === "send" && "Invia QR Coins"}
            {mode === "receive" && "Ricevi QR Coins"}
            {mode === "scan" && "Scansiona QR"}
            {mode === "confirm" && "Conferma Invio"}
          </h3>
          <button onClick={handleClose} className="p-2 rounded-full bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* MENU */}
        {mode === "menu" && (
          <div className="space-y-3">
            {/* Scan QR */}
            <button onClick={() => { setMode("scan"); setTimeout(startCamera, 300); }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Camera className="w-6 h-6 text-primary" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold">Scansiona QR</p>
                <p className="text-[11px] text-muted-foreground">Inquadra il QR per inviare coins istantaneamente</p>
              </div>
            </button>

            {/* Receive / Show my QR */}
            <button onClick={() => setMode("receive")}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-green-500/5 border border-green-500/20 hover:bg-green-500/10 transition-colors">
              <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center">
                <QrCode className="w-6 h-6 text-green-500" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold">Ricevi QR Coins</p>
                <p className="text-[11px] text-muted-foreground">Genera il tuo QR istantaneo per ricevere</p>
              </div>
            </button>

            {/* Send by code */}
            <button onClick={() => setMode("send")}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-muted/50 border border-border/50 hover:bg-muted transition-colors">
              <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center">
                <Send className="w-6 h-6 text-accent-foreground" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold">Invia tramite Codice</p>
                <p className="text-[11px] text-muted-foreground">Inserisci manualmente il codice destinatario</p>
              </div>
            </button>

            {/* Invite */}
            <button onClick={() => {
              const shareData = { title: "STYLE Beauty", text: `Scarica STYLE Beauty e usa il mio codice ${myCode} per ricevere QR Coins!`, url: window.location.origin };
              try {
                if (navigator.share && navigator.canShare?.(shareData)) {
                  navigator.share(shareData);
                } else {
                  navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
                  toast.success("Messaggio copiato!");
                }
              } catch { navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`); toast.success("Messaggio copiato!"); }
            }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-muted/50 border border-border/50 hover:bg-muted transition-colors">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold">Invita Amici</p>
                <p className="text-[11px] text-muted-foreground">Condividi il tuo codice e guadagna</p>
              </div>
            </button>
          </div>
        )}

        {/* SCAN MODE */}
        {mode === "scan" && (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-foreground aspect-square max-h-[50vh]">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {/* Scan overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-56 h-56 border-2 border-primary rounded-3xl relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
                  {/* Animated scan line */}
                  <div className="absolute left-2 right-2 h-0.5 bg-primary/80 animate-pulse top-1/2" />
                </div>
              </div>
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <p className="text-background text-sm font-medium bg-foreground/60 backdrop-blur-sm inline-block px-4 py-1.5 rounded-full">
                  Inquadra il codice QR
                </p>
              </div>
            </div>

            {/* Manual entry fallback */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">Oppure inserisci il codice manualmente</p>
              <div className="flex gap-2">
                <input value={recipientId} onChange={e => setRecipientId(e.target.value.toUpperCase())} placeholder="Codice (es. A1B2C3D4)"
                  className="flex-1 px-4 py-3 rounded-xl bg-muted text-sm font-mono tracking-wider text-center focus:outline-none focus:ring-1 focus:ring-primary/30" maxLength={8} />
                <button onClick={() => {
                  if (recipientId.length >= 6) { stopCamera(); setMode("send"); }
                  else toast.error("Codice troppo corto");
                }} className="px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Vai</button>
              </div>
            </div>
          </div>
        )}

        {/* RECEIVE MODE - Generate QR */}
        {mode === "receive" && (
          <div className="flex flex-col items-center space-y-5 py-2">
            {/* Amount to request (optional) */}
            <div className="w-full">
              <label className="text-xs text-muted-foreground mb-1 block text-center">Importo da richiedere (opzionale)</label>
              <input type="number" value={receiveAmount} onChange={e => setReceiveAmount(e.target.value)} placeholder="0"
                className="w-full px-4 py-3 rounded-xl bg-muted text-center text-lg font-bold focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>

            {/* QR Code */}
            <div className="bg-background p-6 rounded-3xl shadow-lg border border-border/50">
              <QRCodeSVG
                value={qrPayload}
                size={200}
                level="H"
                includeMargin
                bgColor="transparent"
                fgColor="currentColor"
                className="text-foreground"
              />
            </div>

            <div className="text-center space-y-1">
              <p className="text-sm font-semibold">{profile?.display_name || "Il tuo QR"}</p>
              <p className="text-xs text-muted-foreground font-mono tracking-widest">{myCode}</p>
              {receiveAmount && parseFloat(receiveAmount) > 0 && (
                <p className="text-sm font-bold text-primary flex items-center justify-center gap-1">
                  <Coins className="w-4 h-4" /> Richiesta: {receiveAmount} QRC
                </p>
              )}
            </div>

            <div className="flex gap-3 w-full">
              <button onClick={copyCode}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-sm font-semibold">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copiato!" : "Copia Codice"}
              </button>
              <button onClick={() => {
                const shareData = { title: "Ricevi QR Coins", text: `Inviami ${receiveAmount || ""} QR Coins su STYLE Beauty! Codice: ${myCode}`, url: window.location.origin };
                if (navigator.share && navigator.canShare?.(shareData)) navigator.share(shareData);
                else { navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`); toast.success("Link copiato!"); }
              }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                <Send className="w-4 h-4" /> Condividi
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              Il QR si aggiorna automaticamente. Fallo scansionare per ricevere coins istantaneamente.
            </p>
          </div>
        )}

        {/* SEND MODE */}
        {mode === "send" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Codice destinatario</label>
              <input value={recipientId} onChange={e => setRecipientId(e.target.value.toUpperCase())} placeholder="Es. A1B2C3D4"
                className="w-full px-4 py-3 rounded-xl bg-muted text-sm font-mono tracking-wider focus:outline-none focus:ring-1 focus:ring-primary/30" maxLength={8} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Importo QR Coins</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
                className="w-full px-4 py-3 rounded-xl bg-muted text-lg font-bold text-center focus:outline-none focus:ring-1 focus:ring-primary/30" />
              <p className="text-[11px] text-muted-foreground mt-1 text-center">Saldo: {(profile?.qr_coins || 0).toLocaleString()} QRC</p>
            </div>
            <button onClick={() => {
              if (!recipientId.trim()) { toast.error("Inserisci il codice"); return; }
              setScannedData(null);
              handleSend();
            }} disabled={sending}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
              {sending ? "Invio in corso..." : "Invia QR Coins"}
            </button>
          </div>
        )}

        {/* CONFIRM MODE - After scan */}
        {mode === "confirm" && scannedData && (
          <div className="space-y-5">
            <div className="flex flex-col items-center py-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <p className="text-lg font-bold">{scannedData.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{scannedData.code}</p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block text-center">Importo da inviare</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder={scannedData.amount ? String(scannedData.amount) : "0"}
                className="w-full px-4 py-4 rounded-xl bg-muted text-2xl font-bold text-center focus:outline-none focus:ring-1 focus:ring-primary/30" />
              <p className="text-[11px] text-muted-foreground mt-1 text-center">
                Saldo disponibile: {(profile?.qr_coins || 0).toLocaleString()} QRC
              </p>
            </div>

            <button onClick={handleSend} disabled={sending}
              className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-base disabled:opacity-50">
              {sending ? "Invio in corso..." : `Invia ${amount || "0"} QR Coins a ${scannedData.name}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}