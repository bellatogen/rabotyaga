// Маппинг типов событий → lucide-иконки.
// Единый источник для ScheduleTab (CalEventBadge, тултип) и MonthAnalytics.
//
// ВАЖНО: намеренно не используем export const (module-scope const вызывает
// TDZ в Rollup/Vite при определённом порядке модулей в чанке).
// export function хоистится → нет TDZ.
import { Wine, Brain, Target, Mic, Handshake, ClipboardList, Music } from 'lucide-react';

/** Иконка-компонент для typeId события. Возвращает null если тип не найден. */
export function getEventIcon(typeId) {
  switch (typeId) {
    case 'istoriya': return Wine;
    case 'stereo':   return Music;
    case 'pubquiz':  return Brain;
    case 'darts':    return Target;
    case 'guest':    return Mic;
    case 'collab':   return Handshake;
    case 'inventa':  return ClipboardList;
    default:         return null;
  }
}
