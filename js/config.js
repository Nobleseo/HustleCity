'use strict';

const SUPABASE_URL = 'https://xlyefqzqxfjhsigtxgnc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kxWD40ojQTuXWiKeLiRzxg_fLaC_G2V';
const sb = (typeof supabase !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let playerId = localStorage.getItem('hc_player_id') || null;

function updateHomeAuthButton() {
  const signedIn = !!playerId;
  document.body.classList.toggle('is-signed-in', signedIn);
  const homeSignin = document.getElementById('btn-signin-home');
  if (homeSignin) homeSignin.style.display = signedIn ? 'none' : 'block';
}

function getGuestId() {
  let g = localStorage.getItem('hc_guest_id');
  if (!g) {
    g = 'g_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('hc_guest_id', g);
  }
  return g;
}
const GUEST_ID = getGuestId();

const urlRef = new URLSearchParams(location.search).get('ref');
let pendingReferrer = null;
if (urlRef && urlRef !== GUEST_ID) {
  pendingReferrer = urlRef;
  localStorage.setItem('hc_referrer', urlRef);
} else {
  pendingReferrer = localStorage.getItem('hc_referrer');
}

// =========================================================
// ACTIVE HUSTLE
// =========================================================
let currentHustle = 'market_trader';

// =========================================================
// GAME CONFIG
// =========================================================
const CONFIG = {
  roundDuration: 60,
  spawnIntervalStart: 2.2,
  spawnIntervalEnd: 1.0,
  comboThreshold: 3,
  comboMaxMultiplier: 5,
  roundsPerDay: 3,

  referral: {
    bonusRoundsCap: 5,
    boostTokensCap: 5
  },

  watchAd: {
    maxPerDay: 3,
    durationSeconds: 15
  },

  // Market Trader (untouched — original products)
  products: {
    tomatoes: { emoji: '🍅', label: 'Tomato', baseSale: 120, patience: 8.0 },
    pepper:   { emoji: '🌶️', label: 'Pepper', baseSale: 250, patience: 4.5 },
    wrappers: { emoji: '🧣', label: 'Wrapper', baseSale: 180, patience: 6.0 }
  },

  // Hustle registry — one entry per playable game
  hustles: {
    market_trader: {
      key: 'market_trader',
      name: 'Market Trader',
      icon: '🛒',
      description: 'Call customers. Serve right.',
      products: null, // set after CONFIG is defined
      hasStock: false
    },
    wig_plug: {
      key: 'wig_plug',
      name: 'Wig Plug',
      icon: '💇‍♀️',
      description: 'Sell premium wigs to your customers.',
            products: {
        bone_straight: { emoji: '👱🏾‍♀️', label: 'Bone Straight', baseSale: 200, patience: 6.0, stock: 20 },
        deep_wave:     { emoji: '💇🏾‍♀️', label: 'Deep Wave',    baseSale: 350, patience: 5.0, stock: 15 },
        braids:        { emoji: '🧑🏾‍🦱', label: 'Braids',       baseSale: 250, patience: 7.0, stock: 10 }
      },
      hasStock: true,
      restockCost: 3000,
      restockAmount: 20
    }
  },

  // Consumables — bought in shop, apply to next round, then gone
  consumables: {
    edge_control: { name: 'Edge Control', icon: '🧴', cost: 500,  effect: 'spawn_boost',  desc: '+20% customer spawn rate next round' },
    lash_glue:    { name: 'Lash Glue',    icon: '💧', cost: 800,  effect: 'double_spawn', desc: '+1 extra customer next round' },
    hair_oil:     { name: 'Hair Oil',     icon: '🧈', cost: 1200, effect: 'sale_boost',   desc: '+30% sale value next round' },
    melt_band:    { name: 'Melt Band',    icon: '🎀', cost: 300,  effect: 'thief_shield', desc: 'Thief caught automatically next round' }
  },

  upgrades: {
    bigger_shelf: { name: 'Bigger Shelf', icon: '📦', cost: 2000, desc: '+1 product slot in round' },
    loudspeaker:  { name: 'Loudspeaker',  icon: '📢', cost: 5000, desc: '+1.5s customer patience' }
  },

  divisions: [
    { key: 'street_trader', name: 'Street', min: 0,        max: 50000 },
    { key: 'stall_owner',   name: 'Stall',  min: 50001,    max: 250000 },
    { key: 'market_king',   name: 'King',   min: 250001,   max: 1000000 },
    { key: 'mogul',         name: 'Mogul',  min: 1000001,  max: 5000000 },
    { key: 'tycoon',        name: 'Tycoon', min: 5000001,  max: Infinity }
  ]
};

// Wire market_trader products after CONFIG exists
CONFIG.hustles.market_trader.products = CONFIG.products;

const BODIES = ['🧍','🧍‍♀️','🧍‍♂️','👨','👩','👴','👵','👦','👧'];
const BUBBLES = ['Oga, come buy!','How much?','Na final price!','Abeg sharp sharp','I dey wait o'];

const STORAGE_KEY = 'hc_state_v1';

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function defaultState() {
  return {
    wallet: 0,
    lifetime: 0,
    todayScore: 0,
    todayDate: todayKey(),
    roundsToday: 0,
    bonusRoundsToday: 0,
    adBonusRounds: 0,
    watchAdsToday: 0,
    watchAdsDate: todayKey(),
    boostTokens: 0,
    upgrades: [],
    division: 'street_trader',
    playerName: '',
    theme: 'light',
    votes: [],
    writeIns: [],
    bestToday: 0,
    feedbackSent: false,
    referralCount: 0,
    referralClaimedIds: [],
    wigStock: {
      bone_straight: 20,
      deep_wave: 15,
      braids: 10
    },
    activeConsumables: {
      spawn_boost: false,
      double_spawn: false,
      sale_boost: false,
      thief_shield: false
    }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    if (s.todayDate !== todayKey()) {
      s.todayScore = 0;
      s.roundsToday = 0;
      s.bonusRoundsToday = 0;
      s.adBonusRounds = 0;
      s.todayDate = todayKey();
    }
    if (s.watchAdsDate !== todayKey()) {
      s.watchAdsToday = 0;
      s.watchAdsDate = todayKey();
    }
    return Object.assign(defaultState(), s);
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

let state = loadState();

// Total rounds available today = free + referral bonus + ad bonus
function totalRoundsToday() {
  return CONFIG.roundsPerDay + (state.bonusRoundsToday || 0) + (state.adBonusRounds || 0);
}
