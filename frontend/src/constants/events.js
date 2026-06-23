// Реестр типов коммерческих событий — расширяемый справочник.
// Добавить новое событие: один объект в EVENT_TYPES. Всё остальное (аналитика,
// цвета в календаре, сравнение дней) подхватывается автоматически.
//
// matchTerms — подстроки для классификации строк из events:v1 / EMBEDDED_EVENTS
// (сравнение без учёта регистра и частичное совпадение).

export const EVENT_TYPES = [
  {
    id:        'istoriya',
    name:      'История в бутылке',
    shortName: 'История',
    emoji:     '🍷',
    color:     '#c49a3c',                    // янтарный
    bg:        'rgba(196,154,60,.13)',
    matchTerms: ['истории в бутылке', 'история в бутылке'],
  },
  {
    id:        'stereo',
    name:      'Стерео 55',
    shortName: 'Стерео 55',
    emoji:     '🎵',
    color:     '#8b5cf6',                    // фиолетовый
    bg:        'rgba(139,92,246,.13)',
    matchTerms: ['стерео 55', 'стерео55'],
  },
  // → сюда добавляются новые типы: квизы, закрытые вечера, сезонные акции и т.д.
];

/**
 * Классифицировать строку события → EventType | null.
 * Используется везде: в календаре, аналитике, пушах.
 */
export function classifyEvent(eventStr) {
  if (!eventStr) return null;
  const lower = eventStr.toLowerCase();
  return EVENT_TYPES.find(t => t.matchTerms.some(term => lower.includes(term))) ?? null;
}
