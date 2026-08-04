import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Plus, Trash2, GripVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CATEGORIES = ["Taglio", "Colore", "Skincare", "Makeup", "Nail Art", "Business"];

interface DraftLesson {
  title: string;
  content_type: "text" | "video";
  content_text: string;
  video_url: string;
  duration_minutes: string;
}

export default function CreateCoursePage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [price, setPrice] = useState("0");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [lessons, setLessons] = useState<DraftLesson[]>([
    { title: "", content_type: "text", content_text: "", video_url: "", duration_minutes: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const canTeach = profile?.user_type === "professional" || profile?.user_type === "business";

  const addLesson = () => {
    setLessons((prev) => [...prev, { title: "", content_type: "text", content_text: "", video_url: "", duration_minutes: "" }]);
  };

  const updateLesson = (i: number, patch: Partial<DraftLesson>) => {
    setLessons((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const removeLesson = (i: number) => {
    setLessons((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handlePublish = async () => {
    if (!user) return;
    if (!title.trim() || !description.trim()) {
      toast.error("Titolo e descrizione sono obbligatori");
      return;
    }
    const validLessons = lessons.filter((l) => l.title.trim());
    if (validLessons.length === 0) {
      toast.error("Aggiungi almeno una lezione");
      return;
    }

    setSaving(true);
    try {
      const { data: course, error: courseError } = await supabase
        .from("courses")
        .insert({
          instructor_id: user.id,
          title: title.trim(),
          description: description.trim(),
          category,
          price: parseFloat(price) || 0,
          cover_image_url: coverImageUrl || null,
          is_published: true,
        })
        .select("id")
        .single();

      if (courseError || !course) throw courseError;

      const lessonRows = validLessons.map((l, i) => ({
        course_id: course.id,
        title: l.title.trim(),
        content_type: l.content_type,
        content_text: l.content_type === "text" ? l.content_text : null,
        video_url: l.content_type === "video" ? l.video_url : null,
        duration_minutes: l.duration_minutes ? parseInt(l.duration_minutes, 10) : null,
        sort_order: i,
      }));

      const { error: lessonsError } = await supabase.from("course_lessons").insert(lessonRows);
      if (lessonsError) throw lessonsError;

      toast.success("Corso pubblicato! 🎉");
      navigate(`/academy/${course.id}`);
    } catch {
      toast.error("Errore nella pubblicazione, riprova");
    } finally {
      setSaving(false);
    }
  };

  if (!canTeach) {
    return (
      <MobileLayout>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-muted-foreground">Solo professionisti e attività possono creare corsi.</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-sm font-semibold text-primary">Torna indietro</button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-primary" aria-label="Indietro">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Crea corso</h1>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-semibold mb-1 block">Titolo del corso</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es: Tecniche avanzate di balayage"
              className="w-full h-11 px-3 rounded-xl border border-border/50 bg-card text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold mb-1 block">Descrizione</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Cosa impareranno gli studenti?"
              className="w-full px-3 py-2 rounded-xl border border-border/50 bg-card text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block">Categoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-border/50 bg-card text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Prezzo (€, 0 = gratis)</label>
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border/50 bg-card text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold mb-1 block">URL immagine copertina (opzionale)</label>
            <input
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full h-11 px-3 rounded-xl border border-border/50 bg-card text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold">Lezioni</label>
              <button onClick={addLesson} className="flex items-center gap-1 text-xs font-semibold text-primary">
                <Plus className="w-4 h-4" /> Aggiungi lezione
              </button>
            </div>
            <div className="space-y-3">
              {lessons.map((lesson, i) => (
                <div key={i} className="rounded-xl border border-border/50 bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      value={lesson.title}
                      onChange={(e) => updateLesson(i, { title: e.target.value })}
                      placeholder={`Lezione ${i + 1}: titolo`}
                      className="flex-1 h-9 px-2 rounded-lg border border-border/50 bg-background text-xs"
                    />
                    {lessons.length > 1 && (
                      <button onClick={() => removeLesson(i)} aria-label="Rimuovi lezione">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={lesson.content_type}
                      onChange={(e) => updateLesson(i, { content_type: e.target.value as "text" | "video" })}
                      className="h-9 px-2 rounded-lg border border-border/50 bg-background text-xs"
                    >
                      <option value="text">Testo</option>
                      <option value="video">Video</option>
                    </select>
                    <input
                      type="number"
                      value={lesson.duration_minutes}
                      onChange={(e) => updateLesson(i, { duration_minutes: e.target.value })}
                      placeholder="min"
                      className="w-16 h-9 px-2 rounded-lg border border-border/50 bg-background text-xs"
                    />
                  </div>
                  {lesson.content_type === "text" ? (
                    <textarea
                      value={lesson.content_text}
                      onChange={(e) => updateLesson(i, { content_text: e.target.value })}
                      rows={3}
                      placeholder="Contenuto della lezione..."
                      className="w-full px-2 py-1.5 rounded-lg border border-border/50 bg-background text-xs"
                    />
                  ) : (
                    <input
                      value={lesson.video_url}
                      onChange={(e) => updateLesson(i, { video_url: e.target.value })}
                      placeholder="URL video"
                      className="w-full h-9 px-2 rounded-lg border border-border/50 bg-background text-xs"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handlePublish}
            disabled={saving}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
          >
            {saving ? "Pubblicazione..." : "Pubblica corso"}
          </button>
        </div>
      </div>
    </MobileLayout>
  );
}
