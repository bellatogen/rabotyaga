# Critique — Admin Tab Plan (`docs/plans/admin-tab-2026-06-19.md`)

**Scope:** plan vs. context_builder export (`prompt-exports/oracle-plan-2026-06-19-162611-…`). Five questions only; no scope expansion.

## 1. Top 3 under-specified seams

1. **Two writers, one `data.json` — never acknowledged.** `admin.js` reads/writes the file directly (`loadData` line 8, `saveData` line 12, synchronous `fs.writeFileSync`). `server.js` holds a long-lived in-memory `data` object and flushes it on a **debounced** timer (`server.js:45–50`). An admin `POST /default-templates` writes to disk; the next `server.js` debounce flush overwrites it from stale in-memory state → silent loss. Item 1's "Done when … + перезапуск" hides this (restart reloads disk). Implementer must guess: route admin writes through the KV layer, or accept the race. **Load-bearing — biggest gap.**
2. **Template key set is guessed.** `GET /default-templates` hardcodes exactly two keys (`admin.js:58–61`: `dayBeforeShift`, `closeShiftReminder`). Per-user `templates` is a free-form merge (`admin.js:31–34`). Export asserts the per-user section shows "the same two keys" — a guess. The scheduler fires a **third** push type (`personalTasks`, 09:00 — per CLAUDE.md) with no template key anywhere. Implementer must invent the key list for sub-tabs A and B, and `personalTasks` stays unmanageable.
3. **`pushSettings` value shape vs. the `<select>` label.** PerUserSection builds the dropdown from `Object.keys(pushSettings)`, but each value is an object (`pushSettings[userId].templates`, `admin.js:27–34`) and the key is a raw Telegram ID. Plan defers "raw ID vs. bindings" but never says what to render as the label. (`data.bindings` is a flat `{name: telegramId}` map, `server.js:211` — so the label requires inverting it.) Item 5's "Done when: select shows users" is unmeetable until this is decided.

## 2. Specificity balance

- **Over-specified (agent should own):** the export's 12-field `AdminTab` state list (`feedbackMsg`, `savingDefault`, `localDefault`, …), the Error-Handling table, and the Concurrency section dictate tactical implementation of a ~150-line, 3-fetch component. Routine double-submit guards / error alerts don't need spelling out. **The plan doc already trimmed these — good; don't re-import them from the export.**
- **Useful framing the plan dropped:** the export states `AdminTab` "takes no callbacks into App state" (self-contained). Worth keeping — it tells the implementer not to thread state through `App`. Also dropped: the export's backward-compat reasoning for the Item 1 merge (old `data.json` without `defaultTemplates` ⇒ `{}` ⇒ identical to today). One line in Item 1 would prevent a needless migration worry.

## 3. Contradictions / missing dependencies

- **Contradiction:** Approach says "KV store не задействован / server-only." False at the persistence layer — `admin.js` writes the *same* `data.json` that backs the KV store. This false decoupling is the root of seam #1.
- **Missing dep on Item 1:** listed as "Нет / независим," but it interacts with `server.js`'s debounced persistence (seam #1). Not independent.
- **Item 5 prerequisite is toothless:** "проверить формат ключей pushSettings" is named but no blocking dependency is created and Size stays S, though the check can materially change the UI (label mapping).

## 4. Over-planning — cut / simplify

- Cut from the export (do **not** carry into implementation): Section 6 Error-Handling table, Section 7 Concurrency, full state-var enumeration. Over-planning for this size.
- **Items 2 and 3 should merge** — a 2-line tab entry + a 1-line render gate as two separate work items is ceremony. One item.

## 5. Questions that change implementation order

1. **Do admin writes go through `server.js`'s in-memory KV/debounce layer, or stay direct `fs`?** If through → a backend persistence-unification task must precede Item 1, reordering the whole plan. (Biggest order-changer; ties to seam #1.)
2. **Is `personalTasks` (09:00 push) in scope?** If yes → add its key to `default-templates` GET/POST first, expanding Items 1 and 4 before any frontend work.
3. **Can `pushSettings` be empty in dev?** Entries likely appear only after bind. If empty, Item 5 is untestable → a `data.json` seed step must move ahead of Item 5.
