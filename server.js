const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ==================== КОНФИГУРАЦИЯ ====================
const COLORS = ['yellow', 'blue', 'red', 'green'];
const COLOR_CODES = {
  yellow: '#FFC107',
  blue: '#03A9F4',
  red: '#FF5252',
  green: '#8BC34A'
};

// Путь для каждого цвета (координаты [row, col])
const PATHS = {
  yellow: [
    [6,1],[6,2],[6,3],[6,4],[6,5],
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,7],[0,8],
    [1,8],[2,8],[3,8],[4,8],[5,8],
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
    [7,14],[8,14],
    [8,13],[8,12],[8,11],[8,10],[8,9],
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
    [14,7],[14,6],
    [13,6],[12,6],[11,6],[10,6],[9,6],
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [7,0],[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]
  ],
  blue: [
    [1,8],[2,8],[3,8],[4,8],[5,8],
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
    [7,14],[8,14],
    [8,13],[8,12],[8,11],[8,10],[8,9],
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
    [14,7],[14,6],
    [13,6],[12,6],[11,6],[10,6],[9,6],
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [7,0],[6,0],
    [6,1],[6,2],[6,3],[6,4],[6,5],
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,7],[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]
  ],
  red: [
    [8,13],[8,12],[8,11],[8,10],[8,9],
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
    [14,7],[14,6],
    [13,6],[12,6],[11,6],[10,6],[9,6],
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [7,0],[6,0],
    [6,1],[6,2],[6,3],[6,4],[6,5],
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,7],[0,8],
    [1,8],[2,8],[3,8],[4,8],[5,8],
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
    [7,14],[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]
  ],
  green: [
    [13,6],[12,6],[11,6],[10,6],[9,6],
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [7,0],[6,0],
    [6,1],[6,2],[6,3],[6,4],[6,5],
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,7],[0,8],
    [1,8],[2,8],[3,8],[4,8],[5,8],
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
    [7,14],[8,14],
    [8,13],[8,12],[8,11],[8,10],[8,9],
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
    [14,7],[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]
  ]
};

const BASE_POSITIONS = {
  yellow: [[1,1],[1,4],[4,1],[4,4]],
  blue: [[1,10],[1,13],[4,10],[4,13]],
  red: [[10,1],[10,4],[13,1],[13,4]],
  green: [[10,10],[10,13],[13,10],[13,13]]
};

const SAFE_ZONES = [
  [2,6],[6,2],[10,6],[6,10],
  [6,6],[6,8],[8,6],[8,8]
];

