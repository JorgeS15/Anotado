/** Service worker update state, set from main.ts. */
export const pwa = $state<{ needRefresh: boolean; update: () => void }>({
  needRefresh: false,
  update: () => location.reload(),
});
