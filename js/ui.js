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

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

// =========================================================
// HOME
// =========================================================
function refreshHome() {
  const w = document.getElementById('home-wallet');
  if (w) w.textContent = fmtN(state.wallet);
  const t = document.getElementById('home-today');
  if (t) t.textContent = fmtN(state.todayScore);
  const d = document.getElementById('home-division');
  if (d) d.textContent = getDivision(state.lifetime).name;
  const r = document.getElementById('setup-rounds');
  if (r) r.textContent = roundsLeftText();
}

// =========================================================
// SCREEN NAV
// =========================================================
 function showScreen(id) {
  // 1. Remove active from ALL screens
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  
  // 2. Add active ONLY to the requested screen
  const target = document.getElementById('screen-' + id);
  if (target) target.classList.add('active');
  
  document.body.classList.toggle('in-round', id === 'round');

  // 3. Refresh data for the specific screen
  if (id === 'home') refreshHome();
  if (id === 'shop') refreshShop();
  if (id === 'leaderboard') refreshLeaderboard();
  if (id === 'settings') refreshSettings();
  if (id === 'dashboard') refreshDashboard();

  if (typeof updateActivity === 'function') updateActivity(id);
    // NEW: Load the announcement when they open the dashboard
  if (id === 'dashboard') {
    if (typeof loadDashboardAnnouncement === 'function') loadDashboardAnnouncement();
  }
}
// =========================================================
// BILLS
// =========================================================
function getBills() {
  if (!playerId) return [];

  const today = todayKey();

  if (!state.firstPlayDate) {
    state.firstPlayDate = today;
    saveState();
  }

  const firstPlayDays = daysSince(state.firstPlayDate) || 0;
  if (firstPlayDays < CONFIG.bills.graceDays) return [];

  const bills = [];
  const cfg = CONFIG.bills.bills;

  // Rent — weekly, first due on day 2
  if (firstPlayDays >= CONFIG.bills.rentFirstDueDay) {
    const lastRent = state.lastRentPaid;
    const daysSinceRent = lastRent ? (daysSince(lastRent) || 0) : CONFIG.bills.rentFirstDueDay;
    if (!lastRent || daysSinceRent >= cfg.rent.cycleDays) {
      bills.push({
        key: 'rent',
        name: cfg.rent.name,
        amount: cfg.rent.amount,
        description: cfg.rent.description,
        overdue: (daysSinceRent || 0) > cfg.rent.cycleDays + 2
      });
    }
  }

  // NEPA — daily
  if (state.lastNepaPaid !== today) {
    bills.push({
      key: 'nepa',
      name: cfg.nepa.name,
      amount: cfg.nepa.amount,
      description: cfg.nepa.description,
      overdue: false
    });
  }

  // Sanitation — daily
  if (state.lastSanitationPaid !== today) {
    bills.push({
      key: 'sanitation',
      name: cfg.sanitation.name,
      amount: cfg.sanitation.amount,
      description: cfg.sanitation.description,
      overdue: false
    });
  }

  return bills;
}

function canPlay() {
  const bills = getBills();
  const overdueRent = bills.find(b => b.key === 'rent' && b.overdue);
  return !overdueRent;
}

function refreshBills() {
  const container = document.getElementById('dash-bills-list');
  if (!container) return;

  const bills = getBills();

  if (bills.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--muted);font-weight:700;text-align:center;padding:8px 0">✅ All bills paid — nothing due right now</p>';
    return;
  }

  container.innerHTML = bills.map(b => {
    const canAfford = state.wallet >= b.amount;
    return '<div class="bill-row' + (b.overdue ? ' overdue' : '') + '">' +
      '<div class="bill-name">' + b.name +
        (b.overdue ? ' <span class="bill-overdue-badge">Overdue</span>' : '') +
        '<div class="bill-due">' + b.description + '</div>' +
      '</div>' +
      '<div class="bill-amount">₦' + b.amount.toLocaleString('en-NG') + '</div>' +
      '<button class="bill-pay-btn" data-bill="' + b.key + '"' + (!canAfford ? ' disabled' : '') + '>Pay</button>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.bill-pay-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => payBill(btn.dataset.bill));
  });
}

