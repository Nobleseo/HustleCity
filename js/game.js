'use strict';

// =========================================================
// GAME STATE (module-level)
// =========================================================
let selectedProduct = 'tomatoes';
let game = null;
let rafId = null;
const gameAreaEl = document.getElementById('game-area');
const dynamicLayer = document.getElementById('dynamic-layer');

// =========================================================
// ROUND LIFECYCLE
// =========================================================
function clearDynamic() {
  if (dynamicLayer) dynamicLayer.innerHTML = '';
  document.querySelectorAll('.countdown, .event-btn, .rain-overlay').forEach(el => el.remove());
  if (gameAreaEl) gameAreaEl.classList.remove('dark');
}

function startRound() {
  showScreen('round');
  clearDynamic();

  const boosted = state.boostTokens > 0;
  if (boosted) { state.boostTokens--; saveState(); }

  game = {
    running: false,
    startTime: 0,
    lastSpawn: 0,
    money: 0,
    combo: 0,
    multiplier: boosted ? 2 : 1,
    bestCombo: boosted ? 2 : 1,
    served: 0,
    missed: 0,
    customers: [],
    nextId: 1,
    eventTimers: [],
    boosted: boosted,
    patienceBonus: state.upgrades.includes('loudspeaker') ? 1.5 : 0
  };

  document.getElementById('hud-money').textContent = '₦0';
  document.getElementById('hud-combo').textContent = 'x' + game.multiplier;
  document.getElementById('hud-timer').textContent = CONFIG.roundDuration;

  let count = 3;
  const cd = document.createElement('div');
  cd.className = 'countdown';
  cd.textContent = count;
  gameAreaEl.appendChild(cd);

  const iv = setInterval(() => {
    count--;
    if (count > 0) {
      cd.textContent = count;
      cd.style.animation = 'none';
      void cd.offsetWidth;
      cd.style.animation = 'zoomIn 0.5s ease-out';
    } else {
      clearInterval(iv);
      cd.remove();
      beginPlay();
    }
  }, 700);
}

function beginPlay() {
  game.running = true;
  game.startTime = performance.now();
  game.lastSpawn = 0;
  spawnCustomer(false);
  scheduleEvents();
  rafId = requestAnimationFrame(tick);
}

function tick() {
  if (!game || !game.running) return;

  const t = (performance.now() - game.startTime) / 1000;
  const remaining = Math.max(0, CONFIG.roundDuration - t);
  document.getElementById('hud-timer').textContent = Math.ceil(remaining);

  const progress = t / CONFIG.roundDuration;
  let interval = CONFIG.spawnIntervalStart + (CONFIG.spawnIntervalEnd - CONFIG.spawnIntervalStart) * progress;
  if (game.rainActive) interval *= 1.4;

  if (t - game.lastSpawn >= interval) {
    game.lastSpawn = t;
    spawnCustomer(false);
  }

  const toRemove = [];
  for (const c of game.customers) {
    if (c.served) continue;
    const age = t - c.spawnedAt;
    const remain = Math.max(0, c.patience - age);
    const ratio = remain / c.patience;
    const fill = c.el.querySelector('.patience-fill');
    if (fill) {
      fill.style.width = (ratio * 100) + '%';
      fill.style.background = ratio < 0.3 ? '#B23A2E' : (ratio < 0.6 ? '#D4A017' : '#2E5B3A');
    }
    if (remain <= 0) { missCustomer(c); toRemove.push(c); }
  }
  game.customers = game.customers.filter(c => !toRemove.includes(c));

  if (remaining <= 0) { endRound(); return; }
  rafId = requestAnimationFrame(tick);
}

function endRound() {
  if (!game || !game.running) return;
  game.running = false;

  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  if (game.eventTimers && game.eventTimers.length) {
    game.eventTimers.forEach(t => { clearTimeout(t); clearInterval(t); });
    game.eventTimers = [];
  }

  clearDynamic();

  const earned = game.money;
  state.wallet += earned;
  state.lifetime += earned;
  state.todayScore += earned;
  state.bestToday = Math.max(state.bestToday || 0, earned);
  state.roundsToday++;
  state.division = getDivision(state.lifetime).key;
  saveState();

  document.getElementById('result-money').textContent = fmtN(earned);
  document.getElementById('result-served').textContent = game.served;
  document.getElementById('result-missed').textContent = game.missed;
  document.getElementById('result-best').textContent = 'x' + game.bestCombo;
  document.getElementById('result-rounds').textContent = roundsLeftText();

  const target = 1500 + Math.floor(Math.random() * 800);
  document.getElementById('result-near').textContent =
    earned < target ? '₦' + (target - earned) + ' from rank #9' : '🔥 You dey top 10 today!';

  const playBtn = document.getElementById('btn-play-again');
  if (state.roundsToday >= totalRoundsToday()) {
    playBtn.textContent = 'NO ROUNDS LEFT';
    playBtn.disabled = true;
    playBtn.style.opacity = '0.5';
  } else {
    playBtn.textContent = state.boostTokens > 0 ? 'PLAY AGAIN (⚡ x2 BOOST)' : 'PLAY AGAIN';
    playBtn.disabled = false;
    playBtn.style.opacity = '1';
  }

  if (typeof syncRoundToServer === 'function') {
    syncRoundToServer(earned, game.served, game.missed, game.bestCombo);
  }
  if (typeof trackEvent === 'function') {
    trackEvent('round_end', { score: earned, stall: selectedProduct });
  }

  showScreen('result');
  updateResultSigninCta();

  if (!playerId && state.roundsToday >= 2 && typeof showAuthModal === 'function') {
    setTimeout(showAuthModal, 1200);
  }
}

// =========================================================
// CUSTOMERS
// =========================================================
function spawnCustomer(isThief) {
  const items = ['tomatoes', 'pepper', 'wrappers'];
  const wanted = Math.random() < 0.55 ? selectedProduct : items[Math.floor(Math.random() * 3)];
  const prod = CONFIG.products[wanted];
  const id = 'c' + (game.nextId++);
  const body = BODIES[Math.floor(Math.random() * BODIES.length)];
  const isHaggle = !isThief && Math.random() < 0.15;

  const el = document.createElement('div');
  el.className = 'customer' + (isThief ? ' thief' : '');
  el.style.left = (8 + Math.random() * 74) + '%';
  el.style.top = (8 + Math.random() * 58) + '%';
  el.innerHTML =
    '<div class="bubble">' + (isThief ? 'Thief!' : BUBBLES[Math.floor(Math.random() * BUBBLES.length)]) + '</div>' +
    '<div class="wanted">' + (isThief ? '💰' : prod.emoji) + '</div>' +
    '<div class="body">' + (isThief ? '🕵️' : body) + '</div>' +
    '<div class="patience"><div class="patience-fill" style="width:100%"></div></div>';

  el.addEventListener('click', e => { e.stopPropagation(); callCustomer(id); });
  (dynamicLayer || gameAreaEl).appendChild(el);

  game.customers.push({
    id, wanted,
    isThief: !!isThief,
    isHaggle,
    spawnedAt: (performance.now() - game.startTime) / 1000,
    patience: (isThief ? 2.5 : prod.patience) + (game.patienceBonus || 0),
    served: false,
    called: false,
    el
  });
}

function callCustomer(id) {
  const c = game.customers.find(x => x.id === id);
  if (!c || c.served || c.called) return;
  c.called = true;
  c.el.classList.add('called');
  if (c.isThief) {
    game.money += 300;
    addFloat(c.el, '+₦300 caught!', false);
    c.served = true;
    game.served++;
    c.el.style.transition = 'transform 0.3s, opacity 0.3s';
    c.el.style.transform = 'scale(0.3)';
    c.el.style.opacity = '0';
    setTimeout(() => c.el.remove(), 300);
    game.customers = game.customers.filter(x => x.id !== c.id);
    document.getElementById('hud-money').textContent = '₦' + game.money;
  }
}

function serveItem(item, btn) {
  let c = game.customers.find(x => x.called && !x.served && !x.isThief && x.wanted === item);
  if (!c) c = game.customers.find(x => !x.served && !x.isThief && x.wanted === item);
  if (!c) {
    btn.classList.remove('shake');
    void btn.offsetWidth;
    btn.classList.add('shake');
    return;
  }
  if (c.isHaggle && !c.haggled) { c.haggled = true; showHaggleModal(c, item); return; }
  completeSale(c, item);
}