// ==================== КЛАСС КОМНАТЫ ====================
class Room {
  constructor(id, hostId, hostName, hostUsername) {
    this.id = id;
    this.players = [{
      id: hostId,
      name: hostName,
      username: hostUsername,
      color: null,
      ready: true
    }];
    this.hostId = hostId;
    this.status = 'waiting';
    this.currentTurn = 0;
    this.dice = 1;
    this.board = this.initBoard();
    this.winner = null;
    this.moveHistory = [];
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  initBoard() {
    const board = {};
    COLORS.forEach(color => {
      board[color] = {
        pieces: [
          { id: 0, pos: BASE_POSITIONS[color][0], onBoard: false, pathIndex: -1, finished: false },
          { id: 1, pos: BASE_POSITIONS[color][1], onBoard: false, pathIndex: -1, finished: false },
          { id: 2, pos: BASE_POSITIONS[color][2], onBoard: false, pathIndex: -1, finished: false },
          { id: 3, pos: BASE_POSITIONS[color][3], onBoard: false, pathIndex: -1, finished: false }
        ]
      };
    });
    return board;
  }

  addPlayer(playerId, playerName, playerUsername) {
    if (this.players.length >= 4) return false;
    if (this.status !== 'waiting') return false;
    if (this.players.find(p => p.id === playerId)) return false;
    this.players.push({
      id: playerId,
      name: playerName,
      username: playerUsername,
      color: null,
      ready: true
    });
    this.lastActivity = Date.now();
    return true;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    if (this.players.length === 0) return true;
    if (this.hostId === playerId && this.players.length > 0) {
      this.hostId = this.players[0].id;
    }
    return false;
  }

  assignColors() {
    const available = COLORS.slice(0, this.players.length);
    this.players.forEach((p, i) => {
      p.color = available[i];
    });
  }

  startGame() {
    if (this.players.length < 2) return false;
    this.assignColors();
    this.status = 'playing';
    this.currentTurn = 0;
    this.dice = 0;
    return true;
  }

  getCurrentPlayer() {
    return this.players[this.currentTurn % this.players.length];
  }

  rollDice() {
    this.dice = Math.floor(Math.random() * 6) + 1;
    return this.dice;
  }

  canMove(pieceIndex, playerColor) {
    const piece = this.board[playerColor].pieces[pieceIndex];
    if (piece.finished) return false;
    if (!piece.onBoard) {
      return this.dice === 6;
    }
    if (piece.pathIndex + this.dice > 56) {
      return false;
    }
    return true;
  }

  getValidMoves(playerColor) {
    const moves = [];
    this.board[playerColor].pieces.forEach((piece, idx) => {
      if (this.canMove(idx, playerColor)) {
        moves.push(idx);
      }
    });
    return moves;
  }

  movePiece(pieceIndex, playerColor) {
    const piece = this.board[playerColor].pieces[pieceIndex];
    const path = PATHS[playerColor];

    if (!piece.onBoard) {
      if (this.dice !== 6) return { success: false, error: 'Need 6 to exit base' };
      piece.onBoard = true;
      piece.pathIndex = 0;
    } else {
      piece.pathIndex += this.dice;
    }

    // Update position
    if (piece.pathIndex < 56) {
      piece.pos = path[piece.pathIndex];
    } else {
      piece.finished = true;
      piece.pathIndex = 56;
    }

    // Check kill (only if not on home stretch or safe zone)
    let killed = null;
    if (piece.pathIndex < 51) {
      const newPos = piece.pos;
      killed = this.checkKill(newPos, playerColor);
    }

    // Check win
    const allFinished = this.board[playerColor].pieces.every(p => p.finished);
    if (allFinished) {
      this.winner = playerColor;
      this.status = 'finished';
    }

    this.moveHistory.push({
      player: playerColor,
      piece: pieceIndex,
      dice: this.dice,
      to: piece.pathIndex,
      killed: killed,
      time: Date.now()
    });

    this.lastActivity = Date.now();
    return { success: true, killed };
  }

  checkKill(pos, killerColor) {
    for (const color of COLORS) {
      if (color === killerColor) continue;
      for (const piece of this.board[color].pieces) {
        if (!piece.onBoard || piece.finished || piece.pathIndex >= 51) continue;
        const piecePos = PATHS[color][piece.pathIndex];
        if (piecePos[0] === pos[0] && piecePos[1] === pos[1]) {
          const isSafe = SAFE_ZONES.some(sz => sz[0] === pos[0] && sz[1] === pos[1]);
          if (!isSafe) {
            piece.onBoard = false;
            piece.pathIndex = -1;
            piece.pos = BASE_POSITIONS[color][piece.id];
            return { color, pieceId: piece.id };
          }
        }
      }
    }
    return null;
  }

  nextTurn() {
    if (this.dice === 6) {
      return; // Same player rolls again
    }
    this.currentTurn++;
  }

  getState() {
    return {
      id: this.id,
      status: this.status,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        username: p.username,
        color: p.color
      })),
      currentTurn: this.currentTurn,
      currentPlayer: this.getCurrentPlayer()?.color || null,
      dice: this.dice,
      board: this.board,
      winner: this.winner,
      moveHistory: this.moveHistory.slice(-10)
    };
  }

  getPublicInfo() {
    return {
      id: this.id,
      playerCount: this.players.length,
      maxPlayers: 4,
      status: this.status,
      hostName: this.players[0]?.name || 'Unknown'
    };
  }
}

