// End-to-end game test (spawns its own server)
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3199;
const URL = `http://localhost:${PORT}`;
const results = [];
function log(ok, msg) { results.push({ ok, msg }); console.log((ok ? 'PASS' : 'FAIL') + ' - ' + msg); }
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});
server.stdout.on('data', d => process.stdout.write('[srv] ' + d));
server.stderr.on('data', d => process.stdout.write('[srv-err] ' + d));

function mkClient(name) {
  return new Promise((res, rej) => {
    const c = io(URL, { transports: ['websocket'] });
    c.once('connect', () => res(c));
    c.once('connect_error', e => rej(new Error(name + ': ' + e.message)));
    setTimeout(() => rej(new Error(name + ' connect timeout')), 8000);
  });
}

(async () => {
  await wait(2500);
  const A = await mkClient('A'), B = await mkClient('B'), C = await mkClient('C');
  log(true, '3 clients connected');

  let roomCode = null; const playerIds = {}; let gameStarted = false, gameEnded = false;
  const state = { A: null, B: null, C: null };
  const setState = (who, d) => { state[who] = d.room; };

  A.on('room-created', d => { roomCode = d.roomCode; playerIds.A = d.playerId; setState('A', d); });
  B.on('room-joined', d => { playerIds.B = d.playerId; setState('B', d); });
  C.on('room-joined', d => { playerIds.C = d.playerId; setState('C', d); });
  [A, B, C].forEach(c => {
    const who = c === A ? 'A' : c === B ? 'B' : 'C';
    c.on('game-started', d => { setState(who, d); gameStarted = true; });
    c.on('turn-played', d => { setState(who, d); });
    c.on('game-ended', d => { setState(who, d); gameEnded = true; });
    c.on('room-update', d => setState(who, d));
    c.on('player-joined', d => setState(who, d));
  });
  const roomState = () => state.A;

  A.emit('create-room', { playerName: 'A', settings: { maxPlayers: 6, minPlayers: 3 } });
  await wait(600);
  log(!!roomCode, 'room created, code=' + roomCode);
  if (!roomCode) { server.kill(); process.exit(1); }

  B.emit('join-room', { roomCode, playerName: 'B' });
  await wait(300);
  C.emit('join-room', { roomCode, playerName: 'C' });
  await wait(600);
  log(roomState().players.length === 3, '3 players in room (actual ' + roomState().players.length + ')');

  let dupMsg = null;
  C.once('error', d => { dupMsg = d.message; });
  C.emit('join-room', { roomCode, playerName: 'B' });
  await wait(800);
  log(!!dupMsg, 'duplicate name rejected: ' + (dupMsg || 'NO ERROR'));

  B.emit('set-ready', { roomId: roomCode, playerId: playerIds.B, ready: true });
  await wait(200);
  C.emit('set-ready', { roomId: roomCode, playerId: playerIds.C, ready: true });
  await wait(400);

  A.emit('start-game', { roomId: roomCode, playerId: playerIds.A });
  await wait(700);
  log(gameStarted, 'game started');
  if (!gameStarted) { server.kill(); process.exit(1); }

  const sA = state.A, sB = state.B, sC = state.C;
  const ownA = sA.players.find(p => p.id === playerIds.A);
  const ownB = sB.players.find(p => p.id === playerIds.B);
  const ownC = sC.players.find(p => p.id === playerIds.C);
  log(ownA.hand.length > 0 && ownB.hand.length > 0 && ownC.hand.length > 0,
    'each player sees their OWN hand: A=' + ownA.hand.length + ' B=' + ownB.hand.length + ' C=' + ownC.hand.length);
  log(sA.players.filter(p => p.id !== playerIds.A).every(p => p.hand.length === 0),
    'opponent hands HIDDEN from client A');
  log(sB.players.filter(p => p.id !== playerIds.B).every(p => p.hand.length === 0),
    'opponent hands HIDDEN from client B');
  log(sC.players.filter(p => p.id !== playerIds.C).every(p => p.hand.length === 0),
    'opponent hands HIDDEN from client C');
  const sumAll = ownA.hand.length + ownB.hand.length + ownC.hand.length;
  log(sumAll > 0 && sumAll <= 49, 'total cards in play = ' + sumAll + ' (deck is 49: 52 - 3 kings)');

  let guard = 0;
  while (!gameEnded && guard++ < 400) {
    const st = roomState();
    const curId = st.turnOrder[st.currentTurn];
    const cur = st.players.find(p => p.id === curId);
    if (!cur) break;
    const client = cur.name === 'A' ? A : cur.name === 'B' ? B : C;
    const key = Object.keys(playerIds).find(k => playerIds[k] === curId);
    client.emit('draw-card', { roomId: roomCode, playerId: playerIds[key] });
    await wait(25);
  }
  log(gameEnded, 'game ended after ' + guard + ' turns');
  log(roomState().state === 'finished', 'room state = ' + roomState().state);

  const endState = roomState();
  const fA = state.A.players.find(p => p.id === playerIds.A);
  const fB = state.B.players.find(p => p.id === playerIds.B);
  const fC = state.C.players.find(p => p.id === playerIds.C);
  const finalHands = { A: fA.hand, B: fB.hand, C: fC.hand };
  const holder = Object.keys(finalHands).filter(k => finalHands[k].some(c => c.rank === 'K'));
  log(holder.length === 1, 'exactly one player holds the Papaz: ' + holder.join(','));
  const totalAtEnd = fA.hand.length + fB.hand.length + fC.hand.length;
  log(totalAtEnd === 1, 'exactly 1 card left in the game (the Papaz). actual=' + totalAtEnd);

  A.close(); B.close(); C.close();
  server.kill();
  const failed = results.filter(r => !r.ok);
  console.log('\n=== ' + (results.length - failed.length) + '/' + results.length + ' tests passed ===');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e.message); server.kill(); process.exit(1); });