function completeSale(c, item) {
  c.served = true;
  game.served++;
  game.combo++;
  if (game.combo % CONFIG.comboThreshold === 0 && game.multiplier < CONFIG.comboMaxMultiplier) {
    game.multiplier++;
    game.bestCombo = Math.max(game.bestCombo, game.multiplier);
    const el = document.getElementById('hud-combo');
    el.textContent = 'x' + game.multiplier;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  const prod = CONFIG.products[item];
  const base = prod.baseSale + Math.floor(Math.random() * 60);
  const sale = Math.round(base * game.multiplier);
  game.money += sale;
  document.getElementById('hud-money').textContent = '₦' + game.money;
  addFloat(c.el, '+₦' + sale + (game.multiplier > 1 ? ' x' + game.multiplier : ''), false);
  c.el.style.transition = 'transform 0.3s, opacity 0.3s';
  c.el.style.transform = 'translateY(-30px) scale(0.3)';
  c.el.style.opacity = '0';
  setTimeout(() => c.el.remove(), 300);
  game.customers = game.customers.filter(x => x.id !== c.id);
}

function missCustomer(c) {
  if (c.served) return;
  c.served = true;
  game.missed++;
  game.combo = 0;
  if (game.multiplier !== 1) {
    game.multiplier = 1;
    document.getElementById('hud-combo').textContent = 'x1';
  }
  if (c.isThief) {
    const loss = Math.min(300, game.money);
    game.money -= loss;
    document.getElementById('hud-money').textContent = '₦' + game.money;
    addFloat(c.el, '-₦' + loss + ' stolen!', true);
  }
  c.el.style.transition = 'opacity 0.4s, transform 0.4s';
  c.el.style.opacity = '0';
  c.el.style.transform = 'translateX(-80px)';
  setTimeout(() => c.el.remove(), 400);
}

function addFloat(parent, text, negative) {
  const float = document.createElement('div');
  float.className = 'float' + (negative ? ' neg' : '');
  float.textContent = text;
  const r = parent.getBoundingClientRect();
  const ar = gameAreaEl.getBoundingClientRect();
  float.style.left = (r.left - ar.left + r.width / 2) + 'px';
  float.style.top = (r.top - ar.top) + 'px';
  (dynamicLayer || gameAreaEl).appendChild(float);
  setTimeout(() => float.remove(), 900);
}

// =========================================================
// RANDOM EVENTS
// =========================================================
function scheduleEvents() {
  game.eventTimers.push(setTimeout(() => triggerNEPA(), 20000));
  game.eventTimers.push(setTimeout(() => triggerRain(), 35000));
  game.eventTimers.push(setTimeout(() => triggerLevy(), 50000));
  const thiefTimer = setInterval(() => {
    if (!game || !game.running) { clearInterval(thiefTimer); return; }
    if (Math.random() < 0.5) spawnCustomer(true);
  }, 9000);
  game.eventTimers.push(thiefTimer);
}

function triggerNEPA() {
  if (!game || !game.running) return;
  gameAreaEl.classList.add('dark');
  const btn = document.createElement('button');
  btn.className = 'event-btn';
  btn.textContent = '🔦 On torch';
  btn.addEventListener('click', () => { gameAreaEl.classList.remove('dark'); btn.remove(); });
  gameAreaEl.appendChild(btn);
  setTimeout(() => {
    if (btn.parentNode) { gameAreaEl.classList.remove('dark'); btn.remove(); }
  }, 4500);
}

function triggerRain() {
  if (!game || !game.running) return;
  game.rainActive = true;
  const rain = document.createElement('div');
  rain.className = 'rain-overlay';
  gameAreaEl.appendChild(rain);
  const btn = document.createElement('button');
  btn.className = 'event-btn';
  btn.textContent = '☔ Hold umbrella';
  btn.addEventListener('click', () => {
    game.rainActive = false;
    rain.remove();
    btn.remove();
    game.customers.forEach(c => { c.spawnedAt = (performance.now() - game.startTime) / 1000; });
  });
  gameAreaEl.appendChild(btn);
  setTimeout(() => {
    if (rain.parentNode) { game.rainActive = false; rain.remove(); }
    if (btn.parentNode) btn.remove();
  }, 5000);
}

function triggerLevy() {
  if (!game || !game.running) return;
  const cost = 200;
  if (game.money < cost) return;
  showModal({
    title: 'Levy Collector',
    body: 'Council man dey collect levy. Pay ₦200?',
    actions: [
      { label: 'Pay ₦200', primary: true, fn: () => {
        game.money -= cost;
        document.getElementById('hud-money').textContent = '₦' + game.money;
      }},
      { label: 'Ignore', fn: () => {} }
    ]
  });
}

function showHaggleModal(customer, item) {
  const prod = CONFIG.products[item];
  showModal({
    title: 'Customer dey haggle',
    body: 'Dem wan pay less. Wetin you go do?',
    actions: [
      { label: 'Accept lower price', fn: () => {
        customer.served = true;
        game.served++;
        const base = Math.round(prod.baseSale * 0.6);
        const sale = base * game.multiplier;
        game.money += sale;
        document.getElementById('hud-money').textContent = '₦' + game.money;
        addFloat(customer.el, '+₦' + sale, false);
        customer.el.remove();
        game.customers = game.customers.filter(x => x.id !== customer.id);
      }},
      { label: 'Counter (50/50)', primary: true, fn: () => {
        if (Math.random() < 0.5) {
          completeSale(customer, item);
        } else {
          customer.served = true;
          game.missed++;
          game.combo = 0;
          game.multiplier = 1;
          document.getElementById('hud-combo').textContent = 'x1';
          addFloat(customer.el, 'Lost sale', true);
          customer.el.style.opacity = '0';
          setTimeout(() => customer.el.remove(), 300);
          game.customers = game.customers.filter(x => x.id !== customer.id);
        }
      }}
    ]
  });
}

// =========================================================
// SHARE
// =========================================================
document.getElementById('btn-share').addEventListener('click', () => {
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1080;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F5EBDC'; ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = '#1F4A2E'; ctx.fillRect(0, 0, 1080, 220);
  ctx.fillStyle = '#D4A017'; ctx.font = '900 96px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('HUSTLE CITY', 540, 140);
  ctx.fillStyle = '#2E1F14'; ctx.font = '600 36px sans-serif';
  ctx.fillText('Market Trader', 540, 320);
  ctx.fillStyle = '#2E1F14'; ctx.font = '900 220px sans-serif';
  ctx.fillText('₦' + (game ? game.money : 0).toLocaleString('en-NG'), 540, 620);
  ctx.fillStyle = '#7A6A55'; ctx.font = '700 40px sans-serif';
  ctx.fillText(state.playerName || 'Anonymous', 540, 720);
  ctx.fillStyle = '#2E5B3A'; ctx.font = '700 44px sans-serif';
  ctx.fillText('Beat my score 👇', 540, 860);
  ctx.fillStyle = '#1F4A2E'; ctx.font = '900 56px sans-serif';
  ctx.fillText('hustle.ubswift.com', 540, 950);

  c.toBlob(blob => {
    const file = new File([blob], 'hustle-city-score.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Hustle City', text: 'Beat my score!' }).catch(() => {});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'hustle-city-score.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  trackEvent('share_tap', { score: game ? game.money : 0 });
});

// =========================================================
// REFERRAL SHARE
// =========================================================
document.getElementById('btn-refer').addEventListener('click', () => {
  const refCode = (state.playerName && state.playerName.trim()) ? state.playerName.trim() : GUEST_ID;
  const link = location.origin + location.pathname + '?ref=' + encodeURIComponent(refCode);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => {
      alert('Link copied! Send to friends:\n\n' + link + '\n\nYou earn +1 Boost Token and +1 bonus round when they finish their first round.');
    }).catch(() => prompt('Copy this:', link));
  } else {
    prompt('Copy this:', link);
  }
  trackEvent('referral_link_opened', { referrer_id: refCode });
});

