// Утилиты для работы с карточками нарушений (жёлтая / оранжевая / красная)

import { uid, todayStr, addDays } from './dateUtils.js';

/** Возвращает активные карточки сотрудника за последние 90 дней */
export function getActiveCards(cards, name) {
  const cut = addDays(todayStr(), -90);
  return cards.filter(c => c.name === name && c.active && c.date >= cut);
}

/**
 * Обрабатывает выдачу новой карточки с учётом истории:
 * жёлтая + жёлтая → оранжевая; оранжевая → красная.
 */
export function processCard(cards, name, type, comment, isPrivate, issuedBy) {
  const active = getActiveCards(cards, name);
  const yellows = active.filter(c => c.type === "yellow");
  const oranges = active.filter(c => c.type === "orange");
  let finalType = type, updated = [...cards];
  if (type === "yellow") {
    if (oranges.length > 0) finalType = "red";
    else if (yellows.length >= 1) {
      updated = updated.map(c =>
        c.name === name && c.type === "yellow" && c.active ? {...c, active: false} : c
      );
      finalType = "orange";
    }
  }
  return {
    cards: [...updated, {id:uid(), name, type:finalType, date:todayStr(), comment, isPrivate, issuedBy, active:true}],
    finalType,
  };
}
