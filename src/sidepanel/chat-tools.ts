export function appendToolIndicator(
  toolName: string,
  args: Record<string, string>,
  container: HTMLElement,
): HTMLElement {
  const primaryArg = Object.values(args)[0] ?? '';
  const el = document.createElement('div');
  el.className = 'tool-indicator loading';
  el.textContent = `⚙ ${toolName}${primaryArg ? `: ${primaryArg}` : ''}`;
  el.addEventListener('click', () => {
    const existing = el.querySelector('.tool-result-preview');
    if (existing) {
      existing.remove();
      return;
    }
    const result = el.dataset['result'];
    if (!result) return;
    const preview = document.createElement('div');
    preview.className = 'tool-result-preview';
    preview.textContent = result.slice(0, 500);
    el.appendChild(preview);
  });
  container.appendChild(el);
  return el;
}

export function resolveToolIndicator(el: HTMLElement, result: string): void {
  el.classList.remove('loading');
  el.classList.add('done');
  el.dataset['result'] = result;
}
