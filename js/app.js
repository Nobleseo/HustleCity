'use strict';

// =========================================================
// THEME TOGGLE (home)
// =========================================================
(function initThemeToggle() {
  const btn = document.getElementById('theme-toggle-home');
  if (!btn) return;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.textContent = dark ? '☀️' : '🌙';

  btn.addEventListener('click', () => {
    const current = localStorage.getItem('hc_theme') || 'system';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('hc_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    btn.textContent = next === 'dark' ? '☀️' : '🌙';
  });
})();

// =========================================================
// SETTINGS — theme buttons
// =========================================================
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = btn.dataset.theme;
    localStorage.setItem('hc_theme', t);
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const toggleBtn = document.getElementById('theme-toggle-home');
    if (toggleBtn) toggleBtn.textContent = dark ? '☀️' : '🌙';
    if (typeof refreshSettings === 'function') refreshSettings();
  });
});

// =========================================================
// SETTINGS — dashboard color picker
// =========================================================
document.querySelectorAll('.color-swatch').forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.dataset.color;
    if (!color) return;
    state.dashboardColor = color;
    saveState();
    const dash = document.getElementById('screen-dashboard');
    if (dash) dash.setAttribute('data-dash-color', color);
    if (typeof refreshSettings === 'function') refreshSettings();
    if (typeof trackEvent === 'function') trackEvent('dashboard_color_changed', { color });
  });
});

// =========================================================
// SETTINGS — Reset progress
// =========================================================
document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('Delete all progress? This cannot be undone.')) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('hc_camera');
  localStorage.removeItem('hc_city');
  localStorage.removeItem('hc_custom_city');
  localStorage.removeItem('hc_referrer');
  localStorage.removeItem('hc_vote_queue');
  localStorage.removeItem('hc_sync_queue');
  localStorage.removeItem('hc_install_dismissed');
  localStorage.removeItem('hc_install_shown');
  state = defaultState();
  saveState();
  showScreen('home');
});

// =========================================================
// HOME NAV BUTTONS
// =========================================================
document.getElementById('btn-open-settings').addEventListener('click', e => {
  e.preventDefault();
  showScreen('settings');
});
document.getElementById('btn-open-shop').addEventListener('click', () => showScreen('shop'));
document.getElementById('btn-open-lb').addEventListener('click', () => showScreen('leaderboard'));

// =========================================================
// DASHBOARD INLINE HAMBURGER TOGGLE
// =========================================================
(function wireDashMenu() {
  const btn = document.getElementById('dash-hamburger-btn');
  const menu = document.getElementById('dash-menu');
  if (!btn || !menu) return;

  // Start collapsed
  menu.classList.remove('open');
  btn.textContent = '☰';
  btn.classList.remove('open');

  btn.addEventListener('click', () => {
    const isOpen = menu.classList.contains('open');
    if (isOpen) {
      menu.classList.remove('open');
      btn.textContent = '☰';
      btn.classList.remove('open');
    } else {
      menu.classList.add('open');
      btn.textContent = '✕';
      btn.classList.add('open');
    }
  });
})();

// =========================================================
// DASHBOARD PLAY BUTTONS
// =========================================================
const dashPlayBtn = document.getElementById('btn-dash-play');
if (dashPlayBtn) {
  dashPlayBtn.addEventListener('click', () => {
    if (state.roundsToday >= totalRoundsToday()) {
      alert('You don finish your rounds for today. Come back tomorrow!');
      return;
    }
    if (typeof canPlay === 'function' && !canPlay()) {
      alert('Pay your overdue rent first! Check the bills panel.');
      return;
    }
    currentHustle = 'market_trader';
    if (typeof openSetupForHustle === 'function') openSetupForHustle('market_trader');
  });
}

const dashPlayWigBtn = document.getElementById('btn-dash-play-wig');
if (dashPlayWigBtn) {
  dashPlayWigBtn.addEventListener('click', () => {
    if (state.roundsToday >= totalRoundsToday()) {
      alert('You don finish your rounds for today. Come back tomorrow!');
      return;
    }
    if (typeof canPlay === 'function' && !canPlay()) {
      alert('Pay your overdue rent first! Check the bills panel.');
      return;
    }
    currentHustle = 'wig_plug';
    if (!state.wigStock) {
      state.wigStock = { bone_straight: 20, deep_wave: 15, braids: 10 };
      saveState();
    }
    const totalStock = Object.values(state.wigStock).reduce((a, b) => a + b, 0);
    if (totalStock === 0) {
      alert('You don sell finish all your wigs! Restock first.');
      return;
    }
    if (typeof openSetupForHustle === 'function') openSetupForHustle('wig_plug');
  });
}

