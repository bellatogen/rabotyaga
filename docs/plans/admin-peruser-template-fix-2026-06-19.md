# Admin Per-User Template Persistence: Race Fix

## Goal

Fix `POST /api/admin/templates/:userId` in `admin.js` so that per-user push template edits are not silently overwritten by server.js's debounced `saveData()` flush.

## Background

### The bug

`admin.js:POST /templates/:userId` (lines 25–40):

1. Calls `loadData()` — reads a **local copy** from disk.
2. Mutates `data.pushSettings[userId].templates` on that local copy.
3. Calls `saveData(data)` — direct `fs.writeFileSync` to disk.
4. Returns. **Does not update `serverData.pushSettings`** (the shared in-memory object exported by `server.js`).

Any subsequent `/api/kv/:key` PUT call arms `server.js`'s debounced `saveData()` (300 ms timer, `server.js:45–53`). When that timer fires it serialises the full `serverData` object — which still carries the **stale** `pushSettings[userId].templates` value — overwriting the admin's edit.

### Why sender.js doesn't save us

`sender.js` reads directly from disk on every call (`loadData()` at lines 10–15, called inside every `sendXxxPush` and `updatePushSettings`). It never reads or writes `serverData`. This means:

- sender.js will see the correct templates immediately after admin.js writes disk (✅ no bug there).
- But it cannot prevent the debounce clobber that happens next.

### Confirmed: POST /default-templates already does it right

`admin.js:POST /default-templates` (lines 72–81) — the fix for the analogous global-templates field — sets both disk and `serverData`:

```js
saveData(data);                                                    // direct disk write
serverData.defaultTemplates = { ...serverData.defaultTemplates, ...templates }; // in-memory mirror
```

`POST /templates/:userId` is missing the second line.

### Write-path inventory

| Writer | Mechanism | Updates serverData? |
|--------|-----------|---------------------|
| `server.js` debounce `saveData()` | `fs.writeFileSync` | source of truth |
| `admin.js POST /default-templates` | direct + serverData mirror | yes ✅ |
| `admin.js POST /templates/:userId` | direct only | **no ❌** |
| `sender.js updatePushSettings()` | direct only | no (pre-existing gap) |
| `server.js /startpush, /stoppush, /toggle_*` | via `sender.updatePushSettings()` | no (pre-existing gap) |

The pre-existing gap with `sender.js` / bot commands is out of scope for this fix — those writes are high-frequency and never include `defaultTemplates`, so debounce clobber is a separate concern.

### Key file locations

- `rabotyaga-bot/src/api/admin.js:25–40` — the broken handler
- `rabotyaga-bot/src/api/admin.js:72–81` — the working pattern to copy
- `rabotyaga-bot/server.js:11–12` — `serverData` export, `module.exports = { data }`
- `rabotyaga-bot/server.js:45–53` — debounced `saveData()`

## Approach

Mirror `templates` into `serverData.pushSettings[userId]` immediately after the direct disk write, exactly as `POST /default-templates` does for `serverData.defaultTemplates`. No new infrastructure, no new dependencies.

The handler already has `serverData` in scope (imported at line 7 of admin.js). One guard needed: `serverData.pushSettings[userId]` may not exist if server.js never had that user loaded (e.g. first run after adding a new user via sender.js without restarting). Handle with a null check before merging.

## Work Items

### Item 1 — Mirror per-user template write to serverData

**Goal:** Prevent debounce clobber by keeping `serverData.pushSettings[userId].templates` in sync with the direct disk write.

**Done when:**
- `POST /api/admin/templates/:userId` succeeds
- A subsequent `PUT /api/kv/any-key` (which triggers the 300 ms debounce) does **not** revert the template change on disk
- `GET /api/admin/templates/:userId` (which reads disk) returns the updated templates both immediately and after debounce fires

**Key files:**
- `rabotyaga-bot/src/api/admin.js:37` — insert mirror after `saveData(data)` call

**Change shape** (after line 37, before `res.json`):

```js
// Mirror into serverData so debounced flush doesn't clobber this write
if (serverData.pushSettings[userId]) {
  serverData.pushSettings[userId].templates = {
    ...serverData.pushSettings[userId].templates,
    ...templates
  };
}
```

The guard `if (serverData.pushSettings[userId])` handles the edge case where the user entry was added after the last server restart (serverData wouldn't have it, but disk does). In that case the guard is safe: sender.js will read the correct value from disk anyway; only the next debounce flush would clobber it. A more robust fix (out of scope) would fully hydrate `serverData.pushSettings` from disk on this path, but the guard covers the practical case without adding complexity.

**Dependencies:** none — `serverData` already imported at `admin.js:7`

**Size:** XS (3–5 lines, no new imports, no schema changes)

## Open Questions

None — fix is unambiguous. The broader `sender.js`/bot-command write gap (same debounce clobber risk for `enabled`/`notifications`) is a separate concern; out of scope here.

## References

- Existing plan (admin tab): `docs/plans/admin-tab-2026-06-19.md`
- Design critique (identified this race): `docs/reviews/admin-tab-plan-critique-2026-06-19.md`
- Verified by: session verification that produced FAIL for Check 3 (2026-06-19)
- Pattern source: `admin.js:72–81` (`POST /default-templates` dual-write)
