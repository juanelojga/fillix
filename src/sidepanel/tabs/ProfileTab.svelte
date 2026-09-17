<script lang="ts">
  import { Input } from '$components/ui/input';
  import { Textarea } from '$components/ui/textarea';
  import { diagnoseEmbedFailure } from '$lib/profile/embed-diagnostics';
  import { ollamaConfig } from '../stores/settings';
  import {
    draft,
    embedModel,
    indexIsStale,
    indexState,
    isDirty,
    profile,
    profileIndex,
    editProfile,
    reindexProfile,
    saveEmbedModel,
    saveProfile,
    testEmbedModel,
    type TestResult,
  } from '../stores/profile';

  type SaveStatus = 'idle' | 'saving' | 'saved';

  let saveStatus = $state<SaveStatus>('idle');
  let saveError = $state('');
  let modelInput = $state('');
  let testing = $state(false);
  let testResult = $state<TestResult | null>(null);

  // The store is the source of truth; the input mirrors it, including the trim on save.
  $effect(() => {
    modelInput = $embedModel;
  });

  const chars = $derived($draft.trim().length);
  const sections = $derived(($draft.match(/^##\s+\S/gm) ?? []).length);
  const indexing = $derived($indexState.status === 'indexing');
  const canIndex = $derived(
    !indexing && $embedModel.trim().length > 0 && $profile.markdown.trim().length > 0,
  );

  const statusLine = $derived.by(() => {
    if ($isDirty) return 'Unsaved changes';
    if ($profile.updatedAt === 0) return 'Nothing saved yet';
    const time = new Date($profile.updatedAt).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `Saved ${time}`;
  });

  const saveLabel = $derived.by(() => {
    switch (saveStatus) {
      case 'saving':
        return 'Saving…';
      case 'saved':
        return '✓ Saved';
      default:
        return 'Save profile';
    }
  });

  /** Everything the index line says, in one place, so the words and the state cannot drift. */
  const indexLine = $derived.by(() => {
    if (indexing) return 'Embedding your profile — this can take a minute on a cold model.';
    if (!$embedModel.trim()) return 'Name an embedding model above, then press Build index.';
    if (!$profileIndex) return 'Not indexed yet. Press Build index.';
    if ($indexIsStale) {
      return $profileIndex.model !== $embedModel.trim()
        ? `Indexed with "${$profileIndex.model}" — the model changed, so the vectors no longer compare. Press Build index.`
        : 'Your profile changed since it was indexed. Press Build index.';
    }
    const time = new Date($profileIndex.builtAt).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${$profileIndex.chunks.length} sections · ${$profileIndex.dim} dimensions · built ${time}`;
  });

  const diagnosis = $derived(
    $indexState.status === 'failed'
      ? diagnoseEmbedFailure(
          $indexState.error,
          $ollamaConfig?.baseUrl ?? 'http://localhost:11434',
          $embedModel || '(none)',
        )
      : null,
  );

  /**
   * One persistent region, never conditionally rendered — a live region only announces
   * mutations to a node that was already in the DOM.
   */
  const announcement = $derived.by(() => {
    if (saveStatus === 'saving') return 'Saving your profile.';
    if (saveStatus === 'saved') return 'Profile saved.';
    if (indexing) return 'Building the profile index.';
    if (diagnosis) return `Indexing failed. ${diagnosis.summary}`;
    if (saveError) return `Could not save. ${saveError}`;
    return '';
  });

  async function handleSave(): Promise<void> {
    saveStatus = 'saving';
    saveError = '';
    try {
      await saveProfile($draft);
      saveStatus = 'saved';
      setTimeout(() => {
        if (saveStatus === 'saved') saveStatus = 'idle';
      }, 2000);
    } catch (err) {
      saveStatus = 'idle';
      saveError = err instanceof Error ? err.message : String(err);
    }
  }

  async function handleTest(): Promise<void> {
    testing = true;
    testResult = null;
    await saveEmbedModel(modelInput);
    testResult = await testEmbedModel(modelInput.trim());
    testing = false;
  }
</script>

<div class="flex flex-col h-full">
  <header class="shrink-0 flex items-start justify-between gap-2 border-b px-3 py-3">
    <div class="flex flex-col gap-0.5 min-w-0">
      <h2 class="text-sm font-semibold text-slate-800">Profile</h2>
      <p class="text-[11px] text-muted-foreground truncate">{statusLine}</p>
    </div>
    <button
      type="button"
      class="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-input
             bg-background px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-60
             disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2
             focus-visible:ring-ring"
      onclick={() => handleSave()}
      disabled={saveStatus === 'saving' || !$isDirty}
    >
      {saveLabel}
    </button>
  </header>

  <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

  <div class="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 p-3">
    <!-- Not decoration: the retrieval step splits this document on its `##` headings, so how
         the user structures it decides what a drafted answer can cite. -->
    <p class="text-[11px] text-muted-foreground leading-relaxed">
      Your CV, project history and availability, in Markdown. Give each area of experience its
      own <code class="font-mono">##</code> heading — answers are drafted from whichever
      sections match the job, and each one is cited by its heading, so a heading that names a
      skill is worth more than one that names an employer.
    </p>

    <label for="profile-markdown" class="sr-only">Profile document</label>
    <Textarea
      id="profile-markdown"
      value={$draft}
      oninput={(e: Event) => editProfile((e.currentTarget as HTMLTextAreaElement).value)}
      rows={18}
      class="font-mono text-xs"
      placeholder={'## Python and FastAPI\n\nEight years of…\n\n## Availability\n\nFull-time from…'}
    />

    <div class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>{chars.toLocaleString()} characters</span>
      <span>{sections} {sections === 1 ? 'section' : 'sections'}</span>
    </div>

    {#if saveError}
      <div class="flex flex-col gap-1">
        <p class="text-[11px] font-medium text-destructive">Couldn't save your profile</p>
        <p class="text-[11px] text-muted-foreground">
          Chrome refused the write. This is usually the extension's storage quota; shortening
          the document and pressing Save profile again is the quickest check.
        </p>
        <p class="text-[10px] font-mono text-destructive break-words">{saveError}</p>
      </div>
    {/if}

    <section class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h3 class="text-xs font-semibold text-slate-800">Search index</h3>
      <p class="text-[11px] text-muted-foreground leading-relaxed">
        Your profile is embedded once so the right sections can be found per question. This
        needs a separate embedding model — a chat model cannot embed. Pull one with
        <code class="font-mono">ollama pull nomic-embed-text</code> and name it here.
      </p>

      <label for="embed-model" class="text-[11px] font-medium text-slate-700">
        Embedding model
      </label>
      <div class="flex items-center gap-2">
        <Input
          id="embed-model"
          bind:value={modelInput}
          placeholder="nomic-embed-text"
          class="h-8 font-mono text-xs"
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') void handleTest();
          }}
        />
        <button
          type="button"
          class="shrink-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs
                 hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onclick={() => handleTest()}
          disabled={testing || !modelInput.trim()}
        >
          {testing ? 'Testing…' : 'Test'}
        </button>
      </div>

      {#if testResult?.ok}
        <p class="text-[11px] text-emerald-700">Embedded in {testResult.latencyMs} ms.</p>
      {:else if testResult}
        <p class="text-[11px] text-destructive break-words">{testResult.error}</p>
      {/if}

      <div class="flex items-center justify-between gap-2">
        <p class="text-[11px] text-muted-foreground">{indexLine}</p>
        <button
          type="button"
          class="shrink-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs
                 hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onclick={() => reindexProfile()}
          disabled={!canIndex}
        >
          {indexing ? 'Building…' : 'Build index'}
        </button>
      </div>

      {#if $isDirty && $profileIndex}
        <!-- The index is built from what is saved, not what is typed. Without this the user
             presses Build index, sees it succeed, and gets an index of the previous draft. -->
        <p class="text-[11px] text-amber-700">
          Save your profile first — the index is built from the saved document, not the editor.
        </p>
      {/if}

      {#if diagnosis}
        <div class="flex flex-col gap-1">
          <span class="w-fit rounded-md bg-destructive px-2 py-0.5 text-xs font-medium text-white">
            {diagnosis.summary}
          </span>
          {#if diagnosis.hint}
            <p class="text-[11px] text-muted-foreground">{diagnosis.hint}</p>
          {/if}
          <p class="text-[10px] font-mono text-destructive break-words">{diagnosis.detail}</p>
        </div>
      {/if}
    </section>

    {#if !$isDirty && $profile.updatedAt === 0}
      <p class="text-[11px] text-muted-foreground leading-relaxed">
        Nothing is saved yet. This document never leaves your machine — it is stored by the
        extension and embedded by your own Ollama.
      </p>
    {/if}
  </div>
</div>
