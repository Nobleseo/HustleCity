'use strict';

// =========================================================
// SUPABASE CLIENT
// =========================================================
const SUPABASE_URL = 'https://xlyefqzqxfjhsigtxgnc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kxWD40ojQTuXWiKeLiRzxg_fLaC_G2V';
const sb = (typeof supabase !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// =========================================================
// PLAYER IDENTITY
// =========================================================
let playerId = localStorage.getItem('hc_player_id') || null;

function updateHomeAuthButton() {
  const signedIn = !!playerId;
  document.body.classList.toggle('is-signed-in', signedIn);
  const homeSignin = document.getElementById('btn-signin-home');
  if (homeSignin) {
    homeSignin.style.display = signedIn ? 'none' : 'block';
  }
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

// =========================================================
// REFERRAL FROM URL
// =========================================================
const urlRef = new URLSearchParams(location.search).get('ref');
let pendingReferrer = null;
if (urlRef && urlRef !== GUEST_ID) {
  pendingReferrer = urlRef;
  localStorage.setItem('hc_referrer', urlRef);
} else {
  pendingReferrer = localStorage.getItem('hc_referrer');
}

// =========================================================
// GAME CONFIG (all tunable numbers)
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
  products: {
    tomatoes: { emoji: '🍅', baseSale: 120, patience: 8.0 },
    pepper:   { emoji: '🌶️', baseSale: 250, patience: 4.5 },
    wrappers: { emoji: '🧣', baseSale: 180, patience: 6.0 }
  },
  upgrades: {
    bigger_shelf: { name: 'Bigger Shelf', icon: '📦', cost: 2000, desc: '+1 product slot in round' },
    loudspeaker:   { name: 'Loudspeaker', icon: '📢', cost: 5000, desc: '+1.5s customer patience' }
  },
  divisions: [
    { key: 'street_trader', name: 'Street', min: 0,        max: 50000 },
    { key: 'stall_owner',   name: 'Stall',  min: 50001,    max: 250000 },
    { key: 'market_king',   name: 'King',   min: 250001,   max: 1000000 },
    { key: 'mogul',         name: 'Mogul',  min: 1000001,  max: 5000000 },
    { key: 'tycoon',        name: 'Tycoon', min: 5000001,  max: Infinity }
  ]
};

const BODIES = ['🧍','🧍‍♀️','🧍‍♂️','👨','👩','👴','👵','👦','👧'];
const BUBBLES = ['Oga, come buy!','How much?','Na final price!','Abeg sharp sharp','I dey wait o'];

// =========================================================
// STATE (persisted in localStorage)
// =========================================================
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
    referralClaimedIds: []
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
      s.todayDate = todayKey();
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

// Total rounds available today = free + bonus from referrals
function totalRoundsToday() {
  return CONFIG.roundsPerDay + (state.bonusRoundsToday || 0);
}
