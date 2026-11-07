// Canli (production) sunucuya karsi uctan uca test
// Kullanim: node test-live.js [url]
const { io } = require('socket.io-client');
const URL = process.argv[2] || 'https://papaz-kimde-i962.onrender.com';

const results = [];
function log(ok, msg) { results.push({ ok, msg }); console.log((ok ? 'PASS' : 'FAIL') + ' - ' + msg); }
const wait = ms => new Promise(r => setTimeout(r, ms));

function mkClient(name) {
  return new Promise((res, rej) => {
    const c = io(URL, { transports: ['websocket', 'polling'], reconnectionDelay: 1000 });
    c.once('connect', () => res(c));
    c.once('connect_error', e => rej(new Error(name + ': ' + e.message)));
    setTimeout(() => rej(new Error(name + ' connect timeout')), 25000);
  });
}

(async () => {
  console.log('Hedef: ' + URL + '\n');
  const A = await mkClient('A'), B = await mkClient('B'), C = await mkClient('C');
  log(true, '3 client canli sunucuya baglandi (WebSocket)');

  let roomCode = null; const playerIds = {}; let gameStarted = false, gameEnded = false;
  const state = { A: null, B: null, C: null };
  const setState = (who, d) => { state[who] = d.room; };

  A.on('room-created', d => { roomCode = d.roomCode; playerIds.A = d.playerId; setState('A', d); });
  B.on('room-joined', d => { playerIds.B = d.playerId; setState('B', d); });
  C.on('room-joined', d => { playerIds.C = d.playerId; setState('C', d); });
  [A, B, C].forEach(c => {
    const who = c === A ? 'A' : c === B ? 'B' : 'C';
    c.on('game-started', d => { setState(who, d); gameStarted = true; });
    c.on('turn-played', d => setState(who, d));
    c.on('game-ended', d => { setState(who, d); gameEnded = true; });
    c.on('room-update', d => setState(who, d));
    c.on('player-joined', d => setState(who, d));
  });

  A.emit('create-room', { playerName: 'CanliA', settings: { maxPlayers: 6, minPlayers: 3 } });
  await wait(1200);
  log(!!roomCode, 'oda olusturuldu: ' + roomCode);
  if (!roomCode) { process.exit(1); }

  B.emit('join-room', { roomCode, playerName: 'CanliB' });
  await wait(700);
  C.emit('join-room', { roomCode, playerName: 'CanliC' });
  await wait(1200);
  log(state.A.players.length === 3, '3 oyuncu odaya katildi');

  B.emit('set-ready', { roomId: roomCode, playerId: playerIds.B, ready: true });
  await wait(400);
  C.emit('set-ready', { roomId: roomCode, playerId: playerIds.C, ready: true });
  await wait(600);

  A.emit('start-game', { roomId: roomCode, playerId: playerIds.A });
  await wait(1500);
  log(gameStarted, 'oyun basladi');

  const ownA = state.A.players.find(p => p.id === playerIds.A);
  const ownB = state.B.players.find(p => p.id === playerIds.B);
  const ownC = state.C.players.find(p => p.id === playerIds.C);
  log(ownA.hand.length > 0 && ownB.hand.length > 0 && ownC.hand.length > 0,
    'her oyuncu kendi elini goruyor: A=' + ownA.hand.length + ' B=' + ownB.hand.length + ' C=' + ownC.hand.length);
  log(state.A.players.filter(p => p.id !== playerIds.A).every(p => p.hand.length === 0),
    'rakip elleri gizli');

  let guard = 0;
  while (!gameEnded && guard++ < 500) {
    const st = state.A;
    const curId = st.turnOrder[st.currentTurn];
    const cur = st.players.find(p => p.id === curId);
    if (!cur) break;
    const client = cur.name === 'CanliA' ? A : cur.name === 'CanliB' ? B : C;
    const key = Object.keys(playerIds).find(k => playerIds[k] === curId);
    client.emit('draw-card', { roomId: roomCode, playerId: playerIds[key] });
    await wait(80);
  }
  log(gameEnded, 'oyun bitti (' + guard + ' tur)');

  const fA = state.A.players.find(p => p.id === playerIds.A);
  const fB = state.B.players.find(p => p.id === playerIds.B);
  const fC = state.C.players.find(p => p.id === playerIds.C);
  const total = fA.hand.length + fB.hand.length + fC.hand.length;
  log(total === 1, 'oyunda tam 1 kart kaldi (Papaz). actual=' + total);

  // Paylasim linki kontrolu
  const res = await fetch(URL + '/r/' + roomCode);
  const html = await res.text();
  log(res.status === 200 && html.indexOf('Papaz Kimde') !== -1, '/r/' + roomCode + ' linki calisiyor');

  A.close(); B.close(); C.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n=== ' + (results.length - failed.length) + '/' + results.length + ' canli test gecti ===');
  console.log('Oda kodu: ' + roomCode + '  ->  ' + URL + '/r/' + roomCode);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HATA: ' + e.message); process.exit(1); });
