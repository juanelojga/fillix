<script lang="ts">
  import { rowSpec, type AuditReport } from '$lib/linkedin/post-audit';

  let { report, passes }: { report: AuditReport; passes: number } = $props();

  const failed = $derived(report.rows.filter((row) => !row.pass));
</script>

<section class="border-b px-3 py-2">
  <div class="flex items-baseline justify-between gap-2">
    <h3 class="text-xs font-semibold text-slate-800">Algorithm audit</h3>
    <span class="text-[10px] text-muted-foreground">
      {#if passes > 0}Repaired {passes} {passes === 1 ? 'time' : 'times'}{/if}
    </span>
  </div>

  {#if failed.length === 0}
    <p class="mt-1 text-[11px] text-muted-foreground">All {report.rows.length} checks pass.</p>
  {:else}
    <!-- A still-failing row is shown, never hidden. The voice spec says to fix silently and
         re-run; here the user approves before anything is copied, and a hidden failure is the
         one thing a reviewer cannot catch. -->
    <p class="mt-1 text-[11px] text-muted-foreground">
      {failed.length} of {report.rows.length} checks
      {failed.length === 1 ? 'needs' : 'need'} your attention.
    </p>
    <ul class="mt-1.5 flex flex-col gap-1">
      {#each failed as row (row.id)}
        <li class="flex flex-col gap-0.5">
          <span
            class="w-fit rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px]
                   font-medium text-amber-900"
          >
            {rowSpec(row.id).label}
          </span>
          {#if row.why}
            <p class="text-[10px] text-muted-foreground leading-relaxed">{row.why}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
