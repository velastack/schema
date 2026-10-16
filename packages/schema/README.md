# @velastack/schema

The PocketBase schema engine behind VelaStack's visual schema viewer and editor.

```ts
import {
	schemaFromPocketBase,
	collectionToPocketBase,
	diff,
	lint,
	hasErrors,
	plan,
	materialize,
	layout
} from '@velastack/schema';

// The database as it is, from GET /api/collections.
const base = schemaFromPocketBase(items);

// The database as the user wants it (edited copy of `base`).
const next = edit(base);

const changes = diff(base, next); // typed ops, matched by id
const issues = lint(base, next, changes); // errors, warnings, infos
if (!hasErrors(issues)) {
	for (const step of plan(base, next, changes).steps) {
		// create → POST /api/collections, update → PATCH, delete → DELETE,
		// each with collectionToPocketBase(step.collection); PocketBase's
		// automigrate writes one migration file per save.
	}
	const target = materialize(next, changes); // `next` with the ids the plan used
	// Re-read GET /api/collections afterwards for the stored form: PocketBase
	// fills in defaults for options you left out.
}

const positions = layout(next); // dagre, for SVG or the editor
```

## What it knows about PocketBase

Verified against `pocketbase-server` 0.40.6, not just read from the docs:

- Fields and collections are matched **by id**. A kept id with a new name is a rename; a missing id is a drop. Field ids are user-settable.
- A field's id is `type + crc32(name)` (`text3208210256` is `text` + crc32("id")). `pocketbaseFieldId` mints the same, so new fields look native in a migration file.
- A relation's target must already be saved. Self-relations and mutual references take two saves, which the planner defers to its fourth phase.
- A collection that others relate to cannot be deleted. The planner strips the referring fields first.
- A field's type and a relation's target cannot change in place. The diff emits `replaceField` with a fresh id, the lint calls it destructive, and `materialize` gives you `next` with that id in place.
- One save writes one migration file, timestamped to the second. Wait for the clock to advance between saves.

## Modules

| Module                 | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `types`                | `Schema`, `Collection`, `Field` (14 PocketBase types), `Rules`    |
| `ids`                  | `pocketbaseFieldId`, `randomIds`, `seededIds`, `crc32`            |
| `normalize/pocketbase` | `schemaFromPocketBase`, `collectionToPocketBase`                  |
| `normalize/builtins`   | `usersCollection`, `completeCollection` (adds system fields)      |
| `normalize/patterns`   | `applyPatternResult` for @velastack/patterns `generate()` results |
| `diff`                 | `diff`, `summarize`, `destructiveOps`                             |
| `lint`                 | `lintSchema`, `lintChangeSet`, `lint`, `hasErrors`                |
| `plan`                 | `plan` (four phases), `materialize`                               |
| `layout`               | `layout` with dagre; card metrics shared with the UI              |
