<script lang="ts">
	/**
	 * The one bar the editor has. Left: the project and lint counts. Middle:
	 * pending changes, Review, Apply. Right: undo, redo, layout, new table.
	 * Review opens the ordered plan above the bar with issues inline; Apply
	 * is blocked while there are errors.
	 */
	import type { Issue, Op, Step } from '@velastack/schema';
	import type { EditorState } from '../../editor.svelte.js';
	import {
		AiUnavailable,
		ApplyRefused,
		type AiTurn,
		type ApplyResponse,
		type SchemaApi
	} from '../../api.js';

	interface Props {
		editor: EditorState;
		api: SchemaApi;
		onaddtable: () => void;
	}

	let { editor, api, onaddtable }: Props = $props();

	let review = $state(false);
	let applying = $state(false);
	let asking = $state(false);
	let prompt = $state('');
	let promptOpen = $state(false);
	let promptInput: HTMLInputElement | undefined = $state();
	let history = $state.raw<AiTurn[]>([]);
	let aiError = $state<string | null>(null);
	const aiReady = $derived(Boolean(api.ai));
	const aiTitle = $derived(
		aiReady
			? 'Describe a change in words (⌘K)'
			: (api.aiUnavailable ?? 'AI is not available here')
	);

	const openPrompt = () => {
		if (!aiReady) return;
		promptOpen = true;
		aiError = null;
		queueMicrotask(() => promptInput?.focus());
	};

	const ask = async () => {
		const text = prompt.trim();
		if (!text || !api.ai || asking) return;
		asking = true;
		aiError = null;
		try {
			const response = await api.ai({ prompt: text, schema: editor.next, history });
			history = response.turn;
			editor.propose(response.schema, response.summary);
			prompt = '';
		} catch (e) {
			aiError = e instanceof AiUnavailable ? e.message : e instanceof Error ? e.message : String(e);
		} finally {
			asking = false;
		}
	};

	const accept = () => {
		editor.acceptProposal();
		promptOpen = false;
	};
	const discard = () => {
		editor.discardProposal();
		history = [];
		promptOpen = false;
	};
	let result = $state<ApplyResponse | null>(null);
	let refused = $state<Issue[] | null>(null);
	let error = $state<string | null>(null);

	const errors = $derived(editor.issues.filter((i) => i.level === 'error'));
	const warnings = $derived(editor.issues.filter((i) => i.level === 'warning'));

	const describe = (op: Op): string => {
		switch (op.kind) {
			case 'createCollection':
				return `create ${op.collection.name}`;
			case 'dropCollection':
				return `delete ${op.name}`;
			case 'renameCollection':
				return `rename ${op.from} → ${op.to}`;
			case 'updateRules':
				return 'change API rules';
			case 'updateIndexes':
				return `${op.added.length ? `add ${op.added.length} index${op.added.length > 1 ? 'es' : ''}` : ''}${op.added.length && op.removed.length ? ', ' : ''}${op.removed.length ? `drop ${op.removed.length} index${op.removed.length > 1 ? 'es' : ''}` : ''}`;
			case 'updateViewQuery':
				return 'change view query';
			case 'addField':
				return `add ${op.field.name}`;
			case 'dropField':
				return `remove ${op.name}`;
			case 'renameField':
				return `rename ${op.from} → ${op.to}`;
			case 'updateField':
				return `change ${op.name} (${op.changed.join(', ')})`;
			case 'replaceField':
				return op.reason === 'type'
					? `retype ${op.name} ${op.from.type} → ${op.to.type}`
					: `repoint ${op.name}`;
		}
	};

	const destructive = (op: Op) =>
		op.kind === 'dropCollection' || op.kind === 'dropField' || op.kind === 'replaceField';

	const stepIssues = (step: Step): Issue[] =>
		editor.issues.filter((i) => i.collectionId === step.collectionId);

	const applyNow = async () => {
		if (editor.blocked || applying) return;
		applying = true;
		result = null;
		refused = null;
		error = null;
		try {
			const response = await api.apply(editor.next);
			result = response;
			editor.applied(response.base);
			review = false;
		} catch (e) {
			if (e instanceof ApplyRefused) refused = e.issues;
			else error = e instanceof Error ? e.message : String(e);
		} finally {
			applying = false;
		}
	};

	const onKey = (event: KeyboardEvent) => {
		const target = event.target as HTMLElement | null;
		const typing = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
			if (typing) return;
			event.preventDefault();
			if (event.shiftKey) editor.redo();
			else editor.undo();
		}
		if (!typing && event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
			onaddtable();
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			openPrompt();
		}
		if (event.key === 'Escape') {
			review = false;
			result = null;
			if (!editor.proposal) promptOpen = false;
		}
	};
