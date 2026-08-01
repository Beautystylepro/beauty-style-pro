import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data: any;
  created_at: string;
}

// Public VAPID key — safe to expose client-side (it's the "public" half of
// the key pair; only the matching private key on the server can sign pushes).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

// Register Service Worker for push notifications + save subscription to DB
async function registerPushNotifications(userId?: string) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Subscribe to Web Push (VAPID) for background notifications — this
    // enables push even when the app is completely closed (like Facebook/TikTok).
    if (registration.pushManager && userId) {
      try {
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription && VAPID_PUBLIC_KEY) {
          try {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
          } catch { /* permission or browser support issue — realtime fallback still active */ }
        }
        // Store subscription endpoint in Supabase so server can push later
        if (subscription) {
          const subData = subscription.toJSON();
          try {
            await supabase.from("push_subscriptions").upsert({
              user_id: userId,
              endpoint: subData.endpoint,
              p256dh: subData.keys?.p256dh,
              auth: subData.keys?.auth,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
          } catch { /* ignore */ }
        }
      } catch { /* graceful — realtime fallback is still active */ }
    }
  } catch (err) {
    console.warn("Push notification setup failed:", err);
  }
}

// Show notification via Service Worker (works even when app is closed/background)
async function showPushNotification(notif: AppNotification) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const typeEmoji: Record<string, string> = {
    like: "❤️", comment: "💬", booking: "📅", tip: "💰",
    follow: "👤", challenge: "🏆", message: "✉️", system: "🔔", info: "ℹ️",
  };

  const emoji = typeEmoji[notif.type] || "🔔";
  const url = getNotificationUrl(notif);

  try {
    // Always use Service Worker notification - works in background AND when app is closed
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification(`${emoji} ${notif.title}`, {
        body: notif.message,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        tag: notif.id,
        renotify: true,
        requireInteraction: false,
        silent: false,
        vibrate: [200, 100, 200],
        data: { url },
        actions: [
          { action: "open", title: "📲 Apri" },
          { action: "close", title: "✕ Chiudi" },
        ],
      } as NotificationOptions);
    }
  } catch {
    // Last resort fallback
    try {
      new Notification(`${emoji} ${notif.title}`, {
        body: notif.message,
        icon: "/icons/icon-192x192.png",
        tag: notif.id,
      });
    } catch { /* silent */ }
  }
}

function getNotificationUrl(notif: AppNotification): string {
  const type = notif.type || "info";
  const data = notif.data || {};
  if (type === "message" && data.conversation_id) return `/chat/${data.conversation_id}`;
  if (type === "follow" && data.follower_id) return `/profile/${data.follower_id}`;
  if ((type === "like" || type === "comment") && data.post_id) return `/?post=${data.post_id}`;
  if (type === "booking") return "/my-bookings";
  if (type === "tip") return "/wallet";
  if (type === "challenge") return "/challenges";
  return "/notifications";
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Request push permission on mount — pass userId for subscription storage
  useEffect(() => {
    if (user) registerPushNotifications(user.id);
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) { setNotifications([]); setUnreadCount(0); setLoading(false); return; }
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setNotifications(data as AppNotification[]);
      setUnreadCount(data.filter(n => !n.read).length);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscription + push notification (works in background)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const newNotif = payload.new as AppNotification;
        setNotifications(prev => [newNotif, ...prev]);
        setUnreadCount(prev => prev + 1);
        
        // Show push notification (works even in background via SW)
        showPushNotification(newNotif);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(prev - 1, 0));
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications(prev => {
      const n = prev.find(x => x.id === id);
      if (n && !n.read) setUnreadCount(c => Math.max(c - 1, 0));
      return prev.filter(x => x.id !== id);
    });
  };

  return { notifications, unreadCount, loading, markAllRead, markRead, deleteNotification, refetch: fetchNotifications };
}
