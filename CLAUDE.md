# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent self-assessment rule (ALWAYS ACTIVE)

Before delivering any implementation, Claude must self-assess quality on a 100-point scale covering: correctness, security, edge cases, consistency with existing code, no regressions. If score < 95 → iterate silently until 95–98 before presenting output. Never ship below 95. State the score when presenting completed work.

## What this is

"Работяга" — Telegram Mini App for bar shift management (tasks, schedule, hours, "yellow/orange/red card" discipline system, revenue tracking). Two independent halves: a React frontend (Vite) and a small Express + Telegraf bot backend. Russian-language UI and code comments throughout — keep new UI strings/comments in Russian to match.

## Commands

Frontend (`frontend/`):
- `npm run dev` — Vite dev server on :5173 (proxies `/api/*` to `http://localhost:3001`, see `vite.config.js`)
- `npm run build` — production build
- `npm run lint` — ESLint
- No test suite exists in this repo.

Backend (`rabotyaga-bot/`):
- `npm start` (or `node server.js`) — runs Express API + Telegraf bot together on port 3001
- Requires `.env` with `TELEGRAM_TOKEN` (required) and `WEBAPP_URL` (optional — without it the bot's menu button won't appear)

To run the full app locally: start `rabotyaga-bot` first (port 3001), then `frontend` (port 5173) which proxies API calls to it.

## Deployment (planned, not yet wired up)

Target host: **Timeweb**, domain **rabotyaga55.ru**. Not deployed yet — no `Procfile`/`railway.toml`/Dockerfile in the repo. `server.js` still hardcodes port 3001 and `data.json`'s local path; before deploying it'll need `process.env.PORT` / a configurable data dir, and to serve `frontend/dist` as static + SPA fallback so frontend+backend share one origin.

## Architecture

### Frontend is one file
Nearly the entire app lives in `frontend/src/App.jsx` (~1700 lines): all CSS (as a template-string injected via `<style>`), all business logic, and ~30 component functions, all in one module. There is no router — navigation is tab-state (`tab` in the root `App` component) switching which component renders. When making changes, search within this file rather than expecting a conventional multi-file component tree.

`rabotyaga-bot/shift-tasks.jsx` is an **earlier, unused copy** of this same app (slightly different CSS palette/feature set). It is not imported by `server.js` or anything else — don't edit it expecting it to affect the running app; treat it as historical reference only, or ask the user before touching it.

### Data model & persistence (read this before changing storage logic)
- Source of truth is the backend's flat KV store (`rabotyaga-bot/data.json`, written via debounced `fs.writeFileSync`), accessed through `GET/PUT /api/kv/:key`. Values are JSON-stringified blobs keyed by names like `tasks:v4`, `done:hist:v2`, `profiles:v1`, `schedule:v1`, `cards:v1`, etc. (see the `Promise.all([ld(...)])` block in `App.jsx`).
- `localStorage` (prefixed `rab:`) is a **per-device fallback/cache**, not the primary store — `ld()` reads server-first and falls back to local on failure; `sv()` writes to both. `SERVER_OK` tracks reachability and drives the connectivity dot in the nav bar.
- `usePersist(key, value, ready)` skips writing on the first effect run after load, specifically to avoid echoing a freshly-loaded snapshot back to the server and clobbering concurrent edits from another device.
- Versioned key suffixes (`:v1`, `:v2`, `:v4`) are bumped manually when the shape of stored data changes — when changing a data shape, bump the suffix rather than mutating in place, and merge/migrate old data if needed (see `mergeSeeds()` for the pattern used to add new seed tasks without clobbering user customizations).

### Task system
Tasks (`tasks:v4`) have a `repeat` mode (`opening`/`closing`/`daily`/`workday`/`weekly`/`once`) or `kind:"irregular"` (backlog items with no schedule). `isToday(task, dateStr)` is the single function that decides whether a task applies to a given date — both frontend (`App.jsx`) and backend (`server.js`, duplicated logic for the `/today` bot command) implement this the same way; if you change the rule, update both.

Completion is tracked in `done:hist:v2`, keyed `${taskId}::${dateStr}` (or `${taskId}::irregular`), storing either `true` or `{done, ts, by}`.

### Roles & permissions
Three roles (`ROLES` in `App.jsx`): `barman`, `head_barman`, `manager` (plus a hardcoded `developer` super-account). Permissions are an allowlist of perm strings or `"*"`; `hasPerm(who, profiles, perm)` is the gate used throughout to decide which tabs/actions render. Auth itself is a plaintext password map (`auth:v1`) — there's a `// SERVER:` comment marking this as intentionally a stub for the real (bcrypt + session token) implementation.

### Shift status & staffing rules
`getShiftStatus()` derives a person's current status (`on_shift`/`today_shift`/`worked`/`day_off`/etc.) from `schedule:v1` plus manual `statusOverrides` (for sick days/vacation/etc., which take precedence). `staffNorm()`/`staffCheck()` encode the bar's staffing requirements (3 people from 18:00 on Wed/Fri/Sat/holidays/certain events, else 2) — `HOLIDAYS` and `EMBEDDED_EVENTS` are hardcoded 2026 reference data marked `// SERVER:` for eventual move to an editable store.

