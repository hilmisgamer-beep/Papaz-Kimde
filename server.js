const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingInterval: 25000,
  pingTimeout: 20000
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Game Constants
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_ORDER = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };

const rooms = new Map();
const playerSockets = new Map();

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (rank === 'K' && deck.filter(c => c.rank === 'K').length >= 1) continue;
      deck.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  return shuffle(deck);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function removePairs(hand) {
  const ranks = {};
  const remaining = [];
  const removedPairs = [];
  for (const card of hand) {
    if (!ranks[card.rank]) ranks[card.rank] = [];
    ranks[card.rank].push(card);
  }
  for (const rank in ranks) {
    const cards = ranks[rank];
    const pairs = Math.floor(cards.length / 2);
    for (let i = 0; i < pairs * 2; i++) removedPairs.push(cards[i]);
    for (let i = pairs * 2; i < cards.length; i++) remaining.push(cards[i]);
  }
  return { remaining, removedPairs };
}

function createRoom(hostId, hostName, settings = {}) {
  const roomId = generateRoomCode();
  const room = { id: roomId, hostId, players: new Map(),
    settings: { maxPlayers: settings.maxPlayers || 6, minPlayers: settings.minPlayers || 3, ...settings },
    state: 'waiting', deck: [], currentTurn: 0, turnOrder: [], finishedPlayers: [], gameLog: [], createdAt: Date.now() };
  rooms.set(roomId, room); return room;
}

function addPlayerToRoom(roomId, playerId, playerName, socketId) {
  const room = rooms.get(roomId);
  if (!room) return { success: false, error: 'Oda bulunamadı' };
  if (room.state !== 'waiting') return { success: false, error: 'Oyun zaten başladı' };
  if (room.players.size >= room.settings.maxPlayers) return { success: false, error: 'Oda dolu' };
  if ([...room.players.values()].some(p => p.name === playerName)) return { success: false, error: 'Bu isim zaten kullanılıyor' };
  const player = { id: playerId, name: playerName, socketId, hand: [], isHost: playerId === room.hostId, isReady: false, finishedAt: null, position: room.players.size };
  room.players.set(playerId, player); playerSockets.set(socketId, { roomId, playerId });
  return { success: true, room, player };
}

function removePlayerFromRoom(socketId) {
  const mapping = playerSockets.get(socketId); if (!mapping) return;
  const room = rooms.get(mapping.roomId); if (!room) return;
  room.players.delete(mapping.playerId); playerSockets.delete(socketId);
  if (room.players.size > 0 && room.hostId === mapping.playerId) {
    const newHost = room.players.values().next().value; room.hostId = newHost.id; newHost.isHost = true;
  }
  if (room.players.size === 0) rooms.delete(mapping.roomId);
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function checkFinishedPlayers(room) {
  for (const player of room.players.values()) {
    if (player.hand.length === 0 && !player.finishedAt) {
      player.finishedAt = Date.now(); room.finishedPlayers.push(player.id);
      room.gameLog.push(`${player.name} oyunu bitirdi! (${room.finishedPlayers.length}. sıra)`);
    }
  }
  const active = [...room.players.values()].filter(p => !p.finishedAt);
  if (active.length <= 1) endGame(room);
}

function endGame(room) {
  room.state = 'finished';
  for (const player of room.players.values()) {
    if (!player.finishedAt) {
      player.finishedAt = Date.now(); room.finishedPlayers.push(player.id);
      const hasKing = player.hand.some(c => c.rank === 'K');
      room.gameLog.push(`${player.name} ${hasKing ? 'PAPAZ KALDI!' : 'kaybetti'}`);
    }
  }
}

function startGame(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.state !== 'waiting') return { success: false, error: 'Oyun baslatilamadi' };
  if (room.players.size < room.settings.minPlayers) return { success: false, error: 'Yeterli oyuncu yok (min ' + room.settings.minPlayers + ')' };
  if (![...room.players.values()].every(p => p.isReady || p.isHost)) return { success: false, error: 'Herkes hazir olmali' };
  room.deck = createDeck();
  room.state = 'playing'; room.finishedPlayers = []; room.gameLog = [];
  room.turnOrder = [...room.players.values()].sort((a, b) => a.position - b.position).map(p => p.id);
  room.currentTurn = 0;
  const players = [...room.players.values()].sort((a, b) => a.position - b.position);
  for (const p of players) { p.hand = []; p.isReady = false; p.finishedAt = null; }
  let idx = 0;
  while (idx < room.deck.length) { for (const p of players) if (idx < room.deck.length) p.hand.push(room.deck[idx++]); }
  for (const p of players) {
    const res = removePairs(p.hand);
    p.hand = res.remaining;
    if (res.removedPairs.length > 0) room.gameLog.push(`${p.name} ${res.removedPairs.length / 2} cift atti`);
    p.hand.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
  }
  checkFinishedPlayers(room);
  return { success: true, room };
}


