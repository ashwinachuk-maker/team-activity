// ─── STATE ───────────────────────────────────────────────────────────────────
const state = {
  playerName: '',
  trivia: {
    currentQ:  0,
    selected:  null,
    submitted: false,
    answers:   [],   // { qId, selected, correct }
    score:     0,
  },
  voting: {
    currentCat: 0,
    selected:   null,
    reason:     '',
    votes:      [],  // { catId, category, emoji, nominee, reason }
  },
};

// ─── STORAGE ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'teamArena_entries';

function loadLocalEntries() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveLocalEntry(entry) {
  const entries = loadLocalEntries();
  const idx = entries.findIndex(e => e.playerName === entry.playerName);
  if (idx >= 0) entries[idx] = entry; else entries.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

async function loadEntries() {
  if (window.db) {
    try {
      const deadline = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
      const snap = await Promise.race([window.db.ref('entries').once('value'), deadline]);
      const val  = snap.val();
      if (val) return Object.values(val);
      return [];
    } catch (e) {
      console.warn('Firebase read failed, using localStorage:', e.message);
    }
  }
  return loadLocalEntries();
}

async function saveEntry(entry) {
  saveLocalEntry(entry);
  if (window.db) {
    try {
      const key = entry.playerName.replace(/[.#$[\]/]/g, '_');
      await window.db.ref('entries/' + key).set(entry);
    } catch (e) {
      console.warn('Firebase write failed:', e);
    }
  }
}

// ─── SCREEN NAVIGATION ───────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

// ─── NAME ENTRY ──────────────────────────────────────────────────────────────
const nameInput  = document.getElementById('name-input');
const btnEnter   = document.getElementById('btn-enter');
const playersJoinedEl = document.getElementById('players-joined');

nameInput.addEventListener('input', () => {
  btnEnter.disabled = nameInput.value.trim().length === 0;
});
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !btnEnter.disabled) startGame();
});
btnEnter.addEventListener('click', startGame);

function startGame() {
  state.playerName = nameInput.value.trim();
  startTrivia();
}

// show how many others have already played
async function refreshPlayersJoined() {
  const entries = await loadEntries();
  if (entries.length > 0) {
    playersJoinedEl.textContent = `${entries.length} teammate${entries.length > 1 ? 's' : ''} already played`;
  }
}
refreshPlayersJoined();

// ─── TRIVIA ──────────────────────────────────────────────────────────────────
function startTrivia() {
  // answers keyed by question index so going back can overwrite
  state.trivia = { currentQ: 0, selected: null, answers: {}, score: 0 };
  showScreen('screen-trivia');
  renderTrivia();
}

function renderTrivia() {
  const { currentQ, answers } = state.trivia;
  const q = TRIVIA[currentQ];
  const total = TRIVIA.length;

  // header
  document.getElementById('trivia-player-chip').textContent = state.playerName;
  document.getElementById('trivia-counter').textContent = `Q${currentQ + 1} / ${total}`;
  document.getElementById('trivia-progress-fill').style.width = `${(currentQ / total) * 100}%`;

  // question card
  document.getElementById('trivia-emoji').textContent   = q.emoji;
  document.getElementById('trivia-q-label').textContent = `Question ${currentQ + 1}`;
  document.getElementById('trivia-q-text').textContent  = q.question;

  // restore previous answer for this question if user went back
  const prevAnswer = answers[currentQ] || null;
  state.trivia.selected = prevAnswer;

  // pick 5 options: correct answer + 4 random others, stable per question
  const others = TEAM.filter(n => n !== q.answer);
  // deterministic shuffle of others using question id as seed
  const seeded = others.slice().sort((a, b) => {
    const h = s => [...s].reduce((acc, c, i) => acc + c.charCodeAt(0) * (q.id * 7 + i), 0);
    return (h(a) % 97) - (h(b) % 97);
  });
  const options = [q.answer, ...seeded.slice(0, 4)];
  // shuffle the 5 options so correct answer isn't always first
  options.sort((a, b) => {
    const h = s => [...s].reduce((acc, c, i) => acc + c.charCodeAt(0) * (q.id * 13 + i + 3), 0);
    return (h(a) % 53) - (h(b) % 53);
  });

  const grid = document.getElementById('trivia-answer-grid');
  grid.innerHTML = '';
  options.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className = 'answer-btn' + (name === prevAnswer ? ' selected' : '');
    btn.dataset.name = name;
    btn.innerHTML = `
      <span class="answer-num">${i + 1}</span>
      <span class="answer-name">${name}</span>
    `;
    btn.addEventListener('click', () => selectAnswer(btn, name));
    grid.appendChild(btn);
  });

  // back button — hidden on Q1
  const btnBack = document.getElementById('btn-trivia-back');
  btnBack.style.visibility = currentQ === 0 ? 'hidden' : 'visible';
  btnBack.disabled = currentQ === 0;

  // submit button — enabled if this question already has an answer
  const btnNext = document.getElementById('btn-trivia-next');
  btnNext.disabled = !prevAnswer;
  btnNext.textContent = currentQ < total - 1 ? 'Submit →' : 'Finish →';
}

