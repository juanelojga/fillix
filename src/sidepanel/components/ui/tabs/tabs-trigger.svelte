<script lang="ts">
	import { Tabs as TabsPrimitive } from "bits-ui";
	import { cn } from "$components/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		"relative inline-flex h-full flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 gap-1.5 transition-all duration-150 ease-in-out",
		"text-[11px] font-semibold tracking-widest uppercase",
		"text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200",
		"data-[state=active]:bg-neutral-900 data-[state=active]:text-white data-[state=active]:shadow dark:data-[state=active]:bg-white dark:data-[state=active]:text-neutral-900",
		"group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start",
		"disabled:pointer-events-none disabled:opacity-50",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
		"[&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		className
	)}
	{...restProps}
/>
