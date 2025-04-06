import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';

interface Game {
  id: string;
  board: (string | null)[];
  players: string[];
  currentPlayer: string;
  status: string;
  winner?: string;
}

const GameBoard = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const { gameId } = useParams();
  const navigate = useNavigate();

  const isPlayerTurn = game?.currentPlayer === (game?.players[0] === socket?.id ? 'X' : 'O');

  useEffect(() => {
    console.log('Initializing GameBoard with gameId:', gameId);
    const newSocket = io('http://localhost:3000', {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      transports: ['websocket', 'polling']
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected successfully');
      if (gameId) {
        console.log('Emitting joinGame for gameId:', gameId);
        newSocket.emit('joinGame', gameId);
      }
    });

    newSocket.on('reconnect', () => {
      console.log('Socket reconnected');
      if (gameId) {
        console.log('Rejoining game:', gameId);
        newSocket.emit('joinGame', gameId);
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      console.error('Error details:', error);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // The server forcibly closed the connection
        console.log('Server closed the connection, attempting to reconnect...');
        newSocket.connect();
      }
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    newSocket.on('gameUpdate', (updatedGame: Game) => {
      console.log('Game updated:', updatedGame);
      setGame(updatedGame);
    });

    newSocket.on('playerReconnected', ({ playerId }) => {
      console.log('Player reconnected:', playerId);
      // You might want to show a notification that the other player is back
    });

    newSocket.on('playerLeft', ({ playerId }) => {
      console.log('Player left:', playerId);
      if (game) {
        setGame({
          ...game,
          players: game.players.filter(id => id !== playerId),
          status: 'waiting'
        });
      }
    });

    return () => {
      console.log('Cleaning up socket');
      newSocket.close();
    };
  }, [gameId]);

  const handleClick = (index: number) => {
    if (socket && game && game.status === 'in-progress') {
      socket.emit('makeMove', { gameId, position: index });
    }
  };

  const handleRestart = () => {
    if (socket && gameId) {
      socket.emit('restartGame', gameId);
    }
  };

  const handleLeave = () => {
    if (socket && gameId) {
      socket.emit('leaveGame', gameId);
      navigate('/');
    }
  };

  if (!game) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Tic Tac Toe</h1>

        <div className="mb-6">
          <p className="text-center text-gray-600">
            {game?.status === 'waiting' ? 'Waiting for opponent...' :
             game?.status === 'in-progress' ? `Current turn: ${game?.currentPlayer}` :
             game?.status === 'finished' ? `Game over! ${game?.winner ? `Winner: ${game?.winner}` : 'Draw'}` : ''}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6">
          {game?.board.map((cell, index) => (
            <button
              key={index}
              onClick={() => handleClick(index)}
              disabled={!isPlayerTurn || cell !== null}
              className={`aspect-square text-4xl font-bold rounded-lg transition-colors
                ${cell === 'X' ? 'bg-blue-100 text-blue-600' :
                  cell === 'O' ? 'bg-red-100 text-red-600' :
                  'bg-gray-100 hover:bg-gray-200 text-gray-400'}
                ${!isPlayerTurn || cell !== null ? 'cursor-not-allowed' : 'cursor-pointer'}
                flex items-center justify-center
              `}
            >
              {cell}
            </button>
          ))}
        </div>

        <div className="flex justify-center space-x-4">
          <button
            onClick={handleRestart}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Restart Game
          </button>
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Leave Game
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameBoard;