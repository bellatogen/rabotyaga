## Final Prompt
<taskname="Refactor App.jsx монолит"/>

<task>
Рефакторинг монолитного `frontend/src/App.jsx` (1812 строк) в правильную компонентную архитектуру React. Сохранить поведение полностью, убрать дублирование, разбить на модули. Без роутера — навигация остаётся на tab-state.
</task>

<architecture>

## Текущий монолит App.jsx (1812 строк):

**Секции файла:**
- Строки 1–7: Единственный импорт — `import { AdminTab } from "./AdminTab.jsx"` + lucide-react иконки
- Строки 8–191: `const CSS = \`...\`` — ~180 строк CSS в template string (цветовые токены, классы `.app`, `.nav`, `.tabs`, `.task`, `.swipe`, `.modal`, `.cal-*`, анимации, hover-медиа)
- Строки 192–249: Константы: `DAYS_RU`, `MONTHS_RU`, `REPEAT_OPTS`, `DEFAULT_MEMBERS`, `ROLES`, `ALL_PERMS`, `SHIFT_STATUSES`, `HOUR_NORMS`, `HOLIDAYS`, `EMBEDDED_SCHEDULE` (большой JSON 30 дней), `EMBEDDED_EVENTS`
- Строки 250–549: Чистые функции: `buildDaySummary`, `isToday`, `hasPerm`, `staffNorm`, `staffCheck`, `getShiftStatus`, `getActiveCards`, `processCard`, `rateFor`, `progressTrend`, `suspiciousFlags`, `genRecs`, `uid`, `todayStr`, `nowISO`, `hmm`, `fmtDate`, `isDone`, `doneInfo`, `addDays`, `rangeDays`, `nextDue`, `dueLabel`, `afterPushGate`, `PUSH_GATE_MIN`
- Строки 550–619: API-слой inline: `const API="/api"`, `SERVER_OK`, `ld()`, `sv()`, `pingServer()`, `tgBind()`, `applyTheme()`, `usePersist()` hook
- Строки 620–850: `defaultTasks()`, `SEED_TASKS`, `mergeSeeds()`, SVG `Mascot`, `export default function App()` (18+ useState, useEffect, все обработчики событий, вся логика)
- Строки 851–895: JSX рендер вкладок в App() + модалки
- Строки 895–1812: Все компоненты определены ниже App: `RevenueCard`, `TodayTab`, `PersonalCabinet`, `ScheduleTab`, `CalendarTab`, `DayDetail`, `TasksTab` (дубль!), `HoursTab`, `LogsTab`, `StatsTab`, `CardsTab`, `TeamTab`, `TeamHubTab`, `PwdRow`, `PasswordChanger`, `AuthModal`, `TaskCard` (дубль!), `DraggableTaskList`, `SwipeRow`, `DoneAccordion`, `TaskModal`, `CardModal`, `HandoverModal`, `DueRow`, `InboxModal`, `ClosingSummaryModal`, `GoRow`, `GoListInput`, `GoListBlock`, `Ring`, `DashboardTab`

## Tab-роутинг в App():
```js
const tabs = [
  {id:"today", label:"Сегодня"},
  ...(hasPerm(...)?[{id:"tasks", label:"Задачи"}]:[]),
  ...(hasPerm(...)?[{id:"schedule", label:"График"}]:[]),
  ...(canTeam||canStats?[{id:"team", label:"Команда"}]:[]),
  {id:"settings", label:"️ Управление"},
];
```
Tab IDs: **"today", "tasks", "schedule", "team", "settings"** — нет "admin"!

## Уже существующие файлы (не подключены к App.jsx):
- `frontend/src/services/api.js` — ld/sv/kvGet/kvSet, не импортирован (App.jsx использует inline-версии)
- `frontend/src/utils/taskUtils.js` — isToday, isDone, todayStr, getTodayTasks, formatDate — не импортирован
- `frontend/src/components/Common.jsx` — Modal, Alert, Button — не импортирован
- `frontend/src/components/TaskCard.jsx` — TaskCard компонент — не импортирован (App.jsx имеет свой inline TaskCard ~строки 1460)
- `frontend/src/pages/TasksTab.jsx` — мёртвый код, не импортирован; сломанный импорт `import TaskCard from './TaskCard'` (надо `'../components/TaskCard'`)
- `frontend/src/pages/AdminPanel.jsx` — мёртвый код; вызывает `/api/push-log` (→ должно быть `/api/admin/push-logs`), `/api/push-schedule/:date` (→ `/api/admin/schedule`)
- `frontend/src/AdminTab.jsx` — импортирован строка 1, рендерится строка 862

## Бэкенд (для справки о дублировании isToday):
- `rabotyaga-bot/server.js` строка ~72: своя копия `isToday()`
- `rabotyaga-bot/src/push/scheduler.js` строка 23: своя копия `isToday()`
- `rabotyaga-bot/src/api/admin.js` — endpoints: GET/POST `/api/admin/default-templates`, `/api/admin/push-settings`, `/api/admin/schedule`, `/api/admin/push-logs`, GET `/api/admin/employees`
- `rabotyaga-bot/src/api/push.js` — GET `/api/push/stats`, `/api/push/settings`, `/api/push/all`
- `rabotyaga-bot/server.js` — GET `/api/bindings` уже есть (строка ~247)
</architecture>

<selected_context>
frontend/src/App.jsx: полный монолит 1812 строк — CSS (~стр.8–191), константы (~стр.192–249 включая EMBEDDED_SCHEDULE), чистые функции (~стр.250–549), App() компонент (~стр.620–895), все дочерние компоненты (~стр.895–1812)
frontend/src/AdminTab.jsx: единственный внешний импорт в App.jsx — компонент вкладки администратора
frontend/src/components/Common.jsx: Modal, Alert, Button — готово но не используется в App.jsx
frontend/src/components/TaskCard.jsx: TaskCard — готово но не используется; дублируется inline в App.jsx
frontend/src/pages/AdminPanel.jsx: мёртвый код — неверные API пути, не импортирован
frontend/src/pages/TasksTab.jsx: мёртвый код — сломанный импорт TaskCard, не импортирован
frontend/src/services/api.js: ld/sv/kvGet/kvSet — готово но не используется; App.jsx дублирует inline
frontend/src/utils/taskUtils.js: isToday/isDone/todayStr/etc — готово но не используется; App.jsx дублирует inline
frontend/src/index.css: 19 строк минимального CSS + ссылки на CSS-переменные из App.jsx
frontend/src/main.jsx: точка входа, импортирует index.css и App.jsx
frontend/vite.config.js: proxy /api → localhost:3001 (поэтому `const API="/api"` работает)
rabotyaga-bot/server.js: Express+Telegraf 268 строк — исходный isToday() (~стр.72), isDone, todayStr; /api/bindings endpoint существует
rabotyaga-bot/src/push/scheduler.js: копия isToday() на строке 23
rabotyaga-bot/src/api/admin.js: все /api/admin/* endpoints
rabotyaga-bot/src/api/push.js: /api/push/stats — поля ответа: {total, sent, failed, skipped, byUser}
rabotyaga-bot/src/push/sender.js: sendPush, updatePushSettings, getPushLogs и т.д.
CLAUDE.md: полная документация проекта (архитектура, data model, команды)
</selected_context>

<relationships>
- App.jsx → AdminTab.jsx (строка 1 импорт; рендер строка 862 при tab="settings" && isManager)
- App.jsx строка 883: `{tab==="admin"&&isManager&&<AdminTab.../>}` — МЁРТВЫЙ КОД (tab "admin" нет в массиве tabs)
- App.jsx inline `ld()/sv()` ↔ services/api.js `ld()/sv()` — дублирование, нужно объединить
- App.jsx `isToday()` ↔ utils/taskUtils.js `isToday()` ↔ server.js `isToday()` ↔ scheduler.js `isToday()` — 4 копии
- App.jsx `TaskCard` (строка ~1460) ↔ components/TaskCard.jsx — дубль
- App.jsx `TasksTab` (строка ~1289) ↔ pages/TasksTab.jsx — дубль (разные реализации)
- pages/TasksTab.jsx → `import TaskCard from './TaskCard'` (сломан → `'../components/TaskCard'`)
- pages/AdminPanel.jsx → `/api/push-log` (нет, есть `/api/admin/push-logs`) и `/api/push-schedule/:date` (нет, есть `/api/admin/schedule`)
- index.css ← ссылается на `var(--bg)` и другие CSS-переменные определённые в App.jsx (`const CSS`)
- main.jsx → index.css + App.jsx (точка входа)
- vite dev server: proxy `/api/*` → `http://localhost:3001`
- server.js → admin.js (mounted as `/api/admin`) → push.js (mounted as `/api/push`)
</relationships>

<ambiguities>
- **pages/TasksTab.jsx vs inline TasksTab**: В App.jsx (строка ~1289) есть компонент `TasksTab` с простым списком всех задач. В pages/TasksTab.jsx — другая реализация. Нужно выбрать: взять за основу версию из App.jsx (она используется) или слить с pages/TasksTab.jsx.
- **AdminPanel.jsx**: Использует `/api/push-log` и `/api/push-schedule/:date`. Первый не существует точно в этом виде (есть `/api/admin/push-logs`). Второй — `/api/admin/schedule` существует (GET/POST). Нужно либо исправить пути в AdminPanel.jsx, либо добавить aliases в server.js.
- **isToday() в server.js и scheduler.js**: Это Node.js CommonJS файлы — нельзя просто импортировать из taskUtils.js (ESM). Если вынести в canonical источник, нужен либо shared CommonJS файл (`utils/taskUtils.cjs`), либо дублировать с комментарием ссылаясь на источник.
- **EMBEDDED_SCHEDULE**: Огромный JSON в App.jsx (~30 дней данных). В target architecture идёт в `constants/seeds.js`. Данные актуальны только для июня 2026 — возможно стоит просто оставить комментарий что это временные данные.
</ambiguities>


## Selection
- Files: 17 total (17 full)
- Total tokens: 54075 (Auto view)
- Token breakdown: full 54075

### Files
### Selected Files
/Users/pavelfrolov/Desktop/Пивная карта/Софт/rabotyaga/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Common.jsx — 697 tokens (full)
│   │   │   └── TaskCard.jsx — 544 tokens (full)
│   │   ├── pages/
│   │   │   ├── AdminPanel.jsx — 2 521 tokens (full)
│   │   │   └── TasksTab.jsx — 480 tokens (full)
│   │   ├── services/
│   │   │   └── api.js — 515 tokens (full)
│   │   ├── utils/
│   │   │   └── taskUtils.js — 348 tokens (full)
│   │   ├── AdminTab.jsx — 720 tokens (full)
│   │   ├── App.jsx — 39 385 tokens (full)
│   │   ├── index.css — 167 tokens (full)
│   │   └── main.jsx — 60 tokens (full)
│   └── vite.config.js — 88 tokens (full)
├── rabotyaga-bot/
│   ├── src/
│   │   ├── api/
│   │   │   ├── admin.js — 806 tokens (full)
│   │   │   └── push.js — 464 tokens (full)
│   │   └── push/
│   │       ├── scheduler.js — 1 392 tokens (full)
│   │       └── sender.js — 1 163 tokens (full)
│   └── server.js — 2 896 tokens (full)
└── CLAUDE.md — 1 829 tokens (full)


---

## Generated Plan

## Chat Send ✅
- **Chat**: `refactor-app-jsx-монолит-EDD053` | **Mode**: plan

### Response
# Rabotyaga App.jsx Refactor Plan

---

## Summary

Decompose the 1812-line `App.jsx` monolith into a proper module tree while preserving **all behavior exactly**. Approach: targeted extraction (no logic changes, no new abstractions) over ~27 atomic steps, each independently buildable. The existing stubs in `services/api.js`, `utils/taskUtils.js`, `components/Common.jsx`, `components/TaskCard.jsx`, `pages/TasksTab.jsx`, and `pages/AdminPanel.jsx` are either canonical replacements, dead code to overwrite, or contain divergent implementations — each case resolved explicitly below.

---

## Current-State Analysis

### Responsibility map of App.jsx

| Lines | Kind | Content |
|-------|------|---------|
| 1–7 | Import | Only `AdminTab.jsx` + lucide-react icons |
| 8–191 | CSS string | `const CSS` — `:root` vars, all class definitions, media queries |
| 192–249 | Constants | `DAYS_RU`, `MONTHS_RU`, `REPEAT_OPTS`, `DEFAULT_MEMBERS`, `ROLES`, `ALL_PERMS`, `SHIFT_STATUSES`, `HOUR_NORMS`, `EMBEDDED_SCHEDULE` (large JSON), `EMBEDDED_EVENTS`, `HOLIDAYS` |
| 250–549 | Pure functions | ~25 utility functions covering task logic, staff logic, stats, card processing |
| 550–619 | API + hooks | Inline `ld()`, `sv()`, `pingServer()`, `lsGet/lsSet`, `SERVER_OK`, `usePersist()`, `tgBind()`, `applyTheme()` |
| 620–850 | Data seeds + `App()` | `defaultTasks`, `SEED_TASKS`, `mergeSeeds`, `Mascot` SVG, `App()` component (18 `useState`, 5+ `useEffect`, all event handlers) |
| 851–895 | App render | JSX tab renders + modal dispatch (includes dead `{tab==="admin"&&isManager&&<AdminTab.../>}` at line 883) |
| 895–1812 | Child components | ~30 component functions defined after `App()` |

### Existing files — status

| File | Status | Action |
|------|--------|--------|
| `services/api.js` | Partial — has `kvGet/kvSet` (throw-on-fail), endpoint helpers; missing `ld/sv/pingServer/tgBind` | Extend with missing functions, fix 2 wrong paths |
| `utils/taskUtils.js` | Partial — has `isToday`, `isDone`, `todayStr`, `getTodayTasks`, `formatDate` | Extend with `nextDue`, `dueLabel`, `buildDaySummary`, `doneInfo` |
| `components/Common.jsx` | Good but unused in App.jsx — `Modal`/`Alert`/`Button` for AdminPanel only | No change needed |
| `components/TaskCard.jsx` | Dead/simpler version — missing drag handle, `onHandover`, pills, swipe integration | Replace with App.jsx's version |
| `pages/TasksTab.jsx` | Dead code — broken import (`./TaskCard` should be `../components/TaskCard`), self-manages data fetching (wrong pattern for this app) | Replace entirely with App.jsx's prop-driven version |
| `pages/AdminPanel.jsx` | Dead code — calls `/api/push-log` (→ `/api/admin/push-logs`) and `/api/push-schedule/:date` (→ `/api/admin/schedule`) | Fix API paths |
| `AdminTab.jsx` | Working, correctly imported at line 1 | No change |

### Duplication map

- **`isToday()`**: 4 copies — App.jsx, `utils/taskUtils.js`, `server.js:72`, `scheduler.js:23`. Frontend refactor makes `utils/taskUtils.js` the single frontend source. Backend copies stay (CommonJS vs ESM boundary — note this in comments but don't unify in this PR).
- **`ld()/sv()`**: 2 copies — App.jsx inline, `services/api.js` has `kvGet/kvSet` (different semantics: throw vs fallback). Unify by adding `ld/sv` to `services/api.js`.
- **`isDone()`**: App.jsx inline + `utils/taskUtils.js` — identical. Remove App.jsx copy, import from utils.
- **`TaskCard`**: App.jsx inline (feature-rich) + `components/TaskCard.jsx` (simplified). App.jsx version wins.

### Dead code to remove

- Line 883: `{tab==="admin"&&isManager&&<AdminTab.../>}` — tab `"admin"` is never in the `tabs` array. Remove.
- `pages/TasksTab.jsx` (full replacement, not deletion)
- `const FONTS = \`\`` — empty string, never used

---

## Design

### 1. CSS — `src/styles/app.css`

**Why a file, not `<style>` injection**: Vite processes it identically; HMR works on the CSS file; DevTools shows source; no React re-render needed for style changes.

Convert `const CSS = \`...\`` template string verbatim to `src/styles/app.css`. CSS contains no JS expressions — it's pure static CSS with `var()` tokens. Remove `const FONTS`, `const CSS`, and `<style>{CSS}</style>` from App.jsx. Add `import './styles/app.css'` to App.jsx.

`index.css` references `var(--bg)` — this works because both files are bundled into the same stylesheet cascade. No order dependency since `:root` definitions are in `app.css` and `index.css` only uses variables.

### 2. Constants — `src/constants/`

Five files, no circular dependencies:

**`constants/roles.js`** — exports `ROLES`, `ALL_PERMS`. No imports.

**`constants/shifts.js`** — exports `SHIFT_STATUSES`. No imports.

**`constants/locale.js`** — exports `DAYS_RU`, `DOW_FULL`, `MONTHS_RU`, `REPEAT_OPTS`, `DEFAULT_MEMBERS`, `DEFAULT_PROFILES`. Imports `{ ROLES }` from `./roles` (needed for `DEFAULT_PROFILES` computation).

**`constants/schedule.js`** — exports `EMBEDDED_SCHEDULE`, `EMBEDDED_EVENTS`, `HOLIDAYS`. No imports. Add comment that `EMBEDDED_SCHEDULE` covers June 2026 and is candidate for a server-editable store.

**`constants/staff.js`** — exports `HOUR_NORMS`, `DEFAULT_HOUR_NORM`, `hourNorm`. No imports. These are month-hour corridor specs per employee.

**`constants/seeds.js`** — exports `SEED_TASKS`, `defaultTasks()`, `mergeSeeds()`. Imports `{ uid }` from `../utils/dateUtils`. `defaultTasks()` calls `uid()` to generate fresh IDs at boot time. `SEED_TASKS` uses stable string IDs (`"seed-nuts"` etc.) — no `uid()` needed there.

### 3. Utils — extend existing + new files

**`utils/taskUtils.js`** (extend existing):

Add to existing file:
- `doneInfo(v)` — currently inline in App.jsx, identical shape to existing `isDone`
- `nextDue(task, fromDs)` — requires `addDays` from `dateUtils`
- `dueLabel(task, ds)` — requires `REPEAT_OPTS` from `constants/locale`, `fmtDate` from `dateUtils`, `nextDue`
- `buildDaySummary(tasks, history, ds)` — requires `isToday`, `isDone`

Import chain: `taskUtils.js → { REPEAT_OPTS } from '../constants/locale'`, `taskUtils.js → { fmtDate, addDays } from './dateUtils'`.

Note: existing `formatDate` in `taskUtils.js` uses `toLocaleDateString` (different output format from App.jsx's `fmtDate` which uses `MONTHS_RU`). Keep both — `formatDate` is the existing export, `fmtDate` lives in `dateUtils.js`. No conflict.

**`utils/dateUtils.js`** (new):

```
exports: uid, nowISO, hmm, fmtDate, addDays, rangeDays
imports: { MONTHS_RU } from '../constants/locale'
```

`fmtDate(ds)` uses `MONTHS_RU[d.getMonth()]` — same as App.jsx's inline version.
`uid()` — `Math.random().toString(36).slice(2,9)`.

**`utils/authUtils.js`** (new):

```
exports: hasPerm, canManageAccounts, canViewPasswords, accountLabel
imports: none (all logic is on passed params)
```

Pure functions with no external deps. `accountLabel(acc)` converts `"manager"/"developer"` to display strings.

**`utils/staffUtils.js`** (new):

```
exports: PUSH_GATE_MIN, afterPushGate, staffNorm, staffCheck, getShiftStatus
imports: { HOLIDAYS } from '../constants/schedule'
         { hmm, addDays } from './dateUtils'
```

`staffNorm(ds, events)` receives `events` as param (not importing `EMBEDDED_EVENTS` directly) — preserves the existing API where caller decides which events object to pass.

**`utils/cardUtils.js`** (new):

```
exports: getActiveCards, processCard
imports: { uid, todayStr, addDays } from './dateUtils'
```

**`utils/statsUtils.js`** (new):

```
exports: rateFor, progressTrend, suspiciousFlags, genRecs
imports: { isToday, isDone, doneInfo } from './taskUtils'
         { rangeDays, addDays, fmtDate } from './dateUtils'
         { getActiveCards } from './cardUtils'
         { ROLES } from '../constants/roles'
         { SHIFT_STATUSES } from '../constants/shifts'
```

`genRecs` is the most import-heavy function — needs `rateFor`, `progressTrend`, `suspiciousFlags`, `rangeDays`, `getActiveCards`, `ROLES`, `SHIFT_STATUSES`, `fmtDate`. All in same file except imports above. No circular deps.

**`utils/theme.js`** (new):

```
exports: THEME_KEY, systemPrefersLight, applyTheme
imports: none
```

`systemPrefersLight()` reads `window.Telegram?.WebApp?.colorScheme` directly (same as App.jsx's TG constant pattern). Avoids passing TG as param.

```js
// shape
export const THEME_KEY = 'rab:theme_pref';
export function systemPrefersLight() { /* reads window.Telegram?.WebApp?.colorScheme */ }
export function applyTheme(pref) { /* resolves "auto"|"light"|"dark", sets data-theme */ }
```

### 4. Services — `src/services/api.js` (extend)

Add to existing file:

```js
// module-level — internal to this module, not exported
const API = '/api';
let SERVER_OK = null;

// localStorage helpers (private)
const _lsk = k => 'rab:' + k;
function lsGet(k, fb) { ... }
function lsSet(k, v) { ... }

// new exports
export async function ld(k, fb) { /* server-first, localStorage fallback, sets SERVER_OK */ }
export async function sv(k, v) { /* lsSet immediately, then PUT, sets SERVER_OK */ }
export async function pingServer() { /* fetch /api/health, sets SERVER_OK, returns bool */ }
export async function tgBind(name, telegramId) { /* telegramId passed by caller */ }
```

`SERVER_OK` stays module-internal. `ld`/`sv`/`pingServer` set it as side effect. App.jsx gets server status from `pingServer()` return value → React state. No need to export `SERVER_OK`.

**Fix existing endpoints in this file:**

| Current | Fixed | Reason |
|---------|-------|--------|
| `getPushLog`: `GET /api/push-log` | `GET /api/admin/push-logs` | Matches `admin.js` router |
| `getPushSchedule`: `GET /api/push-schedule/${date}` | `GET /api/admin/schedule` | No per-date schedule endpoint exists; admin.js returns full schedule object |
| `setPushSchedule`: `POST /api/push-schedule` | `POST /api/admin/schedule` | Matching correction |

> **Unknown to validate**: `getBindings(token)` currently hits `/api/bindings?token=${token}`. `server.js` has `/api/bindings` with no token check. Verify during implementation whether AdminPanel needs to pass token at all — backend ignores it currently.

### 5. Hooks — `src/hooks/usePersist.js`

```js
import { useEffect, useRef } from 'react';
import { sv } from '../services/api';

