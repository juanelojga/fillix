import { getWorkflowsFolder, setWorkflowsFolder } from '../lib/storage';

export async function loadSidepanelSettings(): Promise<void> {
  const folder = await getWorkflowsFolder();
  const input = document.getElementById('workflows-folder') as HTMLInputElement | null;
  if (input) input.value = folder;
}

export async function saveSidepanelSettings(): Promise<void> {
  const input = document.getElementById('workflows-folder') as HTMLInputElement | null;
  const folder = input?.value.trim() || 'fillix-workflows';
  await setWorkflowsFolder(folder);
}