// =========================================================
// SERVICE WORKER
// =========================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// =========================================================
// INSTALL PROMPT — max 2 shows, never after install
// =========================================================
let deferredInstall = null;

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function getShowCount() {
  return parseInt(localStorage.getItem('hc_install_shown') || '0', 10);
}

function bumpShowCount() {
  const n = getShowCount() + 1;
  localStorage.setItem('hc_install_shown', String(n));
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
});

function maybeOfferInstall() {
  if (!deferredInstall) return;
  if (isInstalled()) return;
  if (localStorage.getItem('hc_install_dismissed') === '1') return;
  if (getShowCount() >= 2) return;
  if (document.getElementById('install-banner')) return;

  bumpShowCount();

  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.style.cssText = 'position:fixed;bottom:90px;left:16px;right:16px;background:var(--oxblood);color:#F5EBDC;padding:14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.3);z-index:60;display:flex;align-items:center;gap:10px;font-family:inherit;font-size:13px;font-weight:700';
  banner.innerHTML =
    '<span style="flex:1">📲 Install Hustle City for offline play?</span>' +
    '<button id="ib-yes" style="background:var(--gold);color:#2E1F14;border:none;padding:8px 14px;border-radius:8px;font-weight:800;font-family:inherit;font-size:12px;cursor:pointer">Install</button>' +
    '<button id="ib-no" style="background:transparent;color:#F5EBDC;border:1px solid #F5EBDC;padding:8px 12px;border-radius:8px;font-weight:800;font-family:inherit;font-size:12px;cursor:pointer">Later</button>';

  document.body.appendChild(banner);

  document.getElementById('ib-yes').addEventListener('click', async () => {
    banner.remove();
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice;
    if (choice.outcome === 'accepted') {
      localStorage.setItem('hc_install_dismissed', '1');
      trackEvent('pwa_installed', {});
    }
    deferredInstall = null;
  });

  document.getElementById('ib-no').addEventListener('click', () => {
    banner.remove();
  });
}

// =========================================================
// BOOT
// =========================================================
refreshHome();
flushVoteQueue();
loadBrandSlots();
loadAnnouncement();
updateActivity('home');

// Apply dashboard color on boot (even before dashboard is shown)
(function applyDashboardColorOnBoot() {
  const color = state.dashboardColor || 'green';
  const dash = document.getElementById('screen-dashboard');
  if (dash) dash.setAttribute('data-dash-color', color);
})();

// If signed in, land on dashboard
setTimeout(() => {
  if (playerId) {
    refreshDashboard();
    showScreen('dashboard');
  }
}, 400);

// Claim referral rewards
setTimeout(() => {
  if (typeof claimPendingReferrals === 'function') claimPendingReferrals();
}, 1500);