export function usePersist(key, value, ready) {
  const first = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (first.current) { first.current = false; return; }
    sv(key, value);
  }, [value, ready]);
}
```

The `first.current` guard — skips writing on first effect run after load to prevent echoing freshly-loaded data back to server. This must be preserved exactly. Each `usePersist` call gets its own `first` ref (per React rules).

### 6. Components — `src/components/`

**`Mascot.jsx`** (new) — Pure SVG component. Props: `{size=24, color="var(--cu)"}`.

**`TaskCard.jsx`** (replace existing) — Use App.jsx's feature-rich version. Props: `{task, done, onToggle, onEdit, onHandover, highlight, dragHandle, dragging}`. The existing simple version in `components/TaskCard.jsx` is discarded — it lacks drag handle, swipe integration, `@mention` pill, `isReport` star, highlight border.

**`SwipeRow.jsx`** (new) — Swipe gesture handler. Props: `{children, onArchive, onDelete}`. Uses `useRef`, `useState` for pointer tracking. Captures pointer on horizontal drag detection.

**`DraggableTaskList.jsx`** (new) — Props: `{tasks, onReorder, onToggle, onEdit, onHandover, doneMap, onDelete, onArchive}`. Uses FLIP animation via `useLayoutEffect`. Imports `TaskCard`, `SwipeRow`.

**`DoneAccordion.jsx`** (new) — Collapsible done-tasks section. Imports `TaskCard`, `SwipeRow`.

**`GoList.jsx`** (new) — Exports `GoRow`, `GoListInput`, `GoListBlock`. Self-contained, no external component deps.

**`RevenueCard.jsx`** (new) — Shared between `TodayTab` and `DayDetail`. Props: `{date, revenue}`.

**`DueRow.jsx`** (new) — Shared between `PersonalCabinet` (subtab "tasks") and `InboxModal`. Props: `{task, history, ds, onToggle}`. Imports `{ dueLabel, isDone }` from utils.

**`Ring.jsx`** (new) — SVG donut ring for dashboard. Props: `{pct, color, top, bottom}`. Pure visual, no deps.

### 7. Pages — `src/pages/`

**`TodayTab.jsx`** (new) — Exports `TodayTab`. Same prop interface as App.jsx's inline version (24 props). Imports `RevenueCard`, `GoListBlock`, `DraggableTaskList`, `DoneAccordion`, staff utils, shift constants.

**`TasksTab.jsx`** (replace dead code) — Replace `pages/TasksTab.jsx` entirely with App.jsx's prop-driven version: `function TasksTab({tasks, doneMap, onToggle, onEdit, onArchive})`. Remove the dead self-contained version that tried to fetch its own data. Imports `TaskCard`, `DoneAccordion`, `SwipeRow`.

**`ScheduleTab.jsx`** (new) — Exports `ScheduleTab`. Contains: `ScheduleTab` (sub-tab switcher), `CalendarTab`, `DayDetail`, `DashboardTab`, `HoursTab`. Rationale for keeping these together: they all relate to schedule/calendar views and are not shared outside this context. `DayDetail` uses `RevenueCard` (import). `DashboardTab` uses `Ring` (import).

**`PersonalCabinet.jsx`** (new) — Exports `PersonalCabinet`. Contains `PasswordChanger` (only used here). Imports `DueRow`, all stats utils, `LogsTab` from `TeamHubTab.jsx`.

> **Dependency note**: `PersonalCabinet` renders `LogsTab` (via subtab `"log"`). `LogsTab` is extracted into `TeamHubTab.jsx`. Options: (a) export `LogsTab` from `TeamHubTab.jsx`, (b) extract `LogsTab` to its own file. Prefer option (b): `pages/LogsTab.jsx` as a standalone export. `PersonalCabinet` and `TeamHubTab` both import it.

**`pages/LogsTab.jsx`** (new, standalone) — Extracted from App.jsx. Props: `{tasks, history, members, who, isManager, ds, eventsLog}`. Imports `{ isToday, isDone, doneInfo }` from utils.

**`TeamHubTab.jsx`** (new) — Exports `TeamHubTab`. Contains `TeamTab`, `StatsTab`, `CardsTab`, `PwdRow`. Imports `LogsTab`. `PwdRow` only used in `TeamTab` → defined in same file, not exported.

**`AdminPanel.jsx`** (fix paths only) — Keep component structure, fix API calls via updated `services/api.js`. No UI changes.

### 8. Modals — `src/modals/`

Six files, each default-exporting one modal component:

| File | Component | Notable imports |
|------|-----------|-----------------|
| `TaskModal.jsx` | `TaskModal` | `REPEAT_OPTS`, `DAYS_RU`, `addDays`, member list |
| `CardModal.jsx` | `CardModal` | lucide icons only |
| `HandoverModal.jsx` | `HandoverModal` | `addDays`, `fmtDate` |
| `InboxModal.jsx` | `InboxModal` | `DueRow`, `dueLabel` |
| `ClosingSummaryModal.jsx` | `ClosingSummaryModal` | `fmtDate`, `isDone` |
| `AuthModal.jsx` | `AuthModal` | `accountLabel` from authUtils |

### 9. `App.jsx` — post-refactor shape

After extraction, `App.jsx` contains only:

```jsx
// ~15 imports (React hooks, lucide icons, all pages, all modals, AdminTab, utils, services)
import './styles/app.css';

