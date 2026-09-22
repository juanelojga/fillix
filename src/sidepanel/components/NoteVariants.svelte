<script lang="ts">
  import { Textarea } from '$components/ui/textarea';
  import { noteSeed, pickNote } from '../stores/love-note';

  let { variants, chosen }: { variants: string[]; chosen: number } = $props();
</script>

<section>
  <div class="border-b px-3 py-2">
    <label class="text-[11px] font-medium text-slate-700" for="note-seed">
      Seed <span class="font-normal text-muted-foreground">(optional)</span>
    </label>
    <!-- Never disabled while a run is in flight, the rule the model pickers follow: the seed
         is read when the button is pressed, so typing during a run simply feeds the next one. -->
    <Textarea
      id="note-seed"
      value={$noteSeed}
      oninput={(e: Event) => noteSeed.set((e.currentTarget as HTMLTextAreaElement).value)}
      rows={2}
      class="mt-1 text-xs"
      placeholder="A topic and a detail or two to work in — in any language. Or leave it blank."
    />
  </div>

  {#if variants.length > 0}
    <!-- A radio group, not buttons: one message becomes the editable text below, and the
         checked one is the only way to tell which. -->
    <fieldset class="border-b px-3 py-2">
      <legend class="text-xs font-semibold text-slate-800">Messages</legend>
      <p class="mb-1.5 text-[11px] text-muted-foreground">
        Three angles, all in Spanish. Pick one to edit and copy.
      </p>

      {#each variants as variant, index (variant)}
        <label
          class="mb-1.5 flex cursor-pointer items-start gap-2 rounded-md border p-2
                 {index === chosen ? 'border-slate-400 bg-slate-50' : 'border-input'}"
        >
          <input
            type="radio"
            name="note-variant"
            class="mt-0.5 shrink-0"
            checked={index === chosen}
            onchange={() => pickNote(index)}
          />
          <span class="min-w-0">
            <span class="block text-[10px] uppercase text-muted-foreground">Message {index + 1}</span>
            <span class="block text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap">{variant}</span>
          </span>
        </label>
      {/each}
    </fieldset>
  {/if}
</section>