function selectAnswer(btn, name) {
  document.querySelectorAll('.answer-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.trivia.selected = name;
  document.getElementById('btn-trivia-next').disabled = false;
}

document.getElementById('btn-trivia-back').addEventListener('click', () => {
  if (state.trivia.currentQ > 0) {
    state.trivia.currentQ--;
    renderTrivia();
  }
});

document.getElementById('btn-trivia-next').addEventListener('click', submitTrivia);

function submitTrivia() {
  if (!state.trivia.selected) return;

  const { currentQ, selected } = state.trivia;
  const q = TRIVIA[currentQ];
  const correct = selected === q.answer;

  // record/overwrite answer for this question
  state.trivia.answers[currentQ] = selected;

  // recalculate score from all stored answers
  state.trivia.score = Object.entries(state.trivia.answers)
    .filter(([idx, ans]) => ans === TRIVIA[idx].answer).length;

  // immediately advance
  if (currentQ >= TRIVIA.length - 1) {
    showScreen('screen-break');
  } else {
    state.trivia.currentQ++;
    renderTrivia();
  }
}

function showTriviaResult() {
  showScreen('screen-trivia-result');
  const { score, answers } = state.trivia;
  const total = TRIVIA.length;
  const perfect = score === total;

  const inner = document.getElementById('trivia-result-inner');
  inner.innerHTML = `
    <span class="result-icon">${perfect ? '👑' : score >= 3 ? '🎉' : '💪'}</span>
    ${perfect ? `<p class="result-award-label">Team Connoisseur Award</p>` : ''}
    <p class="result-player-name">${state.playerName}</p>
    ${perfect ? `<div class="result-title-badge">🏆 Team Connoisseur</div>` : ''}
    <p class="result-score">You got <strong>${score} / ${total}</strong> correct</p>
    ${perfect ? `<p style="color:var(--muted);font-size:14px;margin-top:4px;">You know your team the best!</p>` : ''}
  `;
}

document.getElementById('btn-to-awards').addEventListener('click', startVoting);
document.getElementById('btn-break-continue').addEventListener('click', startVoting);

// ─── VOTING / AWARDS ─────────────────────────────────────────────────────────
function startVoting() {
  state.voting = { currentCat: 0, selected: null, reason: '', votes: [] };
  showScreen('screen-voting');
  renderVoting();
}

function renderVoting() {
  const { currentCat } = state.voting;
  const award = AWARDS[currentCat];
  const total  = AWARDS.length;

  // header
  document.getElementById('voting-player-chip').textContent = state.playerName;
  document.getElementById('voting-counter').textContent = `${currentCat + 1} / ${total}`;
  document.getElementById('voting-progress-fill').style.width = `${(currentCat / total) * 100}%`;

  // award card
  document.getElementById('award-emoji').textContent    = award.emoji;
  document.getElementById('award-cat-label').textContent = award.category.toUpperCase();
  document.getElementById('voting-q-text').textContent  = award.question;

  // names grid
  const grid = document.getElementById('voting-names-grid');
  grid.innerHTML = '';
  TEAM.forEach(name => {
    const tile = document.createElement('button');
    tile.className = 'name-tile';
    tile.dataset.name = name;
    tile.innerHTML = `
      <div class="name-avatar">${name[0]}</div>
      <span class="name-label">${name}</span>
    `;
    tile.addEventListener('click', () => selectVote(tile, name));
    grid.appendChild(tile);
  });

  // reset search
  const searchInput = document.getElementById('name-search');
  searchInput.value = '';
  filterNames('');

  // reset reason area
  const reasonArea = document.getElementById('reason-area');
  reasonArea.classList.add('hidden');
  const reasonInput = document.getElementById('reason-input');
  reasonInput.value = '';
  document.getElementById('btn-vote').disabled = true;

  state.voting.selected = null;
  state.voting.reason   = '';
}

function filterNames(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('#voting-names-grid .name-tile').forEach(tile => {
    const match = tile.dataset.name.toLowerCase().includes(q);
    tile.style.display = match ? '' : 'none';
  });
}

document.getElementById('name-search').addEventListener('input', e => {
  filterNames(e.target.value.trim());
});

function selectVote(tile, name) {
  // deselect others
  document.querySelectorAll('.name-tile').forEach(t => t.classList.remove('selected'));
  tile.classList.add('selected');
  state.voting.selected = name;

  // show reason area
  const reasonArea = document.getElementById('reason-area');
  reasonArea.classList.remove('hidden');
  reasonArea.style.removeProperty('display');
  document.getElementById('reason-input').focus();
  document.getElementById('btn-vote').disabled = true;
  state.voting.reason = '';
  document.getElementById('reason-input').value = '';
}

document.getElementById('reason-input').addEventListener('input', e => {
  state.voting.reason = e.target.value.trim();
  document.getElementById('btn-vote').disabled = state.voting.reason.length === 0;
});

document.getElementById('btn-vote').addEventListener('click', castVote);

function castVote() {
  const { currentCat, selected, reason } = state.voting;
  const award = AWARDS[currentCat];

  state.voting.votes.push({
    catId:    award.id,
    category: award.category,
    emoji:    award.emoji,
    nominee:  selected,
    reason,
  });

  const isLast = currentCat >= AWARDS.length - 1;
  if (isLast) {
    finishVoting();
  } else {
    state.voting.currentCat++;
    renderVoting();
  }
}

async function finishVoting() {
  showScreen('screen-done');
  startGameStateListener();
  await saveEntry({
    playerName:  state.playerName,
    triviaScore: state.trivia.score,
    votes:       state.voting.votes,
    timestamp:   Date.now(),
  });
}

// ─── ADMIN AUTH ───────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'snook';

document.getElementById('btn-show-admin').addEventListener('click', () => {
  document.getElementById('admin-auth').classList.remove('hidden');
  document.getElementById('admin-pw-input').focus();
});

document.getElementById('admin-pw-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-admin-submit').click();
});

