# Investigation: iiko GuestNum Inflation — Prevention & Regression Guard

## Summary
iiko OLAP includes cancelled/void orders (DishDiscountSumInt = 0) with positive GuestNum.
Summing GuestNum across all orders overcounts guests by ~3% (139 guests / 24 days in June 2026).
Fix: only add GuestNum when rowFact > 0. Now matches Мозг exactly.

## Symptoms
- Guests: 4 430 (Работяга) vs 4 291 (Мозг) — 139 extra, ~3.2%
- Revenue correct in both: 5 251 300 ₽
- Average check: 1 185 ₽ (wrong) vs 1 224 ₽ (correct)
- 265 orders with DishDiscountSumInt = 0 carried 139 phantom guests

## Root Cause (confirmed)
`rabotyaga-bot/src/api/iiko.js`
- `fetchOlapForDate` (line ~131): added GuestNum unconditionally
- `syncRevenueRange` accumulator (line ~255): added rowGuests regardless of rowFact
- Fix applied in commit 69bc3bd: `if (rowFact > 0) guests += GuestNum`

## Chain of bugs that masked this
1. Original code: groupByRowFields=['OpenDate.Typed'] — this iiko deduplicates GuestNum internally, so it wasn't the cause we thought
2. Attempted fix: Order.Id → invalid field → 400 → revenue sync broke entirely
3. Second fix: OrderNum (valid) but accumulate-vs-overwrite bug → only last order's data saved
4. Third fix: accumulate correctly + filter fact=0 orders → matches Мозг

## Questions for Investigation
- What tests exist in `rabotyaga-bot/tests/iiko.test.js`?
- Do they cover the guest-count logic?
- What mock iiko server approach is used?
- What's the right regression test to add?
- Should there be a data-integrity check that runs post-sync and alerts if guests/revenue ratio is implausible?
- Should CLAUDE.md document the iiko data contract?

## Background / Prior Research
<!-- Phase 1.5 explore agents -->

## Investigator Findings

### Regression guard added (2026-06-25)

**Tests added to `rabotyaga-bot/tests/iiko.test.js`** (custom no-framework runner; mocked `fetch` via `seqFetch`/`olapRows`; no live iiko). Four new cases, all green:

`── getDayRevenue ──`:
1. **"отменённый заказ (fact=0) не прибавляет гостей"** — two OLAP rows for one date: a cancelled order (`DishDiscountSumInt=0, GuestNum=3`) + a real order (`150000, GuestNum=80`). Asserts `fact=150000` (sum of all) and `guests=80` (phantom 3 excluded).

`── syncRevenue ──` (multi-day, `OrderNum`-grouped):
2. **"cancelled orders (fact=0, guests>0) не учитываются в гостях"** — two real orders + one cancelled on the same date. Asserts `fact=220000`, `guests=110` (not 115), `avgCheck=2000`.
3. **"несколько OrderNum-строк на дату аккумулируются правильно"** — 3 distinct `OrderNum` rows on one date. Asserts the per-date accumulator sums correctly: `fact=120000`, `guests=50`, `avgCheck=2400` (guards against the last-row-wins overwrite bug).
4. **"смешанные даты с отменёнными заказами — только факт-дни в KV"** — rows spanning two dates, the first carrying a cancelled order. Asserts `updated=2` and each date's guests are correct (`50` and `40`), so the fact>0 filter is applied per-row, not per-batch.

**Test suite: 34 → 38 cases.** The 4 new ones pass. Two pre-existing basket-cache tests ("кэш актуальный (<20ч)", "basket: результат сохраняется в KV") fail on baseline too — they depend on `Date.now()`/time-ordering and are unrelated to this fix; verified by running `git stash`ed baseline (32/34) vs current (36/38), i.e. zero new failures introduced.

### Coverage gaps that existed before this work
- **No test exercised the cancelled-order (fact=0, GuestNum>0) path at all** — the original suite only had clean rows, so the inflation bug could regress undetected.
- **No test covered multi-row-per-date accumulation under `OrderNum` grouping** — the last-row-wins overwrite bug (chain step 3 above) had no guard.
- **No `npm test` wiring** — the suite was run-by-hand only; `package.json` had no `test` script, so the suite was easy to forget in CI/pre-deploy.

### Changes shipped
- `rabotyaga-bot/tests/iiko.test.js` — 4 regression tests (above).
- `rabotyaga-bot/package.json` — added `"test": "node tests/iiko.test.js"`.
- `CLAUDE.md` — new **"iiko OLAP data contract"** section documenting: valid OLAP fields (`OpenDate.Typed`, `OrderNum`, `DishDiscountSumInt`, `GuestNum`, `DishName`, `DishCategory`); invalid fields and their failure mode (`Order.Id`/`OrderId` → 400, `UniqOrderId` → "Grouping is not allowed"); the GuestNum contract (sum guests only when `DishDiscountSumInt > 0`; fact sums all rows; accumulate per-date, no overwrite); and the test command `cd rabotyaga-bot && npm test`.

<!-- Pair writes here -->

## Recommendations
<!-- To be filled after investigation -->

## Preventive Measures
<!-- To be filled after investigation -->