// Trigger install prompt after round ends
if (typeof endRound === 'function') {
  const _originalEndRound = endRound;
  endRound = function () {
    _originalEndRound.apply(this, arguments);
    setTimeout(maybeOfferInstall, 1500);
  };
}
// =========================================================
// AUTH SAFETY NET
// If auth.js fails to load (404, syntax error, cache issue),
// this takes over so login still works. If auth.js loads fine,
// this does nothing.
// =========================================================
setTimeout(() => {
  console.log('[HUSTLE AUTH CHECK]', {
    showAuthModal: typeof window.showAuthModal,
    authScriptTag: document.querySelector('script[src*="auth.js"]')?.src || 'NO TAG FOUND IN HTML'
  });

  if (typeof window.showAuthModal === 'function') {
    console.log('[HUSTLE] auth.js loaded fine. Fallback not needed.');
    return;
  }

  console.warn('[HUSTLE] auth.js did NOT load. Activating fallback.');

  window.showAuthModal = function (mode) {
    const m = document.getElementById('auth-modal');
    if (m) m.style.display = 'flex';
    if (mode === 'signin' || mode === 'signup') {
      const isSignup = mode === 'signup';
      const tabUp = document.getElementById('auth-tab-signup');
      const tabIn = document.getElementById('auth-tab-signin');
      const sub = document.getElementById('auth-submit');
      if (tabUp) tabUp.classList.toggle('active', isSignup);
      if (tabIn) tabIn.classList.toggle('active', !isSignup);
      if (sub) sub.textContent = isSignup ? 'Create Account' : 'Sign In';
    }
  };

  const pill = document.getElementById('btn-signin-pill');
  if (pill) {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.showAuthModal('signin');
    });
  }

  const resBtn = document.getElementById('btn-signin-result');
  if (resBtn) resBtn.addEventListener('click', () => window.showAuthModal('signin'));

  const tabUp = document.getElementById('auth-tab-signup');
  const tabIn = document.getElementById('auth-tab-signin');
  if (tabUp) tabUp.addEventListener('click', () => window.showAuthModal('signup'));
  if (tabIn) tabIn.addEventListener('click', () => window.showAuthModal('signin'));

  const skipBtn = document.getElementById('auth-skip');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      const m = document.getElementById('auth-modal');
      if (m) m.style.display = 'none';
    });
  }

  const submitBtn = document.getElementById('auth-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const errEl = document.getElementById('auth-error');
      const isSignup = document.getElementById('auth-tab-signup').classList.contains('active');

      if (!email || !password) { errEl.textContent = 'Enter email and password.'; return; }
      if (password.length < 6) { errEl.textContent = 'Password must be 6+ characters.'; return; }
      errEl.textContent = 'Working…';

      const result = isSignup
        ? await sb.auth.signUp({ email, password })
        : await sb.auth.signInWithPassword({ email, password });

      if (result.error) { errEl.textContent = result.error.message; return; }
      if (result.data.user) {
        playerId = result.data.user.id;
        localStorage.setItem('hc_player_id', playerId);
        if (typeof updateHomeAuthButton === 'function') updateHomeAuthButton();
        document.getElementById('auth-modal').style.display = 'none';
        if (typeof refreshDashboard === 'function') refreshDashboard();
        if (typeof showScreen === 'function') showScreen('dashboard');
      }
    });
  }
}, 300);
// =========================================================
// SAFETY WIRING — HUD theme, dashboard nav, signout
// Idempotent: skips any button that already has a handler via dataset.wired
// =========================================================
(function safetyWire() {
  // HUD theme toggle
  const hudBtn = document.getElementById('hud-theme-btn');
  if (hudBtn && !hudBtn.dataset.wired) {
    hudBtn.dataset.wired = '1';
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    hudBtn.textContent = dark ? '☀️' : '🌙';
    hudBtn.addEventListener('click', () => {
      const current = localStorage.getItem('hc_theme') || 'system';
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('hc_theme', next);
      document.documentElement.setAttribute('data-theme', next);
      hudBtn.textContent = next === 'dark' ? '☀️' : '🌙';
      const homeBtn = document.getElementById('theme-toggle-home');
      if (homeBtn) homeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
    });
  }

  // Dashboard nav buttons — safety-wired so they work even if auth.js is dead
  const dashShop = document.getElementById('btn-dash-shop');
  if (dashShop && !dashShop.dataset.wired) {
    dashShop.dataset.wired = '1';
    dashShop.addEventListener('click', () => {
      if (typeof showScreen === 'function') showScreen('shop');
    });
  }

  const dashLb = document.getElementById('btn-dash-lb');
  if (dashLb && !dashLb.dataset.wired) {
    dashLb.dataset.wired = '1';
    dashLb.addEventListener('click', () => {
      if (typeof showScreen === 'function') showScreen('leaderboard');
    });
  }

  const dashSettings = document.getElementById('btn-dash-settings');
  if (dashSettings && !dashSettings.dataset.wired) {
    dashSettings.dataset.wired = '1';
    dashSettings.addEventListener('click', () => {
      if (typeof showScreen === 'function') showScreen('settings');
    });
  }

  const dashMarket = document.getElementById('btn-dash-market');
  if (dashMarket && !dashMarket.dataset.wired) {
    dashMarket.dataset.wired = '1';
    dashMarket.addEventListener('click', () => {
      if (typeof showScreen === 'function') showScreen('marketplace');
      if (typeof loadMarketplace === 'function') loadMarketplace();
    });
  }

  // Sign out — safety net if auth.js dead
  const btnOut = document.getElementById('btn-sign-out');
  if (btnOut && !btnOut.dataset.wired) {
    btnOut.dataset.wired = '1';
    btnOut.addEventListener('click', async () => {
      if (!confirm('Sign out? Your progress stays on this device.')) return;
      if (typeof sb !== 'undefined' && sb) await sb.auth.signOut();
      playerId = null;
      localStorage.removeItem('hc_player_id');
      if (typeof updateHomeAuthButton === 'function') updateHomeAuthButton();
      if (typeof refreshHome === 'function') refreshHome();
      if (typeof showScreen === 'function') showScreen('home');
    });
  }
})();

// =========================================================
// FORCE PWA UPDATE
// =========================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Check for updates every time the app opens
    reg.update();
  });
}
