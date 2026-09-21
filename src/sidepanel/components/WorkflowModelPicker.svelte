<script lang="ts">
  import ModelPicker from './ModelPicker.svelte';
  import {
    effectiveWorkflowModel,
    modelList,
    setWorkflowModel,
    workflowModel,
  } from '../stores/settings';

  /**
   * Which model the Workflows tab runs on — the drafting and the schedule extraction.
   * The capture itself spends no generation, and the embedding model is a separate knob
   * in the Profile tab.
   *
   * Models only, no "Same as Chat" row, for NewsModelPicker's reason: the header question
   * is "which model runs this?", and the answer is a model name. '' is still the stored
   * default and still means "follow the active model" (resolveWorkflowModel), it is just
   * not offered as a choice — the trigger shows the resolved name instead, and
   * `removeModel` is the only thing that puts '' back.
   */
  const options = $derived($modelList.map((m) => ({ value: m, label: m })));
</script>

<ModelPicker
  value={$workflowModel}
  {options}
  display={$effectiveWorkflowModel}
  label="Workflow model"
  align="end"
  onSelect={(m) => setWorkflowModel(m)}
/>