const TG = (typeof window !== 'undefined' && window.Telegram) ? window.Telegram.WebApp : null;
function tgUserId() { try { return TG?.initDataUnsafe?.user?.id || null; } catch { return null; } }

export default function App() {
  // 18 useState declarations
  // useEffect: TG init, theme, server ping, initial data load
  // usePersist calls (16 of them)
  // computed values (isManager, isDeveloper, myStatus, todayTasks, doneToday, etc.)
  // event handlers (toggle, saveTask, delTask, archiveTask, issueCard, etc.)
  // loading render
  // picking render
  // viewingDay render
  // viewingEmployee render
  // main render (nav + tabs + tab content + modals)
}
```

Target size: ~250–300 lines. The tab render no longer has any inline component definitions.

**Remove dead code at line 883:**
```jsx
// DELETE THIS LINE:
{tab==="admin"&&isManager&&<AdminTab auth={auth} members={members} ds={ds}/>}
```

`AdminTab` already renders correctly at line 862 via `tab==="settings"&&isManager&&<AdminTab.../>`.

---

## File-by-File Impact

| File | Change | Why | Deps on other changes |
|------|--------|-----|-----------------------|
| `src/styles/app.css` | **NEW** | CSS extraction | None |
| `src/constants/locale.js` | **NEW** | Constant extraction | Needs `roles.js` |
| `src/constants/roles.js` | **NEW** | Constant extraction | None |
| `src/constants/shifts.js` | **NEW** | Constant extraction | None |
| `src/constants/schedule.js` | **NEW** | Constant extraction | None |
| `src/constants/staff.js` | **NEW** | Constant extraction | None |
| `src/constants/seeds.js` | **NEW** | Data seeds extraction | Needs `dateUtils.js` for `uid` |
| `src/utils/dateUtils.js` | **NEW** | Utility extraction | Needs `locale.js` for `MONTHS_RU` |
| `src/utils/taskUtils.js` | **EXTEND** | Add `nextDue`, `dueLabel`, `buildDaySummary`, `doneInfo` | Needs `dateUtils.js`, `locale.js` |
| `src/utils/authUtils.js` | **NEW** | Utility extraction | None |
| `src/utils/staffUtils.js` | **NEW** | Utility extraction | Needs `dateUtils.js`, `schedule.js` |
| `src/utils/cardUtils.js` | **NEW** | Utility extraction | Needs `dateUtils.js` |
| `src/utils/statsUtils.js` | **NEW** | Utility extraction | Needs all utils above |
| `src/utils/theme.js` | **NEW** | Theme logic extraction | None |
| `src/hooks/usePersist.js` | **NEW** | Hook extraction | Needs `services/api.js` (`sv`) |
| `src/services/api.js` | **EXTEND + FIX** | Add `ld/sv/pingServer/tgBind`, fix 3 wrong paths | None |
| `src/components/Mascot.jsx` | **NEW** | Component extraction | None |
| `src/components/TaskCard.jsx` | **REPLACE** | Rich version replaces simple stub | None |
| `src/components/SwipeRow.jsx` | **NEW** | Component extraction | None |
| `src/components/DraggableTaskList.jsx` | **NEW** | Component extraction | Needs `TaskCard`, `SwipeRow` |
| `src/components/DoneAccordion.jsx` | **NEW** | Component extraction | Needs `TaskCard`, `SwipeRow` |
| `src/components/GoList.jsx` | **NEW** | Component extraction | None |
| `src/components/RevenueCard.jsx` | **NEW** | Shared by TodayTab + DayDetail | Needs `dateUtils.js` |
| `src/components/DueRow.jsx` | **NEW** | Shared by PersonalCabinet + InboxModal | Needs `taskUtils.js` |
| `src/components/Ring.jsx` | **NEW** | Component extraction | None |
| `src/pages/TodayTab.jsx` | **NEW** | Page extraction | Needs leaf components + utils |
| `src/pages/TasksTab.jsx` | **REPLACE** | Replace dead code with canonical version | Needs `TaskCard`, `DoneAccordion` |
| `src/pages/ScheduleTab.jsx` | **NEW** | Page extraction | Needs `Ring`, `RevenueCard` |
| `src/pages/PersonalCabinet.jsx` | **NEW** | Page extraction | Needs `DueRow`, `LogsTab`, stats utils |
| `src/pages/LogsTab.jsx` | **NEW** | Extracted standalone (shared by PersonalCabinet + TeamHubTab) | Needs taskUtils |
| `src/pages/TeamHubTab.jsx` | **NEW** | Page extraction | Needs `LogsTab`, stats utils |
| `src/pages/AdminPanel.jsx` | **FIX paths** | Wrong API paths in 3 fetch calls | Needs `services/api.js` path fixes |
| `src/modals/TaskModal.jsx` | **NEW** | Modal extraction | Needs locale constants, dateUtils |
| `src/modals/CardModal.jsx` | **NEW** | Modal extraction | None |
| `src/modals/HandoverModal.jsx` | **NEW** | Modal extraction | Needs dateUtils |
| `src/modals/InboxModal.jsx` | **NEW** | Modal extraction | Needs `DueRow` |
| `src/modals/ClosingSummaryModal.jsx` | **NEW** | Modal extraction | Needs taskUtils, dateUtils |
| `src/modals/AuthModal.jsx` | **NEW** | Modal extraction | Needs `authUtils` |
| `src/App.jsx` | **MAJOR REWRITE** | Remove everything extracted, remove dead code at line 883 | All above changes |
| `src/AdminTab.jsx` | **NO CHANGE** | Already correct | None |
| `src/index.css` | **NO CHANGE** | `var(--bg)` refs work after CSS moves to `app.css` | None |
| `src/main.jsx` | **NO CHANGE** | Entry point unchanged | None |
| `frontend/vite.config.js` | **NO CHANGE** | Proxy config unchanged | None |
| All backend files | **NO CHANGE** | Frontend refactor only; `isToday` duplication noted with comments | None |

---

## Risks and Migration

### Behavioral risk: CSS injection → file import

**Risk**: `<style>{CSS}</style>` was injected inside React component tree — it exists as a DOM node scoped under `#root`. A real CSS import is injected in `<head>`. Specificity is identical (no inline styles involved). The only behavioral difference: without `<style>` injection, styles exist from page load rather than after React first render. This is strictly better — eliminates FOUC.

