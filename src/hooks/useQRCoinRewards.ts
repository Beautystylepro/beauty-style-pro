import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type RewardAction = "watch_live" | "react_live" | "comment_live" | "share" | "listen_radio" | "daily_login" | "complete_mission" | "referral";

const REWARD_LABELS: Record<RewardAction, string> = {
  watch_live: "Live guardato",
  react_live: "Reazione live",
  comment_live: "Commento live",
  share: "Condivisione",
  listen_radio: "Radio ascoltata",
  daily_login: "Login giornaliero",
  complete_mission: "Missione completata",
  referral: "Referral",
};

export function useQRCoinRewards() {
  const { user, profile, refreshProfile } = useAuth();

  const awardCoins = useCallback(async (action: RewardAction, silent = false) => {
    if (!user || !profile) return false;

    // The actual amount and cooldown are enforced server-side now (see
    // supabase/functions/qr-coins-transaction) — the client can no longer
    // fake earning coins by bypassing a client-only cooldown timer.
    const { data, error } = await supabase.functions.invoke("qr-coins-transaction", {
      body: { kind: "earn", action },
    });

    if (error || !data?.awarded) return false;

    if (!silent) {
      toast.success(`+${data.amount} QRCoin 🪙`, { description: REWARD_LABELS[action], duration: 2000 });
    }

    refreshProfile();
    return true;
  }, [user, profile, refreshProfile]);

  return { awardCoins };
}
