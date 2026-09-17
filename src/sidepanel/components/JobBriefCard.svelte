<script lang="ts">
  import { missingRequiredSkills, type JobBrief } from '$lib/playbooks/job-brief';

  let { brief }: { brief: JobBrief } = $props();

  const attributes = $derived(Object.entries(brief.attributes));
  const missing = $derived(missingRequiredSkills(brief));
  const claimed = $derived(brief.skills.required.filter((s) => s.onProfile));
</script>

<section class="border-b px-3 py-2">
  <h3 class="text-xs font-semibold text-slate-800">At a glance</h3>

  {#if attributes.length > 0}
    <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {#each attributes as [label, value] (label)}
        <dt class="text-[11px] text-muted-foreground">{label}</dt>
        <dd class="m-0 text-[11px] font-medium text-slate-700 break-words">{value}</dd>
      {/each}
    </dl>
  {:else}
    <p class="mt-1 text-[11px] text-muted-foreground">
      No job attributes on this page — Toptal may have changed its markup.
    </p>
  {/if}

  {#if brief.skills.required.length > 0}
    <div class="mt-3 flex flex-col gap-1.5">
      <p class="text-[11px] text-muted-foreground">
        {claimed.length} of {brief.skills.required.length} required skills are on your Toptal profile.
      </p>

      <!-- The gaps come first and are the only thing coloured. They are what an answer must
           not claim experience with, so they are the part worth reading. -->
      {#if missing.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each missing as name (name)}
            <span
              class="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px]
                     text-amber-800"
            >
              {name}
            </span>
          {/each}
        </div>
      {/if}

      {#if claimed.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each claimed as skill (skill.name)}
            <span
              class="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px]
                     text-slate-600"
            >
              {skill.name}
            </span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>
