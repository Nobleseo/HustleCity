'use strict';

let authMode = 'signup';

function showAuthModal(mode = null) {
  if (mode === 'signup' || mode === 'signin') authMode = mode;
  const m = document.getElementById('auth-modal');
  if (m) m.style.display = 'flex';
  updateAuthUI();
}

function hideAuthModal() {
  const m = document.getElementById('auth-modal');
  if (m) m.style.display = 'none';
}

function updateAuthUI() {
  const isSignup = authMode === 'signup';
  const tabUp = document.getElementById('auth-tab-signup');
  const tabIn = document.getElementById('auth-tab-signin');
  const sub = document.getElementById('auth-submit');
  const err = document.getElementById('auth-error');
  if (tabUp) tabUp.classList.toggle('active', isSignup);
  if (tabIn) tabIn.classList.toggle('active', !isSignup);
  if (sub) sub.textContent = isSignup ? 'Create Account' : 'Sign In';
  if (err) err.textContent = '';
}

// Wire Auth Modal
document.getElementById('auth-tab-signup').addEventListener('click', () => { authMode = 'signup'; updateAuthUI(); });
document.getElementById('auth-tab-signin').addEventListener('click', () => { authMode = 'signin'; updateAuthUI(); });
document.getElementById('auth-skip').addEventListener('click', hideAuthModal);
document.getElementById('btn-signin-result').addEventListener('click', () => showAuthModal('signin'));

const pill = document.getElementById('btn-signin-pill');
if (pill) {
  pill.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (playerId) {
      showScreen('dashboard'); // If logged in, go to dashboard
    } else {
      showAuthModal('signin'); // If guest, show sign in
    }
  });
}

// Submit Auth
document.getElementById('auth-submit').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');

  if (!email || !password) { errEl.textContent = 'Enter email and password.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be 6+ characters.'; return; }
  errEl.textContent = 'Working…';

  const result = (authMode === 'signup')
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });

  if (result.error) { errEl.textContent = result.error.message; return; }
  const user = result.data.user;
  if (!user) { errEl.textContent = 'Check your email to confirm, then Sign In.'; return; }

  playerId = user.id;
  localStorage.setItem('hc_player_id', playerId);
  
  // Save name to local state if missing
  if (!state.playerName || !state.playerName.trim()) {
    state.playerName = (user.email || '').split('@')[0] || 'Hustler';
    saveState();
  }
  updateHomeAuthButton();

  try {
    await sb.from('players').upsert({
      id: user.id,
      email: user.email,
      display_name: state.playerName || 'Player',
      wallet_balance: state.wallet,
      lifetime_earned: state.lifetime,
      division: state.division,
      country: 'NG',
      last_play_date: todayKey()
    }, { onConflict: 'id' });
    await sb.from('guests').upsert({
      guest_id: GUEST_ID,
      wallet_balance: state.wallet,
      player_name: state.playerName || null,
      merged_into_player: user.id
    }, { onConflict: 'guest_id' });
  } catch (e) { console.warn('player upsert failed', e); }

  hideAuthModal();
  refreshHome();
  refreshDashboard();
  showScreen('dashboard'); // Go to dashboard after successful sign-in
});

// Session Listener
if (sb) {
  sb.auth.onAuthStateChange((event, session) => {
    playerId = session && session.user ? session.user.id : null;
    if (playerId) {
      localStorage.setItem('hc_player_id', playerId);
    } else {
      localStorage.removeItem('hc_player_id');
    }
    updateHomeAuthButton();
  });

  sb.auth.getSession().then(({ data }) => {
    if (data && data.session && data.session.user) {
      playerId = data.session.user.id;
      localStorage.setItem('hc_player_id', playerId);
    }
    updateHomeAuthButton();
  });
} else {
  updateHomeAuthButton();
}

// Sign Out
document.getElementById('btn-sign-out').addEventListener('click', async () => {
  if (!confirm('Sign out? Your progress stays on this device.')) return;
  if (sb) await sb.auth.signOut();
  playerId = null;
  localStorage.removeItem('hc_player_id');
  updateHomeAuthButton();
  refreshHome();
  showScreen('home');
});

// Dashboard Buttons
document.getElementById('btn-dash-play').addEventListener('click', () => {
  if (state.roundsToday >= totalRoundsToday()) {
    alert('You don finish your rounds for today. Come back tomorrow!');
    return;
  }
  document.getElementById('player-name').value = state.playerName || '';
  showScreen('setup');
});

document.getElementById('btn-dash-shop').addEventListener('click', () => showScreen('shop'));
document.getElementById('btn-dash-lb').addEventListener('click', () => showScreen('leaderboard'));
document.getElementById('btn-dash-settings').addEventListener('click', () => showScreen('settings'));

document.getElementById('btn-dash-market').addEventListener('click', () => {
  showScreen('marketplace');
  loadMarketplace();
});

// Referral Claim
async function claimPendingReferrals() {
  if (!sb) return;
  try {
    const ids = [GUEST_ID];
    if (state.playerName && state.playerName.trim()) ids.push(state.playerName.trim());
    const { data, error } = await sb.from('referrals').select('id').in('referrer_id', ids).eq('status', 'completed').or('rewarded.is.null,rewarded.eq.false').limit(20);
    if (error || !data || !data.length) return;

    const refIds = data.map(r => r.id);
    let tokensAwarded = 0;
    let bonusAwarded = 0;

    for (let i = 0; i < refIds.length; i++) {
      if (state.boostTokens < CONFIG.referral.boostTokensCap) { state.boostTokens++; tokensAwarded++; }
      if (state.bonusRoundsToday < CONFIG.referral.bonusRoundsCap) { state.bonusRoundsToday++; bonusAwarded++; }
    }
    await sb.from('referrals').update({ rewarded: true }).in('id', refIds);
    if (tokensAwarded > 0 || bonusAwarded > 0) {
      state.referralCount = (state.referralCount || 0) + refIds.length;
      saveState();
      showReferralToast(tokensAwarded, bonusAwarded);
    }
  } catch (e) {}
}

function showReferralToast(tokens, bonus) {
  const toast = document.createElement('div');
  toast.className = 'toast-referral';
  const parts = [];
  if (tokens > 0) parts.push('+' + tokens + ' Boost Token');
  if (bonus > 0) parts.push('+' + bonus + ' bonus round');
  toast.textContent = '🎁 ' + parts.join(' · ') + ' from referrals!';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 5000);
}