// =========================================================
// FEEDBACK
// =========================================================
document.getElementById('btn-feedback').addEventListener('click', () => {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  const box = document.createElement('div'); box.className = 'modal';
  box.innerHTML = '<h3>How the game feel?</h3><p>Talk true — we dey listen.</p>';
  const moods = document.createElement('div');
  moods.style.cssText = 'display:flex;gap:10px;justify-content:center;margin-bottom:12px';
  let chosen = null;
  ['😍', '🙂', '😐', '😞'].forEach(m => {
    const b = document.createElement('button');
    b.textContent = m;
    b.style.cssText = 'font-size:32px;background:transparent;border:2px solid var(--border);border-radius:12px;padding:8px 14px;cursor:pointer;font-family:inherit';
    b.addEventListener('click', () => {
      chosen = m;
      moods.querySelectorAll('button').forEach(x => x.style.borderColor = 'var(--border)');
      b.style.borderColor = 'var(--oxblood)';
    });
    moods.appendChild(b);
  });
  box.appendChild(moods);
  const ta = document.createElement('textarea'); ta.rows = 3; ta.placeholder = 'Anything else? (optional)'; box.appendChild(ta);
  const send = document.createElement('button'); send.className = 'btn btn-gold'; send.textContent = 'SEND';
  send.addEventListener('click', () => {
    if (chosen) { syncFeedback(chosen, ta.value.trim()); }
    bg.remove();
    alert('Thank you! 🙏');
  });
  box.appendChild(send);
  bg.appendChild(box);
  document.body.appendChild(bg);
});

