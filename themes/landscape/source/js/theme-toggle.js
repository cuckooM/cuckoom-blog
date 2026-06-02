(function() {
  'use strict';

  var THEME_KEY = 'cuckoom-blog-theme';
  var DARK = 'dark';
  var LIGHT = 'light';

  // Get current theme
  function getTheme() {
    var stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored;
    // No stored preference - follow system
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT;
  }

  // Apply theme
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateToggleButton(theme);
  }

  // Update toggle button icon
  function updateToggleButton(theme) {
    var btn = document.querySelector('.theme-toggle-btn');
    if (!btn) return;

    var icon = btn.querySelector('.theme-icon');
    if (!icon) return;

    if (theme === DARK) {
      icon.textContent = '\u2600\uFE0F'; // sun
      icon.setAttribute('aria-label', '\u5207\u6362\u5230\u6D45\u8272\u6A21\u5F0F');
      btn.setAttribute('aria-label', '\u5207\u6362\u5230\u6D45\u8272\u6A21\u5F0F');
    } else {
      icon.textContent = '\uD83C\uDF19'; // moon
      icon.setAttribute('aria-label', '\u5207\u6362\u5230\u6DF1\u8272\u6A21\u5F0F');
      btn.setAttribute('aria-label', '\u5207\u6362\u5230\u6DF1\u8272\u6A21\u5F0F');
    }
  }

  // Toggle theme
  function toggleTheme() {
    var current = getTheme();
    var next = current === DARK ? LIGHT : DARK;
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  // Initialize
  function init() {
    applyTheme(getTheme());

    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? DARK : LIGHT);
      }
    });

    // Bind toggle button
    var btn = document.querySelector('.theme-toggle-btn');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
    }
  }

  // Run after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
