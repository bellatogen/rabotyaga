// Аналитический блок месяца.
// Один главный блок цели + прогноз + YoY (динамичный год).
// Ниже: единый вторичный блок со всеми метриками.

import { useState } from 'react';
import {
  BarChart2, Users, AlertTriangle, CheckCircle, X,
  TrendingUp, TrendingDown, Minus, CalendarDays,
} from 'lucide-react';
import { EVENT_TYPES, classifyEvent } from '../../constants/events.js';
import { MONTHS_RU } from '../../constants/locale.js';
import { revColor, kRub } from '../../utils/revenueUtils.js';
import { EVENT_ICON_MAP } from '../../utils/eventIcons.jsx';

const MAX_MONTHLY = 30_000_000;
const DOW_LABELS  = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DOW_FULL    = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

// ── Утилиты ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || !isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('ru-RU');
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
function trendIcon(delta, size = 11) {
  if (delta == null) return null;
  if (delta > 0) return <TrendingUp  size={size} color="#8bc47a" />;
  if (delta < 0) return <TrendingDown size={size} color="#e85535" />;
  return <Minus size={size} color="var(--mt)" />;
}
function deltaStr(d) {
  if (d == null) return null;
  return (d > 0 ? '+' : '') + d + '%';
}

// ── Светофорный бэдж ────────────────────────────────────────────────────────
function PctBadge({ pct, size = 13 }) {
  if (pct == null) return null;
  const c = revColor(pct);
  return (
    <span style={{
      fontSize: size, fontWeight: 700, color: c,
      background: c + '22', padding: '2px 8px', borderRadius: 8, flexShrink: 0,
    }}>
      {pct}%
    </span>
  );
}

// ── Прогресс-бар ────────────────────────────────────────────────────────────
function PBar({ pct, h = 5 }) {
  const c = revColor(pct ?? 0);
  return (
    <div style={{ height: h, background: 'var(--bd)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.min(100, pct ?? 0)}%`,
        background: c, borderRadius: 3, transition: 'width .5s ease',
      }} />
    </div>
  );
}

// ── Мини-стат тайл ──────────────────────────────────────────────────────────
function MiniStat({ label, value, sub, delta, align = 'left' }) {
  const dColor = delta == null ? null : delta > 0 ? '#8bc47a' : delta < 0 ? '#e85535' : 'var(--mt)';
  return (
    <div style={{ textAlign: align }}>
      <div style={{ fontSize: 9, color: 'var(--mt)', textTransform: 'uppercase',
        letterSpacing: '.05em', marginBottom: 3, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>{value}</span>
        {delta != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700, color: dColor }}>
            {trendIcon(delta, 11)}{deltaStr(delta)}
          </span>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: 'var(--mt)', opacity: .55, marginTop: 1 }}>{sub}</div>
      )}
    </div>
  );
}