function payBill(key) {
  const today = todayKey();
  const bills = getBills();
  const bill = bills.find(b => b.key === key);
  if (!bill) return;

  if (state.wallet < bill.amount) {
    alert('Not enough money. Play a round first.');
    return;
  }

  state.wallet -= bill.amount;

  if (key === 'rent') state.lastRentPaid = today;
  if (key === 'neppa') state.lastNeppaPaid = today;
  if (key === 'sanitation') state.lastSanitationPaid = today;

  saveState();
  refreshDashboard();

  if (typeof trackEvent === 'function') trackEvent('bill_paid', { bill: key, amount: bill.amount });
}

// =========================================================
// DASHBOARD
// =========================================================
function refreshDashboard() {
  const dashScreen = document.getElementById('screen-dashboard');
  if (dashScreen) {
    dashScreen.setAttribute('data-dash-color', state.dashboardColor || 'green');
  }

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

  refreshStockBars();
  refreshBills();
  refreshVendorBanner();

  if (typeof loadDashboardRank === 'function') loadDashboardRank();
}

function refreshStockBars() {
  const stockBox = document.getElementById('dash-wig-stock');
  if (!stockBox) return;

  const stock = state.wigStock || {};
  const max = CONFIG.hustles.wig_plug.restockAmount || 20;
  const totalStock = Object.values(stock).reduce((a, b) => a + b, 0);

  let html = '<div class="dash-section-title">📦 Wig Plug Stock';
  if (totalStock === 0) html += ' <span style="color:#A52818">— Out!</span>';
  html += '</div>';

  html += Object.entries(stock).map(([k, v]) => {
    const prod = CONFIG.hustles.wig_plug.products[k];
    const pct = Math.min(100, (v / max) * 100);
    let color = '#2E5B3A';
    if (v === 0) color = '#A52818';
    else if (v < max * 0.25) color = '#A52818';
    else if (v < max * 0.5) color = '#D4A017';

    return '<div class="dash-stock-row">' +
      '<span class="dash-stock-name">' + (prod ? prod.emoji + ' ' + prod.label : k) + '</span>' +
      '<div class="dash-stock-bar-bg"><div class="dash-stock-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '<span class="dash-stock-count" style="color:' + color + '">' + v + '</span>' +
    '</div>';
  }).join('');

  stockBox.innerHTML = html;

     // Restock button with limit
    const restockBtn = document.getElementById('btn-restock');
    if (restockBtn) {
      const cost = CONFIG.hustles.wig_plug.restockCost;
      const maxStock = 100;
      const allFull = Object.keys(stock).every(k => (stock[k] || 0) >= maxStock);
      const canAfford = state.wallet >= cost;
      
      restockBtn.disabled = !canAfford || allFull;
      restockBtn.textContent = allFull ? 'Store Full (Max 100)' : '🔄 Restock all (+20 each) — ₦' + cost.toLocaleString('en-NG');
      restockBtn.style.opacity = (!canAfford || allFull) ? '0.5' : '1';
    }

function refreshVendorBanner() {
  const vendorBanner = document.getElementById('dash-vendor-banner');
  if (!vendorBanner) return;
  vendorBanner.innerHTML = '🛍️ Buying real wigs soon? <a href="#" id="dash-vendor-link" style="color:var(--oxblood);font-weight:900;text-decoration:underline">Browse verified vendors →</a>';
  vendorBanner.style.display = 'block';
  const link = document.getElementById('dash-vendor-link');
  if (link && !link.dataset.wired) {
    link.dataset.wired = '1';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen('marketplace');
      if (typeof loadMarketplace === 'function') loadMarketplace();
    });
  }
}

