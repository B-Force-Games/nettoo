// Netto frontend bootstrap.
// Feature code lives in the ordered classic-script modules loaded before this file.

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => { await initApp(); window.openNavigationDestination?.(); });
} else {
  Promise.resolve(initApp()).then(() => window.openNavigationDestination?.());
}
