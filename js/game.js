'use strict';

// =========================================================
// MODULE STATE
// =========================================================
let selectedProduct = 'tomatoes';
let game = null;
let rafId = null;
let activeProducts = CONFIG.products;

const gameAreaEl = document.getElementById('game-area');
const dynamicLayer = document.getElementById('dynamic-layer');

// =========================================================
// TOAST HELPER
// =========================================================
function showToastMsg(text) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:#1F4A2E;color:#F5EBDC;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:900;z-index:150;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:90vw;text-align:center';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity 0.3s, transform 0.3s';
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => t.remove(), 400);
  }, 2800);
}

// =========================================================
// SHELF RENDERING
// =========================================================
function renderShelf() {
  const items = document.querySelector('.shelf-items');
  if (!items) return;
  items.innerHTML = '';

  Object.entries(activeProducts).forEach(([key, prod]) => {
    const btn = document.createElement('button');
    btn.className = 'shelf-btn';
    btn.dataset.item = key;

    const stockCount = (currentHustle === 'wig_plug') ? (state.wigStock[key] || 0) : null;
    const stockBadge = (stockCount !== null)
      ? `<span style="position:absolute;top:-6px;right:-6px;background:${stockCount > 0 ? '#2E5B3A' : '#A52818'};color:#fff;font-size:9px;font-weight:900;padding:2px 5px;border-radius:10px;min-width:16px;text-align:center">${stockCount}</span>`
      : '';
    btn.style.position = 'relative';
    btn.innerHTML = `${stockBadge}<span class="icon">${prod.emoji}</span><span class="label">${prod.label || key}</span>`;
    items.appendChild(btn);
  });
}

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

  const hustle = CONFIG.hustles[currentHustle];
  activeProducts = hustle.products;
  if (!activeProducts[selectedProduct]) {
    selectedProduct = Object.keys(activeProducts)[0];
  }

  // ---- SET SCENE ATTRIBUTE (drives pink scene CSS) ----
  if (gameAreaEl) gameAreaEl.setAttribute('data-hustle', currentHustle);

  // ---- SWAP TRADER FIGURE ----
  const traderEl = document.querySelector('.trader');
  if (traderEl) traderEl.textContent = currentHustle === 'wig_plug' ? '💇🏾‍♀️' : '🧑‍🍳';

  // ---- SWAP TREES ----
  const treesEl = document.querySelector('.scene-trees');
  if (treesEl) treesEl.textContent = currentHustle === 'wig_plug' ? '🌸 🌺 🌸 🌺' : '🌴 🌳 🌴 🌳';

  renderShelf();

  const boosted = state.boostTokens > 0;
  if (boosted) { state.boostTokens--; saveState(); }

  const consumables = state.activeConsumables || {};
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
    patienceBonus: state.upgrades.includes('loudspeaker') ? 1.5 : 0,
    spawnBoost: consumables.spawn_boost ? 1.2 : 1,
    doubleSpawn: !!consumables.double_spawn,
    saleBoost: consumables.sale_boost ? 1.3 : 1,
    thiefShield: !!consumables.thief_shield
  };

  if (consumables.spawn_boost || consumables.double_spawn || consumables.sale_boost || consumables.thief_shield) {
    state.activeConsumables = { spawn_boost: false, double_spawn: false, sale_boost: false, thief_shield: false };
    saveState();
  }

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
  if (game.doubleSpawn) spawnCustomer(false);
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
  if (game.spawnBoost && game.spawnBoost !== 1) interval /= game.spawnBoost;

  if (t - game.lastSpawn >= interval) {
    game.lastSpawn = t;
    spawnCustomer(false);
    if (game.doubleSpawn) spawnCustomer(false);
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

  updateWatchAdButton();
  updateResultVendorBanner();

  if (typeof syncRoundToServer === 'function') {
    syncRoundToServer(earned, game.served, game.missed, game.bestCombo);
  }
  if (typeof trackEvent === 'function') {
    trackEvent('round_end', { score: earned, stall: selectedProduct, hustle: currentHustle });
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
  const items = Object.keys(activeProducts);

  let available = items;
  if (currentHustle === 'wig_plug') {
    available = items.filter(k => (state.wigStock[k] || 0) > 0);
    if (available.length === 0) return;
  }

  const wanted = Math.random() < 0.55 && available.includes(selectedProduct)
    ? selectedProduct
    : available[Math.floor(Math.random() * available.length)];

  const prod = activeProducts[wanted];
  const id = 'c' + (game.nextId++);

  // ---- HUSTLE-SPECIFIC CUSTOMERS + BUBBLES ----
  const bodiesForHustle = (currentHustle === 'wig_plug')
    ? ['👩🏾', '👩🏿', '👩🏽', '👩🏻', '👩🏾‍🦱', '👩🏿‍🦱', '👩🏽‍🦱']
    : BODIES;
  const bubblesForHustle = (currentHustle === 'wig_plug')
    ? ['Aunty, I want this one!', 'Boss lady, how much?', 'I need quality wig!', 'Which one is best?', 'Give me this one']
    : BUBBLES;

  const body = bodiesForHustle[Math.floor(Math.random() * bodiesForHustle.length)];
  const isHaggle = !isThief && Math.random() < 0.15;

  const wantedText = isThief
    ? 'Thief!'
    : ('I need ' + (prod.label || wanted));

  const el = document.createElement('div');
  el.className = 'customer' + (isThief ? ' thief' : '');
  el.style.left = (8 + Math.random() * 74) + '%';
  el.style.top = (22 + Math.random() * 40) + '%';
  el.innerHTML =
    '<div class="bubble">' + wantedText + '</div>' +
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
    if (game.thiefShield) {
      game.served++;
      addFloat(c.el, 'Caught! (Shield)', false);
      c.served = true;
      c.el.style.transition = 'transform 0.3s, opacity 0.3s';
      c.el.style.transform = 'scale(0.3)';
      c.el.style.opacity = '0';
      setTimeout(() => c.el.remove(), 300);
      game.customers = game.customers.filter(x => x.id !== c.id);
    } else {
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

  if (currentHustle === 'wig_plug') {
    state.wigStock[item] = Math.max(0, (state.wigStock[item] || 0) - 1);
    saveState();
  }

  if (game.combo % CONFIG.comboThreshold === 0 && game.multiplier < CONFIG.comboMaxMultiplier) {
    game.multiplier++;
    game.bestCombo = Math.max(game.bestCombo, game.multiplier);
    const el = document.getElementById('hud-combo');
    el.textContent = 'x' + game.multiplier;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  const prod = activeProducts[item];
  const base = prod.baseSale + Math.floor(Math.random() * 60);
  let sale = Math.round(base * game.multiplier);
  if (c.isInfluencer) sale *= 3;
  if (game.saleBoost && game.saleBoost !== 1) sale = Math.round(sale * game.saleBoost);
  game.money += sale;
  document.getElementById('hud-money').textContent = '₦' + game.money;
  addFloat(c.el, '+₦' + sale + (c.isInfluencer ? ' 💃' : '') + (game.multiplier > 1 ? ' x' + game.multiplier : ''), false);
  c.el.style.transition = 'transform 0.3s, opacity 0.3s';
  c.el.style.transform = 'translateY(-30px) scale(0.3)';
  c.el.style.opacity = '0';
  setTimeout(() => c.el.remove(), 300);
  game.customers = game.customers.filter(x => x.id !== c.id);

  if (currentHustle === 'wig_plug') renderShelf();
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
  if (c.isThief && !game.thiefShield) {
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
// EVENTS
// =========================================================
function scheduleEvents() {
  if (currentHustle === 'wig_plug') {
    game.eventTimers.push(setTimeout(() => triggerInfluencer(), 15000));
    game.eventTimers.push(setTimeout(() => triggerBridalRush(), 35000));
    game.eventTimers.push(setTimeout(() => triggerMarketInspector(), 50000));
  } else {
    game.eventTimers.push(setTimeout(() => triggerNEPA(), 20000));
    game.eventTimers.push(setTimeout(() => triggerRain(), 35000));
    game.eventTimers.push(setTimeout(() => triggerLevy(), 50000));
  }
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

function triggerInfluencer() {
  if (!game || !game.running) return;
  const items = Object.keys(activeProducts).filter(k => (state.wigStock[k] || 0) > 0);
  if (!items.length) return;
  showToastMsg('💃 Influencer don arrive! Serve fast for 3× money!');

  const wanted = items[Math.floor(Math.random() * items.length)];
  const prod = activeProducts[wanted];
  const id = 'c' + (game.nextId++);

  const el = document.createElement('div');
  el.className = 'customer influencer';
  el.style.left = (30 + Math.random() * 40) + '%';
  el.style.top = '15%';
  el.style.zIndex = '10';
  el.innerHTML =
    '<div class="bubble" style="background:#D4A017;color:#3A2418;font-size:11px;opacity:1">Influencer! 3× money 💃</div>' +
    '<div class="wanted">' + prod.emoji + '</div>' +
    '<div class="body" style="font-size:46px;filter:drop-shadow(0 4px 6px rgba(212,160,23,0.6))">💃</div>' +
    '<div class="patience"><div class="patience-fill" style="width:100%"></div></div>';

  el.addEventListener('click', e => { e.stopPropagation(); callCustomer(id); });
  (dynamicLayer || gameAreaEl).appendChild(el);

  game.customers.push({
    id, wanted,
    isThief: false,
    isHaggle: false,
    isInfluencer: true,
    spawnedAt: (performance.now() - game.startTime) / 1000,
    patience: 5 + (game.patienceBonus || 0),
    served: false,
    called: false,
    el
  });
}

function triggerBridalRush() {
  if (!game || !game.running) return;
  showToastMsg('👰 Bridal party rush! 5 customers coming!');
  for (let i = 0; i < 5; i++) {
    setTimeout(() => { if (game && game.running) spawnCustomer(false); }, i * 400);
  }
}

function triggerMarketInspector() {
  if (!game || !game.running) return;
  const cost = 200;
  if (game.money < cost) {
    game.combo = 0;
    game.multiplier = 1;
    document.getElementById('hud-combo').textContent = 'x1';
    showToastMsg('🚫 Inspector don vex! Combo reset (no money to pay).');
    return;
  }
  showModal({
    title: 'Market Inspector',
    body: 'Inspector say pay ₦200 or 1-star rating (combo reset). Wetin you go do?',
    actions: [
      { label: 'Pay ₦200', primary: true, fn: () => {
        game.money -= cost;
        document.getElementById('hud-money').textContent = '₦' + game.money;
      }},
      { label: 'Refuse (combo resets)', fn: () => {
        game.combo = 0;
        game.multiplier = 1;
        document.getElementById('hud-combo').textContent = 'x1';
      }}
    ]
  });
}

function showHaggleModal(customer, item) {
  const prod = activeProducts[item];
  showModal({
    title: 'Customer dey haggle',
    body: 'Dem wan pay less. Wetin you go do?',
    actions: [
      { label: 'Accept lower price', fn: () => {
        customer.served = true;
        game.served++;
        const base = Math.round(prod.baseSale * 0.6);
        let sale = base * game.multiplier;
        if (game.saleBoost && game.saleBoost !== 1) sale = Math.round(sale * game.saleBoost);
        game.money += sale;
        document.getElementById('hud-money').textContent = '₦' + game.money;
        if (currentHustle === 'wig_plug') {
          state.wigStock[item] = Math.max(0, (state.wigStock[item] || 0) - 1);
          saveState();
        }
        addFloat(customer.el, '+₦' + sale, false);
        customer.el.remove();
        game.customers = game.customers.filter(x => x.id !== customer.id);
        if (currentHustle === 'wig_plug') renderShelf();
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
// SHARE / REFERRAL / FEEDBACK / VOTES / WRITE-IN
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
  ctx.fillText(CONFIG.hustles[currentHustle].name, 540, 320);
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
  if (typeof trackEvent === 'function') trackEvent('share_tap', { score: game ? game.money : 0 });
});

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
  if (typeof trackEvent === 'function') trackEvent('referral_link_opened', { referrer_id: refCode });
});

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
    if (chosen && typeof syncFeedback === 'function') syncFeedback(chosen, ta.value.trim());
    bg.remove();
    alert('Thank you! 🙏');
  });
  box.appendChild(send);
  bg.appendChild(box);
  document.body.appendChild(bg);
});

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
    if (typeof syncVoteToServer === 'function') syncVoteToServer(h, null);
    if (typeof trackEvent === 'function') trackEvent('vote', { hustle_key: h });
  });
});

