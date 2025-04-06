import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

interface Game {
  id: string;
  board: (string | null)[];
  players: string[];
  currentPlayer: string;
  status: string;
}

const GameList = () => {
  const [socket, setSocket] = useState<ReturnType<typeof io> | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    console.log('Initializing GameList');
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
      newSocket.emit('requestGameList');
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

    newSocket.on('gameListUpdate', (updatedGames: Game[]) => {
      console.log('Received game list update:', updatedGames);
      const waitingGames = updatedGames.filter(game => game.status === 'waiting');
      setGames(waitingGames);
    });

    newSocket.on('gameCreated', (game: Game) => {
      console.log('New game created:', game);
      if (game.status === 'waiting') {
        setGames(prev => [...prev, game]);
      }
    });

    newSocket.on('gameJoined', (game: Game) => {
      console.log('Game joined:', game);
      if (game.status !== 'waiting') {
        setGames(prev => prev.filter(g => g.id !== game.id));
      }
    });

    return () => {
      console.log('Cleaning up socket');
      newSocket.close();
    };
  }, []);

  const createGame = () => {
    if (socket) {
      console.log('Creating new game');
      socket.emit('createGame');
    }
  };

  const joinGame = (gameId: string) => {
    if (socket) {
      console.log('Joining game:', gameId);
      socket.emit('joinGame', gameId);
      navigate(`/game/${gameId}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Tic Tac Toe</h1>
          <button
            onClick={createGame}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Create New Game
          </button>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Games</h2>
          <div className="grid gap-4">
            {games.map((game) => (
              <div
                key={game.id}
                className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center"
              >
                <div>
                  <p className="font-medium">Game ID: {game.id}</p>
                  <p className="text-sm text-gray-500">
                    Status: {game.status === 'waiting' ? 'Waiting for player' : 'In progress'}
                  </p>
                </div>
                {game.status === 'waiting' && (
                  <button
                    onClick={() => joinGame(game.id)}
                    className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
                  >
                    Join Game
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameList;