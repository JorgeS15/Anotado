/** Grows a textarea with its content. Pass the value so it also resizes on external changes. */
export function autogrow(node: HTMLTextAreaElement, _value?: string) {
  const resize = () => {
    const scroller = node.closest('.scroll');
    const top = scroller?.scrollTop;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
    if (scroller && top !== undefined) scroller.scrollTop = top;
  };
  node.addEventListener('input', resize);
  const observer = new ResizeObserver(() => resize());
  observer.observe(node.parentElement ?? node);
  queueMicrotask(resize);
  return {
    update: () => queueMicrotask(resize),
    destroy: () => {
      node.removeEventListener('input', resize);
      observer.disconnect();
    },
  };
}