// Restock button handler with limit
(function wireRestock() {
  const btn = document.getElementById('btn-restock');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const cost = CONFIG.hustles.wig_plug.restockCost;
    const maxStock = 100;
    
    const allFull = Object.keys(state.wigStock || {}).every(k => (state.wigStock[k] || 0) >= maxStock);
    if (allFull) return alert('Your store is full! Sell some wigs before restocking.');
    
    if (state.wallet < cost) return;
    state.wallet -= cost;
    
    Object.keys(state.wigStock || {}).forEach(k => {
      const current = state.wigStock[k] || 0;
      state.wigStock[k] = Math.min(maxStock, current + CONFIG.hustles.wig_plug.restockAmount);
    });
    
    saveState();
    refreshDashboard();
    alert('✅ Restocked!');
    if (typeof trackEvent === 'function') trackEvent('restock', { cost });
  });
})();
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
  const walletEl = document.getElementById('shop-wallet');
  if (walletEl) walletEl.textContent = fmtN(state.wallet);
  const lifetimeEl = document.getElementById('shop-lifetime');
  if (lifetimeEl) lifetimeEl.textContent = fmtN(state.lifetime);

  const list = document.getElementById('shop-list');
  if (!list) return;
  list.innerHTML = '';

  const upgradesHeader = document.createElement('h3');
  upgradesHeader.style.cssText = 'font-size:13px;font-weight:900;color:var(--oxblood);text-transform:uppercase;letter-spacing:0.8px;margin:4px 0 10px';
  upgradesHeader.textContent = '⚡ Permanent upgrades';
  list.appendChild(upgradesHeader);

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

  const consumablesHeader = document.createElement('h3');
  consumablesHeader.style.cssText = 'font-size:13px;font-weight:900;color:var(--oxblood);text-transform:uppercase;letter-spacing:0.8px;margin:18px 0 10px';
  consumablesHeader.textContent = '🧴 Consumables (next round only)';
  list.appendChild(consumablesHeader);

  Object.entries(CONFIG.consumables).forEach(([key, item]) => {
    const isActive = state.activeConsumables && state.activeConsumables[item.effect];
    const canAfford = state.wallet >= item.cost;
    const el = document.createElement('div');
    el.className = 'shop-item' + (isActive ? ' owned' : '');
    el.innerHTML = '<div class="icon">' + item.icon + '</div>' +
      '<div class="info"><h4>' + item.name + (isActive ? ' ✓' : '') + '</h4><p>' + item.desc + '</p></div>' +
      '<button class="buy-btn" data-consumable="' + key + '"' + (!canAfford || isActive ? ' disabled' : '') + '>' +
      (isActive ? 'ACTIVE' : '₦' + item.cost.toLocaleString('en-NG')) + '</button>';
    list.appendChild(el);
  });

  list.querySelectorAll('.buy-btn[data-key]:not(:disabled)').forEach(btn => {
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

  list.querySelectorAll('.buy-btn[data-consumable]:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.consumable;
      const item = CONFIG.consumables[key];
      if (state.wallet < item.cost) return;
      state.wallet -= item.cost;
      if (!state.activeConsumables) state.activeConsumables = {};
      state.activeConsumables[item.effect] = true;
      saveState();
      refreshShop();
      if (typeof trackEvent === 'function') trackEvent('consumable_bought', { item: key, cost: item.cost });
    });
  });
}

// =========================================================
// SETTINGS
// =========================================================
function refreshSettings() {
  const current = localStorage.getItem('hc_theme') || 'system';
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === current));

  const currentColor = state.dashboardColor || 'green';
  document.querySelectorAll('.color-swatch').forEach(b => {
    const isSelected = b.dataset.color === currentColor;
    b.classList.toggle('selected', isSelected);
    b.textContent = isSelected ? '✓' : '';
  });
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
// CAMERA
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
// RESULT SIGN-IN CTA
// =========================================================
function updateResultSigninCta() {
  const btn = document.getElementById('btn-signin-result');
  if (!btn) return;
  btn.style.display = (!playerId && state.roundsToday >= 1) ? 'block' : 'none';
}
