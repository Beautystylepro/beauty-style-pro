import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Megaphone } from "lucide-react";

interface AdCampaign {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  target_url: string | null;
  campaign_type: string;
}

export default function SponsorBanner() {
  const [ad, setAd] = useState<AdCampaign | null>(null);
  const impressionTrackedRef = useRef(false);

  useEffect(() => {
    loadAd();
  }, []);

  // Track the impression once, the first time this ad is actually shown
  // to a viewer — this is what makes the campaign's budget real (it was
  // previously only decremented by clicks, which almost never fired due
  // to the RLS bug below, so budgets never actually depleted).
  useEffect(() => {
    if (ad && !impressionTrackedRef.current) {
      impressionTrackedRef.current = true;
      void supabase.rpc("record_ad_impression", { _campaign_id: ad.id });
    }
  }, [ad]);

  const loadAd = async () => {
    const { data } = await supabase
      .from("ad_campaigns")
      .select("id, title, description, image_url, target_url, campaign_type")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (data) setAd(data);
  };

  const trackClick = async () => {
    if (!ad) return;
    // Previously: a direct .update({ clicks: ad.clicks + 1 }) from the
    // client — RLS only allows an advertiser to update their OWN
    // campaign, so a real viewer's click was silently rejected every
    // time (it "worked" only if the viewer happened to be the ad's own
    // owner). A SECURITY DEFINER RPC lets any viewer register a click
    // on someone else's campaign safely, without granting broader
    // write access to the campaign itself.
    void supabase.rpc("record_ad_click", { _campaign_id: ad.id });
    if (ad.target_url) window.open(ad.target_url, "_blank", "noopener");
  };

  if (!ad) return null;

  return (
    <button onClick={trackClick} className="w-full rounded-2xl overflow-hidden bg-card border border-border/50 text-left transition-all hover:border-primary/20">
      {ad.image_url && (
        <img src={ad.image_url} alt={ad.title} className="w-full h-32 object-cover" />
      )}
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Megaphone className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Sponsorizzato</span>
        </div>
        <p className="text-sm font-semibold">{ad.title}</p>
        {ad.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ad.description}</p>}
        {ad.target_url && (
          <span className="inline-flex items-center gap-1 mt-2 text-xs text-primary font-semibold">
            Scopri di più <ExternalLink className="w-3 h-3" />
          </span>
        )}
      </div>
    </button>
  );
}
