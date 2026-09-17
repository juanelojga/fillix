<script lang="ts">
  import ModelPicker from './ModelPicker.svelte';
  import type { PlaybookId } from '$lib/playbooks/playbook';
  import { PLAYBOOKS } from '$lib/playbooks/registry';
  import { selectedPlaybookId, selectPlaybook } from '../stores/playbook';

  const options = PLAYBOOKS.map((p) => ({ value: p.id, label: p.label }));
</script>

<!-- The cast is safe by construction: every row's value comes from PLAYBOOKS, and
     ModelPicker's onSelect is typed `string` because it is shared with the model pickers.

     ModelPicker is presentational — a listbox over {value, label} rows — so it carries
     playbooks as readily as models. align="end" because the trigger sits at the panel's
     right edge, and the panel can be as narrow as 240px. -->
<ModelPicker
  value={$selectedPlaybookId}
  {options}
  label="Playbook"
  align="end"
  emptyHint="No playbooks available."
  onSelect={(id) => selectPlaybook(id as PlaybookId)}
/>
