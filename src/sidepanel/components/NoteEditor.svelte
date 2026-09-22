<script lang="ts">
  import CopyButton from './CopyButton.svelte';
  import { Textarea } from '$components/ui/textarea';
  import { editNote } from '../stores/love-note';
  import { writeNotes } from '../stores/love-note-write';

  let { edited }: { edited: string } = $props();
</script>

<section class="border-b px-3 py-2">
  <h3 class="text-xs font-semibold text-slate-800">The message</h3>

  <label class="sr-only" for="note-editor">The picked message</label>
  <!-- Bound to `edited`, never to the variant: what is copied is what is in this box. -->
  <Textarea
    id="note-editor"
    value={edited}
    oninput={(e: Event) => editNote((e.currentTarget as HTMLTextAreaElement).value)}
    rows={6}
    class="mt-1.5 text-xs"
  />

  <div class="mt-1.5 flex items-center gap-2">
    <CopyButton text={edited} label="Copy message" fallback="or select the text above by hand" />
    <button
      type="button"
      class="w-fit rounded-md border border-input bg-background px-2 py-1 text-[11px]
             hover:bg-accent focus-visible:outline-none focus-visible:ring-2
             focus-visible:ring-ring"
      onclick={() => writeNotes()}
    >
      Regenerate
    </button>
  </div>
</section>