**Validation**: After step 1, visually inspect all tabs, dark/light/auto theme switching, and hover states.

### Behavioral risk: `TaskCard` replacement

`components/TaskCard.jsx` currently isn't used anywhere meaningful (dead code). After replacement, the new rich version exports `TaskCard` with the full App.jsx signature. The old `pages/TasksTab.jsx` imports `TaskCard` from `'./TaskCard'` (broken path). Both get replaced together in the same step — no partial state.

### Unknown: `AdminPanel.jsx` schedule endpoint shape mismatch

`AdminPanel.jsx` renders schedule as per-day push items `{time, recipient, text}[]`, but `/api/admin/schedule` actually returns `{dayBeforeShift: {time, enabled}, personalTasks: {time, enabled}, closeShiftReminder: {time, enabled}}`. The UI concept doesn't match the backend model. Since `AdminPanel.jsx` is currently dead code (never rendered), fixing API paths does not fix this conceptual mismatch. The plan only fixes paths — the UI mismatch is a separate feature task.

**Flag for implementer**: After path fix, `AdminPanel.jsx` will call the correct endpoint but render incorrectly for the push-schedule tab. This is acceptable since it's still not rendered in the live app.

---

## Implementation Order

Each step: create/modify file → verify Vite build passes → optionally test in browser.