// ── Спарклайн с тапабельным тултипом ────────────────────────────────────────
function Sparkline({ days, revenue, events, monthShort }) {
  const [active, setActive] = useState(null); // index
  const fN    = d => Number(revenue[d]?.fact) || 0;
  const pN    = d => Number(revenue[d]?.plan) || 0;
  const facts = days.map(d => fN(d));
  const maxF  = Math.max(1, ...facts);
  if (!facts.some(f => f > 0)) return null;

  const activeDay  = active != null ? days[active]    : null;
  const activeFact = activeDay ? fN(activeDay) : 0;
  const activePlan = activeDay ? pN(activeDay) : 0;
  const activePct  = activePlan > 0 && activeFact > 0 ? Math.round(activeFact / activePlan * 100) : null;
  const activeEv   = activeDay ? classifyEvent(events[activeDay]) : null;
  const activeNum  = activeDay ? Number(activeDay.slice(8, 10)) : null;
  const activeDow  = activeDay
    ? DOW_LABELS[(new Date(activeDay + 'T00:00:00').getDay() + 6) % 7].toLowerCase()
    : null;

  const activeTypes = EVENT_TYPES.filter(et =>
    days.some(d => classifyEvent(events[d])?.id === et.id)
  );

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Бары */}
      <div
        style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 46, paddingBottom: 6, cursor: 'pointer' }}
        onMouseLeave={() => setActive(null)}
      >
        {days.map((date, i) => {
          const fact  = facts[i];
          const plan  = pN(date);
          const pct   = plan > 0 && fact > 0 ? (fact / plan) * 100 : null;
          const barH  = fact > 0 ? Math.max(2, (fact / maxF) * 38) : 1;
          const color = pct != null ? revColor(pct) : fact > 0 ? 'var(--cu)' : 'var(--bd)';
          const ev    = classifyEvent(events[date]);
          const isAct = i === active;
          return (
            <div
              key={date}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}
              onMouseEnter={() => setActive(i)}
              onTouchStart={(e) => { e.preventDefault(); setActive(i); }}
            >
              <div style={{
                width: '100%', height: barH, background: color, borderRadius: '2px 2px 0 0',
                opacity: fact > 0 ? (isAct ? 1 : .75) : .15,
                outline: isAct && fact > 0 ? `1.5px solid ${color}` : 'none',
                transition: 'opacity .1s',
              }} />
              <div style={{ width: 3, height: 3, borderRadius: '50%', flexShrink: 0, background: ev ? ev.color : 'transparent' }} />
            </div>
          );
        })}
      </div>

      {/* Тултип — снизу, в дизайне интерфейса */}
      {activeDay ? (
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 9,
          padding: '8px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10,
          transition: 'opacity .15s',
        }}>
          {/* Дата */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {activeNum} {monthShort}
            </div>
            <div style={{ fontSize: 9, color: 'var(--mt)', marginTop: 1 }}>{activeDow}</div>
          </div>
          {/* Разделитель */}
          <div style={{ width: 1, height: 30, background: 'var(--bd)', flexShrink: 0 }} />
          {/* Факт */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {activeFact > 0 ? fmt(activeFact) + ' ₽' : '— нет данных'}
            </div>
            {activePlan > 0 && (
              <div style={{ fontSize: 10, color: 'var(--mt)', marginTop: 1 }}>
                план {fmt(activePlan)} ₽
              </div>
            )}
          </div>
          {/* % от плана */}
          {activePct != null && <PctBadge pct={activePct} size={12} />}
          {/* Событие */}
          {activeEv && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
              color: activeEv.color, fontWeight: 600, flexShrink: 0 }}>
              {(() => { const Icon = EVENT_ICON_MAP[activeEv.id] || CalendarDays; return <Icon size={11} />; })()}
              {activeEv.shortName}
            </div>
          )}
        </div>
      ) : (
        /* Легенда событий когда ничего не выбрано */
        activeTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 10, fontSize: 9, color: 'var(--mt)', flexWrap: 'wrap', marginBottom: 2 }}>
            {activeTypes.map(et => {
              const Icon = EVENT_ICON_MAP[et.id] || CalendarDays;
              return (
                <span key={et.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Icon size={9} color={et.color} />
                  {et.shortName}
                </span>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ── По дням недели — кликабельная диаграмма ──────────────────────────────────
function WeekdayChart({ days, revenue, monthShort, events }) {
  const [selDow, setSelDow] = useState(null);
  const fN    = d => Number(revenue[d]?.fact) || 0;
  const pN    = d => Number(revenue[d]?.plan) || 0;
  const byDow = Array(7).fill(null).map(() => ({ total: 0, count: 0, days: [] }));
  days.filter(d => fN(d) > 0).forEach(d => {
    const dow = (new Date(d + 'T00:00:00').getDay() + 6) % 7;
    byDow[dow].total += fN(d);
    byDow[dow].count++;
    byDow[dow].days.push(d);
  });
  const avgs    = byDow.map(x => x.count > 0 ? Math.round(x.total / x.count) : 0);
  const maxAvg  = Math.max(1, ...avgs);
  const bestDow = avgs.reduce((bi, a, i) => a > (avgs[bi] || 0) ? i : bi, 0);
  if (!avgs.some(a => a > 0)) return null;

  // Детализация выбранного дня недели
  const selDays  = selDow != null ? byDow[selDow].days : [];
  const selMax   = selDays.length > 0 ? Math.max(...selDays.map(d => fN(d))) : 0;
  const selAvg   = avgs[selDow];

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, color: 'var(--mt)', textTransform: 'uppercase',
        letterSpacing: '.06em', fontWeight: 600, marginBottom: 7 }}>
        Avg по дням недели
      </div>
      {/* Бары — кликабельные */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 44 }}>
        {avgs.map((avg, i) => {
          const h      = avg > 0 ? Math.max(4, (avg / maxAvg) * 36) : 2;
          const isBest = i === bestDow && avg > 0;
          const isSel  = i === selDow;
          const color  = isBest ? '#8bc47a' : i >= 5 ? '#5b8b9b' : 'var(--cu)';
          return (
            <div
              key={i}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: avg > 0 ? 'pointer' : 'default' }}
              onClick={() => avg > 0 && setSelDow(isSel ? null : i)}
            >
              <div style={{
                width: '100%', height: h, borderRadius: '3px 3px 0 0',
                background: avg > 0 ? color : 'var(--bd)',
                opacity: avg > 0 ? (isSel ? 1 : .75) : .2,
                outline: isSel ? `2px solid ${color}` : 'none',
                outlineOffset: 1,
                boxShadow: isBest && !isSel ? `0 0 7px ${color}60` : 'none',
                transition: 'opacity .1s',
              }} />
              <span style={{ fontSize: 9, color: isBest ? '#8bc47a' : isSel ? 'var(--pp)' : 'var(--mt)', fontWeight: isBest || isSel ? 700 : 400 }}>
                {DOW_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 1 }}>
        {avgs.map((avg, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: 'var(--mt)', opacity: avg > 0 ? .6 : 0 }}>
            {avg > 0 ? kRub(avg) : ''}
          </span>
        ))}
      </div>

      {/* Детальная панель выбранного дня недели */}
      {selDow != null && selDays.length > 0 && (
        <div style={{ marginTop: 10, background: 'var(--bg)', border: '1px solid var(--bd)',
          borderRadius: 9, overflow: 'hidden' }}>
          {/* Шапка */}
          <div style={{ padding: '8px 10px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid var(--bd)' }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>
              {DOW_FULL[selDow]}
              <span style={{ fontWeight: 400, color: 'var(--mt)', marginLeft: 6 }}>
                {selDays.length} {plural(selDays.length,'день','дня','дней')} · avg {kRub(selAvg)} ₽
              </span>
            </span>
            <button onClick={() => setSelDow(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mt)', padding: 0, display: 'flex' }}>
              <X size={13} />
            </button>
          </div>
          {/* Список дней */}
          {selDays.map(d => {
            const f   = fN(d);
            const p   = pN(d);
            const pct = p > 0 ? Math.round(f / p * 100) : null;
            const barW = selMax > 0 ? Math.round(f / selMax * 100) : 0;
            const isB  = f === selMax;
            const ev   = classifyEvent(events ? events[d] : null);
            const dayN = Number(d.slice(8, 10));
            return (
              <div key={d} style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: '1px solid var(--bd)', background: isB ? 'rgba(139,196,122,.05)' : 'transparent' }}>
                <span style={{ fontSize: 11, color: 'var(--mt)', flexShrink: 0, width: 24 }}>
                  {dayN} {monthShort}
                </span>
                {/* Мини-бар */}
                <div style={{ flex: 1, height: 4, background: 'var(--bd)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: barW + '%', borderRadius: 2,
                    background: pct != null ? revColor(pct) : 'var(--cu)' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
                  {fmt(f)} ₽
                </span>
                {pct != null && <PctBadge pct={pct} size={10} />}
                {ev && (() => { const Icon = EVENT_ICON_MAP[ev.id] || CalendarDays; return <Icon size={10} color={ev.color} style={{ flexShrink: 0 }} />; })()}
                {isB && <span style={{ fontSize: 9, color: '#8bc47a', flexShrink: 0 }}>★</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Список событий (вместо колец) ───────────────────────────────────────────
function EventList({ rows }) {
  if (!rows.length) return null;
  const maxAvg = Math.max(1, ...rows.map(r => r.avgFact ?? 0));
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, color: 'var(--mt)', textTransform: 'uppercase',
        letterSpacing: '.06em', fontWeight: 600, marginBottom: 7 }}>
        Типы дней
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((row, i) => {
          const barW = row.avgFact != null && maxAvg > 0 ? Math.round(row.avgFact / maxAvg * 100) : 0;
          const Icon = row.Icon;
          return (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <Icon size={11} color={row.color} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.shortName}
                </span>
                <span style={{ fontSize: 10, color: 'var(--mt)', flexShrink: 0 }}>
                  {row.count} {plural(row.count,'д','д','д')}
                </span>
                {row.avgFact != null && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--pp)', flexShrink: 0, minWidth: 34, textAlign: 'right' }}>
                    {kRub(row.avgFact)}
                  </span>
                )}
              </div>
              {row.avgFact != null && (
                <div style={{ height: 3, background: 'var(--bd)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: barW + '%', background: row.color, borderRadius: 2, opacity: .75 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Мини-спарклайн (последние N дней с данными) ──────────────────────────────
function MiniSparkline({ values, color = 'var(--cu)', h = 24 }) {
  if (!values || values.length < 2) return null;
  const maxV = Math.max(1, ...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: h }}>
      {values.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: Math.max(2, (v / maxV) * h),
          background: color, borderRadius: '2px 2px 0 0', opacity: .75,
        }} />
      ))}
    </div>
  );
}

// ── Блок с авторитетными данными из mozg.rest ──────────────────────────────
function MozgCard({ data, iikofact }) {
  if (!data) return null;
  const { fact, guests, cheque, forecast, plan, period, syncedAt } = data;

  // Расхождение mozg vs iiko (%)
  const drift = fact > 0 && iikofact > 0
    ? Math.round((fact - iikofact) / fact * 100)
    : null;
  const driftAbs  = drift != null ? Math.abs(drift) : null;
  const driftBig  = driftAbs != null && driftAbs >= 5;
  const syncTime = syncedAt ? new Date(syncedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : null;
  const syncDate = syncedAt ? new Date(syncedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : null;

  const Row = ({ label, value, sub, accent }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '5px 0', borderBottom: '1px solid var(--bd)' }}>
      <span style={{ fontSize: 11, color: 'var(--mt)' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent || 'var(--pp)' }}>{value}</span>
        {sub && <span style={{ fontSize: 10, color: 'var(--mt)', marginLeft: 5 }}>{sub}</span>}
      </div>
    </div>
  );

  const fmtRub = n => n != null ? Number(n).toLocaleString('ru-RU') + ' ₽' : '—';
  const fmtN   = n => n != null ? Number(n).toLocaleString('ru-RU') : '—';

  const planPct  = plan  > 0 && fact  != null ? Math.round(fact  / plan  * 100) : null;
  const fcPct    = plan  > 0 && forecast != null ? Math.round(forecast / plan * 100) : null;

  return (
    <div style={{
      background: 'var(--sf)', borderRadius: 12, border: '1px solid var(--bd)',
      padding: '12px 14px', marginBottom: 10,
    }}>
      {/* Заголовок */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.07em', color: 'var(--mt)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13 }}>🧠</span> Мозг
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {drift != null && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
              background: driftBig ? 'rgba(232,85,53,.15)' : 'rgba(139,196,122,.15)',
              color: driftBig ? '#e85535' : '#8bc47a',
            }}>
              {driftBig ? '⚠ ' : '✓ '}iiko {drift > 0 ? '-' : '+'}{driftAbs}%
            </span>
          )}
          {syncDate && (
            <span style={{ fontSize: 9, color: 'var(--mt)', opacity: .55 }}>
              {syncDate} {syncTime}
            </span>
          )}
        </div>
      </div>

      {/* Выручка — большое число */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: 'var(--mt)', textTransform: 'uppercase',
          letterSpacing: '.05em', marginBottom: 2 }}>Выручка факт</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: 'var(--pp)' }}>
            {fmtRub(fact)}
          </span>
          {planPct != null && <PctBadge pct={planPct} size={13} />}
        </div>
        {period?.from && (
          <div style={{ fontSize: 9, color: 'var(--mt)', opacity: .6, marginTop: 1 }}>
            {period.from.slice(8)} – {period.to.slice(8)} {MONTHS_RU[Number(period.from.slice(5,7))-1].toLowerCase()}
          </div>
        )}
      </div>

      {/* Строки метрик */}
      <div>
        {forecast != null && <Row label="Прогноз на месяц" value={fmtRub(forecast)}
          sub={fcPct != null ? `${fcPct}% от плана` : null} accent="var(--cu)" />}
        {plan != null && <Row label="План на месяц" value={fmtRub(plan)} />}
        {guests != null && <Row label="Гостей" value={fmtN(guests) + ' чел.'} />}
        {cheque != null && <Row label="Средний чек" value={fmtRub(cheque)} />}
      </div>
    </div>
  );
}

// ── Главный компонент ────────────────────────────────────────────────────────
export function MonthAnalytics({ revenue, events, ym, ds, isManager, monthPlan = {}, onSetMonthPlan, mozgData }) {
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    `${ym}-${String(i + 1).padStart(2, '0')}`
  );
  // Короткое название месяца (для тултипов): "июн", "янв" и т.д.
  const monthShort = MONTHS_RU[m - 1].slice(0, 3).toLowerCase();

  const fN  = d => Number(revenue[d]?.fact)     || 0;
  const pN  = d => Number(revenue[d]?.plan)     || 0;
  const gN  = d => Number(revenue[d]?.guests)   || 0;
  const lyN = d => Number(revenue[d]?.lastYear) || 0;

  // ── Факт месяца ──
  const daysWithFact = days.filter(d => fN(d) > 0);
  const totalFact    = daysWithFact.reduce((s, d) => s + fN(d), 0);

  // ── Временной прогресс ──
  const todayYM    = ds ? ds.slice(0, 7) : null;
  const today      = ds || '';
  const isCurMonth = todayYM === ym;
  const elapsed    = isCurMonth
    ? Math.min(daysInMonth, Number(ds.slice(8, 10)))
    : (todayYM && ym < todayYM ? daysInMonth : 0);
  const monthOver   = elapsed >= daysInMonth;
  const remainDays  = Math.max(0, daysInMonth - elapsed);

  // ── Цель месяца ──
  const totalPlanFromDays = days.reduce((s, d) => s + pN(d), 0);
  const mGoalExplicit     = Number(monthPlan?.[ym]) || 0;
  const mGoal             = mGoalExplicit || totalPlanFromDays;
  const goalPct           = mGoal > 0 ? Math.round((totalFact / mGoal) * 100) : null;

  // ── План к дате ──
  const elapsedDays  = isCurMonth ? days.filter(d => d <= today) : days;
  const planToDate   = elapsedDays.reduce((s, d) => s + pN(d), 0);
  const pctToDate    = planToDate > 0 ? Math.round((totalFact / planToDate) * 100) : null;
  const gapToDate    = planToDate > totalFact ? planToDate - totalFact : 0;
  const aheadOfDate  = totalFact > planToDate ? totalFact - planToDate : 0;

  // ── Прогноз на конец месяца ──
  const avgPerDay   = daysWithFact.length > 0 ? totalFact / daysWithFact.length : 0;
  const projection  = isCurMonth && avgPerDay > 0 && !monthOver
    ? Math.round(totalFact + avgPerDay * remainDays)
    : 0;
  const projPct     = mGoal > 0 && projection > 0 ? Math.round(projection / mGoal * 100) : null;

  // ── Нужно в день ──
  const neededPerDay = isCurMonth && remainDays > 0 && mGoal > totalFact
    ? Math.round((mGoal - totalFact) / remainDays)
    : 0;

  // ── Конверсия плана ──
  const daysWithBoth = days.filter(d => pN(d) > 0 && fN(d) > 0);
  const daysHitPlan  = daysWithBoth.filter(d => fN(d) >= pN(d));

  // ── YoY (год динамически: y-1, не захардкоженный) ──
  const prevYear = y - 1;
  const lyDays   = days.filter(d => lyN(d) > 0 && fN(d) > 0);
  const totalLY  = lyDays.reduce((s, d) => s + lyN(d), 0);
  const totalFLY = lyDays.reduce((s, d) => s + fN(d), 0);
  const lyDelta  = totalLY > 0 ? Math.round((totalFLY / totalLY - 1) * 100) : null;
  // Экстраполяция прошлого года до сопоставимого числа дней
  const lyScaled = lyDays.length > 0
    ? Math.round(totalLY / lyDays.length * daysWithFact.length)
    : 0;

  // ── Гости и средний чек ──
  const totalGuests = days.reduce((s, d) => s + gN(d), 0);
  const guestDays   = days.filter(d => fN(d) > 0 && gN(d) > 0);
  const gGuests     = guestDays.reduce((s, d) => s + gN(d), 0);
  const gFact       = guestDays.reduce((s, d) => s + fN(d), 0);
  const avgCheck    = gGuests > 0 ? Math.round(gFact / gGuests) : null;
  const avgGpD      = guestDays.length > 0 ? Math.round(totalGuests / guestDays.length) : null;
  const projGuests  = isCurMonth && avgGpD && remainDays > 0 && !monthOver
    ? Math.round(totalGuests + avgGpD * remainDays)
    : null;

  // ── A: Лучший день месяца ──
  const bestDay     = daysWithFact.length > 0
    ? daysWithFact.reduce((best, d) => fN(d) > fN(best) ? d : best, daysWithFact[0])
    : null;
  const bestDayFact = bestDay ? fN(bestDay) : 0;
  const bestDayPlan = bestDay ? pN(bestDay) : 0;
  const bestDayPct  = bestDayPlan > 0 ? Math.round(bestDayFact / bestDayPlan * 100) : null;
  const bestDayLbl  = bestDay
    ? `${Number(bestDay.slice(8, 10))} ${monthShort}`
    : null;

  // ── B: Тренд последней недели ──
  const last7    = daysWithFact.slice(-7);
  const prev7    = daysWithFact.slice(-14, -7);
  const avgLast7 = last7.length > 0 ? Math.round(last7.reduce((s, d) => s + fN(d), 0) / last7.length) : 0;
  const avgPrev7 = prev7.length > 0 ? Math.round(prev7.reduce((s, d) => s + fN(d), 0) / prev7.length) : 0;
  const weekTrend = avgPrev7 > 0 ? Math.round((avgLast7 / avgPrev7 - 1) * 100) : null;

  // ── C: Будни vs выходные ──
  const weekdayFact = daysWithFact.filter(d => (new Date(d + 'T00:00:00').getDay() + 6) % 7 < 5);
  const weekendFact = daysWithFact.filter(d => (new Date(d + 'T00:00:00').getDay() + 6) % 7 >= 5);
  const avgWD = weekdayFact.length > 0 ? Math.round(weekdayFact.reduce((s, d) => s + fN(d), 0) / weekdayFact.length) : null;
  const avgWE = weekendFact.length > 0 ? Math.round(weekendFact.reduce((s, d) => s + fN(d), 0) / weekendFact.length) : null;
  const wdWeRatio = avgWD && avgWE ? (avgWE / avgWD).toFixed(1) : null;

  // ── E: Динамика среднего чека (1-я половина vs 2-я) ──
  const halfIdx        = Math.floor(guestDays.length / 2);
  const checkFirst     = guestDays.slice(0, halfIdx);
  const checkSecond    = guestDays.slice(halfIdx);
  const gFirst  = checkFirst.reduce((s, d) => s + gN(d), 0);
  const gSecond = checkSecond.reduce((s, d) => s + gN(d), 0);
  const avgCheckFirst  = checkFirst.length > 0 && gFirst  > 0 ? Math.round(checkFirst.reduce((s, d) => s + fN(d), 0)  / gFirst)  : null;
  const avgCheckSecond = checkSecond.length > 0 && gSecond > 0 ? Math.round(checkSecond.reduce((s, d) => s + fN(d), 0) / gSecond) : null;
  const checkTrend = avgCheckFirst && avgCheckSecond
    ? Math.round((avgCheckSecond / avgCheckFirst - 1) * 100) : null;

  // ── G: Скользящий тренд (последние ≤14 дн. с данными) ──
  const rollingValues = daysWithFact.slice(-14).map(d => fN(d));

  // ── Аналитика событий ──
  const eventRows = EVENT_TYPES.map(type => {
    const td  = days.filter(d => classifyEvent(events[d])?.id === type.id);
    const twf = td.filter(d => fN(d) > 0);
    const tot = twf.reduce((s, d) => s + fN(d), 0);
    return {
      Icon: EVENT_ICON_MAP[type.id] || CalendarDays,
      shortName: type.shortName, color: type.color,
      count: td.length, avgFact: twf.length ? Math.round(tot / twf.length) : null,
    };
  }).filter(t => t.count > 0);
  // Обычные дни (без события)
  const regWF  = days.filter(d => !classifyEvent(events[d]) && fN(d) > 0);
  const regAvg = regWF.length > 0 ? Math.round(regWF.reduce((s, d) => s + fN(d), 0) / regWF.length) : null;
  if (regAvg != null) eventRows.push({
    Icon: CalendarDays, shortName: 'Обычные', color: 'var(--mt)',
    count: days.filter(d => !classifyEvent(events[d])).length, avgFact: regAvg,
  });

  // ── Санитарный контроль ──
  const dataCorrupt = !isFinite(totalFact) || totalFact > MAX_MONTHLY;

  // ── Редактор цели ──
  const [editGoal, setEditGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const saveGoal = () => {
    const v = goalDraft === '' ? 0 : Number(goalDraft);
    if (!isFinite(v) || v < 0 || v > MAX_MONTHLY) { setEditGoal(false); return; }
    onSetMonthPlan && onSetMonthPlan(ym, v);
    setEditGoal(false);
  };
  const goalAction = isManager && onSetMonthPlan
    ? editGoal ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="number" value={goalDraft} autoFocus
            onChange={e => setGoalDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditGoal(false); }}
            style={{ width: 100, background: 'var(--bg)', border: '1px solid var(--bd)',
              borderRadius: 6, padding: '3px 7px', color: 'var(--pp)', fontSize: 12, fontFamily: 'inherit' }} />
          <button onClick={saveGoal} style={{ background: 'var(--cu)', border: 'none', borderRadius: 6,
            color: 'var(--bg)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '3px 9px', fontFamily: 'inherit' }}>OK</button>
          <button onClick={() => setEditGoal(false)} style={{ background: 'transparent', border: '1px solid var(--bd)',
            borderRadius: 6, color: 'var(--mt)', cursor: 'pointer', padding: '3px 6px', display: 'flex' }}>
            <X size={12}/>
          </button>
        </div>
      ) : (
        <button onClick={() => { setGoalDraft(mGoalExplicit > 0 ? String(mGoalExplicit) : ''); setEditGoal(true); }}
          style={{ background: 'transparent', border: '1px solid var(--bd)', borderRadius: 6,
            color: 'var(--mt)', cursor: 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: 'inherit' }}>
          {mGoalExplicit > 0 ? 'Изменить' : 'Задать'}
        </button>
      )
    : null;

  // ── Нет данных ──
  if (daysWithFact.length === 0) {
    return (
      <div className="sec" style={{ paddingTop: 14 }}>
        <span className="sec-lbl" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <BarChart2 size={12}/>{MONTHS_RU[m - 1]}
        </span>
        <div style={{ fontSize: 12, color: 'var(--mt)', textAlign: 'center', padding: '14px 0', opacity: .6 }}>
          Данных выручки за {MONTHS_RU[m - 1].toLowerCase()} пока нет
        </div>
      </div>
    );
  }

  return (
    <div className="sec" style={{ paddingTop: 14 }}>

      {/* Санитарный алерт */}
      {dataCorrupt && (
        <div style={{ background: 'rgba(220,53,53,.12)', border: '1px solid rgba(220,53,53,.35)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#e05555', lineHeight: 1.5 }}>
          <strong style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={14}/>Данные выручки некорректны
          </strong>
          <span style={{ fontSize: 12, opacity: .85 }}>
            Откройте Календарь → найдите день с неверным числом → «Сохранить выручку».
          </span>
        </div>
      )}

      {/* Заголовок */}
      <div className="sec-head" style={{ marginBottom: 8 }}>
        <span className="sec-lbl" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <BarChart2 size={12}/>{MONTHS_RU[m - 1]}
        </span>
        <span style={{ fontSize: 11, color: 'var(--mt)' }}>{daysWithFact.length}/{daysInMonth} дн.</span>
      </div>

      {/* Блок Мозг — авторитетные данные (если есть) */}
      <MozgCard data={mozgData} iikofact={totalFact} />

      {/* Спарклайн с тултипом */}
      <Sparkline days={days} revenue={revenue} events={events} monthShort={monthShort} />

      {/* ════ ГЛАВНЫЙ БЛОК: ЦЕЛЬ МЕСЯЦА ════ */}
      <div style={{ background: 'var(--sf)', borderRadius: 12, padding: '14px 16px',
        border: '1px solid var(--bd)', marginBottom: 10 }}>

        {/* Шапка */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--mt)', fontWeight: 600 }}>
            {monthOver ? 'Итог месяца' : 'Цель месяца'}
            {mGoal > 0 && (
              <span style={{ fontWeight: 400, marginLeft: 6, opacity: .6 }}>{fmt(mGoal)} ₽</span>
            )}
          </span>
          {goalAction}
        </div>

        {/* Большое число факта + светофор */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.8, color: 'var(--pp)', lineHeight: 1 }}>
            {fmt(totalFact)} ₽
          </span>
          <PctBadge pct={goalPct} size={16} />
        </div>

        {goalPct != null && (
          <div style={{ marginTop: 7, marginBottom: 5 }}>
            <PBar pct={goalPct} h={5} />
          </div>
        )}

        {/* Статусная строка — "к 24 июн" вместо "к 24-му" чтобы не путалось с годом */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mt)',
          marginTop: 4, flexWrap: 'wrap', gap: 4 }}>
          {isCurMonth && planToDate > 0 ? (
            <span>
              к {elapsed} {monthShort}:{' '}
              <b style={{ color: revColor(pctToDate ?? 50), fontWeight: 700 }}>{pctToDate}%</b>
              {gapToDate   > 0 && <span style={{ opacity: .75 }}> · -{fmt(gapToDate)} ₽</span>}
              {aheadOfDate > 0 && <span style={{ color: '#8bc47a' }}> · +{fmt(aheadOfDate)} ₽</span>}
            </span>
          ) : (
            <span style={{ opacity: .6 }}>{elapsed} из {daysInMonth} {plural(daysInMonth,'дня','дней','дней')}</span>
          )}
          {!monthOver && mGoal > 0 && totalFact < mGoal && (
            <span style={{ opacity: .7 }}>осталось {fmt(mGoal - totalFact)} ₽</span>
          )}
          {monthOver && totalFact >= mGoal && (
            <span style={{ color: '#8bc47a', display: 'flex', alignItems: 'center', gap: 3 }}>
              <CheckCircle size={11}/>+{fmt(totalFact - mGoal)} ₽ сверх
            </span>
          )}
        </div>

        {/* Конверсия дней */}
        {daysWithBoth.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--mt)', opacity: .6, marginTop: 3 }}>
            {daysHitPlan.length} из {daysWithBoth.length} {plural(daysWithBoth.length,'дня','дней','дней')} выполнили план
          </div>
        )}

        {/* Прогноз + нужно в день */}
        {isCurMonth && !monthOver && projection > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bd)',
            display: 'flex', alignItems: 'center', gap: 14 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                Прогноз
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4 }}>{fmt(projection)} ₽</span>
                <PctBadge pct={projPct} size={11} />
              </div>
              <div style={{ marginTop: 3 }}>
                <PBar pct={projPct} h={3} />
              </div>
            </div>
            {neededPerDay > 0 && (
              <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                  Нужно/день
                </div>
                <div style={{ fontSize: 16, fontWeight: 700,
                  color: neededPerDay > avgPerDay * 1.3 ? '#e85535' : neededPerDay > avgPerDay ? '#e8a030' : '#8bc47a' }}>
                  {kRub(neededPerDay)} ₽
                </div>
                <div style={{ fontSize: 9, color: 'var(--mt)', opacity: .5, marginTop: 1 }}>
                  ещё {remainDays} {plural(remainDays,'день','дня','дней')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* YoY — полупрозрачная строка, всегда предыдущий год (y-1) */}
        {lyDelta != null && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bd)',
            fontSize: 11, color: 'var(--mt)', opacity: .55,
            display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>vs {prevYear}: {fmt(lyScaled)} ₽</span>
            <span style={{ color: lyDelta > 0 ? '#8bc47a' : '#e85535', fontWeight: 700, filter: 'brightness(1.35)' }}>
              {lyDelta > 0 ? '+' : ''}{lyDelta}%
            </span>
            <span style={{ opacity: .7, fontSize: 10 }}>({lyDays.length} дн.)</span>
          </div>
        )}
      </div>
      {/* ════ конец главного блока ════ */}

      {/* ════ ВТОРИЧНЫЙ БЛОК: ВСЕ МЕТРИКИ ════ */}
      <div style={{ background: 'var(--sf)', borderRadius: 12, border: '1px solid var(--bd)', overflow: 'hidden' }}>

        {/* ─ Ряд 1: Гости + Средний чек ─ */}
        {totalGuests > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '12px 14px', gap: 12 }}>
              <MiniStat
                label="Гостей"
                value={<><Users size={12} style={{ marginRight: 4, verticalAlign: -1 }}/>{fmt(totalGuests)}</>}
                sub={[avgGpD && `≈ ${fmt(avgGpD)}/день`, projGuests && `прогноз ~${fmt(projGuests)}`].filter(Boolean).join(' · ')}
              />
              {avgCheck != null && (
                <MiniStat
                  label="Средний чек"
                  value={`${fmt(avgCheck)} ₽`}
                  sub={checkTrend != null
                    ? `${avgCheckFirst && fmt(avgCheckFirst)} → ${avgCheckSecond && fmt(avgCheckSecond)} ₽`
                    : `${guestDays.length} дн. с данными`}
                  delta={checkTrend}
                  align="right"
                />
              )}
            </div>
            <div style={{ height: 1, background: 'var(--bd)', margin: '0 14px' }} />
          </>
        )}

        {/* ─ Ряд 2: Лучший день + Будни/выходные ─ */}
        {(bestDay || avgWD) && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '12px 14px', gap: 12 }}>
              {bestDay && (
                <MiniStat
                  label="Лучший день"
                  value={kRub(bestDayFact) + ' ₽'}
                  sub={[bestDayLbl, bestDayPct && `${bestDayPct}% от плана`].filter(Boolean).join(' · ')}
                />
              )}
              {avgWD && avgWE && (
                <MiniStat
                  label="Будни / выходные"
                  value={`${kRub(avgWD)} / ${kRub(avgWE)}`}
                  sub={wdWeRatio && `выходные ×${wdWeRatio}`}
                  align="right"
                />
              )}
            </div>
            <div style={{ height: 1, background: 'var(--bd)', margin: '0 14px' }} />
          </>
        )}

        {/* ─ Ряд 3: Тренд 7 дней + скользящий спарклайн ─ */}
        {(weekTrend != null || rollingValues.length >= 4) && (
          <>
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
              {weekTrend != null && (
                <div>
                  <div style={{ fontSize: 9, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 4 }}>
                    Тренд 7 дней
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {trendIcon(weekTrend, 14)}
                    <span style={{ fontSize: 15, fontWeight: 700,
                      color: weekTrend > 0 ? '#8bc47a' : weekTrend < 0 ? '#e85535' : 'var(--mt)' }}>
                      {deltaStr(weekTrend)}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--mt)', opacity: .55 }}>
                      {kRub(avgLast7)} vs {kRub(avgPrev7)}
                    </span>
                  </div>
                </div>
              )}
              {rollingValues.length >= 4 && (
                <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 4 }}>
                    Последние {rollingValues.length} дн.
                  </div>
                  <MiniSparkline values={rollingValues} color={weekTrend != null && weekTrend >= 0 ? '#8bc47a' : '#e85535'} h={26} />
                </div>
              )}
            </div>
            <div style={{ height: 1, background: 'var(--bd)', margin: '0 14px' }} />
          </>
        )}

        {/* ─ Ряд 4: По дням недели + список событий ─ */}
        <div style={{ padding: '12px 14px', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <WeekdayChart days={days} revenue={revenue} monthShort={monthShort} events={events} />
          {eventRows.length > 0 && <EventList rows={eventRows} />}
        </div>

      </div>
      {/* ════ конец вторичного блока ════ */}

    </div>
  );
}
