'use strict';

// =========================================================
// THEME & SETTINGS
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

document.querySelectorAll('.color-swatch').forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.dataset.color;
    if (!color) return;
    state.dashboardColor = color;
    if (typeof saveState === 'function') saveState();
    const dash = document.getElementById('screen-dashboard');
    if (dash) dash.setAttribute('data-dash-color', color);
    if (typeof refreshSettings === 'function') refreshSettings();
  });
});

const btnReset = document.getElementById('btn-reset');
if (btnReset) {
  btnReset.addEventListener('click', () => {
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
}

// =========================================================
// HOME NAV BUTTONS
// =========================================================
const btnSettings = document.getElementById('btn-open-settings');
if (btnSettings) btnSettings.addEventListener('click', e => { e.preventDefault(); showScreen('settings'); });

const btnShop = document.getElementById('btn-open-shop');
if (btnShop) btnShop.addEventListener('click', () => showScreen('shop'));

const btnLb = document.getElementById('btn-open-lb');
if (btnLb) btnLb.addEventListener('click', () => showScreen('leaderboard'));

// =========================================================
// DASHBOARD INLINE HAMBURGER TOGGLE
// =========================================================
(function wireDashMenu() {
  const btn = document.getElementById('dash-hamburger-btn');
  const menu = document.getElementById('dash-menu');
  if (!btn || !menu) return;

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
// DASHBOARD BUTTONS (Safety Wired)
// =========================================================
function wireDashboardButtons() {
  const playBtn = document.getElementById('btn-dash-play');
  if (playBtn && !playBtn.dataset.wired) {
    playBtn.dataset.wired = '1';
    playBtn.addEventListener('click', () => {
      if (state.roundsToday >= totalRoundsToday()) return alert('You don finish your rounds for today. Come back tomorrow!');
      if (typeof canPlay === 'function' && !canPlay()) return alert('Pay your overdue rent first!');
      currentHustle = 'market_trader';
      if (typeof openSetupForHustle === 'function') openSetupForHustle('market_trader');
    });
  }

  const playWigBtn = document.getElementById('btn-dash-play-wig');
  if (playWigBtn && !playWigBtn.dataset.wired) {
    playWigBtn.dataset.wired = '1';
    playWigBtn.addEventListener('click', () => {
      if (state.roundsToday >= totalRoundsToday()) return alert('You don finish your rounds for today. Come back tomorrow!');
      if (typeof canPlay === 'function' && !canPlay()) return alert('Pay your overdue rent first!');
      currentHustle = 'wig_plug';
      if (!state.wigStock) { state.wigStock = { bone_straight: 20, deep_wave: 15, braids: 10 }; saveState(); }
      const totalStock = Object.values(state.wigStock).reduce((a, b) => a + b, 0);
      if (totalStock === 0) return alert('You don sell finish all your wigs! Restock first.');
      if (typeof openSetupForHustle === 'function') openSetupForHustle('wig_plug');
    });
  }

  const dashShop = document.getElementById('btn-dash-shop');
  if (dashShop && !dashShop.dataset.wired) {
    dashShop.dataset.wired = '1';
    dashShop.addEventListener('click', () => showScreen('shop'));
  }

  const dashLb = document.getElementById('btn-dash-lb');
  if (dashLb && !dashLb.dataset.wired) {
    dashLb.dataset.wired = '1';
    dashLb.addEventListener('click', () => showScreen('leaderboard'));
  }

  const dashSettings = document.getElementById('btn-dash-settings');
  if (dashSettings && !dashSettings.dataset.wired) {
    dashSettings.dataset.wired = '1';
    dashSettings.addEventListener('click', () => showScreen('settings'));
  }

  const dashMarket = document.getElementById('btn-dash-market');
  if (dashMarket && !dashMarket.dataset.wired) {
    dashMarket.dataset.wired = '1';
    dashMarket.addEventListener('click', () => {
      showScreen('marketplace');
      if (typeof loadMarketplace === 'function') loadMarketplace();
    });
  }

  const btnOut = document.getElementById('btn-sign-out');
  if (btnOut && !btnOut.dataset.wired) {
    btnOut.dataset.wired = '1';
    btnOut.addEventListener('click', async () => {
      if (!confirm('Sign out? Your progress stays on this device.')) return;
      if (typeof sb !== 'undefined' && sb) await sb.auth.signOut();
      playerId = null;
      localStorage.removeItem('hc_player_id');
      if (typeof updateHomeAuthButton === 'function') updateHomeAuthButton();
      showScreen('home');
    });
  }
}
// Wire them immediately
wireDashboardButtons();


// =========================================================
// HUD THEME TOGGLE (In-Game)
// =========================================================
const hudThemeBtn = document.getElementById('hud-theme-btn');
if (hudThemeBtn) {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  hudThemeBtn.textContent = dark ? '☀️' : '🌙';
  
  hudThemeBtn.addEventListener('click', () => {
    const current = localStorage.getItem('hc_theme') || 'system';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('hc_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    hudThemeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
    const homeBtn = document.getElementById('theme-toggle-home');
    if (homeBtn) homeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
  });
}

// =========================================================
// SERVICE WORKER & PWA
// =========================================================
let deferredInstall = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.update();
  }).catch(() => {});
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
});

function maybeOfferInstall() {
  if (!deferredInstall) return;
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) return;
  if (localStorage.getItem('hc_install_dismissed') === '1') return;
  const showCount = parseInt(localStorage.getItem('hc_install_shown') || '0', 10);
  if (showCount >= 2) return;
  if (document.getElementById('install-banner')) return;

  localStorage.setItem('hc_install_shown', String(showCount + 1));

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
      if (typeof trackEvent === 'function') trackEvent('pwa_installed', {});
    }
    deferredInstall = null;
  });

  document.getElementById('ib-no').addEventListener('click', () => banner.remove());
}

