// Smoke-рендер всех страниц — ловит TDZ/init-краши до деплоя (renderToString
// выполняет тело компонента). Один общий богатый набор пропсов: каждый компонент
// берёт нужное, лишнее игнорирует. Цель — не проверка логики, а отсутствие краша
// инициализации (тот же класс, что ронял график белым экраном).
import { renderToString } from 'react-dom/server';

import { EventsTab } from './EventsTab';
import { LogsTab } from './LogsTab';
import { PersonalCabinet } from './PersonalCabinet';
import { ScheduleTab, DayDetail } from './ScheduleTab';
import { TasksTab } from './TasksTab';
import { TeamHubTab } from './TeamHubTab';
import { TodayTab } from './TodayTab';
import { AdminTab } from '../AdminTab';

const fn = () => {};
const NOW = new Date('2026-06-25T12:00:00');

// Богатый props-bag: объединение пропсов всех страниц с безопасными значениями.
const bag = {
  token: 'tok', auth: { account: 'manager', role: 'manager' },
  events: {}, eventsLog: [], isManager: true, ds: '2026-06-25', now: NOW,
  staff: ['Антон', 'Павел'], members: ['Антон', 'Павел'],
  who: 'manager', tasks: [], history: {}, doneMap: {}, schedule: {}, cards: [], profiles: [],
  revenue: {}, handovers: {}, statusOverrides: [], monthPlan: { '2026-06': 3000000 }, hourNorms: {},
  mozgDashboard: {}, leaveRequests: [], goList: [], taskOrder: [], todayTasks: [], todayEvents: [],
  todayShifts: [], myStatus: {}, myAssigned: [], irregular: [], irregularDoneMap: {},
  name: 'Антон', isOwnCabinet: true, adminPanel: null, date: '2026-06-25',
  canTeam: true, canStats: true, dayClosed: false, dayRegularCount: 0, pushGateOk: false,
  pct: 50, doneTodayCount: 0, sectionsOpen: false, tasksView: 'list',
  // колбэки
  onSave: fn, onDelete: fn, onToggle: fn, onEdit: fn, onArchive: fn, onView: fn, onRevoke: fn,
  onIssueCard: fn, onUpdateProfile: fn, onAddOverride: fn, setCardModal: fn, onChangePassword: fn,
  onLogout: fn, onLeaveRequest: fn, onLeaveDecide: fn, onOpenDay: fn, onSetMonthPlan: fn,
  onSetHourNorm: fn, onSummary: fn, onReorder: fn, onGoAdd: fn, onGoToggle: fn, onGoRemove: fn,
  onViewEmployee: fn, onHandover: fn, onIikoLoad: fn, onEventClick: fn, onReloadData: fn,
  onAddTask: fn, onEditTask: fn, onSetRevenue: fn, onAddShift: fn, onRemoveShift: fn, onUpdateShift: fn,
};

const CASES = [
  ['EventsTab', EventsTab],
  ['LogsTab', LogsTab],
  ['PersonalCabinet', PersonalCabinet],
  ['ScheduleTab', ScheduleTab],
  ['DayDetail', DayDetail],
  ['TasksTab', TasksTab],
  ['TeamHubTab', TeamHubTab],
  ['TodayTab', TodayTab],
  ['AdminTab', AdminTab],
];

describe('Страницы — smoke рендер (TDZ/init-страховка)', () => {
  test.each(CASES)('%s рендерится без краша инициализации', (_name, Comp) => {
    expect(() => renderToString(<Comp {...bag} />)).not.toThrow();
  });
});
