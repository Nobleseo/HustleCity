'use strict';

// =========================================================
// ROUND SYNC
// =========================================================
async function syncRoundToServer(earned, served, missed, bestCombo) {
  if (!sb) return;
  try {
    await sb.from('guests').upsert({
      guest_id: GUEST_ID,
      wallet_balance: state.wallet,
      player_name: (state.playerName && state.playerName.trim()) || null
    }, { onConflict: 'guest_id' });

    await sb.from('runs').insert({
      guest_id: GUEST_ID,
      player_id: playerId || null,
      player_name: state.playerName || null,
      hustle_key: 'market_trader',
      stall_key: (typeof selectedProduct !== 'undefined' ? selectedProduct : 'tomatoes'),
      seed: 'client_' + Date.now(),
      score: earned,
      duration_ms: CONFIG.roundDuration * 1000,
      valid: true,
      boost_used: (game && game.boosted) || false,
      action_log: { served, missed, bestCombo, ts: Date.now() }
    });

    if (pendingReferrer && state.roundsToday === 1) {
      await sb.from('referrals').insert({
        referrer_id: pendingReferrer,
        referred_id: GUEST_ID,
        status: 'completed',
        completed_at: new Date().toISOString()
      });
    }
  } catch (e) {
    console.warn('sync failed', e);
    const q = JSON.parse(localStorage.getItem('hc_sync_queue') || '[]');
    q.push({ earned, served, missed, bestCombo, ts: Date.now() });
    localStorage.setItem('hc_sync_queue', JSON.stringify(q));
  }
}

// =========================================================
// VOTES
// =========================================================
async function syncVoteToServer(hustleKey, writeInText) {
  if (!sb) { console.warn('no supabase client'); return false; }
  const { data, error } = await sb.from('votes').insert({
    guest_id: GUEST_ID,
    player_id: playerId || null,
    hustle_key: hustleKey || null,
    write_in_text: writeInText || null
  }).select();

  if (error) {
    console.error('vote insert failed:', error.message, error.details, error.hint);
    const q = JSON.parse(localStorage.getItem('hc_vote_queue') || '[]');
    q.push({ hustleKey, writeInText, ts: Date.now() });
    localStorage.setItem('hc_vote_queue', JSON.stringify(q));
    return false;
  }
  return true;
}

async function flushVoteQueue() {
  if (!sb) return;
  const q = JSON.parse(localStorage.getItem('hc_vote_queue') || '[]');
  if (!q.length) return;
  const remaining = [];
  for (const v of q) {
    const { error } = await sb.from('votes').insert({
      guest_id: GUEST_ID,
      player_id: playerId || null,
      hustle_key: v.hustleKey || null,
      write_in_text: v.writeInText || null
    });
    if (error) remaining.push(v);
  }
  localStorage.setItem('hc_vote_queue', JSON.stringify(remaining));
}

// =========================================================
// FEEDBACK + ANALYTICS
// =========================================================
async function syncFeedback(mood, message) {
  if (!sb) return;
  try {
    await sb.from('feedback').insert({ guest_id: GUEST_ID, mood, message });
  } catch (e) { console.warn('feedback sync failed', e); }
}

async function trackEvent(name, payload) {
  if (!sb) return;
  try {
    await sb.from('events').insert({
      guest_id: GUEST_ID,
      name,
      payload: payload || {}
    });
  } catch (e) {}
}

// =========================================================
// PRESENCE
// =========================================================
let presenceChannel = null;
let currentActivity = 'home';

function updateActivity(activity) {
  currentActivity = activity;
  if (presenceChannel) {
    presenceChannel.track({
      guest_id: GUEST_ID,
      player_id: playerId || null,
      name: state.playerName || 'Guest',
      activity: activity,
      ts: Date.now()
    }).catch(() => {});
  }
}

if (sb) {
  presenceChannel = sb.channel('hc-presence', {
    config: { presence: { key: playerId || GUEST_ID } }
  });
  presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') updateActivity(currentActivity);
  });
  setInterval(() => updateActivity(currentActivity), 25000);
}

// =========================================================
// BRAND SLOTS
// =========================================================
let brandSlots = {};

async function loadBrandSlots() {
  if (!sb) return;
  try {
    const { data } = await sb.from('brand_slots')
      .select('slot_key,slot_number,brand_name,brand_art_url,brand_color,active')
      .eq('active', true);
    brandSlots = {};
    (data || []).forEach(s => {
      const key = s.slot_key || ('tool_' + (s.slot_number || 1));
      brandSlots[key] = s;
    });
    renderBrandSlots();
  } catch (e) { console.warn('brand slots load failed', e); }
}

