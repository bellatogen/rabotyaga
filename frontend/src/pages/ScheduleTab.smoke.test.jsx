// Smoke-тест рендера ScheduleTab — ловит краши инициализации (TDZ и т.п.).
// См. MonthAnalytics.smoke.test.jsx.
import { renderToString } from 'react-dom/server';
import { ScheduleTab } from './ScheduleTab';

const baseProps = {
  schedule: {},
  events: {},
  revenue: {},
  ds: '2026-06-25',
  members: [{ name: 'Антон', role: 'barman' }, { name: 'Павел', role: 'manager' }],
  onOpenDay: () => {},
  isManager: true,
  monthPlan: { '2026-06': 3000000 },
  onSetMonthPlan: () => {},
  hourNorms: {},
  onSetHourNorm: () => {},
  mozgDashboard: {},
};

describe('ScheduleTab — smoke рендер', () => {
  test('рендерится с базовыми пропсами', () => {
    expect(() => renderToString(<ScheduleTab {...baseProps} />)).not.toThrow();
  });

  test('рендерится с пустыми members', () => {
    expect(() => renderToString(<ScheduleTab {...baseProps} members={[]} />)).not.toThrow();
  });
});
