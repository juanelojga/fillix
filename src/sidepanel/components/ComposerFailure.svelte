<script lang="ts">
  /**
   * Structural, not `PostDiagnosis`: the four strings are the whole contract, and both the
   * composer's `PostDiagnosis` and the love note's `NoteDiagnosis` satisfy it. Naming one of
   * them here would make the other feature import LinkedIn's type to render an Ollama error.
   */
  let {
    diagnosis,
  }: { diagnosis: { summary: string; hint: string; context: string; detail: string } } =
    $props();
</script>

<!-- Summary, hint, context and detail — all four. A badge with no worded cause and no next
     step is the failure mode this codebase's diagnostics convention exists to stop. The detail
     is bounded: it carries the head and tail of the model's real reply, and an unbounded one
     would push everything else off a 240px panel. -->
<div class="flex flex-col gap-2 p-4">
  <span class="w-fit rounded-md bg-destructive px-2 py-0.5 text-xs font-medium text-white">
    {diagnosis.summary}
  </span>
  <p class="text-xs text-muted-foreground">{diagnosis.hint}</p>
  <p class="text-[10px] text-muted-foreground">{diagnosis.context}</p>
  <p class="max-h-24 overflow-y-auto text-[10px] font-mono text-destructive break-words">
    {diagnosis.detail}
  </p>
</div>