function renderBrandSlots() {
  // Billboard
  const bb = document.getElementById('in-game-billboard');
  if (bb) {
    const b = brandSlots['billboard'];
    if (b && b.brand_art_url) {
      bb.innerHTML = '<img src="' + escapeHtml(b.brand_art_url) + '" alt="">';
      bb.style.borderColor = b.brand_color || 'var(--gold)';
    } else if (b && b.brand_name) {
      bb.textContent = b.brand_name.toUpperCase();
      bb.style.borderColor = b.brand_color || 'var(--gold)';
    } else {
      bb.textContent = 'PLACE YOUR AD HERE';
      bb.style.borderColor = 'var(--border)';
    }
  }

  // Shelf brand strip
  const shelfBrand = document.getElementById('shelf-brand');
  if (shelfBrand) {
    const s = brandSlots['shelf'];
    if (s && s.brand_art_url) {
      shelfBrand.innerHTML = '<img src="' + escapeHtml(s.brand_art_url) + '" alt="">';
      shelfBrand.style.background = s.brand_color
        ? 'linear-gradient(180deg,' + s.brand_color + 'cc,' + s.brand_color + ')'
        : '';
    } else if (s && s.brand_name) {
      shelfBrand.innerHTML = '<span style="color:#F5EBDC;font-weight:800;letter-spacing:1.2px">' + escapeHtml(s.brand_name.toUpperCase()) + '</span>';
      shelfBrand.style.background = s.brand_color
        ? 'linear-gradient(180deg,' + s.brand_color + 'cc,' + s.brand_color + ')'
        : '';
    } else {
      shelfBrand.innerHTML = '<span class="shelf-brand-text">PLACE YOUR AD HERE · SPONSOR THIS STALL</span>';
      shelfBrand.style.background = '';
    }
  }

  // Tool belt
  const belt = document.getElementById('tool-belt');
  if (belt) {
    const tools = [];
    ['tool_1','tool_2','tool_3','umbrella','handcart','loudspeaker'].forEach(k => {
      if (brandSlots[k]) tools.push(brandSlots[k]);
    });
    if (tools.length === 0) {
      tools.push({ slot_key: 'tool_1' }, { slot_key: 'tool_2' }, { slot_key: 'tool_3' });
    }
    belt.innerHTML = tools.map(t => {
      if (t.brand_art_url) {
        return '<div class="tool has-brand" style="border-color:' + escapeHtml(t.brand_color || '#D4A017') + '"><img src="' + escapeHtml(t.brand_art_url) + '" alt=""></div>';
      }
      if (t.brand_name) {
        return '<div class="tool has-brand" style="border-color:' + escapeHtml(t.brand_color || '#D4A017') + '">' + escapeHtml(t.brand_name.slice(0, 10)) + '</div>';
      }
      return '<div class="tool">PLACE<br>AD<br>HERE</div>';
    }).join('');
  }
}

// Auto refresh every 60s
setInterval(loadBrandSlots, 60000);

// =========================================================
// ANNOUNCEMENT BANNER
// =========================================================
async function loadAnnouncement() {
  if (!sb) return;
  try {
    const { data } = await sb.from('announcements')
      .select('message')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && data.message) {
      const b = document.getElementById('announce-banner');
      if (b) {
        b.textContent = data.message;
        b.style.display = 'block';
      }
    }
  } catch (e) {}
}

// =========================================================
// LEADERBOARD REALTIME REFRESH
// =========================================================
let lbDebounce = null;
function scheduleLbRefresh() {
  clearTimeout(lbDebounce);
  lbDebounce = setTimeout(() => {
    const active = document.getElementById('screen-leaderboard').classList.contains('active');
    if (active && typeof refreshLeaderboard === 'function') refreshLeaderboard();
  }, 1200);
}

if (sb) {
  sb.channel('lb-runs-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'runs' }, scheduleLbRefresh)
    .subscribe();
}

// =========================================================
// MARKETPLACE
// =========================================================
let allVendors = [];
let vendorFilter = { category: 'all', query: '' };

const VENDOR_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'tailor', label: '🧵 Tailor' },
  { key: 'food', label: '🍲 Food & Buka' },
  { key: 'barber', label: '💈 Barber' },
  { key: 'laundry', label: '👕 Laundry' },
  { key: 'mechanic', label: '🔧 Mechanic' },
  { key: 'pos', label: '💳 POS' },
  { key: 'delivery', label: '🛵 Delivery' },
  { key: 'home', label: '🏠 Home' },
  { key: 'other', label: 'Other' }
];