document.getElementById('btn-admin-submit').addEventListener('click', async () => {
  const val = document.getElementById('admin-pw-input').value;
  const err = document.getElementById('admin-pw-error');
  if (val === ADMIN_PASSWORD) {
    err.classList.add('hidden');
    stopGameStateListener();
    await showLeaderboard();
  } else {
    err.classList.remove('hidden');
    document.getElementById('admin-pw-input').value = '';
    document.getElementById('admin-pw-input').focus();
  }
});

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────
async function showLeaderboard() {
  showScreen('screen-leaderboard');
  const rows = document.getElementById('lb-rows');
  rows.innerHTML = '<p style="color:var(--muted);text-align:center;padding:24px 0;">Loading…</p>';

  const entries = await loadEntries();
  const sorted  = [...entries]
    .filter(e => typeof e.triviaScore === 'number')
    .sort((a, b) => b.triviaScore - a.triviaScore || (a.timestamp || 0) - (b.timestamp || 0));

  const top3   = sorted.slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  rows.innerHTML = '';

  if (top3.length === 0) {
    rows.innerHTML = '<p style="color:var(--muted);text-align:center;padding:24px 0;">No scores yet.</p>';
    return;
  }

  top3.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = `lb-row lb-rank-${i + 1}`;
    row.style.animationDelay = `${i * 0.1}s`;
    row.innerHTML = `
      <span class="lb-medal">${medals[i]}</span>
      <span class="lb-name">${escapeHtml(entry.playerName)}</span>
      <span class="lb-score">${entry.triviaScore} <span class="lb-total">/ ${TRIVIA.length}</span></span>
    `;
    rows.appendChild(row);
  });
}

document.getElementById('btn-lb-next').addEventListener('click', showResults);

