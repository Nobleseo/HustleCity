'use strict';

// =========================================================
// HELPERS
// =========================================================
function fmtN(n) { return '₦' + Math.round(n).toLocaleString('en-NG'); }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function getDivision(l) {
  for (const d of CONFIG.divisions) { if (l <= d.max) return d; }
  return CONFIG.divisions[4];
}

function roundsLeftText() {
  const left = Math.max(0, totalRoundsToday() - state.roundsToday);
  return left > 0
    ? left + ' round' + (left === 1 ? '' : 's') + ' left today'
    : 'No rounds left — reload tomorrow';
}

function watStartOfDay(d) {
  const watMs = 60 * 60 * 1000;
  const wat = new Date(d.getTime() + watMs);
  return new Date(Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), wat.getUTCDate(), 0, 0, 0) - watMs);
}

// =========================================================
// HOME
// =========================================================
function refreshHome() {
  document.getElementById('home-wallet').textContent = fmtN(state.wallet);
  document.getElementById('home-today').textContent = fmtN(state.todayScore);
  document.getElementById('home-division').textContent = getDivision(state.lifetime).name;
  document.getElementById('setup-rounds').textContent = roundsLeftText();
}

// SCREEN NAVIGATION
// =========================================================
function showScreen(id) {
  // Signed-in users: "home" redirects to dashboard
  if (id === 'home' && playerId) {
    id = 'dashboard';
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + id);
  if (target) target.classList.add('active');
  document.body.classList.toggle('in-round', id === 'round');

  if (id === 'home') refreshHome();
  if (id === 'shop') refreshShop();
  if (id === 'leaderboard') refreshLeaderboard();
  if (id === 'settings') refreshSettings();
  if (id === 'dashboard') refreshDashboard();

  if (typeof updateActivity === 'function') updateActivity(id);
}
// =========================================================
// DASHBOARD
// =========================================================
function refreshDashboard() {
  const name = state.playerName || 'Hustler';
  const greeting = document.getElementById('dash-greeting');
  if (greeting) greeting.textContent = 'Hi, ' + name + ' 👋';

  const meta = document.getElementById('dash-meta');
    if (meta) {
    const cityLabel = (currentCity === 'other' && customCityName)
      ? customCityName.toUpperCase()
      : currentCity.toUpperCase();
    meta.textContent = getDivision(state.lifetime).name + ' Trader · ' + cityLabel;
  }

  const wallet = document.getElementById('dash-wallet');
  if (wallet) wallet.textContent = fmtN(state.wallet);

  const lifetime = document.getElementById('dash-lifetime');
  if (lifetime) lifetime.textContent = 'Lifetime ' + fmtN(state.lifetime);

  const rounds = document.getElementById('dash-rounds');
  if (rounds) rounds.textContent = state.roundsToday;

  const best = document.getElementById('dash-best');
  if (best) best.textContent = fmtN(state.bestToday || 0);

  const refCount = document.getElementById('dash-referrals');
  if (refCount) refCount.textContent = state.referralCount || 0;

  const refBoost = document.getElementById('dash-boost-tokens');
  if (refBoost) refBoost.textContent = state.boostTokens || 0;

  const refBonus = document.getElementById('dash-bonus-rounds');
  if (refBonus) refBonus.textContent = state.bonusRoundsToday || 0;

  if (typeof loadDashboardRank === 'function') loadDashboardRank();
}

// =========================================================
// LEADERBOARD
// =========================================================
let lbScope = 'today';

function aggregateRuns(data) {
  const byGuest = {};
  for (const r of data) {
    const k = r.guest_id || 'anon';
    if (!byGuest[k]) byGuest[k] = { guest_id: k, name: (r.player_name || k.slice(0, 8)), score: 0, nameLocked: false };
    byGuest[k].score += (r.score || 0);
    if (!byGuest[k].nameLocked && r.player_name) {
      byGuest[k].name = r.player_name;
      byGuest[k].nameLocked = true;
    }
  }
  return Object.values(byGuest).sort((a, b) => b.score - a.score);
}

async function refreshLeaderboard() {
  const list = document.getElementById('lb-list');
  if (!list) return;
  list.innerHTML = '<p class="small" style="padding:16px;text-align:center">Loading…</p>';
  if (!sb) {
    list.innerHTML = '<p class="small" style="padding:32px 16px;text-align:center">Offline — the board needs internet.</p>';
    return;
  }

  let rows = [];
  try {
    const q = sb.from('runs').select('guest_id, player_name, score, created_at').order('created_at', { ascending: false });
    const { data, error } = (lbScope === 'today')
      ? await q.gte('created_at', watStartOfDay(new Date()).toISOString()).limit(2000)
      : await q.limit(5000);
    if (error) throw error;
    if (data && data.length) rows = aggregateRuns(data);
  } catch (e) { console.warn('leaderboard fetch failed', e); }

  if (rows.length === 0) {
    list.innerHTML = '<p class="small" style="padding:32px 16px;text-align:center;line-height:1.5">' +
      (lbScope === 'today'
        ? 'No rounds yet today.<br><strong>Be the first to play.</strong> 🏁'
        : 'No history yet.<br>Play a round to enter the board.') +
      '</p>';
    return;
  }

  list.innerHTML = '';
  rows.slice(0, 50).forEach((row, i) => {
    const isSelf = row.guest_id === GUEST_ID;
    const el = document.createElement('div');
    el.className = 'lb-row' + (isSelf ? ' self' : '');
    el.innerHTML = '<div class="lb-rank' + (i < 3 ? ' top' : '') + '">#' + (i + 1) + '</div>' +
      '<div class="lb-avatar">' + escapeHtml((row.name || '?').charAt(0).toUpperCase()) + '</div>' +
      '<div class="lb-name">' + escapeHtml(row.name) + (isSelf ? ' (you)' : '') + '</div>' +
      '<div class="lb-score">₦' + row.score.toLocaleString('en-NG') + '</div>';
    list.appendChild(el);
  });

  const selfRank = rows.findIndex(r => r.guest_id === GUEST_ID);
  if (selfRank >= 50) {
    const div = document.createElement('div');
    div.style.cssText = 'padding:6px;text-align:center;color:var(--muted);font-size:11px';
    div.textContent = '· · ·';
    list.appendChild(div);
    const row = rows[selfRank];
    const el = document.createElement('div');
    el.className = 'lb-row self';
    el.innerHTML = '<div class="lb-rank">#' + (selfRank + 1) + '</div>' +
      '<div class="lb-avatar">' + escapeHtml((row.name || '?').charAt(0).toUpperCase()) + '</div>' +
      '<div class="lb-name">' + escapeHtml(row.name) + ' (you)</div>' +
      '<div class="lb-score">₦' + row.score.toLocaleString('en-NG') + '</div>';
    list.appendChild(el);
  }
}

// =========================================================
// SHOP
// =========================================================
function refreshShop() {
  document.getElementById('shop-wallet').textContent = fmtN(state.wallet);
  document.getElementById('shop-lifetime').textContent = fmtN(state.lifetime);
  const list = document.getElementById('shop-list');
  list.innerHTML = '';

  Object.entries(CONFIG.upgrades).forEach(([key, up]) => {
    const owned = state.upgrades.includes(key);
    const canAfford = state.wallet >= up.cost;
    const el = document.createElement('div');
    el.className = 'shop-item' + (owned ? ' owned' : '');
    el.innerHTML = '<div class="icon">' + up.icon + '</div>' +
      '<div class="info"><h4>' + up.name + '</h4><p>' + up.desc + '</p></div>' +
      '<button class="buy-btn" data-key="' + key + '"' + (owned || !canAfford ? ' disabled' : '') + '>' +
      (owned ? 'OWNED' : '₦' + up.cost.toLocaleString('en-NG')) + '</button>';
    list.appendChild(el);
  });

  list.querySelectorAll('.buy-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const up = CONFIG.upgrades[key];
      if (state.wallet < up.cost) return;
      state.wallet -= up.cost;
      state.upgrades.push(key);
      saveState();
      refreshShop();
      if (typeof trackEvent === 'function') trackEvent('upgrade_purchased', { upgrade_key: key, cost: up.cost });
    });
  });
}

// =========================================================
// SETTINGS
// =========================================================
function refreshSettings() {
  const current = localStorage.getItem('hc_theme') || 'system';
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === current));
}

// =========================================================
// MODAL
// =========================================================
function showModal(opts) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  const box = document.createElement('div'); box.className = 'modal';
  box.innerHTML = '<h3>' + opts.title + '</h3><p>' + opts.body + '</p>';
  const actions = document.createElement('div'); actions.className = 'modal-actions';
  opts.actions.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (a.primary ? 'btn-gold' : 'btn-secondary');
    btn.textContent = a.label;
    btn.addEventListener('click', () => { bg.remove(); a.fn(); });
    actions.appendChild(btn);
  });
  box.appendChild(actions); bg.appendChild(box); document.body.appendChild(bg);
}

// =========================================================
// CAMERA MODES
// =========================================================
let cameraMode = localStorage.getItem('hc_camera') || 'front';

function applyCamera() {
  const area = document.getElementById('game-area');
  if (area) area.setAttribute('data-camera', cameraMode);
  document.querySelectorAll('#camera-picker .cam-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cam === cameraMode);
  });
}

document.querySelectorAll('#camera-picker .cam-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    cameraMode = btn.dataset.cam;
    localStorage.setItem('hc_camera', cameraMode);
    applyCamera();
  });
});
applyCamera();

// =========================================================
// CITY STATE
// =========================================================
let currentCity = localStorage.getItem('hc_city') || 'lagos';
let customCityName = localStorage.getItem('hc_custom_city') || '';

function applyCity() {
  const area = document.getElementById('game-area');
  if (area) area.setAttribute('data-city', currentCity);
  const sel = document.getElementById('city-select');
  if (sel) sel.value = currentCity;

  const customRow = document.getElementById('custom-state-row');
  const customInput = document.getElementById('custom-state');
  if (customRow && customInput) {
    if (currentCity === 'other') {
      customRow.style.display = 'block';
      customInput.value = customCityName;
    } else {
      customRow.style.display = 'none';
    }
  }
}

(function wireCitySelector() {
  const sel = document.getElementById('city-select');
  if (sel) {
    sel.addEventListener('change', (e) => {
      currentCity = e.target.value;
      localStorage.setItem('hc_city', currentCity);
      applyCity();
    });
  }

  const customInput = document.getElementById('custom-state');
  if (customInput) {
    customInput.addEventListener('input', (e) => {
      customCityName = e.target.value.trim();
      localStorage.setItem('hc_custom_city', customCityName);
    });
  }
})();
applyCity();

// =========================================================
// RESULT SCREEN — SIGN-IN CTA VISIBILITY
// =========================================================
function updateResultSigninCta() {
  const btn = document.getElementById('btn-signin-result');
  if (!btn) return;
  btn.style.display = (!playerId && state.roundsToday >= 1) ? 'block' : 'none';
}
// Result screen "Home" — dynamic label + destination
(function wireResultHomeButton() {
  const btn = document.getElementById('btn-result-home');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (playerId) {
      btn.textContent = 'Dashboard';
      showScreen('dashboard');
    } else {
      btn.textContent = 'Home';
      showScreen('home');
    }
  });

  // Update label whenever the result screen becomes active
  const observer = new MutationObserver(() => {
    const resultScreen = document.getElementById('screen-result');
    if (resultScreen && resultScreen.classList.contains('active')) {
      btn.textContent = playerId ? 'Dashboard' : 'Home';
    }
  });
  const resultScreen = document.getElementById('screen-result');
  if (resultScreen) observer.observe(resultScreen, { attributes: true, attributeFilter: ['class'] });
})();