1. **Create `src/styles/app.css`** — copy CSS string content verbatim. Add `import './styles/app.css'` to App.jsx. Remove `const FONTS`, `const CSS`, `<style>{CSS}</style>`. *(Compilable; verify theme switching works.)*

2. **Create `src/constants/roles.js`** — extract `ROLES`, `ALL_PERMS`.

3. **Create `src/constants/shifts.js`** — extract `SHIFT_STATUSES`.

4. **Create `src/constants/locale.js`** — extract locale arrays + `DEFAULT_MEMBERS` + `DEFAULT_PROFILES`. Import `ROLES` from `./roles`.

5. **Create `src/constants/schedule.js`** — extract `EMBEDDED_SCHEDULE`, `EMBEDDED_EVENTS`, `HOLIDAYS`.

6. **Create `src/constants/staff.js`** — extract `HOUR_NORMS`, `DEFAULT_HOUR_NORM`, `hourNorm`.

7. **Create `src/utils/dateUtils.js`** — extract `uid`, `nowISO`, `hmm`, `fmtDate`, `addDays`, `rangeDays`. Import `MONTHS_RU` from `constants/locale`.

8. **Create `src/constants/seeds.js`** — extract `SEED_TASKS`, `defaultTasks()`, `mergeSeeds()`. Import `uid` from `utils/dateUtils`.

