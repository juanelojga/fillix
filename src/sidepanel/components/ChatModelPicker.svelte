<script lang="ts">
  import ModelPicker from './ModelPicker.svelte';
  import { ollamaConfig, modelList, setActiveModel } from '../stores/settings';

  const value = $derived($ollamaConfig?.model ?? '');
  const options = $derived($modelList.map((m) => ({ value: m, label: m })));
</script>

<!-- No `label` prop: the trigger's accessible name stays the model name. -->
<ModelPicker {value} {options} onSelect={(m) => setActiveModel(m)} />
