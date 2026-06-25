// Маппинг типов событий → lucide-иконки.
// Единый источник для ScheduleTab (CalEventBadge, тултип) и MonthAnalytics.
import { Wine, Brain, Target, Mic, Handshake, ClipboardList, CalendarDays, Music } from 'lucide-react';

export const EVENT_ICON_MAP = {
  istoriya: Wine,
  stereo:   Music,
  pubquiz:  Brain,
  darts:    Target,
  guest:    Mic,
  collab:   Handshake,
  inventa:  ClipboardList,
};

/** Иконка для типа события (fallback — CalendarDays) */
export function getEventIcon(typeId) {
  return EVENT_ICON_MAP[typeId] ?? CalendarDays;
}