### Shift-closing flow
When all of a day's regular (non-irregular) tasks are marked done, the day is considered "closed" (`dayClosed`). A closing push/summary only fires after 23:30 (`PUSH_GATE_MIN`/`afterPushGate()`) — both as an automatic popup on the frontend and (per code comments) as a planned Telegram push to managers. `carryOver()` clones unfinished tasks into tomorrow with a `[Перенос]` prefix.

### Telegram integration
`window.Telegram.WebApp` (aliased `TG`) is used for Mini App init (`TG.ready()/expand()`) and to read the Telegram user id (`tgUserId()`), which is POSTed to `/api/bind` to link a chosen in-app name to a Telegram chat id — this is what lets the bot DM that person later via `sendToName()` in `server.js`. Test this flow only inside actual Telegram (ngrok tunnel + bot), not a plain browser — `tgUserId()` returns null outside Telegram.

### Push notifications
`rabotyaga-bot/src/push/sender.js` is the single chokepoint all pushes go through (`sendPush()`); the per-event helpers (`sendDayBeforeShiftPush`, `sendPersonalTasksPush`, `sendCloseShiftPush`, `sendIndividualPush`) all call into it. `sendPush()` retries up to 3 times with linear backoff (1s × attempt), skipping retries on a 403 (user blocked the bot) since that's permanent. Every attempt — sent, failed, or skipped (pushes disabled) — is appended to `rabotyaga-bot/push-log.json` (separate from `data.json`, not versioned with the KV store). `src/push/scheduler.js` ticks every minute and fires the three scheduled jobs at fixed times (20:00 day-before-shift, 09:00 personal tasks, 22:00 close-shift reminder) — it duplicates `isToday()` from `App.jsx`/`server.js` a third time, so a fourth place to update if the day-matching rule changes. `GET /api/push/stats` (`src/api/push.js`) reads `push-log.json` and returns total/sent/failed/skipped counts plus a per-user breakdown.

### Единый источник правды для аналитики (ОБЯЗАТЕЛЬНО)

**Запрещено показывать одни и те же итоговые метрики из двух разных источников одновременно.**

Иерархия источников:
1. **iiko / `revenue:v1`** — единственный источник для отображения: выручка-факт, прогноз, гости, средний чек. Синкается по требованию (кнопка ⬇ iiko) — всегда свежее mozg.
2. **mozg.rest** (`mozg:dashboard:v1`) — НЕ замещает iiko в UI. Используется только как справочный дрифт-индикатор на бэкенде (`server.js`): расхождение ≥5% → принудительный re-sync iiko. Отстаёт до 2 часов.

Правило реализовано в `MonthAnalytics.jsx`: переменные `displayFact/displayFcst/displayGuests/displayCheck` всегда равны iiko-агрегату (`totalFact/projection/totalGuests/avgCheck`). `mozgData` — только для дрифт-бейджа. При добавлении новых метрических блоков — использовать `display*`-переменные.

### iiko OLAP data contract (read before touching `rabotyaga-bot/src/api/iiko.js`)
The revenue/guests/basket analytics come from iikoServer's OLAP report endpoint. The field names and aggregation rules are strict — getting them wrong silently corrupts the numbers or returns HTTP 400.

**Valid OLAP fields** used here:
- `OpenDate.Typed` — order open date (group/filter)
- `OrderNum` — order number; **the only order-level field allowed in `groupByRowFields`** (gives one row per order so `GuestNum` isn't duplicated across a basket's dishes)
- `DishDiscountSumInt` — order fact revenue (aggregate)
- `GuestNum` — guest count (aggregate)
- `DishName`, `DishCategory` — for basket/ABC/margin reports

**Invalid fields — do NOT use** (each breaks a query):
- `Order.Id` → HTTP 400 (not a real OLAP field). Was a wrong guess for order grouping; use `OrderNum`.
- `OrderId` → HTTP 400.
- `UniqOrderId` → "Grouping is not allowed for field UniqOrderId".

**GuestNum contract (regression-critical, commit `69bc3bd`):** cancelled/void orders stay in OLAP with `DishDiscountSumInt = 0` but a **positive `GuestNum`**. Guests must only be summed when `rowFact > 0` (`if (rowFact > 0) guests += Number(row.GuestNum||0)` in `fetchOlapForDate`; `const rowGuests = (useGuests && rowFact > 0) ? … : 0` in the `syncRevenueRange` accumulator). Summing unconditionally inflated guests ~3% (139 phantom guests in June 2026) and skewed the average check. Revenue (`fact`) is summed across **all** rows including zero-fact ones; only guests are gated. Since `OrderNum` grouping yields multiple rows per date, both paths accumulate per-date before writing `revenue:v1` (don't last-row-wins overwrite).

**Tests:** `rabotyaga-bot/tests/iiko.test.js` (custom no-framework runner, mocked `fetch`) covers auth, OLAP fallbacks, the GuestNum-inflation regression, and basket logic. Run with `cd rabotyaga-bot && npm test`.
