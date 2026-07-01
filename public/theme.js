/* Theme switcher — carried over from the OnlyMIP MusicQuiz template and
   re-pointed at the WordQuiz brand. Persists choice in localStorage and
   applies before first paint to avoid a flash. */
(function () {
  var THEME_KEY = 'onlymip-wod-theme';

  var BRAND_PREFIX = {
    dark: 'OnlyMIP',
    ua:   'SLAVA MIP',
    tpb:  'The MIP Bay',
    ph:   'MIPHUB',
    spo:  'MIPify',
    yt:   'MIPTube'
  };
  var BRAND_SUFFIX = 'WordQuiz';

  function getSaved() {
    try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { return 'dark'; }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? '' : theme);

    var prefix = BRAND_PREFIX[theme] || BRAND_PREFIX.dark;
    document.querySelectorAll('.brand-text').forEach(function (el) {
      el.textContent = prefix + ' ' + BRAND_SUFFIX;
    });

    var sel = document.getElementById('theme-select');
    if (sel) sel.value = theme;
  }

  var saved = getSaved();
  if (saved !== 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(saved);
    var sel = document.getElementById('theme-select');
    if (sel) {
      sel.addEventListener('change', function () {
        var next = sel.value;
        try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
        applyTheme(next);
      });
    }
  });
})();
