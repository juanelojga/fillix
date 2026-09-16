<script lang="ts">
  import ModelPicker from './ModelPicker.svelte';
  import { effectiveSummaryModel, modelList, newsModel, setNewsModel } from '../stores/settings';

  /** Models only — no "Same as Chat" row. '' is still the stored default and still means
   *  "follow the active model" (resolveSummaryModel), it just is not offered as a choice:
   *  the dropdown answers "which model summarizes this?" with model names. Picking one is
   *  therefore one-way from the UI; storage returns to '' when removeModel drops the
   *  selected model in Settings. */
  const options = $derived($modelList.map((m) => ({ value: m, label: m })));
</script>

<!-- While '' is stored the trigger shows the model it resolves to, so the header always
     names the model that will actually run. -->
<ModelPicker
  value={$newsModel}
  {options}
  display={$effectiveSummaryModel}
  label="Summary model"
  align="end"
  onSelect={(m) => setNewsModel(m)}
/>
