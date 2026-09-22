<script lang="ts">
  import { MAX_HOOK_CHARS } from '$lib/linkedin/brief-prompt';
  import { hookLength, type HookVariant } from '$lib/linkedin/write-brief';
  import { chooseHook } from '../stores/composer-brief';

  let { hooks, selected }: { hooks: HookVariant[]; selected: number } = $props();
</script>

<fieldset class="border-b px-3 py-2">
  <legend class="text-xs font-semibold text-slate-800">Hook</legend>
  <p class="mb-1.5 text-[11px] text-muted-foreground">
    Three openings. The one you pick becomes the first three lines of the post.
  </p>

  {#each hooks as hook, index (hook.lines.join('\n'))}
    {@const length = hookLength(hook)}
    <label class="mb-1.5 flex cursor-pointer items-start gap-2 rounded-md border p-2
                  {index === selected ? 'border-slate-400 bg-slate-50' : 'border-input'}">
      <input
        type="radio"
        name="hook"
        class="mt-0.5 shrink-0"
        checked={index === selected}
        onchange={() => chooseHook(index)}
      />
      <span class="min-w-0">
        {#each hook.lines as line (line)}
          <span class="block text-[11px] leading-relaxed text-slate-800">{line}</span>
        {/each}
        <span class="mt-1 block text-[10px] text-muted-foreground">
          {hook.trigger} · {length}/{MAX_HOOK_CHARS} characters
        </span>
      </span>
    </label>
  {/each}
</fieldset>