// =========================================================
// VOTES + WRITE-IN
// =========================================================
document.querySelectorAll('.vote-btn').forEach(btn => {
  if (state.votes.includes(btn.dataset.hustle)) {
    btn.textContent = 'VOTED ✓';
    btn.disabled = true;
  }
  btn.addEventListener('click', () => {
    const h = btn.dataset.hustle;
    if (state.votes.includes(h)) return;
    state.votes.push(h);
    saveState();
    btn.textContent = 'VOTED ✓';
    btn.disabled = true;
    syncVoteToServer(h, null);
    trackEvent('vote', { hustle_key: h });
  });
});

document.getElementById('btn-writein').addEventListener('click', () => {
  const inp = document.getElementById('writein-input');
  const text = inp.value.trim();
  if (!text) return;
  state.writeIns = state.writeIns || [];
  state.writeIns.push(text);
  saveState();
  syncVoteToServer(null, text);
  trackEvent('write_in_vote', { hustle_text: text });
  inp.value = '';
  inp.placeholder = 'Sent! Add another...';
  document.getElementById('btn-writein').textContent = 'SENT ✓';
  setTimeout(() => document.getElementById('btn-writein').textContent = 'SEND IDEA', 2000);
});

// =========================================================
// LEADERBOARD TABS (delegate to ui.js)
// =========================================================
document.querySelectorAll('.lb-tab[data-scope]').forEach(tab => {
  tab.addEventListener('click', () => {
    if (!tab.dataset.scope) return;
    document.querySelectorAll('.lb-tab[data-scope]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    lbScope = tab.dataset.scope;
    refreshLeaderboard();
  });
});

// =========================================================
// SHELF BUTTONS
// =========================================================
document.querySelectorAll('.shelf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!game || !game.running) return;
    serveItem(btn.dataset.item, btn);
  });
});

// =========================================================
// SETUP SCREEN — PRODUCT CARDS
// =========================================================
document.querySelectorAll('.product-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedProduct = card.dataset.product;
  });
});

// =========================================================
// PLAY BUTTONS
// =========================================================
document.getElementById('btn-home-play').addEventListener('click', () => {
  if (state.roundsToday >= totalRoundsToday()) {
    alert('You don finish your rounds for today. Come back tomorrow!');
    return;
  }
  document.getElementById('player-name').value = state.playerName || '';
  showScreen('setup');
});

document.getElementById('btn-start-round').addEventListener('click', () => {
  state.playerName = document.getElementById('player-name').value.trim() || state.playerName;
  saveState();
  trackEvent('round_start', { stall: selectedProduct, is_guest: !playerId });
  startRound();
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  if (state.roundsToday >= totalRoundsToday()) return;
  startRound();
});
