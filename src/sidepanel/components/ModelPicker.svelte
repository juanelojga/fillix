<script lang="ts">
  import type { ModelOption } from './model-picker';

  interface Props {
    /** The selected option's value. '' is allowed and selects a "follow" row. */
    value: string;
    options: ModelOption[];
    onSelect: (value: string) => void | Promise<void>;
    /** Trigger text. Defaults to the matched option's label, else the raw value. */
    display?: string;
    placeholder?: string;
    emptyHint?: string;
    /** Prefix for the trigger's aria-label. A bare aria-label would REPLACE the
     *  accessible name; composing keeps the model name queryable too. */
    label?: string;
    /** Which trigger edge the dropdown hangs from. A trigger near the panel's right
     *  edge needs 'end', or a long model name pushes the popup off-screen — the panel
     *  can be as narrow as 240px and there is nowhere for it to scroll to. */
    align?: 'start' | 'end';
  }

  let {
    value,
    options,
    onSelect,
    display,
    placeholder = 'No model',
    emptyHint = 'Add models in Settings.',
    label,
    align = 'start',
  }: Props = $props();

  let open = $state(false);

  /** A non-empty value that nothing offers is still shown: the active model is not
   *  required to be in the hand-maintained list. */
  let rows = $derived(
    value && !options.some((o) => o.value === value)
      ? [...options, { value, label: value }]
      : options,
  );
  let displayText = $derived(
    display || rows.find((o) => o.value === value)?.label || value || placeholder,
  );
  /** Only a row naming a real model counts — a lone "follow" row is not a choice. */
  let hasModelRow = $derived(rows.some((o) => o.value !== ''));

  async function select(next: string) {
    open = false;
    if (next === value) return;
    await onSelect(next);
  }
</script>

<!-- `min-w-0` is what lets the trigger actually shrink: a flex item's automatic minimum
     size is its content, so without it the picker pushes its neighbours off a narrow panel
     instead of ellipsising. Inert wherever a picker is not under width pressure. -->
<div class="relative min-w-0">
  <button
    type="button"
    class="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    onclick={() => (open = !open)}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={label ? `${label}: ${displayText}` : undefined}
    title={label ? `${label}: ${displayText}` : undefined}
  >
    <span class="max-w-[120px] truncate">{displayText}</span>
    <!-- Never squeezed away: the chevron is the only thing saying this is a menu. -->
    <svg
      class="shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  </button>

  {#if open}
    <div
      class="absolute top-full {align === 'end'
        ? 'right-0'
        : 'left-0'} mt-1 z-50 min-w-[160px] rounded-md border border-border bg-background shadow-md py-1"
      role="listbox"
      tabindex="0"
      onkeydown={(e) => e.key === 'Escape' && (open = false)}
    >
      {#if !hasModelRow}
        <p class="px-3 py-2 text-xs text-muted-foreground">{emptyHint}</p>
      {/if}

      {#each rows as opt (opt.value)}
        <button
          type="button"
          role="option"
          aria-selected={opt.value === value}
          {...opt.hint ? { 'aria-label': `${opt.label}, ${opt.hint}` } : {}}
          class="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors {opt.value ===
          value
            ? 'font-medium'
            : ''}"
          onclick={() => select(opt.value)}
        >
          <!-- The separator is an expression: Svelte strips leading whitespace from a
               text node at the start of an element. The accessible-name algorithm drops
               it either way and concatenates without a separator ("Same as Chat· phi4"),
               hence the aria-label above whenever there is a hint. -->
          {opt.label}{#if opt.hint}<span class="text-muted-foreground"
              >{' · '}{opt.hint}</span
            >{/if}
        </button>
      {/each}
    </div>

    <!-- Click-outside dismiss -->
    <button
      type="button"
      aria-hidden="true"
      class="fixed inset-0 z-40"
      tabindex="-1"
      onclick={() => (open = false)}
    ></button>
  {/if}
</div>
