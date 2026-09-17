<script lang="ts">
  import { Input } from '$components/ui/input';
  import {
    WEEKDAYS,
    WEEKDAY_NAMES,
    describeRanges,
    hasAnyHours,
    type Weekday,
  } from '$lib/profile/availability';
  import { parseDayHours } from '$lib/profile/day-hours';
  import {
    availability,
    browserTimeZone,
    copyDayToWeek,
    setDayHours,
    setTimeZone,
  } from '../stores/availability';

  let zoneInput = $state('');

  // The store is the source of truth; the field mirrors it, including the trim on save.
  $effect(() => {
    zoneInput = $availability.timeZone;
  });

  const anyHours = $derived(hasAnyHours($availability));

  /** The zone the job page's client hours were converted into. Mismatch drops the overlap. */
  const zoneMismatch = $derived(
    $availability.timeZone !== '' && $availability.timeZone !== browserTimeZone(),
  );

  const savedLine = $derived.by(() => {
    if ($availability.updatedAt === 0) return 'Nothing set yet';
    const time = new Date($availability.updatedAt).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `Saved ${time}`;
  });

  /**
   * What the parser made of one day.
   *
   * Echoed under every field, and that is the safety net the whole free-text field rests on:
   * the parser gives `9-1` and `3-6pm` the benefit of the doubt, so the only honest way to
   * offer that is to show the reading back. A wrong one is then visible immediately, rather
   * than surfacing in an answer a recruiter has already read.
   */
  function reading(day: Weekday) {
    const { ranges, unreadable } = parseDayHours($availability.days[day]);
    return { text: describeRanges(ranges) || 'not available', unreadable };
  }
</script>

<section class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
  <div class="flex items-start justify-between gap-2">
    <h3 class="text-xs font-semibold text-slate-800">Meeting availability</h3>
    <p class="shrink-0 text-[10px] text-muted-foreground">{savedLine}</p>
  </div>

  <!-- Stated because the box directly above behaves the opposite way: the profile document has
       to be saved and re-indexed, and these hours are neither. -->
  <p class="text-[11px] text-muted-foreground leading-relaxed">
    When you can take a call, Monday to Friday. Type the hours however you like —
    <code class="font-mono">9am-1pm</code>, <code class="font-mono">9-1</code>,
    <code class="font-mono">09:00–13:00</code>, or several ranges:
    <code class="font-mono">9-1, 3-6pm</code>. Leave a day empty if you are not available.
    These go into every drafted answer as a
    <code class="font-mono">## Meeting availability</code> section, and they save as you type.
    They are not embedded, so changing them never makes your search index stale.
  </p>

  <div class="flex flex-col gap-2">
    {#each WEEKDAYS as day (day)}
      {@const parsed = reading(day)}
      <div class="flex flex-col gap-0.5">
        <div class="flex items-center gap-2">
          <label
            for="hours-{day}"
            class="w-9 shrink-0 text-[11px] font-medium text-slate-700"
          >
            {WEEKDAY_NAMES[day].slice(0, 3)}
          </label>
          <input
            id="hours-{day}"
            type="text"
            inputmode="text"
            class="h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-xs
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="9am-1pm, 3-6pm"
            aria-label="{WEEKDAY_NAMES[day]} hours"
            value={$availability.days[day]}
            oninput={(e) => setDayHours(day, (e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div class="pl-11 flex flex-col gap-0.5">
          {#if parsed.unreadable.length > 0}
            {#each parsed.unreadable as fragment (fragment)}
              <p class="text-[10px] text-amber-700">
                Couldn't read "{fragment}" — try something like 9am-1pm.
              </p>
            {/each}
          {/if}
          <p class="text-[10px] text-muted-foreground">{parsed.text}</p>
        </div>
      </div>
    {/each}
  </div>

  <div>
    <button
      type="button"
      class="rounded-md border border-input bg-background px-2.5 py-1 text-[11px]
             hover:bg-accent focus-visible:outline-none focus-visible:ring-2
             focus-visible:ring-ring"
      onclick={() => copyDayToWeek('mon')}
    >
      Apply Monday to every weekday
    </button>
  </div>

  <label for="availability-zone" class="text-[11px] font-medium text-slate-700">Time zone</label>
  <Input
    id="availability-zone"
    bind:value={zoneInput}
    placeholder="America/Guayaquil"
    class="h-8 font-mono text-xs"
    onblur={() => setTimeZone(zoneInput)}
    onkeydown={(e: KeyboardEvent) => {
      if (e.key === 'Enter') void setTimeZone(zoneInput);
    }}
  />

  {#if zoneMismatch}
    <!-- A job page states the client's hours already converted into the *browser's* zone.
         Intersecting those with hours declared in another zone would be wrong by exactly the
         offset between them, so the overlap is dropped rather than guessed. -->
    <p class="text-[11px] text-amber-700 leading-relaxed">
      This is not your browser's time zone ({browserTimeZone()}). Your hours will still go into
      every answer, but the overlap with the client's hours will be left out — a job page states
      those in the browser's zone, so comparing them would be off by the difference.
    </p>
  {/if}

  {#if !anyHours}
    <p class="text-[11px] text-muted-foreground">
      No hours entered yet, so nothing about your schedule is added to an answer.
    </p>
  {/if}
</section>