document.getElementById('btn-writein').addEventListener('click', () => {
  const inp = document.getElementById('writein-input');
  const text = inp.value.trim();
  if (!text) return;
  state.writeIns = state.writeIns || [];
  state.writeIns.push(text);
  saveState();
  if (typeof syncVoteToServer === 'function') syncVoteToServer(null, text);
  if (typeof trackEvent === 'function') trackEvent('write_in_vote', { hustle_text: text });
  inp.value = '';
  inp.placeholder = 'Sent! Add another...';
  document.getElementById('btn-writein').textContent = 'SENT ✓';
  setTimeout(() => document.getElementById('btn-writein').textContent = 'SEND IDEA', 2000);
});

document.querySelectorAll('.lb-tab[data-scope]').forEach(tab => {
  tab.addEventListener('click', () => {
    if (!tab.dataset.scope) return;
    document.querySelectorAll('.lb-tab[data-scope]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    lbScope = tab.dataset.scope;
    if (typeof refreshLeaderboard === 'function') refreshLeaderboard();
  });
});

// Shelf delegate (survives shelf re-render)
document.querySelector('.shelf-items').addEventListener('click', (e) => {
  const btn = e.target.closest('.shelf-btn');
  if (!btn) return;
  if (!game || !game.running) return;
  serveItem(btn.dataset.item, btn);
});

// =========================================================
// PLAY BUTTONS
// =========================================================
document.getElementById('btn-home-play').addEventListener('click', () => {
  if (state.roundsToday >= totalRoundsToday()) {
    alert('You don finish your rounds for today. Come back tomorrow!');
    return;
  }
  currentHustle = 'market_trader';
  openSetupForHustle('market_trader');
});

const wigPlayBtn = document.getElementById('btn-home-play-wig');
if (wigPlayBtn) {
  wigPlayBtn.addEventListener('click', () => {
    if (state.roundsToday >= totalRoundsToday()) {
      alert('You don finish your rounds for today. Come back tomorrow!');
      return;
    }
    currentHustle = 'wig_plug';
    if (!state.wigStock) {
      state.wigStock = { bone_straight: 20, deep_wave: 15, braids: 10 };
      saveState();
    }
    const totalStock = Object.values(state.wigStock).reduce((a, b) => a + b, 0);
    if (totalStock === 0) {
      alert('You don sell finish all your wigs! Go to your dashboard to restock.');
      if (typeof showScreen === 'function') showScreen(playerId ? 'dashboard' : 'home');
      return;
    }
    openSetupForHustle('wig_plug');
  });
}

function openSetupForHustle(hustleKey) {
  currentHustle = hustleKey;
  const hustle = CONFIG.hustles[hustleKey];

  const grid = document.querySelector('.product-grid');
  if (grid) {
    grid.innerHTML = '';
    Object.entries(hustle.products).forEach(([key, prod]) => {
      const btn = document.createElement('button');
      btn.className = 'product-card';
      btn.dataset.product = key;
      btn.innerHTML = `<span class="emoji">${prod.emoji}</span><div><strong>${prod.label || key}</strong><small>₦${prod.baseSale} base · ${prod.patience}s patience</small></div>`;
      grid.appendChild(btn);
    });

    selectedProduct = Object.keys(hustle.products)[0];
    const first = grid.querySelector('.product-card');
    if (first) first.classList.add('selected');
  }

  document.getElementById('player-name').value = state.playerName || '';
  if (typeof showScreen === 'function') showScreen('setup');
}

// Setup screen product selection (delegate — wired once)
document.querySelector('.product-grid').addEventListener('click', (e) => {
  const card = e.target.closest('.product-card');
  if (!card) return;
  document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedProduct = card.dataset.product;
});

document.getElementById('btn-start-round').addEventListener('click', () => {
  state.playerName = document.getElementById('player-name').value.trim() || state.playerName;
  saveState();
  if (typeof trackEvent === 'function') trackEvent('round_start', { stall: selectedProduct, hustle: currentHustle, is_guest: !playerId });
  startRound();
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  if (state.roundsToday >= totalRoundsToday()) return;
  startRound();
});

// =========================================================
// WATCH AD
// =========================================================
function updateWatchAdButton() {
  const btn = document.getElementById('btn-watch-ad');
  if (!btn) return;
  const adsLeft = CONFIG.watchAd.maxPerDay - (state.watchAdsToday || 0);
  if (adsLeft <= 0) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'block';
  btn.textContent = `🎬 Watch ad for +1 round (${adsLeft} left today)`;
}

document.addEventListener('click', (e) => {
  if (e.target.id !== 'btn-watch-ad') return;
  const adsLeft = CONFIG.watchAd.maxPerDay - (state.watchAdsToday || 0);
  if (adsLeft <= 0) return;

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.style.zIndex = '200';
  const box = document.createElement('div');
  box.className = 'modal';
  box.style.maxWidth = '420px';

  const adSlot = (typeof brandSlots !== 'undefined' && brandSlots) ? brandSlots['video_ad'] : null;
  const seconds = CONFIG.watchAd.durationSeconds;

  let adHTML;
  if (adSlot && adSlot.brand_art_url) {
    adHTML = `
      <div id="ad-content" style="background:#000;padding:0;border-radius:12px;overflow:hidden;margin:16px 0;position:relative;aspect-ratio:16/9">
        <img src="${adSlot.brand_art_url}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
        <div style="position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.75);color:#fff;padding:4px 10px;border-radius:20px;font-size:10px;font-weight:900;letter-spacing:1px">SPONSORED</div>
        <div id="ad-timer" style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.8);color:#D4A017;padding:6px 14px;border-radius:20px;font-size:16px;font-weight:900">${seconds}</div>
      </div>
    `;
  } else if (adSlot && adSlot.brand_name) {
    adHTML = `
      <div id="ad-content" style="background:${adSlot.brand_color || '#1F4A2E'};color:#F5EBDC;padding:40px 20px;border-radius:12px;margin:16px 0;text-align:center;position:relative">
        <div style="font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;opacity:0.7">Sponsored</div>
        <div style="font-size:24px;font-weight:900;margin:12px 0">${adSlot.brand_name}</div>
        <div id="ad-timer" style="font-size:36px;font-weight:900;margin-top:16px;color:#D4A017">${seconds}</div>
      </div>
    `;
  } else {
    adHTML = `
      <div id="ad-content" style="background:#1F4A2E;color:#F5EBDC;padding:40px 20px;border-radius:12px;margin:16px 0;text-align:center">
        <div style="font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;opacity:0.7">Sponsored</div>
        <div style="font-size:22px;font-weight:900;margin:12px 0">YOUR AD HERE</div>
        <div style="font-size:12px;opacity:0.85">Reach thousands of Nigerian players</div>
        <div id="ad-timer" style="font-size:36px;font-weight:900;margin-top:16px;color:#D4A017">${seconds}</div>
      </div>
    `;
  }

  box.innerHTML = `
    <h3>Advertisement</h3>
    ${adHTML}
    <p style="font-size:12px;color:var(--muted)">Ad closes in <span id="ad-timer-inline">${seconds}</span>s — your extra round will be granted automatically.</p>
  `;
  bg.appendChild(box);
  document.body.appendChild(bg);

  let remaining = seconds;
  const timerEl = document.getElementById('ad-timer');
  const inlineEl = document.getElementById('ad-timer-inline');

  const iv = setInterval(() => {
    remaining--;
    if (timerEl) timerEl.textContent = remaining;
    if (inlineEl) inlineEl.textContent = remaining;

    if (remaining <= 0) {
      clearInterval(iv);
      bg.remove();

      state.adBonusRounds = (state.adBonusRounds || 0) + 1;
      state.watchAdsToday = (state.watchAdsToday || 0) + 1;
      state.watchAdsDate = todayKey();
      saveState();

      if (typeof trackEvent === 'function') trackEvent('ad_watched', { hustle: currentHustle });
      alert('🎉 +1 round granted! Play again now.');

      const playBtn = document.getElementById('btn-play-again');
      if (playBtn) {
        playBtn.textContent = 'PLAY AGAIN';
        playBtn.disabled = false;
        playBtn.style.opacity = '1';
      }
      updateWatchAdButton();
      document.getElementById('result-rounds').textContent = roundsLeftText();
    }
  }, 1000);
});

// =========================================================
// RESULT VENDOR BANNER
// =========================================================
function updateResultVendorBanner() {
  const banner = document.getElementById('result-vendor-banner');
  if (!banner) return;

  if (currentHustle === 'wig_plug') {
    banner.innerHTML = '🛍️ Looking for real wigs? <a href="#" id="result-vendor-link" style="color:var(--oxblood);font-weight:900;text-decoration:underline">Browse verified vendors →</a>';
    banner.style.display = 'block';
    const link = document.getElementById('result-vendor-link');
    if (link) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (playerId) {
          if (typeof showScreen === 'function') showScreen('marketplace');
          if (typeof loadMarketplace === 'function') loadMarketplace();
        } else {
          sessionStorage.setItem('hc_after_auth', 'marketplace');
          if (typeof showAuthModal === 'function') showAuthModal();
        }
      });
    }
  } else {
    banner.style.display = 'none';
  }
}
