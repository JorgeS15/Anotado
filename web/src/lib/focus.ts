const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside a dialog while it is open: Tab cycles through its
 * controls, Escape closes it, and focus goes back where it was on close.
 * Returns the cleanup function.
 */
export function trapFocus(root: HTMLElement, onescape?: () => void): () => void {
  const previous = document.activeElement as HTMLElement | null;
  const focusables = () =>
    [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);

  // Focus the dialog itself (not a field, which would open the phone's keyboard), so the first Tab enters it.
  if (!root.contains(document.activeElement)) {
    if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
    root.focus({ preventScroll: true });
  }

  const onkeydown = (e: KeyboardEvent) => {
    // Only the topmost dialog reacts.
    const dialogs = document.querySelectorAll('[aria-modal="true"]');
    if (dialogs[dialogs.length - 1] !== root) return;
    if (e.key === 'Escape' && onescape) {
      // A menu open inside the dialog closes first.
      if (root.querySelector('[role="menu"]')) return;
      e.preventDefault();
      e.stopPropagation();
      onescape();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !root.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onkeydown, true);
  return () => {
    document.removeEventListener('keydown', onkeydown, true);
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  };
}