9. **Extend `src/utils/taskUtils.js`** — add `doneInfo`, `nextDue`, `dueLabel`, `buildDaySummary`. Import `REPEAT_OPTS` from `constants/locale`, `fmtDate`/`addDays` from `dateUtils`. *(Keep all existing exports.)*

10. **Create `src/utils/authUtils.js`** — extract `hasPerm`, `canManageAccounts`, `canViewPasswords`, `accountLabel`.

11. **Create `src/utils/staffUtils.js`** — extract `PUSH_GATE_MIN`, `afterPushGate`, `staffNorm`, `staffCheck`, `getShiftStatus`.

12. **Create `src/utils/cardUtils.js`** — extract `getActiveCards`, `processCard`.

13. **Create `src/utils/statsUtils.js`** — extract `rateFor`, `progressTrend`, `suspiciousFlags`, `genRecs`.

14. **Create `src/utils/theme.js`** — extract `THEME_KEY`, `systemPrefersLight`, `applyTheme`.

15. **Extend `src/services/api.js`** — add `ld`, `sv`, `pingServer`, `tgBind`, `lsGet`, `lsSet`, `SERVER_OK` (internal). Fix 3 wrong endpoint paths.

16. **Create `src/hooks/usePersist.js`** — extract `usePersist`. Import `sv` from `services/api`.

17. **Update App.jsx imports (step 2–16 results)** — App.jsx now imports all constants/utils/services/hooks from their new locations. Remove all inline definitions that were extracted. *(This step makes App.jsx compilable without any component extraction yet. Verify full app runs.)*

18. **Create `src/components/Mascot.jsx`**. Update App.jsx import.

19. **Replace `src/components/TaskCard.jsx`** with App.jsx's rich version.

20. **Create `src/components/SwipeRow.jsx`**. Remove inline in App.jsx, import.

21. **Create `src/components/DraggableTaskList.jsx`**. Remove inline in App.jsx, import.

22. **Create `src/components/DoneAccordion.jsx`**. Remove inline in App.jsx, import.

23. **Create `src/components/GoList.jsx`** — exports `GoRow`, `GoListInput`, `GoListBlock`. Remove inlines in App.jsx, import.

24. **Create `src/components/RevenueCard.jsx`**. Remove inline in App.jsx, import.

25. **Create `src/components/DueRow.jsx`**. Remove inline in App.jsx, import.

26. **Create `src/components/Ring.jsx`**. Remove inline in App.jsx, import.

27. **(Atomic pair) Create `src/modals/` — all 6 modal files + update App.jsx modal imports.** These must land together since App.jsx's modal dispatch references all 6. Remove 6 inline component definitions from App.jsx.

28. **Create `src/pages/TodayTab.jsx`**. Remove `TodayTab` inline from App.jsx, import.

29. **Replace `src/pages/TasksTab.jsx`** with canonical prop-driven version. Fix import path for `TaskCard`.

30. **Create `src/pages/ScheduleTab.jsx`** — includes `ScheduleTab`, `CalendarTab`, `DayDetail`, `DashboardTab`, `HoursTab`. Remove inlines from App.jsx, import `ScheduleTab`.

31. **Create `src/pages/LogsTab.jsx`** — standalone export.

32. **Create `src/pages/PersonalCabinet.jsx`** — includes `PersonalCabinet`, `PasswordChanger`. Import `LogsTab`, `DueRow`. Remove inlines from App.jsx, import.

33. **Create `src/pages/TeamHubTab.jsx`** — includes `TeamHubTab`, `TeamTab`, `StatsTab`, `CardsTab`, `PwdRow`. Import `LogsTab`. Remove inlines from App.jsx, import.

34. **Fix `src/pages/AdminPanel.jsx`** — update 3 API call paths.

35. **Final App.jsx cleanup** — remove dead `{tab==="admin"&&isManager&&<AdminTab.../>}` at line 883. Verify App.jsx is ~250 lines, no inline component definitions remain, no unused imports.

36. **Verify no regressions** — smoke test: all 5 tabs render for manager role, task toggle persists, theme cycling works, server connectivity indicator updates, drag-to-reorder works, swipe-to-archive works.

> Steps 2–16 (constants/utils/services) can be batched into one PR since they don't touch JSX. Steps 18–26 (leaf components) can be a second PR. Steps 27–35 (pages + final cleanup) are a third PR. Steps 28–33 have no ordering constraint among themselves — each is independently safe to extract.


> 💡 Continue this plan conversation with ask_oracle(chat_id: "refactor-app-jsx-монолит-EDD053", new_chat: false)