// Статистические утилиты: рейтинги, тренды, рекомендации

import { isToday, isDone, doneInfo } from './taskUtils.js';
import { rangeDays, addDays, fmtDate, hmm } from './dateUtils.js';
import { getActiveCards } from './cardUtils.js';

/** Считает выполненность задач за span дней начиная с fromAgo дней назад */
export function rateFor(name, tasks, history, ds, fromAgo, span) {
  let t = 0, d = 0;
  for (let i = fromAgo; i < fromAgo + span; i++) {
    const k = addDays(ds, -i);
    tasks.filter(x => (x.assignee === name || x.assignee === "смена") && isToday(x, k))
      .forEach(x => { t++; if (isDone(history[`${x.id}::${k}`])) d++; });
  }
  return {t, d, rate: t ? d / t : null};
}

/** Сравнивает темп выполнения за последние 15 дней с предыдущими 15 */
export function progressTrend(name, tasks, history, ds) {
  const recent = rateFor(name, tasks, history, ds, 0, 15);
  const prev   = rateFor(name, tasks, history, ds, 15, 15);
  if (recent.rate === null || prev.rate === null) return null;
  return {recent: recent.rate, prev: prev.rate, delta: recent.rate - prev.rate};
}

/** Ищет признаки нереалистичного закрытия задач (массовые отметки, ранние закрытия) */
export function suspiciousFlags(name, tasks, history) {
  const byId = Object.fromEntries(tasks.map(t => [t.id, t]));
  const byDate = {};
  Object.entries(history).forEach(([k, v]) => {
    const info = doneInfo(v);
    if (!info || !info.done || !info.ts || info.by !== name) return;
    const [tid, date] = k.split("::");
    (byDate[date] = byDate[date] || []).push({ts: info.ts, task: byId[tid]});
  });
  const flags = [];
  Object.entries(byDate).forEach(([date, arr]) => {
    const minutes = {};
    arr.forEach(a => { const m = a.ts.slice(0, 16); minutes[m] = (minutes[m] || 0) + 1; });
    const massMin = Object.entries(minutes).find(([, c]) => c >= 3);
    if (massMin) flags.push({date, type:"mass", text:`${fmtDate(date)}: ${massMin[1]} задач отмечены в одну минуту — возможно «накликал»`});
    arr.forEach(a => {
      if (!a.task) return;
      const hour = new Date(a.ts).getHours();
      if ((a.task.repeat === "closing" || a.task.isReport) && hour >= 6 && hour < 20)
        flags.push({date, type:"early", text:`${fmtDate(date)}: задача закрытия отмечена в ${String(hour).padStart(2,"0")}:00 (рано)`});
    });
  });
  return flags;
}

/** Генерирует персональные рекомендации для сотрудника */
export function genRecs(name, tasks, history, schedule, cards, profiles, ds) {
  const recs = [];
  const r = rateFor(name, tasks, history, ds, 0, 14);
  const rate = r.rate;
  // отчётные/открытие/закрытие
  let repTot = 0, repDon = 0, opTot = 0, opDon = 0, clTot = 0, clDon = 0;
  rangeDays(ds, 14).forEach(d => {
    tasks.filter(t => t.assignee === name || t.assignee === "смена").filter(t => isToday(t, d)).forEach(t => {
      const ok = isDone(history[`${t.id}::${d}`]);
      if (t.isReport) { repTot++; if (ok) repDon++; }
      if (t.repeat === "opening") { opTot++; if (ok) opDon++; }
      if (t.repeat === "closing") { clTot++; if (ok) clDon++; }
    });
  });
  if (rate !== null) {
    if (rate >= .9) recs.push({type:"success", icon:"⭐", text:"Отличная дисциплина — 90%+ задач. Держи темп."});
    else if (rate >= .7) recs.push({type:"info", icon:"📈", text:`${Math.round(rate*100)}% задач — хороший уровень, есть куда расти.`});
    else if (rate >= .5) recs.push({type:"warning", icon:"⚠️", text:`${Math.round(rate*100)}% задач за 2 недели — подтяни пунктуальность.`});
    else recs.push({type:"danger", icon:"🚨", text:`Только ${Math.round(rate*100)}% задач — нужно внимание.`});
  }
  // тренд прогресса
  const tr = progressTrend(name, tasks, history, ds);
  if (tr && Math.abs(tr.delta) >= .1) {
    if (tr.delta > 0) recs.push({type:"success", icon:"🚀", text:`Прогресс! Было ${Math.round(tr.prev*100)}% → стало ${Math.round(tr.recent*100)}%. Так держать.`});
    else recs.push({type:"warning", icon:"📉", text:`Снижение: было ${Math.round(tr.prev*100)}% → стало ${Math.round(tr.recent*100)}%. Вернёмся в форму.`});
  }
  if (repTot >= 2) { const rr = repDon / repTot; if (rate && rr < rate - .15) recs.push({type:"warning", icon:"📋", text:"Отчётные задачи проседают — важная зона роста."}); else if (rr >= .9) recs.push({type:"success", icon:"📋", text:"Отчётная дисциплина на высоте!"}); }
  if (opTot >= 2 && clTot >= 2) { const or2 = opDon / opTot, cr = clDon / clTot; if (cr < or2 - .2) recs.push({type:"info", icon:"🌙", text:`Открытие (${Math.round(or2*100)}%) лучше закрытия (${Math.round(cr*100)}%) — добей закрытие.`}); }
  // серия смен
  let streak = 0;
  for (const d of rangeDays(ds, 30)) { if ((schedule[d] || []).some(s => s.name === name)) streak++; else break; }
  if (streak >= 5) recs.push({type:"warning", icon:"😴", text:`${streak} смен подряд — дай себе отдых, усталость бьёт по качеству.`});
  else if (streak >= 3) recs.push({type:"info", icon:"💡", text:`${streak} смены подряд — отдохни на ближайшем выходном.`});
  const wh = rangeDays(ds, 7).reduce((a, d) => { const s = (schedule[d] || []).find(x => x.name === name); return a + (s && s.end ? hmm(s.end) / 60 : 0); }, 0);
  if (wh > 48) recs.push({type:"warning", icon:"⏰", text:`${Math.round(wh)}ч за 7 дней — высокая нагрузка.`});
  // подозрительное закрытие
  const susp = suspiciousFlags(name, tasks, history);
  if (susp.length) recs.push({type:"danger", icon:"🔍", text:`Замечено нереалистичное закрытие задач (${susp.length}). Стоит проверить — возможно отмечает не делая.`});
  // карточки
  const ac = getActiveCards(cards, name);
  if (ac.some(c => c.type === "red")) recs.push({type:"danger", icon:"🟥", text:"Красная карточка — нужна встреча с руководством."});
  else if (ac.some(c => c.type === "orange")) recs.push({type:"warning", icon:"🟧", text:"Оранжевая карточка — следующее нарушение станет красной."});
  else if (ac.some(c => c.type === "yellow")) recs.push({type:"info", icon:"🟨", text:"Жёлтая карточка — следующая станет оранжевой."});
  else if (rate && rate > .8 && streak < 4 && !susp.length) recs.push({type:"success", icon:"✅", text:"Чистая история и хорошие показатели — супер!"});
  const p = profiles.find(x => x.name === name);
  if (p?.role === "barman" && rate && rate > .85 && !ac.length && !susp.length)
    recs.push({type:"growth", icon:"🎯", text:"Стабильно высокие показатели — можно брать больше ответственности."});
  if (!recs.length) recs.push({type:"info", icon:"📊", text:"Данных пока мало — выполняй задачи, рекомендации появятся."});
  return recs;
}
