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
// SETTINGS SCREEN — theme buttons
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
// SETTINGS — Reset progress
// =========================================================
document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('Delete all progress? This cannot be undone.')) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('hc_camera');
  localStorage.removeItem('hc_city');
  localStorage.removeItem('hc_referrer');
  localStorage.removeItem('hc_vote_queue');
  localStorage.removeItem('hc_sync_queue');
  localStorage.removeItem('hc_install_dismissed');
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
// SERVICE WORKER
// =========================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// =========================================================
// INSTALL PROMPT
// =========================================================
let deferredInstall = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (state.roundsToday >= 1) maybeOfferInstall();
});

function maybeOfferInstall() {
  if (!deferredInstall) return;
  if (localStorage.getItem('hc_install_dismissed') === '1') return;
  if (document.getElementById('install-banner')) return;

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
    if (choice.outcome === 'accepted') trackEvent('pwa_installed', {});
    deferredInstall = null;
  });

  document.getElementById('ib-no').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('hc_install_dismissed', '1');
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

// If signed in, land on dashboard
setTimeout(() => {
  if (playerId) {
    refreshDashboard();
    showScreen('dashboard');
  }
}, 400);

// Claim any pending referral rewards (returns +1 Boost Token +1 bonus round each)
setTimeout(() => {
  if (typeof claimPendingReferrals === 'function') claimPendingReferrals();
}, 1500);

// Trigger install prompt after a round ends (wrapped safely)
if (typeof endRound === 'function') {
  const _originalEndRound = endRound;
  endRound = function () {
    _originalEndRound.apply(this, arguments);
    setTimeout(maybeOfferInstall, 1500);
  };
}