// ─── RESULTS ─────────────────────────────────────────────────────────────────
async function buildTally() {
  const entries = await loadEntries();
  const tally = {};

  for (const award of AWARDS) {
    const votes = [];
    const counts = {};
    entries.forEach(entry => {
      const v = (entry.votes || []).find(v => v.catId === award.id);
      if (v) {
        votes.push({ nominee: v.nominee, reason: v.reason, voter: entry.playerName });
        counts[v.nominee] = (counts[v.nominee] || 0) + 1;
      }
    });

    const maxV = Object.values(counts).length ? Math.max(...Object.values(counts)) : 0;
    const topNames = Object.entries(counts).filter(([, c]) => c === maxV).map(([n]) => n);
    let isTie = topNames.length > 1 && maxV > 0;
    let winner = isTie ? null : (topNames[0] || null);
    let tiedNames = isTie ? topNames : [];

    // Check tiebreaker votes if there was a tie
    if (isTie && window.db) {
      try {
        const deadline = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
        const tbSnap = await Promise.race([window.db.ref('tiebreaker/' + award.id).once('value'), deadline]);
        const tbVal = tbSnap.val();
        if (tbVal) {
          const tbCounts = {};
          Object.values(tbVal).forEach(v => { tbCounts[v.nominee] = (tbCounts[v.nominee] || 0) + 1; });
          const tbMax = Math.max(...Object.values(tbCounts));
          const tbTop = Object.entries(tbCounts).filter(([, c]) => c === tbMax).map(([n]) => n);
          if (tbTop.length === 1) { winner = tbTop[0]; isTie = false; tiedNames = []; }
        }
      } catch (e) { /* keep tie state */ }
    }

    tally[award.id] = { winner, tiedNames, winnerVotes: maxV, allVotes: votes, isTie };
  }
  return tally;
}

async function showResults() {
  showScreen('screen-results');
  const tally = await buildTally();
  const list  = document.getElementById('awards-list');
  list.innerHTML = '';

  AWARDS.forEach((award, i) => {
    const { winner, tiedNames, winnerVotes, isTie } = tally[award.id];
    const label = winnerVotes === 1 ? '1 vote' : `${winnerVotes} votes`;

    const wrap = document.createElement('div');
    wrap.className = 'sticky-wrap';
    wrap.style.animationDelay = `${i * 0.08}s`;
    wrap.dataset.state = '0';
    wrap.dataset.awardId = award.id;

    const winnerFace = isTie ? `
      <div class="sticky-face face-winner face-tie">
        <span class="fw-award-tag">${award.category}</span>
        <span class="fw-crown">🤝</span>
        <span class="fw-tie-label">It's a Tie!</span>
        <span class="fw-tied-names">${tiedNames.join(' vs ')}</span>
        <button class="btn-tiebreaker" data-award-id="${award.id}">🗳️ Run Tiebreaker</button>
      </div>
    ` : `
      <div class="sticky-face face-winner">
        <span class="fw-award-tag">${award.category}</span>
        <span class="fw-crown">👑</span>
        <span class="fw-name">${winner || '???'}</span>
        <span style="font-size:12px;opacity:0.5;">${label}</span>
        <button class="btn-who-picked" data-award-id="${award.id}">💬 What people said</button>
      </div>
    `;

    wrap.innerHTML = `
      <div class="sticky-note">
        <div class="sticky-face face-closed">
          <span class="fc-award-tag">${award.category}</span>
          <span class="fc-emoji">${award.emoji}</span>
          <span class="fc-title">${award.category}</span>
          <span class="fc-hint">Tap to reveal winner</span>
        </div>
        ${winnerFace}
      </div>
    `;

    wrap.querySelector('.sticky-note').addEventListener('click', e => {
      if (e.target.closest('.btn-who-picked') || e.target.closest('.btn-tiebreaker')) return;
      if (wrap.dataset.state === '0') {
        wrap.dataset.state = '1';
        wrap.classList.add('state-1');
      }
    });

    if (isTie) {
      wrap.querySelector('.btn-tiebreaker').addEventListener('click', () => {
        startTiebreaker(award, tiedNames);
      });
    } else {
      wrap.querySelector('.btn-who-picked').addEventListener('click', () => {
        showReasons(award, tally[award.id]);
      });
    }

    list.appendChild(wrap);
  });
}

// ─── TIEBREAKER (admin side) ──────────────────────────────────────────────────
async function startTiebreaker(award, tiedNames) {
  if (window.db) {
    await window.db.ref('gameState').set({
      phase: 'tiebreaker',
      awardId: award.id,
      nominees: tiedNames,
      question: award.question,
      emoji: award.emoji,
      category: award.category,
    });
  }
  showScreen('screen-admin-tiebreaker');
  document.getElementById('atb-award').textContent = award.category.toUpperCase();
  const namesEl = document.getElementById('atb-names');
  namesEl.innerHTML = tiedNames.map(n => `<span class="atb-name-chip">${n}</span>`).join('');
}

document.getElementById('btn-close-voting').addEventListener('click', async () => {
  if (window.db) await window.db.ref('gameState').set({ phase: 'idle' });
  await showResults();
});

