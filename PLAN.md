# Visual schema viewer/editor for PocketBase — plan (2026-10-16)

## Decisions (settled)

- Option A: PocketBase automigrate writes migration files; the engine validates, orders and applies through the collections API.
- One new pure-TS engine package; one Svelte UI package; both in a new repo `velastack-schema`.
- Two renderers: SSR SVG (docs, gallery) and SvelteFlow (editor). One shared table card.
- AI contract is whole-schema in, whole-schema out, ids preserved, diff reviewed before apply.
- `--ai` with no argument opens the browser editor.
- Gallery launch path is `vela create --schema <slug>`.
- The editor always boots its own temporary PocketBase on a fresh data dir.

## Verified PocketBase facts the engine is built on (0.40.6)

- Fields and collections are matched by `id`; a rename is the same id with a new name. Field ids are user-settable, any string.
- A relation target must already be saved. Self-relations on a new collection fail. Mutual references need two saves.
- Deleting a collection that another collection relates to is refused.
- Field `type` and relation `collectionId` cannot change in place (drop + add, data loss).
- One save = one migration file, timestamped to the second; two saves in one second collide on timestamp.
- Batch API is not available for collections.

## Learned in phase 0 (2026-10-16, against pocketbase-server 0.40.6)

- A field's id is `type + crc32(name)`: `text3208210256` is `text` + crc32("id"), identical in every collection. `pocketbaseFieldId` mints the same, so editor-created fields are indistinguishable from dashboard-created ones. Collection ids are not derived from the name.
- PocketBase adds system fields on save (`id` for base; `id`, `password`, `tokenKey`, `email`, `emailVisibility`, `verified` for auth). `completeCollection` adds them up front so a hand-built schema diffs clean afterwards.
- A `replaceField` (type or target change) must be materialised into the update body with its new id, or PocketBase refuses the save. `materialize(next, changeSet)` does that; the planner uses it and the editor adopts it after apply.
- Deleting a collection with a self-relation needs no stripping; PocketBase excludes the collection itself from the reference check.
- The payments cycle, a self-relation, a referenced drop, a rename plus retype, and a drop of the whole cycle all applied cleanly through the REST API with the planner's order, one file per save, re-diff empty.
- PocketBase fills omitted field options with zero values (`maxSelect: 0`, `min: 0`, `mimeTypes: []`), and the diff treats zero as absent, so a hand-built schema re-diffs clean after apply. Two consequences: for `select`/`file`/`relation`, `maxSelect` 0 and 1 both mean single, but the diff sees 1 as a change from 0, so the editor must keep the stored value rather than normalising to 1; and a number field's `min`/`max` are nullable, so there `0` is a real bound and only `null` is absent (special-cased in `diff`).
- Still only unit-tested, not run against the binary: rules and indexes updates, view creation, auth collection creation through `completeCollection`, and a collection type change (drop then create). Phase 2's integration test closes these.
- The `pocketbase-server` binary velastack installs is the WhatsApp-plugin build: `_whatsapp*` collections exist in a fresh database. The editor must treat `system: true` collections and the `_`-prefixed plugin collections as locked.

## Packages and repos

### New repo `velastack-schema`

`packages/schema` → `@velastack/schema` (pure TS, no DOM, no Svelte)

