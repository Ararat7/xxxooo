import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: /^http:\/\/localhost:\d+$/,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: /^http:\/\/localhost:\d+$/,
  credentials: true
}));
app.use(express.json());

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);

let db;
let gamesCollection;

async function connectDB() {
  try {
    await client.connect();
    db = client.db('tic-tac-toe');
    gamesCollection = db.collection('games');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
}

connectDB();

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);

  // Handle reconnection
  socket.on('reconnect', async () => {
    console.log('User reconnected:', socket.id);
    try {
      // Find all games where this player was previously connected
      const games = await gamesCollection.find({ players: socket.id }).toArray();

      for (const game of games) {
        // Rejoin the game room
        socket.join(game.id);

        // Send current game state to reconnected player
        socket.emit('gameUpdate', game);

        // If game was in progress, notify other players
        if (game.status === 'in-progress') {
          io.to(game.id).emit('playerReconnected', { playerId: socket.id });
        }
      }
    } catch (error) {
      console.error('Error handling reconnection:', error);
    }
  });

  socket.on('createGame', async () => {
    const gameId = Math.random().toString(36).substring(2, 8);
    const game = {
      id: gameId,
      board: Array(9).fill(null),
      players: [socket.id],
      currentPlayer: 'X',
      status: 'waiting',
      lastActivity: new Date()
    };

    try {
      await gamesCollection.insertOne(game);
      socket.join(gameId);
      socket.emit('gameCreated', game);
      const allGames = await gamesCollection.find({ status: 'waiting' }).toArray();
      io.emit('gameListUpdate', allGames);
    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error', { message: 'Failed to create game' });
    }
  });

  socket.on('joinGame', async (gameId) => {
    console.log('Attempting to join game:', gameId);
    try {
      const game = await gamesCollection.findOne({ id: gameId });

      if (!game) {
        console.log('Game not found:', gameId);
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      console.log('Game found:', game);

      // Clean up any disconnected players from the game
      const activePlayers = game.players.filter(playerId =>
        io.sockets.sockets.has(playerId)
      );

      if (activePlayers.length >= 2) {
        socket.emit('error', { message: 'Game is full' });
        return;
      }

      if (activePlayers.includes(socket.id)) {
        // Player is reconnecting to the game
        socket.join(gameId);
        socket.emit('gameJoined', game);
        return;
      }

      // Add player to the game
      const updatedGame = {
        ...game,
        players: [...activePlayers, socket.id],
        status: activePlayers.length === 1 ? 'in-progress' : 'waiting',
        lastActivity: new Date()
      };

      await gamesCollection.updateOne(
        { id: gameId },
        { $set: updatedGame }
      );

      // Join the game room
      socket.join(gameId);
      console.log('Player joined game:', socket.id);

      // Notify all players in the game
      io.to(gameId).emit('gameUpdate', updatedGame);

      // Notify the player who joined
      socket.emit('gameJoined', updatedGame);

      // Update game list for all clients
      const allGames = await gamesCollection.find({ status: 'waiting' }).toArray();
      io.emit('gameListUpdate', allGames);

    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: 'Error joining game' });
    }
  });

  socket.on('requestGameList', async () => {
    try {
      const allGames = await gamesCollection.find({ status: 'waiting' }).toArray();
      socket.emit('gameListUpdate', allGames);
    } catch (error) {
      console.error('Error fetching game list:', error);
    }
  });

  socket.on('makeMove', async ({ gameId, position }) => {
    try {
      const game = await gamesCollection.findOne({ id: gameId });
      if (game && game.players.includes(socket.id)) {
        if (game.board[position] === null) {
          const updatedBoard = [...game.board];
          updatedBoard[position] = game.currentPlayer;
          const updatedGame = {
            ...game,
            board: updatedBoard,
            currentPlayer: game.currentPlayer === 'X' ? 'O' : 'X'
          };

          const winner = checkWinner(updatedBoard);
          if (winner) {
            updatedGame.status = 'finished';
            updatedGame.winner = winner;
          }

          await gamesCollection.updateOne(
            { id: gameId },
            { $set: updatedGame }
          );
          io.to(gameId).emit('gameUpdate', updatedGame);
        }
      }
    } catch (error) {
      console.error('Error making move:', error);
      socket.emit('error', { message: 'Failed to make move' });
    }
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    try {
      const games = await gamesCollection.find({ players: socket.id }).toArray();
      for (const game of games) {
        // Remove the disconnected player from the game
        const updatedPlayers = game.players.filter(playerId => playerId !== socket.id);
        const updatedGame = {
          ...game,
          players: updatedPlayers,
          status: updatedPlayers.length === 0 ? 'finished' : 'waiting',
          lastActivity: new Date()
        };

        await gamesCollection.updateOne(
          { id: game.id },
          { $set: updatedGame }
        );

        // Notify remaining players
        if (updatedPlayers.length > 0) {
          io.to(game.id).emit('playerLeft', { playerId: socket.id });
          io.to(game.id).emit('gameUpdate', updatedGame);
        }

        // Only delete the game if it's been inactive for more than 5 minutes
        if (updatedPlayers.length === 0) {
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          if (game.lastActivity < fiveMinutesAgo) {
            await gamesCollection.deleteOne({ id: game.id });
          }
        }
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });

  socket.on('restartGame', async (gameId) => {
    console.log('Attempting to restart game:', gameId);
    try {
      const game = await gamesCollection.findOne({ id: gameId });

      if (!game) {
        console.log('Game not found:', gameId);
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (!game.players.includes(socket.id)) {
        console.log('Player not in game:', socket.id);
        socket.emit('error', { message: 'You are not in this game' });
        return;
      }

      // Reset game state
      const updatedGame = {
        ...game,
        board: Array(9).fill(null),
        currentPlayer: 'X',
        status: 'in-progress',
        winner: null,
        lastActivity: new Date()
      };

      await gamesCollection.updateOne(
        { id: gameId },
        { $set: updatedGame }
      );

      // Notify all players in the game
      io.to(gameId).emit('gameUpdate', updatedGame);
      console.log('Game restarted:', gameId);

    } catch (error) {
      console.error('Error restarting game:', error);
      socket.emit('error', { message: 'Error restarting game' });
    }
  });

  socket.on('leaveGame', async (gameId) => {
    console.log('Player leaving game:', gameId);
    try {
      const game = await gamesCollection.findOne({ id: gameId });

      if (!game) {
        console.log('Game not found:', gameId);
        return;
      }

      // Remove player from the game
      const updatedPlayers = game.players.filter(playerId => playerId !== socket.id);
      const updatedGame = {
        ...game,
        players: updatedPlayers,
        status: updatedPlayers.length === 0 ? 'finished' : 'waiting',
        lastActivity: new Date()
      };

      await gamesCollection.updateOne(
        { id: gameId },
        { $set: updatedGame }
      );

      // Notify remaining players
      if (updatedPlayers.length > 0) {
        io.to(gameId).emit('playerLeft', { playerId: socket.id });
        io.to(gameId).emit('gameUpdate', updatedGame);
      }

      // Leave the game room
      socket.leave(gameId);
      console.log('Player left game:', socket.id);

    } catch (error) {
      console.error('Error leaving game:', error);
    }
  });
});

function checkWinner(board) {
  const winningCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6] // diagonals
  ];

  for (const combination of winningCombinations) {
    const [a, b, c] = combination;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  if (!board.includes(null)) return 'draw';
  return null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});