async function loadMarketplace() {
  const list = document.getElementById('vendor-list');
  if (!list) return;
  list.innerHTML = '<div class="vendor-empty">Loading…</div>';
  if (!sb) { list.innerHTML = '<div class="vendor-empty">Needs internet</div>'; return; }
  try {
    const { data, error } = await sb.from('vendors')
      .select('*')
      .eq('active', true)
      .order('verified', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    allVendors = data || [];
    renderVendorChips();
    renderVendors();
  } catch (e) {
    list.innerHTML = '<div class="vendor-empty">Could not load vendors. Try again.</div>';
    console.warn('marketplace load failed', e);
  }
}

function renderVendorChips() {
  const wrap = document.getElementById('vendor-categories');
  if (!wrap) return;
  wrap.innerHTML = VENDOR_CATEGORIES.map(c =>
    '<button class="vendor-chip' + (vendorFilter.category === c.key ? ' active' : '') + '" data-cat="' + c.key + '">' + c.label + '</button>'
  ).join('');
  wrap.querySelectorAll('.vendor-chip').forEach(b => b.addEventListener('click', () => {
    vendorFilter.category = b.dataset.cat;
    renderVendorChips();
    renderVendors();
  }));
}

function renderVendors() {
  const list = document.getElementById('vendor-list');
  if (!list) return;

  const q = vendorFilter.query.toLowerCase().trim();
  let rows = allVendors.slice();

  rows.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    const aCityMatch = a.city === currentCity ? 1 : 0;
    const bCityMatch = b.city === currentCity ? 1 : 0;
    if (aCityMatch !== bCityMatch) return bCityMatch - aCityMatch;
    return (a.name || '').localeCompare(b.name || '');
  });

  if (vendorFilter.category !== 'all') rows = rows.filter(v => v.category === vendorFilter.category);
  if (q) rows = rows.filter(v =>
    (v.name || '').toLowerCase().includes(q) ||
    (v.category || '').toLowerCase().includes(q) ||
    (v.description || '').toLowerCase().includes(q) ||
    (v.city || '').toLowerCase().includes(q)
  );

  if (!rows.length) {
    list.innerHTML = '<div class="vendor-empty">No vendors found.<br><span style="font-size:11px">Try a different category or search.</span></div>';
    return;
  }

  list.innerHTML = rows.map(v => {
    const img = v.image_url
      ? '<img class="vendor-photo" src="' + escapeHtml(v.image_url) + '" alt="" onerror="this.style.display=\'none\';this.parentNode.insertAdjacentHTML(\'afterbegin\',\'<div class=&quot;vendor-photo&quot;>🏪</div>\')">'
      : '<div class="vendor-photo">🏪</div>';
    const badge = v.verified ? '<span class="vendor-badge">✓ VERIFIED</span>' : '';
    const catLabel = (VENDOR_CATEGORIES.find(c => c.key === v.category) || { label: v.category }).label.replace(/^\S+\s/, '');
    const phone = v.phone || '';
    const wa = v.whatsapp || v.phone || '';
    const waLink = wa
      ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi ' + (v.name || '') + ', I found you on Hustle City')
      : '#';
    const callLink = phone ? 'tel:' + phone : '#';
    const callBtn = phone ? '<a class="vendor-btn call" href="' + callLink + '">📞 Call</a>' : '';
    const waBtn = wa ? '<a class="vendor-btn wa" href="' + waLink + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '';
    return '<div class="vendor-card">' + img +
      '<div class="vendor-info">' +
        '<div class="vendor-name">' + escapeHtml(v.name || '') + ' ' + badge + '</div>' +
        '<div class="vendor-meta">' + escapeHtml(catLabel) + ' · ' + escapeHtml((v.city || '').toUpperCase()) + '</div>' +
        '<div class="vendor-desc">' + escapeHtml((v.description || '').slice(0, 140)) + '</div>' +
        '<div class="vendor-actions">' + callBtn + waBtn + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// =========================================================
// DASHBOARD RANK
// =========================================================
async function loadDashboardRank() {
  if (!sb) return;
  try {
    const today = watStartOfDay(new Date()).toISOString();
    const { data } = await sb.from('runs')
      .select('guest_id, score')
      .gte('created_at', today)
      .order('score', { ascending: false })
      .limit(500);
    if (!data) return;
    const byGuest = {};
    data.forEach(r => {
      const k = r.guest_id || 'anon';
      if (!byGuest[k] || r.score > byGuest[k]) byGuest[k] = r.score;
    });
    const sorted = Object.entries(byGuest).sort((a, b) => b[1] - a[1]);
    const rank = sorted.findIndex(([gid]) => gid === GUEST_ID);
    const el = document.getElementById('dash-rank-today');
    if (el) el.textContent = rank >= 0 ? '#' + (rank + 1) : '#--';
  } catch (e) { console.warn('rank fetch failed', e); }
}