// ==================== ХРАНИЛИЩЕ ====================
const rooms = new Map();
const playerRooms = new Map();
const telegramRoomMap = new Map(); // chatId -> roomId

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function cleanupOldRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.lastActivity > 30 * 60 * 1000) { // 30 min
      rooms.delete(id);
      telegramRoomMap.delete(id);
    }
  }
}
setInterval(cleanupOldRooms, 5 * 60 * 1000);

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('create-room', (data, callback) => {
    const roomId = generateRoomCode();
    const room = new Room(roomId, socket.id, data.name || 'Player', data.username);
    rooms.set(roomId, room);
    playerRooms.set(socket.id, roomId);
    socket.join(roomId);

    callback({ success: true, roomId, state: room.getState() });
    console.log('Room created:', roomId);
  });

  socket.on('join-room', (data, callback) => {
    const roomId = data.roomId.toUpperCase();
    const room = rooms.get(roomId);

    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }

    if (room.status !== 'waiting') {
      callback({ success: false, error: 'Game already started' });
      return;
    }

    if (!room.addPlayer(socket.id, data.name || `Player ${room.players.length + 1}`, data.username)) {
      callback({ success: false, error: 'Room full' });
      return;
    }

    playerRooms.set(socket.id, roomId);
    socket.join(roomId);

    io.to(roomId).emit('room-update', room.getState());
    callback({ success: true, state: room.getState() });
  });

  socket.on('start-game', () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room.hostId !== socket.id) return;

    if (room.startGame()) {
      io.to(roomId).emit('game-started', room.getState());
    }
  });

  socket.on('roll-dice', () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    const currentPlayer = room.getCurrentPlayer();

    if (currentPlayer.id !== socket.id) return;
    if (room.status !== 'playing') return;

    const dice = room.rollDice();
    const validMoves = room.getValidMoves(currentPlayer.color);

    io.to(roomId).emit('dice-rolled', {
      player: currentPlayer.color,
      dice,
      validMoves,
      state: room.getState()
    });
  });

  socket.on('move-piece', (data) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    const currentPlayer = room.getCurrentPlayer();

    if (currentPlayer.id !== socket.id) return;
    if (room.status !== 'playing') return;

    const pieceIndex = data.pieceIndex;
    if (!room.canMove(pieceIndex, currentPlayer.color)) {
      socket.emit('error', 'Invalid move');
      return;
    }

    const result = room.movePiece(pieceIndex, currentPlayer.color);
    if (!result.success) {
      socket.emit('error', result.error);
      return;
    }

    room.nextTurn();

    io.to(roomId).emit('piece-moved', {
      state: room.getState(),
      killed: result.killed,
      nextPlayer: room.getCurrentPlayer()?.color
    });

    if (room.winner) {
      io.to(roomId).emit('game-over', {
        winner: room.winner,
        state: room.getState()
      });
    }
  });

  socket.on('disconnect', () => {
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        const isEmpty = room.removePlayer(socket.id);
        if (isEmpty) {
          rooms.delete(roomId);
        } else {
          io.to(roomId).emit('player-left', room.getState());
        }
      }
      playerRooms.delete(socket.id);
    }
    console.log('Player disconnected:', socket.id);
  });
});

// ==================== API для Telegram ====================
app.get('/api/rooms', (req, res) => {
  const publicRooms = [];
  for (const [id, room] of rooms) {
    if (room.status === 'waiting') {
      publicRooms.push(room.getPublicInfo());
    }
  }
  res.json({ rooms: publicRooms });
});

app.get('/api/room/:id', (req, res) => {
  const room = rooms.get(req.params.id.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room.getState());
});

// ==================== ЗАПУСК ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎲 Ludo Server v2 running on port ${PORT}`);
});