- `types.ts`: canonical `Schema { collections }`, `Collection { id, name, type, system, fields, indexes, rules }`, `Field` as a discriminated union over the 14 PocketBase types with all options, every entity with an `id`.
- `normalize/`: from live PocketBase `CollectionModel` (API / codegen), from patterns `CollectionSpec` + `CollectionFieldsPatch` + `CollectionDropSpec` applied onto a baseline, relation-target resolution (real id, name, `*_preview`), built-in `users`/`teams` nodes.
- `ids.ts`: mint native-looking ids (`pbc_` + 10 digits, `<type>` + 10 digits).
- `diff.ts`: `diff(base, next) → ChangeSet` of typed ops: createCollection, dropCollection, renameCollection, updateRules, updateIndexes, addField, dropField, renameField, updateFieldOptions, replaceField (type/target change → destructive).
- `lint.ts`: errors and warnings on a Schema and on a ChangeSet: invalid names, duplicate names, dangling relation target, base→view relation, select without values, maxSelect > values, autodate without onCreate/onUpdate, type change (destructive), dropping a referenced collection (destructive, lists referrers), relation cycle A↔B (informational: resolved by deferral, shown so the user sees it), relation cycle where both sides are `required` (error: no record can ever be created on either side; PocketBase does not catch this), cascadeDelete cycle (warning), required relation inside a cascade cycle (warning), self-relation (informational, needs two-phase).
- `plan.ts`: `order(changeSet) → Plan` of phases: (1) drop relation fields that point at collections being dropped, (2) drop collections, (3) create collections without relation fields and apply non-relation updates/renames, (4) add relation fields and relation updates. Topological order on relation edges inside each phase; cycles resolved by phase 4 deferral, never an error.
- `apply.ts`: `apply(pb, plan, { onStep })` using the PocketBase JS SDK; before each save, wait until the Unix second advances past the previous save so filenames sort correctly; returns the migration files written.
- `layout.ts`: dagre wrapper → positions for a Schema (used server-side and as the editor's initial layout).
- `registry/`: gallery schemas as JSON (`schemas/<slug>.json` + `meta.json`: title, description, category, tags, `requires: { auth, teams }`), exported as an index.

`packages/ui` → `@velastack/schema-ui` (Svelte 5)

- `TableCard.svelte`: shared card; props `collection`, `diff?` (added/removed/renamed/destructive styling), `locked`.
- `SchemaDiagram.svelte`: read-only SSR SVG. Takes a Schema + positions + optional diff. No client JS required; optional pan/zoom enhancement.
- `SchemaEditor.svelte`: SvelteFlow canvas, table cards as nodes, relation edges, interactions below.
- `app/`: the editor SPA shell (Vite build → `dist/app`), served by the CLI. Talks to `/api/*` on the same origin.

### `velastack-cli`

- `vela generate migration --ai` (no description): boot temp server, start local HTTP server, open browser, apply on request. Open question for Phase 2: `generate migration` has required positionals and the `preAction` gate is per command path, not per flag. If Commander can't make the positionals optional under `--ai`, or the gate still demands `.env` credentials, use a dedicated `vela schema --ai` subcommand instead.
- `vela create --schema <slug>`: `create` lives in the CLI (`src/commands/create.ts`), takes `--template` and no feature flags; features come from the template plus `vela enable …`. So `--schema` runs after create: enable the features the schema `requires` (auth, teams) through the enable patterns, then boot PocketBase with the `launchPocketbase` recipe against the project's `migrations/`, apply the schema's plan, stop. Verify the enable patterns can be invoked programmatically from `create` before costing Phase 4.
- `src/lib/schema-server.ts`: Node `http` server; routes `GET /api/schema`, `POST /api/lint`, `POST /api/apply`, `POST /api/ai` (proxy to velastack.dev with the stored key), static files from `@velastack/schema-ui/dist/app`.
- Temp server: `startPocketbaseServe` directly with a fresh data dir under `$TMPDIR`, `superuser create`, `migrate up` with the project's `migrations/` as `--migrationsDir`, so automigrate writes new files straight into the project. No `--hooksDir` (hooks may need env, the workflows worker, or network; the editor only needs schema). Never reads `_pocketbase_metadata.json`. Stopped by PID on exit/signal. After apply, if `_pocketbase_metadata.json` exists, print that the running `vela dev` server must be restarted to load the new migrations.
- The editor works fully without `vela login`; only the AI dock needs a linked project and key, and says so inline.
- Add the command to `SELF_CREDENTIALED_COMMANDS`.

### `velastack` (website)

- Pattern pages: replace the Collections tab with `<SchemaDiagram>` built from baseline (users/teams per PREVIEW_FEATURES) + the pattern's collections/patches/drops, diff-styled. SSR, no client flow lib.
- `/schemas` and `/schemas/[slug]`: gallery shaped like `/patterns`; card thumbnail is the SVG diagram rendered to an OG image at build; detail page shows the diagram, the collection list, a copyable `npx vela create my-app --schema <slug>`, and the required features.
- `POST /v1/projects/:id/ai/schema-edit`: new endpoint beside `ai/schema`. Input `{ prompt, schema, history }`, forced tool `emit_schema`, returns `{ schema, summary, turn }`. System prompt: never change an existing field's or collection's id; rename by changing `name` only; re-emit the full schema. Server guard: engine lint passes; every id in the output exists in the input or is new; a drop plus add of the same name in the same collection (a disguised rename with data loss) is rejected and the model is asked to repair it.

### `velastack-patterns`

- Export `CollectionSpec`, `CollectionFieldSpec`, `CollectionFieldsPatch`, `CollectionDropSpec`, `FieldChange` from `src/index.ts`.
- Later: make `applyFieldChanges`/`createCollections` use `@velastack/schema` so the two-step payments cycle becomes generic.

## Editor interaction model (deliberately small)

- Canvas only. No sidebar. One bottom dock.
- Add table: double-click empty canvas or `N`. Card name is inline-editable.
- Add field: type in the always-present empty last row and press Enter. Type picker is a compact inline select; `relation` shows a target picker in the same row (or drag the row handle onto a table).
- Field options: one small popover per row (required, presentable, multiple, and the two or three type-specific options). Nothing nests further.
- Built-in and system collections (`users`, `_superusers`, feature tables that come from patterns) render locked; `_pb_users_auth_` siblings hidden.
- Undo/redo from snapshot history (`Cmd+Z`), made cheap by the id diff.
- Bottom dock: pending-change count, lint badges on cards, `Review` (ordered op list, destructive items highlighted, blocked when errors), `Apply`.
- AI: `Cmd+K` opens a single prompt input in the dock. The response is applied as a _proposed_ state; cards show the diff (green add, red drop, amber destructive). `Accept` merges into the working state; `Discard` reverts. Refinements continue the same history.
- Default layout from dagre on load; positions kept in `sessionStorage`; `Auto layout` button.
- No scaffold/model modes, no app-mode toggles: features come from the project's real state.

## Phases

0. **Engine core** — done 2026-10-16. Repo, `@velastack/schema` types, normalize, ids, diff, lint, plan, layout; 63 unit tests; manual end-to-end against the binary (to become the CI integration test in phase 2).
1. **Read-only on pattern pages** — done 2026-10-16. `@velastack/schema@0.1.0` and `@velastack/schema-ui@0.1.0` are on npm; velastack PR #60 adds the Schema tab. `TableCard`, `SchemaDiagram`, `annotate` (Diagram model), pattern page shows a Schema tab from the baseline users+teams preview project.
2. **Apply + CLI editor (no AI)** — built 2026-10-16. `apply.ts` with a binary-backed integration test in CI (cycle, self-relation, view, auth, referenced drop, rename+retype, rules+indexes, type change); the editor SPA (`EditorState`, SvelteFlow canvas, dock with Review/Apply, in-memory and HTTP api seams) built into the ui package's `app/`; the CLI's loopback token-checked server and `vela generate migration --ai` (branch `feat/schema-editor`). Verified end to end against a scratch project with velastack's 99 migrations: edit, apply, file written, Ctrl-C cleans up. System and plugin collections are locked and hidden from the canvas.
3. **AI** — built 2026-10-16. velastack PR #61 (stacked on #60): `POST /v1/projects/:id/ai/schema-edit` with `reconcile` (ids kept, new ids minted PocketBase-style, `new:<name>` relation targets, system fields restored, locked collections hidden from the model, disguised renames and dangling relations refused, lint-checked); 8 unit tests pass, a `LIVE_AI=1` test against the real model exists but the local `.env` key is refused by Anthropic. vela PR #40: `/api/ai` proxy with a 409 reason when not linked or logged in. ui 0.2.2: ⌘K prompt, proposal bar (Accept as one undo step, Discard, Review, Refine with history), mock AI behind `?mockai`.
4. **Gallery + launch** — built 2026-10-16. `@velastack/schema/registry` (0.3.0) holds eight schemas written as code with deterministic ids (gym memberships, hotel bookings, restaurant reservations, clinic appointments, inventory, online courses, event ticketing, invoicing); each lints clean against a fresh project. velastack `/schemas` and `/schemas/[slug]` draw them with the SSR diagram (`fit="contain"` thumbnails on the cards, ui 0.3.1) and show the copyable `npx vela create my-app --schema <slug>`. `vela create --schema <slug>` applies the schema into the new project after its superuser exists (verified: `vela create demo --schema hotel-bookings` wrote 6 migration files in dependency order and `migrate up` reports nothing left to apply). Gallery schemas reference only `users`; a schema needing the teams pattern is a follow-up. OG cards for schema pages are a follow-up (cards use the live diagram instead).
5. **Follow-ups** — `generate schema|resource|scaffold --ai` (no arg) opening the editor and continuing with Zod/CRUD for the collections it creates; regenerate types after apply; Option B migration emitter; rules and indexes editing; patterns runtime adopting the engine.

## Risks

- Timestamp-per-second migration files: mitigated by waiting for the clock to advance; a large apply takes ~1 s per save.
- The SVG card and the SvelteFlow card must stay one component; SSR rendering inside `<foreignObject>` needs a check in Safari.
- Preview vs runtime drift in patterns (e.g. `stripe_prices.recurring` text vs json) shows in diagrams; acceptable for now, fixed in patterns later.
- The AI endpoint's output size grows with schema size; cap at `max_tokens` 16k and return a partial-apply error rather than truncating.
