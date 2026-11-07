// Papaz Kimde - Frontend App
const socket = io({
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  forceNew: true
});
let currentRoom = null, currentPlayerId = null, myTurn = false, settings = { sound: true, vibrate: true, animations: true };

const screens = { lobby: document.getElementById('lobby-screen'), waiting: document.getElementById('waiting-screen'), game: document.getElementById('game-screen') };
const tabs = document.querySelectorAll('.tab-btn'), panels = document.querySelectorAll('.tab-panel');

document.addEventListener('DOMContentLoaded', init);
function init() { setupTabs(); setupInputs(); setupButtons(); setupSocket(); loadSettings(); registerSW(); }
function setupTabs() { tabs.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.mode))); }
function switchTab(mode) { tabs.forEach(b => b.classList.toggle('active', b.dataset.mode === mode)); panels.forEach(p => p.classList.toggle('active', p.id === `${mode}-panel`)); }
function setupInputs() { ['create-name','join-name','room-code'].forEach(id => { const el = document.getElementById(id); if(el) el.addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')); }); }
function setupButtons() {
  document.getElementById('create-btn').onclick = createRoom;
  document.getElementById('join-btn').onclick = joinRoom;
  document.getElementById('leave-btn').onclick = leaveRoom;
  document.getElementById('draw-btn').onclick = drawCard;
  document.getElementById('new-game-btn').onclick = newGame;
  document.getElementById('share-btn').onclick = shareLink;
  document.getElementById('menu-btn').onclick = toggleSettings;
  document.getElementById('close-settings-btn').onclick = toggleSettings;
  document.getElementById('leave-game-btn').onclick = leaveRoom;
  ['sound-toggle','vibrate-toggle','animations-toggle'].forEach(id => { const el = document.getElementById(id); if(el) el.onchange = saveSettings; });
}
function loadSettings() { const s = JSON.parse(localStorage.getItem('papaz_settings')||'{}'); settings = {sound:true,vibrate:true,animations:true,...s}; ['sound-toggle','vibrate-toggle','animations-toggle'].forEach(id => { const el=document.getElementById(id); if(el) el.checked = settings[id.replace('-toggle','')]; }); }
function saveSettings() { settings.sound = document.getElementById('sound-toggle').checked; settings.vibrate = document.getElementById('vibrate-toggle').checked; settings.animations = document.getElementById('animations-toggle').checked; localStorage.setItem('papaz_settings', JSON.stringify(settings)); }
function registerSW() { if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{}); }
function showScreen(name) { Object.values(screens).forEach(s => s.classList.remove('active')); screens[name].classList.add('active'); }
function createRoom() {
  if (!socket.connected) return toast('Sunucuya bağlanılıyor, lütfen bekleyin...', 'error');
  const name = document.getElementById('create-name').value.trim();
  if(!name) return toast('İsim gir', 'error');
  socket.emit('create-room', { playerName: name, settings: { maxPlayers: +document.getElementById('max-players').value, minPlayers: +document.getElementById('min-players').value } });
}
function joinRoom() {
  if (!socket.connected) return toast('Sunucuya bağlanılıyor, lütfen bekleyin...', 'error');
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('room-code').value.trim().toUpperCase();
  if(!name || !code) return toast('İsim ve kod gir', 'error');
  socket.emit('join-room', { roomCode: code, playerName: name });
}
function leaveRoom() { if(currentRoom && currentPlayerId) { socket.emit('leave-room', { roomId: currentRoom, playerId: currentPlayerId }); } resetGame(); showScreen('lobby'); }
function resetGame() { currentRoom = null; currentPlayerId = null; myTurn = false; }

function setupSocket() {
  socket.on('connect', () => { console.log('Connected to server'); updateConnStatus(true); });
  socket.on('disconnect', () => { updateConnStatus(false); toast('Baglanti kesildi', 'error'); });
  socket.on('connect_error', (e) => { updateConnStatus(false); toast('Baglanti hatasi: ' + e.message, 'error'); });
  socket.on('error', data => toast(data.message, 'error'));
  socket.on('room-created', data => { currentRoom = data.roomCode; currentPlayerId = data.playerId; showWaitingScreen(data.room); });
  socket.on('room-joined', data => { currentRoom = data.room.id; currentPlayerId = data.playerId; showWaitingScreen(data.room); });
  socket.on('room-update', data => updateWaitingScreen(data.room));
  socket.on('player-joined', data => updateWaitingScreen(data.room));
  socket.on('player-left', data => { toast(data.playerName + ' ayrildi'); updateWaitingScreen(data.room); });
  socket.on('game-started', data => { showGameScreen(data.room); });
  socket.on('turn-played', data => { updateGameScreen(data.room, data.log); });
  socket.on('game-ended', data => { showGameOver(data.room); });
}

function updateConnStatus(connected) {
  const el = document.getElementById('conn-status');
  const dot = el?.querySelector('.status-dot');
  const text = el?.querySelector('span:last-child');
  if (!el || !dot || !text) return;
  if (connected) {
    el.classList.add('connected'); el.classList.remove('disconnected');
    dot.classList.add('connected'); dot.classList.remove('disconnected');
    text.textContent = 'Bağlı ✓';
  } else {
    el.classList.add('disconnected'); el.classList.remove('connected');
    dot.classList.add('disconnected'); dot.classList.remove('connected');
    text.textContent = 'Bağlantı kesildi';
  }
}

function showWaitingScreen(room) {
  showScreen('waiting');
  document.getElementById('room-code-value').textContent = room.id;
  renderPlayers(room);
  updateWaitingActions(room);
}
function updateWaitingScreen(room) {
  document.getElementById('room-code-value').textContent = room.id;
  renderPlayers(room);
  updateWaitingActions(room);
}
function renderPlayers(room) {
  const container = document.getElementById('players-list');
  container.innerHTML = '';
  const players = [...room.players].sort((a, b) => a.position - b.position);
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player-item';
    const badges = [];
    if (p.isHost) badges.push('<span class="status-dot host"></span>Oda Sahibi');
    if (p.isReady) badges.push('<span class="status-dot ready"></span>Hazir');
    if (!badges.length) badges.push('<span class="status-dot"></span>Bekliyor');
    div.innerHTML = '<div class="player-avatar">' + p.name[0].toUpperCase() + '</div>' +
      '<div class="player-info"><div class="player-name">' + esc(p.name) + (p.isHost ? ' &#9818;' : '') + '</div>' +
      '<div class="player-status ' + (p.isReady ? 'ready' : '') + (p.isHost ? ' host' : '') + '">' + badges.join(' ') + '</div></div>';
    container.appendChild(div);
  });
}
function esc(s) { return String(s).replace(/[^a-zA-Z0-9 _-]/g, ''); }
function updateWaitingActions(room) {
  const container = document.getElementById('waiting-actions');
  const me = room.players.find(p => p.id === currentPlayerId);
  if (!me) return;
  if (me.isHost) {
    const allReady = room.players.every(p => p.isReady || p.isHost);
    const minMet = room.players.length >= room.settings.minPlayers;
    const label = allReady && minMet ? 'Oyunu Baslat' : room.settings.minPlayers + ' oyuncu gerek (' + room.players.length + '/' + room.settings.minPlayers + ')';
    container.innerHTML = '<button class="btn btn-primary btn-lg" id="start-btn"' + (allReady && minMet ? '' : ' disabled') + '>' + label + '</button>';
    const b = document.getElementById('start-btn');
    if (b) b.addEventListener('click', () => socket.emit('start-game', { roomId: currentRoom, playerId: currentPlayerId }));
  } else {
    container.innerHTML = '<button class="btn ' + (me.isReady ? 'btn-secondary' : 'btn-primary') + ' btn-lg" id="ready-btn">' + (me.isReady ? 'Hazirim (Iptal)' : 'Hazir Ol') + '</button>';
    document.getElementById('ready-btn').onclick = () => socket.emit('set-ready', { roomId: currentRoom, playerId: currentPlayerId, ready: !me.isReady });
  }
}


