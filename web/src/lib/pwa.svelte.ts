/** Service worker update and install state, set from main.ts. */
export const pwa = $state<{
  needRefresh: boolean;
  update: () => void;
  canInstall: boolean;
  install: () => Promise<void>;
}>({
  needRefresh: false,
  update: () => location.reload(),
  canInstall: false,
  install: async () => {},
});

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Lets the app offer a proper install (an app in the launcher), instead of
 * relying on the browser menu, where "Add to home screen" may only create a shortcut.
 */
export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const prompt = e as BeforeInstallPromptEvent;
    pwa.install = async () => {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') pwa.canInstall = false;
    };
    pwa.canInstall = true;
  });
  window.addEventListener('appinstalled', () => {
    pwa.canInstall = false;
  });
}
