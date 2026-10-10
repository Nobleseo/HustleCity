'use strict';

// =========================================================
// AUTH STATE
// =========================================================
let authMode = 'signup';

function showAuthModal() {
  document.getElementById('auth-modal').style.display = 'flex';
  updateAuthUI();
}

function hideAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

function updateAuthUI() {
  const isSignup = authMode === 'signup';
  document.getElementById('auth-tab-signup').classList.toggle('active', isSignup);
  document.getElementById('auth-tab-signin').classList.toggle('active', !isSignup);
  document.getElementById('auth-submit').textContent = isSignup ? 'Create Account' : 'Sign In';
  document.getElementById('auth-error').textContent = '';
}

// =========================================================
// AUTH WIRING
// =========================================================
document.getElementById('auth-tab-signup').addEventListener('click', () => { authMode = 'signup'; updateAuthUI(); });
document.getElementById('auth-tab-signin').addEventListener('click', () => { authMode = 'signin'; updateAuthUI(); });
document.getElementById('auth-skip').addEventListener('click', hideAuthModal);
document.getElementById('btn-signin-result').addEventListener('click', showAuthModal);
document.getElementById('btn-signin-home').addEventListener('click', showAuthModal);
const pill = document.getElementById('btn-signin-pill');
if (pill) pill.addEventListener('click', showAuthModal);
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
  updateHomeAuthButton();

  try {
        await sb.from('players').upsert({
      id: user.id,
      email: user.email,
      display_name: state.playerName || (user.email || '').split('@')[0] || 'Player',
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

  trackEvent('signup_done', { method: authMode });
  hideAuthModal();
  refreshHome();
  refreshDashboard();
  showScreen('dashboard');
});

// =========================================================
// SESSION LISTENER
// =========================================================
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

// =========================================================
// SIGN OUT
// =========================================================
document.getElementById('btn-sign-out').addEventListener('click', async () => {
  if (!confirm('Sign out? Your progress stays on this device.')) return;
  if (sb) await sb.auth.signOut();
  playerId = null;
  localStorage.removeItem('hc_player_id');
  updateHomeAuthButton();
  refreshHome();
  showScreen('home');
});

// =========================================================
// DASHBOARD NAV BUTTONS
// =========================================================
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

// =========================================================
// REFERRAL REWARD CLAIM
// ---------------------------------------------------------
// Called on boot. Finds all referrals where this device is
// the referrer, marks them rewarded, and credits:
//   +1 Boost Token  (capped at 5)
//   +1 bonus round  (capped at 5 per day)
// =========================================================
async function claimPendingReferrals() {
  if (!sb) return;

  try {
    const { data, error } = await sb.from('referrals')
      .select('id')
      .eq('referrer_id', GUEST_ID)
      .eq('status', 'completed')
      .or('rewarded.is.null,rewarded.eq.false')
      .limit(20);

    if (error) {
      // rewarded column might not exist yet — silently skip
      console.warn('referral claim skipped:', error.message);
      return;
    }

    if (!data || !data.length) return;

    const ids = data.map(r => r.id);
    let tokensAwarded = 0;
    let bonusAwarded = 0;

    for (let i = 0; i < ids.length; i++) {
      const canAwardToken = state.boostTokens < CONFIG.referral.boostTokensCap;
      const canAwardBonus = state.bonusRoundsToday < CONFIG.referral.bonusRoundsCap;
      if (!canAwardToken && !canAwardBonus) break;

      if (canAwardToken) { state.boostTokens++; tokensAwarded++; }
      if (canAwardBonus) { state.bonusRoundsToday++; bonusAwarded++; }
    }

    // Mark all as rewarded so we don't claim them again
    await sb.from('referrals')
      .update({ rewarded: true })
      .in('id', ids);

    if (tokensAwarded > 0 || bonusAwarded > 0) {
      state.referralCount = (state.referralCount || 0) + ids.length;
      saveState();
      showReferralToast(tokensAwarded, bonusAwarded);
    }
  } catch (e) {
    console.warn('referral claim failed', e);
  }
}

function showReferralToast(tokens, bonus) {
  const toast = document.createElement('div');
  toast.className = 'toast-referral';
  const parts = [];
  if (tokens > 0) parts.push('+' + tokens + ' Boost Token' + (tokens > 1 ? 's' : ''));
  if (bonus > 0) parts.push('+' + bonus + ' bonus round' + (bonus > 1 ? 's' : ''));
  toast.textContent = '🎁 ' + parts.join(' · ') + ' from referrals!';
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

// =========================================================
// UI SYNC ON AUTH STATE CHANGE
// =========================================================
if (sb) {
  sb.auth.onAuthStateChange(() => {
    if (typeof refreshDashboard === 'function') refreshDashboard();
  });
}