function showGameScreen(room) { showScreen('game'); currentRoom = room.id; renderGame(room); }
function updateGameScreen(room, logMsg) { if (logMsg) addLog(logMsg); renderGame(room); }
function renderGame(room) {
  const me = room.players.find(p => p.id === currentPlayerId);
  if (!me) return;
  myTurn = room.turnOrder[room.currentTurn] === currentPlayerId && room.state === 'playing' && !me.finishedAt;
  document.getElementById('game-room-code').textContent = 'KOD: ' + room.id;
  document.getElementById('turn-indicator').textContent = myTurn ? 'Sira SENDE!' : 'Sira: ' + currentPlayerName(room);
  document.getElementById('draw-btn').disabled = !myTurn || room.state !== 'playing';
  document.getElementById('my-card-count').textContent = me.hand.length;
  renderOpponents(room);
  renderMyHand(me, room.state === 'finished');
  renderLog(room.gameLog);
  updateHint(me, room);
}
function currentPlayerName(room) { const p = room.players.find(x => x.id === room.turnOrder[room.currentTurn]); return p ? p.name : '-'; }
function renderOpponents(room) {
  const container = document.getElementById('opponents-area');
  container.innerHTML = '';
  const others = [...room.players].filter(p => p.id !== currentPlayerId).sort((a, b) => a.position - b.position);
  others.forEach(p => {
    const div = document.createElement('div');
    const isTurn = room.turnOrder[room.currentTurn] === p.id;
    div.className = 'opponent' + (p.finishedAt ? ' finished' : '') + (isTurn ? ' current-turn' : '');
    let cards = '';
    if (settings.animations) {
      const n = Math.min(p.hand.length, 6);
      for (let i = 0; i < n; i++) cards += '<div class="opponent-card"></div>';
      if (p.hand.length > 6) cards += '<div class="opponent-card" style="opacity:.5">+' + (p.hand.length - 6) + '</div>';
    }
    div.innerHTML = '<div class="opponent-avatar">' + p.name[0].toUpperCase() + '</div>' +
      '<div class="opponent-name">' + esc(p.name) + (p.finishedAt ? ' &#10004;' : '') + '</div>' +
      '<div class="opponent-card-count">' + p.hand.length + ' kart</div>' +
      '<div class="opponent-cards">' + cards + '</div>';
    container.appendChild(div);
  });
}
function renderMyHand(me, showAll) {
  const container = document.getElementById('my-hand');
  container.innerHTML = '';
  me.hand.forEach((card, i) => {
    const div = document.createElement('div');
    div.className = 'playing-card ' + getCardColor(card) + ' rank-' + card.rank + (card.rank === 'K' ? ' papaz' : '');
    div.dataset.rank = card.rank;
    div.dataset.index = i;
    const label = card.rank === '10' ? '10' : card.rank[0];
    div.innerHTML = '<div class="corner top"><span>' + label + '</span><span class="suit">' + card.suit + '</span></div>' +
      '<div class="center"><span class="suit" style="font-size:2.5rem">' + card.suit + '</span></div>' +
      '<div class="corner bottom"><span>' + label + '</span><span class="suit">' + card.suit + '</span></div>';
    if (showAll || (myTurn && !me.finishedAt)) div.addEventListener('click', () => selectCard(div));
    container.appendChild(div);
  });
}
function selectCard(el) {
  if (!settings.animations) return;
  document.querySelectorAll('.playing-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  if (settings.vibrate && navigator.vibrate) navigator.vibrate(30);
}
function getCardColor(card) { return (card.suit === '\u2665' || card.suit === '\u2666') ? 'red' : 'black'; }
function fmtLog(l) {
  return l.replace(/^([^,]+)/, '<span class="player">$1</span>')
    .replace(/(cikti|cift atti|bitirdi|kaybetti|PAPAZ KALDI!)/g, '<span class="action">$1</span>');
}
function renderLog(logs) {
  const container = document.getElementById('log-content');
  container.innerHTML = (logs || []).slice(-15).map(l => '<div class="log-entry">' + fmtLog(l) + '</div>').join('');
  container.scrollTop = container.scrollHeight;
}
function addLog(msg) {
  const container = document.getElementById('log-content');
  const div = document.createElement('div');

function drawCard() {
  if (!myTurn || !currentRoom) return;
  socket.emit('draw-card', { roomId: currentRoom, playerId: currentPlayerId });
  if (settings.sound) playSound('draw');
  if (settings.vibrate && navigator.vibrate) navigator.vibrate([50, 30, 50]);
}
function newGame() {
  document.getElementById('game-over-modal').classList.add('hidden');
  if (currentRoom && currentPlayerId) socket.emit('leave-room', { roomId: currentRoom, playerId: currentPlayerId });
  resetGame(); showScreen('lobby');
}
function shareLink() {
  const url = window.location.origin + '/r/' + currentRoom;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => toast('Link kopyalandi!', 'success')).catch(() => toast(url));
  } else toast(url);
}
function showGameOver(room) {
  const me = room.players.find(p => p.id === currentPlayerId);
  const hasKing = me ? me.hand.some(c => c.rank === 'K') : false;
  const icon = document.getElementById('modal-icon');
  icon.className = 'modal-icon' + (hasKing ? ' loser' : '');
  icon.textContent = hasKing ? '\u{1F0CF}' : '\u{1F3C6}';
  document.getElementById('modal-title').textContent = hasKing ? 'Papaz Sende Kaldi!' : 'Kazandin!';
  const results = document.getElementById('results');
  results.innerHTML = '';
  const sorted = [...room.players].sort((a, b) => (a.finishedAt || Infinity) - (b.finishedAt || Infinity));
  sorted.forEach((p, i) => {
    const pHasKing = p.hand.some(c => c.rank === 'K');
    const isMe = p.id === currentPlayerId;
    const div = document.createElement('div');
    div.className = 'result-item ' + (pHasKing ? 'loser' : 'winner');
    const badge = pHasKing ? 'PAPAZ' : (i + 1) + '.';
    div.innerHTML = '<span class="result-rank">' + (i + 1) + '.</span>' +
      '<span class="result-name">' + esc(p.name) + (isMe ? ' (Sen)' : '') + '</span>' +
      '<span class="result-badge ' + (pHasKing ? 'lose' : 'win') + '">' + badge + '</span>';
    results.appendChild(div);
  });
  document.getElementById('game-over-modal').classList.remove('hidden');
  if (settings.sound) playSound(hasKing ? 'lose' : 'win');
  if (settings.vibrate && navigator.vibrate) navigator.vibrate(hasKing ? [200, 100, 200] : [100, 50, 100, 50, 100]);
}
function toggleSettings() { document.getElementById('settings-modal').classList.toggle('hidden'); }
function toast(msg, type) {
  const container = document.getElementById('toast-container');
  const div = document.createElement('div');
  div.className = 'toast ' + (type || '');
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => { div.remove(); }, 3000);
}
function playSound(type) {
  if (!settings.sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const tone = (freq, dur, delay, vol, wave) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = wave || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.08, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      o.start(now + delay); o.stop(now + delay + dur + 0.05);
    };
    if (type === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, i * 0.1, 0.08, 'triangle'));
    else if (type === 'lose') { tone(300, 0.5, 0, 0.1, 'sawtooth'); tone(100, 0.5, 0, 0.05, 'sawtooth'); }
    else if (type === 'draw') { tone(800, 0.15, 0, 0.08, 'sine'); tone(400, 0.15, 0.08, 0.05, 'sine'); }
    else tone(600, 0.08, 0, 0.04, 'square');
  } catch (e) { /* ses desteklenmiyor */ }
}

  div.className = 'log-entry';
  div.innerHTML = fmtLog(msg);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  if (settings.sound) playSound('log');
}
function updateHint(me, room) {
  const hint = document.getElementById('hand-hint');
  if (room.state === 'finished') {
    const hasKing = me.hand.some(c => c.rank === 'K');
    hint.innerHTML = hasKing ? '<strong>PAPAZ SENDE KALDI!</strong>' : '<strong>KAZANDIN!</strong>';
    return;
  }
  if (me.finishedAt) { hint.textContent = 'Oyunu bitirdin, bekle...'; return; }
  hint.textContent = myTurn ? 'Sira sende: Sagindaki oyuncudan kart cek' : 'Sira: ' + currentPlayerName(room);
}