</script>

<svelte:window onkeydown={onKey} />

{#if review && editor.dirty}
	<section class="dock__panel" aria-label="Review changes">
		<header class="dock__panel-head">
			<strong>{editor.plan.steps.length}</strong>
			{editor.plan.steps.length === 1 ? 'migration' : 'migrations'}, in the order PocketBase needs
			{#if editor.summary.destructive}
				<span class="dock__destructive">{editor.summary.destructive} destructive</span>
			{/if}
		</header>
		<ol class="dock__steps">
			{#each editor.plan.steps as step, index (index)}
				{@const issues = stepIssues(step)}
				<li class="dock__step" data-kind={step.kind}>
					<span class="dock__step-kind">{step.kind}</span>
					<span class="dock__step-name">{step.name}</span>
					<ul class="dock__ops">
						{#each step.ops as op, i (i)}
							<li data-destructive={destructive(op) || undefined}>{describe(op)}</li>
						{/each}
					</ul>
					{#if issues.length}
						<ul class="dock__issues">
							{#each issues as issue (issue.code + (issue.fieldId ?? ''))}
								<li data-level={issue.level}>{issue.message}</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ol>
	</section>
{/if}

{#if result}
	<section class="dock__panel dock__panel--result" aria-live="polite">
		<header class="dock__panel-head">
			{#if result.failed}
				<strong class="dock__fail">Stopped</strong> at {result.failed.step.name}: {result.failed.message}
			{:else}
				<strong>Applied.</strong> {result.written.length} migration {result.written.length === 1 ? 'file' : 'files'} written.
			{/if}
			<button class="dock__link" type="button" onclick={() => (result = null)}>dismiss</button>
		</header>
		{#if result.written.length}
			<ul class="dock__files">
				{#each result.written as file (file)}
					<li><code>{file}</code></li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

{#if refused}
	<section class="dock__panel dock__panel--result" aria-live="assertive">
		<header class="dock__panel-head">
			<strong class="dock__fail">Refused.</strong> The server found errors:
			<button class="dock__link" type="button" onclick={() => (refused = null)}>dismiss</button>
		</header>
		<ul class="dock__issues">
			{#each refused as issue, i (i)}
				<li data-level={issue.level}>{issue.message}</li>
			{/each}
		</ul>
	</section>
{/if}

{#if aiError}
	<section class="dock__panel dock__panel--result" aria-live="assertive">
		<header class="dock__panel-head">
			<strong class="dock__fail">AI could not do that.</strong> {aiError}
			<button class="dock__link" type="button" onclick={() => (aiError = null)}>dismiss</button>
		</header>
	</section>
{/if}

{#if error}
	<section class="dock__panel dock__panel--result" aria-live="assertive">
		<header class="dock__panel-head">
			<strong class="dock__fail">Failed.</strong> {error}
			<button class="dock__link" type="button" onclick={() => (error = null)}>dismiss</button>
		</header>
	</section>
{/if}

<footer class="dock">
	<div class="dock__group">
		<span class="dock__project">{editor.project ?? 'schema'}</span>
		{#if errors.length}
			<span class="dock__count" data-level="error" title={errors.map((i) => i.message).join('\n')}>{errors.length} {errors.length === 1 ? 'error' : 'errors'}</span>
		{/if}
		{#if warnings.length}
			<span class="dock__count" data-level="warning" title={warnings.map((i) => i.message).join('\n')}>{warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}</span>
		{/if}
	</div>

	<div class="dock__group dock__group--centre">
		{#if editor.proposal && promptOpen}
			<form
				class="dock__prompt"
				onsubmit={(event) => {
					event.preventDefault();
					void ask();
				}}
			>
				<span class="dock__prompt-mark">✦</span>
				<input
					class="dock__prompt-input"
					bind:this={promptInput}
					bind:value={prompt}
					placeholder="Refine: make the relation required, rename…"
					disabled={asking}
					onkeydown={(event) => {
						if (event.key === 'Escape') promptOpen = false;
					}}
				/>
				<button class="dock__button dock__button--primary" type="submit" disabled={asking || !prompt.trim()}>
					{asking ? 'Thinking…' : 'Ask'}
				</button>
				<button class="dock__button" type="button" onclick={() => (promptOpen = false)}>Back</button>
			</form>
		{:else if editor.proposal}
			<span class="dock__pending dock__pending--ai" title={editor.proposal.summary}>✦ {editor.proposal.summary}</span>
			<button class="dock__button" type="button" onclick={discard}>Discard</button>
			<button class="dock__button" type="button" data-active={review || undefined} onclick={() => (review = !review)}>Review</button>
			<button class="dock__button dock__button--primary" type="button" onclick={accept}>Accept</button>
			<button class="dock__button" type="button" title="Ask for a change to this proposal" onclick={openPrompt}>Refine…</button>
		{:else if promptOpen}
			<form
				class="dock__prompt"
				onsubmit={(event) => {
					event.preventDefault();
					void ask();
				}}
			>
				<span class="dock__prompt-mark">✦</span>
				<input
					class="dock__prompt-input"
					bind:this={promptInput}
					bind:value={prompt}
					placeholder="Describe a change: add a comments table with a post relation…"
					disabled={asking}
					onkeydown={(event) => {
						if (event.key === 'Escape') promptOpen = false;
					}}
				/>
				<button class="dock__button dock__button--primary" type="submit" disabled={asking || !prompt.trim()}>
					{asking ? 'Thinking…' : 'Ask'}
				</button>
			</form>
		{:else if editor.dirty}
			<span class="dock__pending">
				{editor.summary.total} {editor.summary.total === 1 ? 'change' : 'changes'}
			</span>
			<button class="dock__button" type="button" data-active={review || undefined} onclick={() => (review = !review)}>Review</button>
			<button class="dock__button" type="button" onclick={() => editor.discard()}>Discard</button>
			<button
				class="dock__button dock__button--primary"
				type="button"
				disabled={editor.blocked || applying}
				title={editor.blocked ? 'Fix the errors first' : 'Write the migrations'}
				onclick={applyNow}
			>
				{applying ? 'Applying…' : 'Apply'}
			</button>
		{:else}
			<span class="dock__pending dock__pending--quiet">No changes</span>
		{/if}
	</div>

	<div class="dock__group dock__group--end">
		<button class="dock__button dock__button--icon" type="button" disabled={!editor.canUndo} title="Undo (⌘Z)" aria-label="Undo" onclick={() => editor.undo()}>↶</button>
		<button class="dock__button dock__button--icon" type="button" disabled={!editor.canRedo} title="Redo (⇧⌘Z)" aria-label="Redo" onclick={() => editor.redo()}>↷</button>
		<button class="dock__button" type="button" title="Arrange the tables" onclick={() => editor.relayout()}>Layout</button>
		<button class="dock__button" type="button" title="Add a table (N)" onclick={onaddtable}>+ Table</button>
		<button class="dock__button dock__button--ai" type="button" disabled={!aiReady} title={aiTitle} onclick={openPrompt}>✦ AI</button>
	</div>
</footer>

<style>
	.dock {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 5;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 12px;
		height: 44px;
		padding: 0 14px;
		font: 12px/1 ui-sans-serif, system-ui, sans-serif;
		color: var(--foreground, #0f172a);
		background: color-mix(in oklab, var(--background, #fff) 92%, transparent);
		backdrop-filter: blur(8px);
		border-top: 1px solid var(--border, #e2e8f0);
	}
	.dock__group {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.dock__group--centre {
		justify-content: center;
	}
	.dock__group--end {
		justify-content: flex-end;
	}
	.dock__project {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dock__count {
		padding: 2px 7px;
		border-radius: 999px;
		font-size: 11px;
		color: #fff;
		background: var(--warning, #bf8700);
	}
	.dock__count[data-level='error'] {
		background: var(--danger, #d1242f);
	}
	.dock__pending {
		color: var(--muted-foreground, #64748b);
		white-space: nowrap;
	}
	.dock__pending--quiet {
		font-style: italic;
	}
	.dock__button {
		font: inherit;
		color: var(--foreground, #0f172a);
		background: var(--background, #fff);
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 5px;
		padding: 5px 10px;
		cursor: pointer;
		white-space: nowrap;
	}
	.dock__button:hover:not(:disabled),
	.dock__button[data-active] {
		border-color: var(--ring, #94a3b8);
		background: var(--muted, #f1f5f9);
	}
	.dock__button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.dock__button--primary {
		color: var(--primary-foreground, #fff);
		background: var(--primary, #0f172a);
		border-color: var(--primary, #0f172a);
	}
	.dock__button--primary:hover:not(:disabled) {
		background: color-mix(in oklab, var(--primary, #0f172a) 85%, #fff);
	}
	.dock__button--icon {
		padding: 5px 8px;
		font-size: 14px;
		line-height: 12px;
	}
	.dock__button--ai:not(:disabled) {
		color: var(--foreground, #0f172a);
	}
	.dock__pending--ai {
		max-width: 360px;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--foreground, #0f172a);
	}
	.dock__prompt {
		display: flex;
		align-items: center;
		gap: 8px;
		width: min(640px, 60vw);
	}
	.dock__prompt-mark {
		color: var(--muted-foreground, #64748b);
	}
	.dock__prompt-input {
		flex: 1;
		min-width: 0;
		font: inherit;
		color: var(--foreground, #0f172a);
		background: var(--background, #fff);
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 5px;
		padding: 6px 10px;
	}
	.dock__prompt-input:focus {
		outline: none;
		border-color: var(--ring, #94a3b8);
	}

	.dock__panel {
		position: absolute;
		left: 50%;
		bottom: 56px;
		z-index: 6;
		transform: translateX(-50%);
		width: min(560px, calc(100% - 32px));
		max-height: 60vh;
		overflow: auto;
		padding: 12px 14px;
		font: 12px/1.4 ui-sans-serif, system-ui, sans-serif;
		color: var(--foreground, #0f172a);
		background: var(--popover, var(--background, #fff));
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 8px;
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.14);
	}
	.dock__panel-head {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 8px;
	}
	.dock__destructive {
		margin-left: auto;
		color: var(--danger, #d1242f);
	}
	.dock__fail {
		color: var(--danger, #d1242f);
	}
	.dock__link {
		margin-left: auto;
		font: inherit;
		color: var(--muted-foreground, #64748b);
		background: none;
		border: 0;
		cursor: pointer;
		text-decoration: underline;
	}
	.dock__steps {
		margin: 0;
		padding: 0 0 0 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.dock__step-kind {
		display: inline-block;
		min-width: 46px;
		font-family: var(--font-code, ui-monospace, monospace);
		font-size: 11px;
		color: var(--muted-foreground, #64748b);
	}
	.dock__step[data-kind='delete'] .dock__step-kind {
		color: var(--danger, #d1242f);
	}
	.dock__step[data-kind='create'] .dock__step-kind {
		color: var(--green, #00a85a);
	}
	.dock__step-name {
		font-weight: 600;
	}
	.dock__ops,
	.dock__issues,
	.dock__files {
		margin: 2px 0 0;
		padding-left: 14px;
		color: var(--muted-foreground, #64748b);
	}
	.dock__ops li[data-destructive] {
		color: var(--danger, #d1242f);
	}
	.dock__issues li[data-level='error'] {
		color: var(--danger, #d1242f);
	}
	.dock__issues li[data-level='warning'] {
		color: var(--warning, #bf8700);
	}
	.dock__files {
		list-style: none;
		padding: 0;
		font-family: var(--font-code, ui-monospace, monospace);
		font-size: 11px;
	}
</style>
