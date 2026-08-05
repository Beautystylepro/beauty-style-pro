import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Send, Image, Phone, Video, Search, Mic, MicOff, Paperclip, Play, Pause, X, File, Camera, Briefcase, MessageCircle, UserPlus, Globe, Volume2, CheckCheck, Clock } from "lucide-react";
import AutoMessageSuggestions from "@/components/chat/AutoMessageSuggestions";
import { useTranslation } from "@/hooks/useTranslation";
import { usePresenceTracker, isUserOnline, formatLastSeen } from "@/hooks/usePresence";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCall } from "@/contexts/CallContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import stylist1 from "@/assets/stylist-1.jpg";
import stylist2 from "@/assets/stylist-2.jpg";
import beauty2 from "@/assets/beauty-2.jpg";

interface Conversation {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
  lastSeen: string | null;
  otherUserId: string;
}

type MessageType = "text" | "image" | "video" | "voice" | "file" | "job_application";

interface Message {
  id: string;
  sender: "me" | "other";
  content: string;
  time: string;
  type: MessageType;
  mediaUrl?: string;
  fileName?: string;
  duration?: number;
  read?: boolean;
  isAiReply?: boolean;
}

interface SearchedUser {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

const fallbackAvatars = [stylist2, stylist1, beauty2];

export default function ChatPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchedUsers, setSearchedUsers] = useState<SearchedUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayRef = useRef<HTMLAudioElement | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [inCall, setInCall] = useState<"voice" | "video" | null>(null);
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [callTimer, setCallTimer] = useState(0);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const { translate, translating, autoTranslate, setAutoTranslate, getUserLanguage } = useTranslation();
  const callApi = useCall();
  usePresenceTracker();

  useEffect(() => {
    if (user) loadConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (id && conversations.length > 0) {
      const chat = conversations.find(c => c.id === id);
      if (chat) { setSelectedChat(chat); loadMessages(chat.id); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, conversations]);

  // BUG TROVATO: il pulsante "Messaggio" sul profilo di un utente
  // portava alla lista generale delle chat invece di aprire subito la
  // conversazione con QUELLA persona — a differenza di Instagram, dove
  // "Messaggio" apre direttamente la chat. Questo effetto gestisce il
  // parametro ?startWith=ID_UTENTE passato dal profilo: trova la
  // conversazione già esistente, o ne crea una nuova, e la apre subito.
  useEffect(() => {
    const startWithUserId = searchParams.get("startWith");
    if (!startWithUserId || !user || startWithUserId === user.id) return;

    (async () => {
      const existing = conversations.find(c => c.otherUserId === startWithUserId);
      if (existing) {
        setSelectedChat(existing);
        loadMessages(existing.id);
        navigate(`/chat/${existing.id}`, { replace: true });
        return;
      }

      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .eq("user_id", startWithUserId)
        .maybeSingle();
      if (!targetProfile) return;

      const { data: newConv, error } = await supabase.from("conversations").insert({
        participant_1: user.id,
        participant_2: startWithUserId,
      }).select().single();
      if (error || !newConv) return;

      const conv: Conversation = {
        id: newConv.id,
        name: targetProfile.display_name || "Utente",
        avatar: targetProfile.avatar_url || fallbackAvatars[0],
        lastMessage: "Nessun messaggio",
        time: "",
        unread: 0,
        online: false,
        lastSeen: null,
        otherUserId: startWithUserId,
      };
      setConversations(prev => [conv, ...prev]);
      setSelectedChat(conv);
      navigate(`/chat/${conv.id}`, { replace: true });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user, conversations.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Search registered users when typing
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchedUsers([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchingUsers(true);
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .ilike("display_name", `%${searchQuery}%`)
        .neq("user_id", user?.id || "")
        .limit(10);
      setSearchedUsers(data || []);
      setSearchingUsers(false);
    }, 300);
  }, [searchQuery, user]);

  // Auto-translate helper
  const autoTranslateMsg = async (msgId: string, content: string) => {
    if (!autoTranslate || !content.trim() || content.startsWith("[")) return;
    try {
      const translated = await translate(content);
      if (translated && translated !== content) {
        setTranslatedMessages(prev => ({ ...prev, [msgId]: translated }));
      }
    } catch { /* silent */ }
  };

  // Realtime subscription for messages
  useEffect(() => {
    if (!selectedChat) return;
    const channel = supabase
      .channel(`messages-${selectedChat.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedChat.id}`,
      }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_id !== user?.id) {
          const newMsg = {
            id: msg.id,
            sender: "other" as const,
            content: msg.content,
            time: new Date(msg.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
            type: (msg.message_type || "text") as MessageType,
            mediaUrl: msg.image_url,
            isAiReply: !!msg.is_ai_reply,
          };
          setMessages(prev => [...prev, newMsg]);
          // Auto-translate incoming message in real-time
          autoTranslateMsg(msg.id, msg.content);
          // Auto-transcribe + translate incoming voice messages
          if (newMsg.type === "voice" && newMsg.mediaUrl && autoTranslate) {
            setTimeout(() => transcribeAndTranslateVoice(newMsg), 300);
          }
        }
      })
      .subscribe();

    // Separate listener for read-receipt updates: when the other participant
    // opens the chat and their client marks our messages as read=true, this
    // updates our double-check ticks live without needing a refresh.
    const readChannel = supabase
      .channel(`messages-read-${selectedChat.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedChat.id}`,
      }, (payload) => {
        const msg = payload.new as any;
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: !!msg.read } : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); supabase.removeChannel(readChannel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat]);

  // Typing indicator: uses Supabase Presence to broadcast "I'm typing" state
  // scoped to this conversation, so it clears automatically if the other
  // person closes the tab (no stale "typing..." stuck on screen).
  useEffect(() => {
    if (!selectedChat || !user) return;
    const typingChannel = supabase.channel(`typing-${selectedChat.id}`, {
      config: { presence: { key: user.id } },
    });

    typingChannel
      .on('presence', { event: 'sync' }, () => {
        const state = typingChannel.presenceState();
        const someoneElseTyping = Object.entries(state).some(
          ([key, entries]) => key !== user.id && (entries as any[]).some(e => e.typing)
        );
        setOtherIsTyping(someoneElseTyping);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await typingChannel.track({ typing: false });
        }
      });

    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [selectedChat, user]);

  const notifyTyping = () => {
    const channel = typingChannelRef.current;
    if (!channel) return;
    channel.track({ typing: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      channel.track({ typing: false });
    }, 2500);
  };

  // Auto-translate all existing "other" messages when autoTranslate turns on
  useEffect(() => {
    if (!autoTranslate || messages.length === 0) return;
    const otherMsgs = messages.filter(m => m.sender === "other" && m.content && !m.content.startsWith("[") && !translatedMessages[m.id]);
    otherMsgs.forEach(m => autoTranslateMsg(m.id, m.content));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranslate, messages.length]);

  const loadConversations = async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from("conversations")
      .select("*")
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .order("last_message_at", { ascending: false });

    if (data && data.length > 0) {
      const otherUserIds = data.map(c => c.participant_1 === user.id ? c.participant_2 : c.participant_1);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, last_seen")
        .in("user_id", otherUserIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Count unread messages per conversation
      const unreadCounts = new Map<string, number>();
      for (const c of data) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", c.id)
          .neq("sender_id", user.id)
          .eq("read", false);
        unreadCounts.set(c.id, count || 0);
      }

      setConversations(data.map((c, i) => {
        const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1;
        const profile = profileMap.get(otherId);
        const lastSeenVal = profile?.last_seen || null;
        return {
          id: c.id,
          name: profile?.display_name || "Utente",
          avatar: profile?.avatar_url || fallbackAvatars[i % fallbackAvatars.length],
          lastMessage: c.last_message || "Nessun messaggio",
          time: c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "",
          unread: unreadCounts.get(c.id) || 0,
          online: isUserOnline(lastSeenVal),
          lastSeen: lastSeenVal,
          otherUserId: otherId,
        };
      }));
    }
    setLoading(false);
  };

  const loadMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (data) {
      setMessages(data.map(m => ({
        id: m.id,
        sender: m.sender_id === user?.id ? "me" : "other",
        content: m.content,
        time: new Date(m.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
        type: (m.message_type || "text") as MessageType,
        mediaUrl: m.image_url || undefined,
        read: !!m.read,
        isAiReply: !!(m as any).is_ai_reply,
      })));
      await supabase.from("messages").update({ read: true }).eq("conversation_id", conversationId).neq("sender_id", user?.id || "");
    }
  };

  const startNewChat = async (otherUser: SearchedUser) => {
    if (!user) return;
    // Check if conversation already exists
    const existing = conversations.find(c => c.otherUserId === otherUser.user_id);
    if (existing) {
      setSelectedChat(existing);
      loadMessages(existing.id);
      navigate(`/chat/${existing.id}`);
      setSearchQuery("");
      setSearchedUsers([]);
      return;
    }

    // Create new conversation
    const { data, error } = await supabase.from("conversations").insert({
      participant_1: user.id,
      participant_2: otherUser.user_id,
    }).select().single();

    if (data && !error) {
      const newConv: Conversation = {
        id: data.id,
        name: otherUser.display_name || "Utente",
        avatar: otherUser.avatar_url || fallbackAvatars[0],
        lastMessage: "Nessun messaggio",
        time: "",
        unread: 0,
        online: false,
        lastSeen: null,
        otherUserId: otherUser.user_id,
      };
      setConversations(prev => [newConv, ...prev]);
      setSelectedChat(newConv);
      setMessages([]);
      navigate(`/chat/${data.id}`);
      setSearchQuery("");
      setSearchedUsers([]);
    }
  };

  const now = () => new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || !user) return;
    const content = newMessage;
    setNewMessage("");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingChannelRef.current?.track({ typing: false });
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: "me", content, time: now(), type: "text" }]);
    await supabase.from("messages").insert({
      conversation_id: selectedChat.id,
      sender_id: user.id,
      content,
      message_type: "text",
    });
    // Update conversation last_message
    await supabase.from("conversations").update({
      last_message: content,
      last_message_at: new Date().toISOString(),
    }).eq("id", selectedChat.id);
  };

  const uploadFile = async (file: File, type: MessageType) => {
    if (!selectedChat || !user) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("File troppo grande (max 20MB)"); return; }
    const fileName = `${Date.now()}_${file.name}`;
    const { data } = await supabase.storage.from("posts").upload(`chat/${fileName}`, file);
    let mediaUrl: string;
    if (data) {
      const { data: urlData } = supabase.storage.from("posts").getPublicUrl(`chat/${fileName}`);
      mediaUrl = urlData.publicUrl;
    } else {
      mediaUrl = URL.createObjectURL(file);
    }
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: "me", content: "", time: now(), type, mediaUrl, fileName: file.name }]);
    await supabase.from("messages").insert({
      conversation_id: selectedChat.id,
      sender_id: user.id,
      content: `[${type}] ${file.name}`,
      message_type: type,
      image_url: mediaUrl,
    });
    setShowAttachMenu(false);
    toast.success(`${type === "image" ? "Immagine" : type === "video" ? "Video" : "File"} inviato!`);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: MessageType) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, type);
    e.target.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const duration = recordingTime;
        const fName = `voice_${Date.now()}.webm`;
        const { data } = await supabase.storage.from("posts").upload(`chat/${fName}`, audioBlob);
        let mediaUrl: string;
        if (data) {
          const { data: urlData } = supabase.storage.from("posts").getPublicUrl(`chat/${fName}`);
          mediaUrl = urlData.publicUrl;
        } else {
          mediaUrl = URL.createObjectURL(audioBlob);
        }
        setMessages(prev => [...prev, { id: Date.now().toString(), sender: "me", content: "", time: now(), type: "voice", mediaUrl, duration }]);
        if (selectedChat && user) {
          await supabase.from("messages").insert({
            conversation_id: selectedChat.id,
            sender_id: user.id,
            content: `[voice] ${duration}s`,
            message_type: "voice",
            image_url: mediaUrl,
          });
        }
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast.error("Impossibile accedere al microfono");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingTime(0);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    audioChunksRef.current = [];
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const openWhatsApp = (name: string, otherUserId: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Ciao ${name}! Ti contatto tramite STYLE App.`)}`, "_blank");
  };


  const startCall = async (type: "voice" | "video") => {
    if (!selectedChat || !user) return;
    try {
      const callLabel = type === "voice" ? "📞 Chiamata vocale" : "📹 Videochiamata";
      // Log message in conversation history
      await supabase.from("messages").insert({
        conversation_id: selectedChat.id,
        sender_id: user.id,
        content: `${callLabel} avviata`,
        message_type: "text",
      });
      // Trigger real WebRTC call via global manager
      await callApi.startCall(
        selectedChat.otherUserId,
        type === "voice" ? "audio" : "video",
        selectedChat.name,
      );
    } catch (err) {
      toast.error("Impossibile avviare la chiamata");
    }
  };

  const endCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    setInCall(null);
    setCallTimer(0);
    toast.success("Chiamata terminata");
  };

  // Clear translations cache when target language changes
  const clearTranslations = () => setTranslatedMessages({});

  const filteredConversations = conversations.filter(c =>
    !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleVoicePlay = (msg: Message) => {
    if (playingVoice === msg.id) {
      audioPlayRef.current?.pause();
      setPlayingVoice(null);
    } else {
      if (audioPlayRef.current) audioPlayRef.current.pause();
      const audio = new Audio(msg.mediaUrl);
      audio.onended = () => setPlayingVoice(null);
      audio.play().catch(() => toast.error("Impossibile riprodurre audio"));
      audioPlayRef.current = audio;
      setPlayingVoice(msg.id);
    }
  };

  // Voice message transcription + translation
  const [voiceTranscripts, setVoiceTranscripts] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<string | null>(null);

  const transcribeAndTranslateVoice = async (msg: Message) => {
    if (!msg.mediaUrl || voiceTranscripts[msg.id]) return;
    setTranscribing(msg.id);
    try {
      const { data, error } = await supabase.functions.invoke("voice-transcribe", {
        body: {
          audioUrl: msg.mediaUrl,
          targetLanguage: getUserLanguage(),
        },
      });
      if (error) throw error;
      const text = data?.translated || data?.transcript || "Trascrizione non disponibile";
      setVoiceTranscripts(prev => ({ ...prev, [msg.id]: text }));
    } catch {
      toast.error("Errore nella trascrizione");
    } finally {
      setTranscribing(null);
    }
  };

  // Real-time call translation state with ElevenLabs
  const [callTranslation, setCallTranslation] = useState<string>("");
  const [callTranslating, setCallTranslating] = useState(false);
  const [callTargetLang, setCallTargetLang] = useState(getUserLanguage());
  const speechRecRef = useRef<any>(null);
  const translationAudioRef = useRef<HTMLAudioElement | null>(null);
  const isProcessingRef = useRef(false);

  const playTranslationAudio = (audioBase64: string) => {
    try {
      if (translationAudioRef.current) {
        translationAudioRef.current.pause();
      }
      const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;
      const audio = new Audio(audioUrl);
      translationAudioRef.current = audio;
      audio.play().catch(() => {});
    } catch { /* best-effort, ignore */ }
  };

  const startCallTranslation = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error("Riconoscimento vocale non supportato");
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "auto";
    
    recognition.onresult = async (event: any) => {
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        const spokenText = lastResult[0].transcript;
        if (isProcessingRef.current || spokenText.trim().length < 3) return;
        isProcessingRef.current = true;
        setCallTranslating(true);
        try {
          // Call ElevenLabs translate+speak edge function
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-translate-speak`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({ spokenText, targetLanguage: callTargetLang }),
            }
          );
          if (resp.ok) {
            const data = await resp.json();
            setCallTranslation(data.translatedText || spokenText);
            // Play the translated audio automatically
            if (data.audioAvailable && data.audioBase64) {
              playTranslationAudio(data.audioBase64);
            }
          } else {
            // Fallback to text-only translation
            const translated = await translate(spokenText);
            setCallTranslation(translated || spokenText);
          }
        } catch {
          setCallTranslation(spokenText);
        } finally {
          setCallTranslating(false);
          isProcessingRef.current = false;
        }
      } else {
        setCallTranslation(lastResult[0].transcript + "...");
      }
    };
    
    recognition.onerror = () => {};
    recognition.start();
    speechRecRef.current = recognition;
    toast.success("🎤 Traduzione vocale ElevenLabs attiva");
  };

  const stopCallTranslation = () => {
    speechRecRef.current?.stop();
    speechRecRef.current = null;
    if (translationAudioRef.current) {
      translationAudioRef.current.pause();
      translationAudioRef.current = null;
    }
    setCallTranslation("");
  };

  const VoiceBubble = ({ msg }: { msg: Message }) => {
    const isPlaying = playingVoice === msg.id;
    const hasTranscript = voiceTranscripts[msg.id];
    const isTranscribing = transcribing === msg.id;
    return (
      <div className="min-w-[140px]">
        <button onClick={() => toggleVoicePlay(msg)} className="flex items-center gap-2 w-full">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${msg.sender === "me" ? "bg-primary-foreground/20" : "bg-primary/20"}`}>
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </div>
          <div className="flex-1">
            <div className="flex gap-0.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className={`w-1 rounded-full ${msg.sender === "me" ? "bg-primary-foreground/40" : "bg-muted-foreground/40"}`}
                  style={{ height: `${Math.random() * 16 + 4}px` }} />
              ))}
            </div>
          </div>
          <span className={`text-xs ${msg.sender === "me" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {formatDuration(msg.duration || 0)}
          </span>
        </button>
        {/* Translate voice button */}
        {msg.sender === "other" && autoTranslate && !hasTranscript && (
          <button onClick={() => transcribeAndTranslateVoice(msg)} disabled={isTranscribing}
            className={`flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${msg.sender === "other" ? "bg-primary/10 text-primary" : "bg-primary-foreground/10 text-primary-foreground/70"}`}>
            <Globe className="w-2.5 h-2.5" />
            {isTranscribing ? "Traduco..." : "Traduci audio"}
          </button>
        )}
        {hasTranscript && (
          <p className={`text-xs italic mt-1 ${msg.sender === "me" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            🌐 {voiceTranscripts[msg.id]}
          </p>
        )}
      </div>
    );
  };

  // ===== CHAT THREAD =====
  if (selectedChat) {
    return (
      <MobileLayout>
        <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setSelectedChat(null); navigate("/chat"); }} className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button onClick={() => navigate(`/profile/${selectedChat.otherUserId}`)} className="flex items-center gap-2 flex-1">
            <div className="relative">
              <img src={selectedChat.avatar} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-primary" />
              {selectedChat.online && (
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
              )}
            </div>
            <div>
              <p className="font-semibold text-sm">{selectedChat.name}</p>
              <p className={`text-xs font-medium ${selectedChat.online ? "text-green-500" : "text-muted-foreground"}`}>
                {selectedChat.online ? "● Online" : `Ultimo accesso ${formatLastSeen(selectedChat.lastSeen)}`}
              </p>
            </div>
          </button>
          <button onClick={() => openWhatsApp(selectedChat.name, selectedChat.otherUserId)} className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-primary-foreground" />
          </button>
          <button onClick={() => startCall("voice")} className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
            <Phone className="w-4 h-4 text-primary-foreground" />
          </button>
          <button onClick={() => startCall("video")} className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
            <Video className="w-4 h-4 text-primary-foreground" />
          </button>
          <button onClick={() => { setAutoTranslate(!autoTranslate); if (!autoTranslate) toast.success("Traduzione AI attivata"); else { toast.info("Traduzione AI disattivata"); setTranslatedMessages({}); } }}
            className={`w-9 h-9 rounded-full flex items-center justify-center ${autoTranslate ? "bg-primary" : "bg-muted"}`}>
            <Globe className={`w-4 h-4 ${autoTranslate ? "text-primary-foreground" : "text-muted-foreground"}`} />
          </button>
        </header>
        {/* In-call overlay */}
        {inCall && (
          <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center">
            {inCall === "video" && (
              <>
                <div className="absolute inset-0 bg-card flex items-center justify-center">
                  <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover opacity-30" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <img src={selectedChat.avatar} alt="" className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-primary" />
                      <p className="text-lg font-bold">{selectedChat.name}</p>
                      <p className="text-sm text-muted-foreground">In attesa di risposta...</p>
                    </div>
                  </div>
                </div>
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute top-16 right-4 w-28 h-36 rounded-2xl object-cover border-2 border-primary shadow-lg z-10" />
              </>
            )}
            
            {inCall === "voice" && (
              <div className="flex flex-col items-center gap-4">
                <img src={selectedChat.avatar} alt="" className="w-24 h-24 rounded-full border-4 border-primary shadow-glow" />
                <p className="text-xl font-bold">{selectedChat.name}</p>
                <p className="text-sm text-primary">Chiamata vocale</p>
                <div className="flex items-center gap-1 h-8">
                  {[0,1,2,3,4,5,6].map(i => (
                    <div key={i} className="w-1 bg-primary rounded-full animate-pulse" 
                      style={{ height: `${12 + Math.random() * 20}px`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              </div>
            )}
            
            {/* Live translation subtitles + audio indicator */}
            {callTranslation && (
              <div className="absolute bottom-44 left-4 right-4 bg-card/90 backdrop-blur rounded-2xl px-4 py-3 border border-primary/30 shadow-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-bold text-primary">🔊 Traduzione Vocale Live</span>
                  {callTranslating && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                </div>
                <p className="text-sm">{callTranslation}</p>
              </div>
            )}

            {/* Language selector for translation */}
            {speechRecRef.current && (
              <div className="absolute top-16 left-4 right-4 flex justify-center">
                <select
                  value={callTargetLang}
                  onChange={e => setCallTargetLang(e.target.value)}
                  className="px-3 py-1.5 rounded-full bg-card/80 backdrop-blur border border-primary/30 text-xs font-medium text-foreground"
                >
                  <option value="it">🇮🇹 Italiano</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="es">🇪🇸 Español</option>
                  <option value="fr">🇫🇷 Français</option>
                  <option value="de">🇩🇪 Deutsch</option>
                  <option value="pt">🇧🇷 Português</option>
                  <option value="ar">🇸🇦 العربية</option>
                  <option value="zh">🇨🇳 中文</option>
                  <option value="ja">🇯🇵 日本語</option>
                  <option value="ko">🇰🇷 한국어</option>
                  <option value="ru">🇷🇺 Русский</option>
                  <option value="hi">🇮🇳 हिन्दी</option>
                  <option value="tr">🇹🇷 Türkçe</option>
                </select>
              </div>
            )}
            
            <p className="text-lg font-mono text-primary mt-6">{formatDuration(callTimer)}</p>
            
            {/* Call controls */}
            <div className="absolute bottom-16 flex items-center gap-6">
              <button className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                {inCall === "voice" ? <Mic className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </button>
              <button onClick={() => { if (speechRecRef.current) stopCallTranslation(); else startCallTranslation(); }}
                className={`w-14 h-14 rounded-full flex items-center justify-center ${speechRecRef.current ? "bg-primary" : "bg-muted"}`}>
                <Globe className={`w-6 h-6 ${speechRecRef.current ? "text-primary-foreground" : ""}`} />
              </button>
              <button onClick={() => { stopCallTranslation(); endCall(); }} className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-lg">
                <Phone className="w-7 h-7 text-destructive-foreground rotate-[135deg]" />
              </button>
              <button className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                <Volume2 className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {/* Auto-translate indicator */}
        {autoTranslate && (
          <div className="px-4 py-1.5 bg-primary/5 border-b border-border flex items-center justify-center gap-2">
            <Globe className="w-3 h-3 text-primary" />
            <span className="text-xs text-primary font-medium">Traduzione AI automatica attiva</span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 px-4 py-4 space-y-3 min-h-[60vh]">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Inizia la conversazione!</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex items-end gap-1.5 ${msg.sender === "me" ? "justify-end" : "justify-start"} fade-in`}>
              {msg.sender === "other" && (
                <img src={selectedChat.avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 mb-1" />
              )}
              <div className={`max-w-[72%] rounded-2xl overflow-hidden ${
                msg.type === "image" || msg.type === "video"
                  ? "shadow-card"
                  : msg.sender === "me"
                    ? "gradient-primary text-primary-foreground rounded-br-md px-4 py-2.5"
                    : "bg-card border border-border rounded-bl-md px-4 py-2.5"
              }`}>
                {msg.type === "image" && msg.mediaUrl && (
                  <img src={msg.mediaUrl} alt="" className="w-full max-w-[240px] rounded-xl object-cover" />
                )}
                {msg.type === "video" && msg.mediaUrl && (
                  <video src={msg.mediaUrl} controls className="w-full max-w-[240px] rounded-xl" />
                )}
                {msg.type === "voice" && <VoiceBubble msg={msg} />}
                {msg.type === "file" && (
                  <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-[140px]">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${msg.sender === "me" ? "bg-primary-foreground/20" : "bg-primary/10"}`}>
                      <File className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{msg.fileName || "File"}</p>
                      <p className={`text-xs ${msg.sender === "me" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>Tocca per aprire</p>
                    </div>
                  </a>
                )}
                {msg.isAiReply && (
                  <p className={`text-[10px] mb-0.5 opacity-70 ${msg.sender === "me" ? "text-primary-foreground" : "text-muted-foreground"}`}>
                    🤖 Risposta automatica
                  </p>
                )}
                {msg.content && <p className="text-sm">{msg.content}</p>}
                {msg.content && translatedMessages[msg.id] && (
                  <p className={`text-xs italic mt-1 border-t pt-1 ${msg.sender === "me" ? "border-primary-foreground/20 text-primary-foreground/70" : "border-border/30 text-muted-foreground"}`}>
                    🌐 {translatedMessages[msg.id]}
                  </p>
                )}
                {msg.type !== "image" && msg.type !== "video" && (
                  <div className={`flex items-center justify-end gap-1 mt-1`}>
                    <span className={`text-xs ${msg.sender === "me" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{msg.time}</span>
                    {msg.sender === "me" && (
                      msg.read
                        ? <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                        : <CheckCheck className="w-3.5 h-3.5 text-primary-foreground/40" />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {otherIsTyping && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Attach menu */}
        {showAttachMenu && (
          <div className="px-4 pb-2 flex gap-3 fade-in">
            {[
              { icon: <Camera className="w-5 h-5" />, label: "Foto", color: "bg-primary", action: () => imageInputRef.current?.click() },
              { icon: <File className="w-5 h-5" />, label: "File", color: "bg-accent", action: () => fileInputRef.current?.click() },
            ].map(item => (
              <button key={item.label} onClick={item.action} className="flex flex-col items-center gap-1">
                <div className={`w-12 h-12 rounded-full ${item.color} flex items-center justify-center text-primary-foreground`}>{item.icon}</div>
                <span className="text-xs text-muted-foreground font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, "image")} />
        <input ref={fileInputRef} type="file" className="hidden" onChange={e => handleFileSelect(e, "file")} />

        {/* Recording UI */}
        {isRecording ? (
          <div className="sticky bottom-16 glass px-4 py-3 flex items-center gap-3">
            <button onClick={cancelRecording} className="w-9 h-9 rounded-full bg-destructive/20 flex items-center justify-center">
              <X className="w-4 h-4 text-destructive" />
            </button>
            <div className="flex-1 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm font-mono font-semibold text-destructive">{formatDuration(recordingTime)}</span>
            </div>
            <button onClick={stopRecording} className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center shadow-glow">
              <Send className="w-5 h-5 text-primary-foreground" />
            </button>
          </div>
        ) : (
          <div className="sticky bottom-16 glass px-4 py-2 space-y-2">
            {messages.length < 3 && (
              <AutoMessageSuggestions
                recipientName={conversations.find(c => c.id === id)?.name}
                context="prenotare un servizio"
                onSelect={(msg) => setNewMessage(msg)}
              />
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAttachMenu(!showAttachMenu)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                <Paperclip className="w-4 h-4 text-muted-foreground" />
              </button>
              <input
                value={newMessage}
                onChange={e => { setNewMessage(e.target.value); notifyTyping(); }}
                onKeyPress={e => e.key === "Enter" && sendMessage()}
                placeholder="Scrivi un messaggio..."
                className="flex-1 h-10 rounded-full bg-muted px-4 text-sm focus:outline-none"
              />
              {newMessage.trim() ? (
                <button onClick={sendMessage} className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                  <Send className="w-4 h-4 text-primary-foreground" />
                </button>
              ) : (
                <button onMouseDown={startRecording} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Mic className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        )}
      </MobileLayout>
    );
  }

  // ===== CONVERSATION LIST =====
  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-display font-bold">Chat</h1>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cerca persone o conversazioni..."
            className="w-full h-10 rounded-full bg-muted pl-10 pr-4 text-sm focus:outline-none"
          />
        </div>
      </header>

      <div className="p-4 space-y-2">
        {/* Search results - show registered users */}
        {searchQuery.length >= 2 && searchedUsers.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2 px-1">Utenti registrati</p>
            {searchedUsers.map(u => (
              <button
                key={u.user_id}
                onClick={() => startNewChat(u)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-all"
              >
                <img
                  src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.user_id}`}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover"
                />
                <div className="flex-1 text-left">
                  <p className="font-semibold text-sm">{u.display_name || "Utente"}</p>
                  <p className="text-xs text-muted-foreground">Tocca per iniziare una chat</p>
                </div>
                <UserPlus className="w-4 h-4 text-primary" />
              </button>
            ))}
            {filteredConversations.length > 0 && (
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-4 mb-2 px-1">Conversazioni</p>
            )}
          </div>
        )}

        {searchQuery.length >= 2 && searchedUsers.length === 0 && !searchingUsers && (
          <p className="text-xs text-muted-foreground text-center py-2">Nessun utente trovato per "{searchQuery}"</p>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredConversations.length === 0 && searchedUsers.length === 0 ? (
          <div className="text-center py-16">
            <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nessuna conversazione</p>
            <p className="text-xs text-muted-foreground mt-1">Cerca un utente per iniziare una chat</p>
          </div>
        ) : (
          filteredConversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => { setSelectedChat(conv); loadMessages(conv.id); navigate(`/chat/${conv.id}`); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-all"
            >
              <div className="relative">
                <img src={conv.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
                {conv.online && (
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-background" />
                )}
                {!conv.online && conv.lastSeen && (
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-muted-foreground/40 border-2 border-background" />
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{conv.name}</p>
                  <span className="text-xs text-muted-foreground">{conv.time}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{conv.lastMessage}</p>
              </div>
              {conv.unread > 0 && (
                <span className="w-5 h-5 rounded-full gradient-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  {conv.unread}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </MobileLayout>
  );
}