// Trigger install prompt after round ends
if (typeof endRound === 'function') {
  const _originalEndRound = endRound;
  endRound = function () {
    _originalEndRound.apply(this, arguments);
    setTimeout(maybeOfferInstall, 1500);
  };
}

// =========================================================
// BOOT SEQUENCE — LAND ON HOMEPAGE
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

// FORCE THE HOMEPAGE TO SHOW ON LOAD
if (typeof showScreen === 'function') {
  showScreen('home');
}

// Claim referral rewards
setTimeout(() => {
  if (typeof claimPendingReferrals === 'function') claimPendingReferrals();
}, 1500);

// =========================================================
// AUTH SAFETY NET (Fallback if auth.js fails)
// =========================================================
setTimeout(() => {
  if (typeof window.showAuthModal === 'function') return; // auth.js loaded fine

  console.warn('[HUSTLE] auth.js did NOT load. Activating fallback.');

  window.showAuthModal = function (mode) {
    const m = document.getElementById('auth-modal');
    if (m) m.style.display = 'flex';
    const isSignup = (mode === 'signup');
    const tabUp = document.getElementById('auth-tab-signup');
    const tabIn = document.getElementById('auth-tab-signin');
    const sub = document.getElementById('auth-submit');
    if (tabUp) tabUp.classList.toggle('active', isSignup);
    if (tabIn) tabIn.classList.toggle('active', !isSignup);
    if (sub) sub.textContent = isSignup ? 'Create Account' : 'Sign In';
  };

  const pill = document.getElementById('btn-signin-pill');
  if (pill) {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof playerId !== 'undefined' && playerId) {
        showScreen('dashboard');
      } else {
        window.showAuthModal('signin');
      }
    });
  }

  const resBtn = document.getElementById('btn-signin-result');
  if (resBtn) resBtn.addEventListener('click', () => window.showAuthModal('signin'));

  const tabUp = document.getElementById('auth-tab-signup');
  const tabIn = document.getElementById('auth-tab-signin');
  if (tabUp) tabUp.addEventListener('click', () => window.showAuthModal('signup'));
  if (tabIn) tabIn.addEventListener('click', () => window.showAuthModal('signin'));

  const skipBtn = document.getElementById('auth-skip');
  if (skipBtn) skipBtn.addEventListener('click', () => document.getElementById('auth-modal').style.display = 'none');

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

      const result = isSignup ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });

      if (result.error) { errEl.textContent = result.error.message; return; }
      if (result.data.user) {
        playerId = result.data.user.id;
        localStorage.setItem('hc_player_id', playerId);
        if (!state.playerName) { state.playerName = (email || '').split('@')[0] || 'Hustler'; saveState(); }
        if (typeof updateHomeAuthButton === 'function') updateHomeAuthButton();
        document.getElementById('auth-modal').style.display = 'none';
        if (typeof refreshDashboard === 'function') refreshDashboard();
        showScreen('dashboard');
      }
    });
  }
}, 300);
