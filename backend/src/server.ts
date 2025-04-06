import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { MongoClient, Collection } from 'mongodb';
import type { Game, SocketWithGame } from './types/game';

const app = express();
app.use(cors());
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const client = new MongoClient('mongodb://localhost:27017');
let db: any;
let gamesCollection: Collection<Game>;

async function connectDB(): Promise<void> {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db('tic-tac-toe');
    gamesCollection = db.collection('games');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
}

connectDB();

function checkWinner(board: (string | null)[]): 'X' | 'O' | 'draw' | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6] // diagonals
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as 'X' | 'O';
    }
  }

  if (!board.includes(null)) {
    return 'draw';
  }

  return null;
}

io.on('connection', (socket: SocketWithGame) => {
  console.log('User connected:', socket.id);

  socket.on('createGame', async () => {
    const gameId = Math.random().toString(36).substring(2, 8);
    console.log('Creating new game with ID:', gameId);
    const game: Game = {
      id: gameId,
      board: Array(9).fill(null),
      players: [socket.id],
      currentPlayer: 'X',
      status: 'waiting',
      lastActivity: new Date()
    };

    try {
      console.log('Inserting game into database:', game);
      const result = await gamesCollection.insertOne(game);
      console.log('Insert result:', result);

      if (!result.acknowledged) {
        throw new Error('Failed to insert game into database');
      }

      socket.join(gameId);
      socket.gameId = gameId;
      console.log('Game created successfully, emitting gameCreated event');
      socket.emit('gameCreated', game);

      // Verify the game was actually stored
      const storedGame = await gamesCollection.findOne({ id: gameId });
      console.log('Stored game verification:', storedGame);

      const allGames = await gamesCollection.find({ status: 'waiting' }).toArray();
      console.log('Current waiting games:', allGames);
      io.emit('gameListUpdate', allGames);
    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error', { message: 'Failed to create game' });
    }
  });

  socket.on('joinGame', async (gameId: string) => {
    console.log('Attempting to join game:', gameId);
    console.log('Current socket ID:', socket.id);

    try {
      // First check if the game exists
      const game = await gamesCollection.findOne({ id: gameId });

      if (!game) {
        console.log('Game not found in database:', gameId);
        // Log all current games for debugging
        const allGames = await gamesCollection.find({}).toArray();
        console.log('All games in database:', allGames);
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      console.log('Game found:', game);
      console.log('Current players:', game.players);
      console.log('Current status:', game.status);

      // Check if game is in a valid state for joining
      if (game.status !== 'waiting' && game.status !== 'in-progress') {
        console.log('Game is not in a joinable state:', game.status);
        socket.emit('error', { message: 'Game is no longer available' });
        return;
      }

      if (game.players.length >= 2) {
        console.log('Game is full:', game.players);
        socket.emit('error', { message: 'Game is full' });
        return;
      }

      // Only check for existing player if they're not the only player
      if (game.players.length === 1 && game.players[0] !== socket.id) {
        if (game.players.includes(socket.id)) {
          console.log('Player already in game:', socket.id);
          socket.emit('error', { message: 'You are already in this game' });
          return;
        }
      }

      const updatedGame: Game = {
        ...game,
        players: [...game.players, socket.id],
        status: game.players.length === 1 ? 'in-progress' : 'waiting',
        lastActivity: new Date()
      };

      console.log('Updating game with new player:', updatedGame);

      // Update the game in the database
      const result = await gamesCollection.updateOne(
        { id: gameId },
        { $set: updatedGame }
      );

      if (result.modifiedCount === 0) {
        console.log('Failed to update game:', gameId);
        socket.emit('error', { message: 'Failed to join game' });
        return;
      }

      // Verify the update
      const updatedGameInDB = await gamesCollection.findOne({ id: gameId });
      console.log('Updated game in database:', updatedGameInDB);

      // Join the socket room
      socket.join(gameId);
      socket.gameId = gameId;
      console.log('Player joined game successfully:', socket.id);

      // Notify all players in the game
      io.to(gameId).emit('gameUpdate', updatedGame);
      socket.emit('gameJoined', updatedGame);

      // Update the game list for all clients
      const waitingGames = await gamesCollection.find({
        status: 'waiting',
        $or: [
          { players: { $size: 0 } },
          { players: { $size: 1 } }
        ]
      }).toArray();
      console.log('Updated waiting games list:', waitingGames);
      io.emit('gameListUpdate', waitingGames);

    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: 'Error joining game' });
    }
  });

  socket.on('makeMove', async (data: { gameId: string; position: number }) => {
    const { gameId, position } = data;
    try {
      const game = await gamesCollection.findOne({ id: gameId });

      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (!game.players.includes(socket.id)) {
        socket.emit('error', { message: 'You are not a player in this game' });
        return;
      }

      if (game.status !== 'in-progress') {
        socket.emit('error', { message: 'Game is not in progress' });
        return;
      }

      if (game.currentPlayer !== (game.players[0] === socket.id ? 'X' : 'O')) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }

      if (game.board[position] !== null) {
        socket.emit('error', { message: 'Position already taken' });
        return;
      }

      const newBoard = [...game.board];
      newBoard[position] = game.currentPlayer;

      const winner = checkWinner(newBoard);
      const updatedGame: Game = {
        ...game,
        board: newBoard,
        currentPlayer: game.currentPlayer === 'X' ? 'O' : 'X',
        status: winner ? 'finished' : 'in-progress',
        winner: winner === 'draw' ? 'draw' : winner || undefined,
        lastActivity: new Date()
      };

      await gamesCollection.updateOne(
        { id: gameId },
        { $set: updatedGame }
      );

      io.to(gameId).emit('gameUpdate', updatedGame);

      const waitingGames = await gamesCollection.find({ status: 'waiting' }).toArray();
      io.emit('gameListUpdate', waitingGames);
    } catch (error) {
      console.error('Error making move:', error);
      socket.emit('error', { message: 'Error making move' });
    }
  });

  socket.on('restartGame', async (gameId: string) => {
    console.log('Attempting to restart game:', gameId);
    try {
      const game = await gamesCollection.findOne({ id: gameId });

      if (!game) {
        console.log('Game not found for restart:', gameId);
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (!game.players.includes(socket.id)) {
        console.log('Player not in game:', socket.id);
        socket.emit('error', { message: 'You are not a player in this game' });
        return;
      }

      const updatedGame: Game = {
        ...game,
        board: Array(9).fill(null),
        currentPlayer: 'X',
        status: 'in-progress',
        winner: undefined,
        lastActivity: new Date()
      };

      const result = await gamesCollection.updateOne(
        { id: gameId },
        { $set: updatedGame }
      );

      if (result.modifiedCount === 0) {
        console.log('Failed to restart game:', gameId);
        socket.emit('error', { message: 'Failed to restart game' });
        return;
      }

      console.log('Game restarted successfully:', gameId);
      io.to(gameId).emit('gameUpdate', updatedGame);
    } catch (error) {
      console.error('Error restarting game:', error);
      socket.emit('error', { message: 'Error restarting game' });
    }
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    if (socket.gameId) {
      try {
        const game = await gamesCollection.findOne({ id: socket.gameId });
        if (game) {
          const updatedPlayers = game.players.filter(player => player !== socket.id);
          const updatedGame: Game = {
            ...game,
            players: updatedPlayers,
            status: game.status === 'in-progress' ? 'waiting' : game.status,
            lastActivity: new Date()
          };

          await gamesCollection.updateOne(
            { id: socket.gameId },
            { $set: updatedGame }
          );

          // Only delete the game if it's finished and has no players
          if (game.status === 'finished' && updatedPlayers.length === 0) {
            await gamesCollection.deleteOne({ id: socket.gameId });
            console.log('Game deleted (finished and empty):', socket.gameId);
          } else {
            io.to(socket.gameId).emit('playerLeft', { playerId: socket.id });
            io.to(socket.gameId).emit('gameUpdate', updatedGame);
            console.log('Player left game:', socket.id, 'Game status:', updatedGame.status);
          }

          // Update game list for all clients
          const waitingGames = await gamesCollection.find({
            $or: [
              { status: 'waiting' },
              { status: 'in-progress', players: { $size: 1 } }
            ]
          }).toArray();
          console.log('Updated waiting games list:', waitingGames);
          io.emit('gameListUpdate', waitingGames);
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    }
  });

  // Add a new event handler for requesting the game list
  socket.on('requestGameList', async () => {
    try {
      const waitingGames = await gamesCollection.find({
        $or: [
          { status: 'waiting' },
          { status: 'in-progress', players: { $size: 1 } }
        ]
      }).toArray();
      console.log('Sending game list to client:', waitingGames);
      socket.emit('gameListUpdate', waitingGames);
    } catch (error) {
      console.error('Error sending game list:', error);
    }
  });
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});
