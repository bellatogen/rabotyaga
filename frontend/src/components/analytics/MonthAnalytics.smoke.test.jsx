// Smoke-тест рендера MonthAnalytics.
// Цель — ловить краши ИНИЦИАЛИЗАЦИИ (TDZ «Cannot access before initialization»,
// обращение к undefined и т.п.), которые eslint не видит, а vite build пропускает.
// Именно такой баг (displayGuests до totalGuests) ронял график в проде белым экраном.
// renderToString синхронно выполняет тело компонента → любой ReferenceError всплывёт здесь.
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MonthAnalytics } from './MonthAnalytics';

// Реалистичные данные: несколько дней с фактом/гостями (триггерит путь daysWithFact>0,
// где и жил TDZ), план месяца, текущий месяц (isCurMonth → прогноз/гости/чек).
function makeRevenue() {
  const rev = {};
  for (let d = 1; d <= 20; d++) {
    const day = String(d).padStart(2, '0');
    rev[`2026-06-${day}`] = { plan: 100000, fact: 85000 + d * 500, guests: 40 + d, avgCheck: 1800 };
  }
  return rev;
}

const baseProps = {
  revenue: makeRevenue(),
  events: {},
  ym: '2026-06',
  ds: '2026-06-25',
  isManager: true,
  monthPlan: { '2026-06': 3000000 },
  onSetMonthPlan: () => {},
  mozgData: null,
};

describe('MonthAnalytics — smoke рендер', () => {
  test('рендерится с фактическими данными без краша инициализации (TDZ-страховка)', () => {
    expect(() => renderToString(<MonthAnalytics {...baseProps} />)).not.toThrow();
  });

  test('рендерится с mozgData (путь дрифт-бейджа)', () => {
    const withMozg = { ...baseProps, mozgData: { fact: 1900000, syncedAt: '2026-06-25T10:00:00Z', period: { from: '2026-06-01', to: '2026-06-20' } } };
    expect(() => renderToString(<MonthAnalytics {...withMozg} />)).not.toThrow();
  });

  test('рендерится без events (guard на undefined)', () => {
    const noEvents = { ...baseProps };
    delete noEvents.events;
    expect(() => renderToString(<MonthAnalytics {...noEvents} />)).not.toThrow();
  });

  test('рендерится на пустом месяце (нет данных)', () => {
    expect(() => renderToString(<MonthAnalytics {...baseProps} revenue={{}} />)).not.toThrow();
  });
});
