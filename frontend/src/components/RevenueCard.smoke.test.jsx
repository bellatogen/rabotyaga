// Smoke-тест рендера RevenueCard — ловит краши инициализации (TDZ и т.п.),
// которые vite build пропускает. См. MonthAnalytics.smoke.test.jsx.
import { renderToString } from 'react-dom/server';
import { RevenueCard } from './RevenueCard';

const baseRevenue = {
  '2026-06-25': { plan: 100000, fact: 92000, guests: 48, avgCheck: 1900 },
  '2026-06-24': { plan: 100000, fact: 88000, guests: 45, avgCheck: 1850 },
};

describe('RevenueCard — smoke рендер', () => {
  test('рендерится с данными дня', () => {
    expect(() => renderToString(
      <RevenueCard date="2026-06-25" revenue={baseRevenue} onIikoLoad={() => {}} />
    )).not.toThrow();
  });

  test('рендерится без данных за день (пустой revenue)', () => {
    expect(() => renderToString(
      <RevenueCard date="2026-06-25" revenue={{}} onIikoLoad={() => {}} />
    )).not.toThrow();
  });

  test('рендерится при нулевом факте', () => {
    expect(() => renderToString(
      <RevenueCard date="2026-06-25" revenue={{ '2026-06-25': { plan: 100000, fact: 0, guests: 0 } }} onIikoLoad={() => {}} />
    )).not.toThrow();
  });
});