function playTurn(roomId, playerId, action, data) {
  const room = rooms.get(roomId);
  if (!room || room.state !== 'playing') return { success: false, error: 'Oyun aktif degil' };
  const currentId = room.turnOrder[room.currentTurn];
  if (currentId !== playerId) return { success: false, error: 'Sira sizde degil' };
  const player = room.players.get(playerId);
  if (!player || player.finishedAt) return { success: false, error: 'Oyunu bitirdiniz' };

  if (action === 'draw') {
    if (!data || typeof data.cardIndex !== 'number') return { success: false, error: 'Kart secilmeli' };

    let targetIndex = (room.currentTurn + 1) % room.turnOrder.length;
    let attempts = 0;
    while (attempts < room.turnOrder.length) {
      const t = room.players.get(room.turnOrder[targetIndex]);
      if (t && !t.finishedAt && t.hand.length > 0) break;
      targetIndex = (targetIndex + 1) % room.turnOrder.length; attempts++;
    }
    if (attempts >= room.turnOrder.length) return { success: false, error: 'Cekilecek oyuncu yok' };

    const target = room.players.get(room.turnOrder[targetIndex]);
    if (data.cardIndex < 0 || data.cardIndex >= target.hand.length) {
      return { success: false, error: 'Gecersiz kart indeksi' };
    }

    const drawn = target.hand.splice(data.cardIndex, 1)[0];
    player.hand.push(drawn);
    let msg = `${player.name}, ${target.name} isimli oyuncudan ${drawn.rank}${drawn.suit} secti`;

    const res = removePairs(player.hand);
    player.hand = res.remaining;
    if (res.removedPairs.length > 0) msg += ` ve ${res.removedPairs.length / 2} cift atti!`;
    room.gameLog.push(msg);
    player.hand.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
    checkFinishedPlayers(room);

    if (room.state === 'playing') {
      room.currentTurn = (room.currentTurn + 1) % room.turnOrder.length;
      let skip = 0;
      while (skip < room.turnOrder.length) {
        const n = room.players.get(room.turnOrder[room.currentTurn]);
        if (n && !n.finishedAt) break;
        room.currentTurn = (room.currentTurn + 1) % room.turnOrder.length; skip++;
      }
    }
    return { success: true, room, log: msg };
  }
  return { success: false, error: 'Gecersiz islem' };
}

function getPublicRoomState(room, viewerId) {
  const players = [];
  for (const [id, p] of room.players) {
    players.push({
      id: p.id, name: p.name, isHost: p.isHost, isReady: p.isReady,
      handCount: p.hand.length,
      hand: (id === viewerId || room.state === 'finished') ? p.hand : [],
      finishedAt: p.finishedAt, position: p.position
    });
  }
  return {
    id: room.id, state: room.state, settings: room.settings, players,
    currentTurn: room.currentTurn, turnOrder: room.turnOrder,
    finishedPlayers: room.finishedPlayers, gameLog: room.gameLog.slice(-20),
    hostId: room.hostId
  };
}

function broadcastRoom(room, event, extra) {
  const payload = extra || {};
  for (const p of room.players.values()) {
    io.to(p.socketId).emit(event, Object.assign({ room: getPublicRoomState(room, p.id) }, payload));
  }
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('create-room', ({ playerName, settings }) => {
    const playerId = uuidv4();
    const room = createRoom(playerId, playerName, settings);
    const result = addPlayerToRoom(room.id, playerId, playerName, socket.id);
    if (result.success) {
      socket.join(room.id);
      socket.emit('room-created', { room: getPublicRoomState(room, playerId), playerId, roomCode: room.id });
    } else socket.emit('error', { message: result.error });
  });

  socket.on('join-room', ({ roomCode, playerName }) => {
    const playerId = uuidv4();
    const result = addPlayerToRoom(String(roomCode || '').toUpperCase().trim(), playerId, playerName, socket.id);
    if (result.success) {
      socket.join(result.room.id);
      socket.emit('room-joined', { room: getPublicRoomState(result.room, playerId), playerId });
      broadcastRoom(result.room, 'player-joined');
    } else socket.emit('error', { message: result.error });
  });

  socket.on('set-ready', ({ roomId, playerId, ready }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(playerId);
    if (player) { player.isReady = !!ready; broadcastRoom(room, 'room-update'); }
  });

  socket.on('start-game', ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== playerId) return;
    const result = startGame(roomId);
    if (result.success) broadcastRoom(room, 'game-started');
    else socket.emit('error', { message: result.error });
  });

  socket.on('draw-card', ({ roomId, playerId }) => {
    const result = playTurn(roomId, playerId, 'draw');
    if (result.success) {
      broadcastRoom(result.room, 'turn-played', { log: result.log });
      if (result.room.state === 'finished') broadcastRoom(result.room, 'game-ended');
    } else socket.emit('error', { message: result.error });
  });

  socket.on('leave-room', ({ roomId, playerId }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.players.delete(playerId);
      socket.leave(roomId);
      if (room.players.size > 0) broadcastRoom(room, 'room-update');
      else rooms.delete(roomId);
    }
    playerSockets.delete(socket.id);
  });

  socket.on('disconnect', () => {
    const mapping = playerSockets.get(socket.id);
    if (mapping) {
      const room = rooms.get(mapping.roomId);
      if (room) {
        const player = room.players.get(mapping.playerId);
        if (player) {
          const playerName = player.name;
          room.players.delete(mapping.playerId);
          if (room.players.size > 0) {
            if (room.hostId === mapping.playerId) {
              const newHost = room.players.values().next().value;
              room.hostId = newHost.id; newHost.isHost = true;
            }
            broadcastRoom(room, 'player-left', { playerName });
          } else rooms.delete(mapping.roomId);
        }
      }
      playerSockets.delete(socket.id);
    }
    console.log('Disconnected:', socket.id);
  });
});

app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(String(req.params.code).toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(getPublicRoomState(room));
});
app.get('/r/:code', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Papaz Kimde server running on port ${PORT}`);
  console.log(`Share links like: http://localhost:${PORT}/r/ROOMCODE`);
});
