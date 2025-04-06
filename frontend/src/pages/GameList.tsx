import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import io, { Socket } from 'socket.io-client';
import { Game } from '../types/game';

const GameList = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
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

    newSocket.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error.message);
      console.error('Error details:', error);
    });

    newSocket.on('disconnect', (reason: string) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // The server forcibly closed the connection
        console.log('Server closed the connection, attempting to reconnect...');
        newSocket.connect();
      }
    });

    newSocket.on('error', (error: Error) => {
      console.error('Socket error:', error);
    });

    newSocket.on('gameListUpdate', (updatedGames: Game[]) => {
      console.log('Received game list update:', updatedGames);
      // Show all games that are either waiting or in-progress with one player
      const availableGames = updatedGames.filter(game =>
        (game.status === 'waiting' ||
         (game.status === 'in-progress' && game.players.length === 1)) &&
        game.players.length < 2
      );
      console.log('Filtered available games:', availableGames);
      setGames(availableGames);
    });

    newSocket.on('gameCreated', (game: Game) => {
      console.log('New game created:', game);
      if (game.status === 'waiting' && game.players.length < 2) {
        console.log('Adding game to list:', game);
        setGames(prev => [...prev, game]);
      }
    });

    newSocket.on('gameJoined', (game: Game) => {
      console.log('Game joined:', game);
      if (game.status === 'in-progress' && game.players.length >= 2) {
        console.log('Removing game from list:', game.id);
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
      console.log('Attempting to join game:', gameId);
      console.log('Current socket ID:', socket.id);

      // Add error handler for this specific join attempt
      const errorHandler = (error: { message: string }) => {
        console.error('Error joining game:', error.message);
        alert(error.message);
        // Don't navigate if there was an error
        return;
      };

      // Add success handler
      const successHandler = (game: Game) => {
        console.log('Successfully joined game:', game);
        console.log('Game status:', game.status);
        console.log('Game players:', game.players);
        // Only navigate if the join was successful
        navigate(`/game/${gameId}`);
      };

      // Set up one-time listeners
      socket.once('error', errorHandler);
      socket.once('gameJoined', successHandler);

      // Emit the join request
      socket.emit('joinGame', gameId);

      // Clean up listeners after 5 seconds if no response
      setTimeout(() => {
        socket.off('error', errorHandler);
        socket.off('gameJoined', successHandler);
      }, 5000);
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
                  <p className="text-sm text-gray-500">
                    Players: {game.players.length}/2
                  </p>
                </div>
                {game.status === 'waiting' && game.players.length < 2 && (
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
