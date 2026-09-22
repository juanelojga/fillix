<script lang="ts">
  import AuditChecklist from './AuditChecklist.svelte';
  import CopyButton from './CopyButton.svelte';
  import { Textarea } from '$components/ui/textarea';
  import { MIN_POST_CHARS } from '$lib/linkedin/post-audit-checks';
  import type { AuditReport } from '$lib/linkedin/post-audit';
  import type { PostResult } from '$lib/linkedin/write-post';
  import { editPost, regenerateDraft } from '../stores/composer-draft';

  let {
    result,
    edited,
    report,
  }: { result: PostResult; edited: string; report: AuditReport } = $props();

  // Counts `edited`, never `result.draft.text`: the audit rules on what will be copied, and a
  // count that disagreed with it after one keystroke would be worse than no count.
  const length = $derived(edited.length);
  const short = $derived(length < MIN_POST_CHARS);
</script>

<section class="border-b px-3 py-2">
  <div class="flex items-baseline justify-between gap-2">
    <h3 class="text-xs font-semibold text-slate-800">The post</h3>
    <span class="text-[10px] {short ? 'text-amber-800' : 'text-muted-foreground'}">
      {length.toLocaleString()} / {MIN_POST_CHARS.toLocaleString()}
    </span>
  </div>

  <label class="sr-only" for="post-draft">The drafted post</label>
  <Textarea
    id="post-draft"
    value={edited}
    oninput={(e: Event) => editPost((e.currentTarget as HTMLTextAreaElement).value)}
    rows={14}
    class="mt-1.5 text-xs"
  />

  <div class="mt-1.5 flex items-center gap-2">
    <CopyButton
      text={edited}
      label="Copy post"
      fallback="or select the text above by hand"
    />
    <button
      type="button"
      class="w-fit rounded-md border border-input bg-background px-2 py-1 text-[11px]
             hover:bg-accent focus-visible:outline-none focus-visible:ring-2
             focus-visible:ring-ring"
      onclick={() => regenerateDraft()}
    >
      Regenerate
    </button>
  </div>

  {#if result.exhausted}
    <!-- The run stopped with rows still failing rather than discarding a draft that is mostly
         right. Said plainly, because the remaining work is now the user's. -->
    <p class="mt-1.5 text-[10px] text-muted-foreground leading-relaxed">
      The repair passes ran out with checks still failing. What is left is below — fix it here
      or press Regenerate.
    </p>
  {/if}
</section>

<AuditChecklist {report} passes={result.passes} />