// ─── TIEBREAKER (participant side) ───────────────────────────────────────────
let _gameStateRef = null;

function startGameStateListener() {
  if (!window.db || _gameStateRef) return;
  _gameStateRef = window.db.ref('gameState');
  _gameStateRef.on('value', snap => {
    const gs = snap.val();
    const activeScreen = document.querySelector('.screen.active')?.id;
    if (!gs || gs.phase === 'idle') {
      if (activeScreen === 'screen-tiebreaker') showScreen('screen-done');
      return;
    }
    if (gs.phase === 'tiebreaker' && (activeScreen === 'screen-done' || activeScreen === 'screen-tiebreaker')) {
      showTiebreakerScreen(gs);
    }
  });
}

function stopGameStateListener() {
  if (_gameStateRef) { _gameStateRef.off(); _gameStateRef = null; }
}

function showTiebreakerScreen(gs) {
  showScreen('screen-tiebreaker');
  document.getElementById('tb-title').textContent = gs.question;
  const grid = document.getElementById('tb-nominees-grid');
  grid.innerHTML = '';
  const votedMsg = document.getElementById('tb-voted-msg');
  votedMsg.classList.add('hidden');

  gs.nominees.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'tb-nominee-btn';
    btn.innerHTML = `<div class="name-avatar tb-avatar">${name[0]}</div><span class="tb-nominee-name">${escapeHtml(name)}</span>`;
    btn.addEventListener('click', async () => {
      if (votedMsg.classList.contains('hidden') === false) return;
      grid.querySelectorAll('.tb-nominee-btn').forEach(b => { b.disabled = true; b.classList.remove('selected'); });
      btn.classList.add('selected');
      if (window.db && state.playerName) {
        const key = state.playerName.replace(/[.#$[\]/]/g, '_');
        await window.db.ref('tiebreaker/' + gs.awardId + '/' + key).set({
          nominee: name, voter: state.playerName,
        });
      }
      votedMsg.classList.remove('hidden');
    });
    grid.appendChild(btn);
  });
}

// ─── REASONS SCREEN ──────────────────────────────────────────────────────────
function showReasons(award, { winner, allVotes }) {
  showScreen('screen-reasons');

  document.getElementById('reasons-award-label').textContent = award.category;
  document.getElementById('reasons-winner-name').textContent = winner || '???';

  const votersList = allVotes.filter(v => v.nominee === winner);
  const intro = document.getElementById('reasons-intro');
  intro.textContent = votersList.length
    ? `${votersList.length} message${votersList.length > 1 ? 's' : ''} for ${winner} — tap any to reveal who said it (max 2)`
    : 'No votes recorded yet.';

  const grid = document.getElementById('reasons-cards-grid');
  grid.innerHTML = '';
  let revealed = 0;
  const MAX_REVEAL = 2;

  votersList.forEach(({ reason, voter }) => {
    const cardWrap = document.createElement('div');
    cardWrap.className = 'reason-card-wrap';
    cardWrap.innerHTML = `
      <div class="reason-card">
        <div class="reason-card-face rcard-front">
          <p class="rcard-reason">${escapeHtml(reason)}</p>
          <span class="rcard-front-hint">Tap to see who said this</span>
        </div>
        <div class="reason-card-face rcard-back">
          <span class="rcard-back-label">said by</span>
          <span class="rcard-voter">${escapeHtml(voter)}</span>
        </div>
      </div>
    `;

    cardWrap.addEventListener('click', () => {
      if (cardWrap.classList.contains('revealed') || cardWrap.classList.contains('disabled')) return;
      if (revealed >= MAX_REVEAL) return;
      revealed++;
      cardWrap.classList.add('revealed');
      if (revealed >= MAX_REVEAL) {
        // disable all remaining un-revealed cards
        grid.querySelectorAll('.reason-card-wrap:not(.revealed)').forEach(c => c.classList.add('disabled'));
      }
    });

    grid.appendChild(cardWrap);
  });

  // if no votes, show a placeholder
  if (votersList.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted);text-align:center;padding:32px 0;">No votes yet for this award.</p>';
  }
}

document.getElementById('btn-reasons-back').addEventListener('click', () => {
  showScreen('screen-results');
});

// ─── REPLAY ──────────────────────────────────────────────────────────────────
document.getElementById('btn-replay').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  nameInput.value = '';
  btnEnter.disabled = true;
  playersJoinedEl.textContent = '';
  showScreen('screen-name');
});

// ─── UTILS ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
