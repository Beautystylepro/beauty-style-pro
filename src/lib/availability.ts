import { supabase } from "@/integrations/supabase/client";

/**
 * Standard working-hours grid used across the app (salon default hours,
 * closed 12:00-14:00 for lunch). This is the same grid BookingPage has
 * always shown — the difference is we now actually check it against
 * existing bookings instead of always showing every slot as free.
 */
export const DEFAULT_TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00",
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export interface OccupiedRange {
  start: number; // minutes from midnight
  end: number;
}

/** Fetches existing (non-cancelled) bookings for a professional on a given date, as occupied minute ranges. */
export async function getOccupiedRanges(
  professionalId: string,
  date: string,
  defaultDurationMinutes = 30
): Promise<OccupiedRange[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("start_time, end_time, status")
    .eq("professional_id", professionalId)
    .eq("booking_date", date)
    .neq("status", "cancelled");

  if (error) {
    console.error("Errore nel controllo del calendario:", error);
    // Fail safe: treat as fully booked so we never double-book on an unknown error.
    return DEFAULT_TIME_SLOTS.map((s) => ({ start: toMinutes(s), end: toMinutes(s) + defaultDurationMinutes }));
  }

  return (data || []).map((b) => {
    const start = toMinutes(b.start_time.slice(0, 5));
    const end = b.end_time ? toMinutes(b.end_time.slice(0, 5)) : start + defaultDurationMinutes;
    return { start, end };
  });
}

function overlaps(slotStart: number, slotEnd: number, ranges: OccupiedRange[]): boolean {
  return ranges.some((r) => slotStart < r.end && slotEnd > r.start);
}

/**
 * Returns the subset of DEFAULT_TIME_SLOTS that are actually free for the
 * given professional/date, given a service duration. This is the single
 * source of truth used both by the human BookingPage and by Stella's
 * autonomous booking flow, so they can never disagree about what's free.
 */
export async function getAvailableSlots(
  professionalId: string,
  date: string,
  durationMinutes = 30
): Promise<string[]> {
  const occupied = await getOccupiedRanges(professionalId, date, durationMinutes);
  return DEFAULT_TIME_SLOTS.filter((slot) => {
    const start = toMinutes(slot);
    const end = start + durationMinutes;
    // Don't offer a slot that would run past the last grid slot's natural end
    // (keeps appointments inside standard opening hours).
    if (end > toMinutes(DEFAULT_TIME_SLOTS[DEFAULT_TIME_SLOTS.length - 1]) + 60) return false;
    return !overlaps(start, end, occupied);
  });
}

/**
 * Finds the first available slot for a professional, scanning forward up to
 * `maxDaysAhead` days starting from `fromDate` (inclusive) if the requested
 * day is fully booked. Returns null if nothing is free in that window.
 */
export async function findNextAvailableSlot(
  professionalId: string,
  fromDate: string,
  durationMinutes = 30,
  maxDaysAhead = 14
): Promise<{ date: string; time: string } | null> {
  const cursor = new Date(fromDate + "T00:00:00");
  for (let i = 0; i < maxDaysAhead; i++) {
    const dateStr = cursor.toISOString().split("T")[0];
    const slots = await getAvailableSlots(professionalId, dateStr, durationMinutes);
    if (slots.length > 0) {
      return { date: dateStr, time: slots[0] };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

export { toMinutes, fromMinutes };
