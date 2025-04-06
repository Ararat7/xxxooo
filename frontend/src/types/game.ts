export interface Game {
  id: string;
  board: (string | null)[];
  players: string[];
  currentPlayer: 'X' | 'O';
  status: 'waiting' | 'in-progress' | 'finished';
  winner?: 'X' | 'O' | 'draw';
  lastActivity?: Date;
}

export interface GameState {
  game: Game | null;
  error: string | null;
}

export interface GameMove {
  gameId: string;
  position: number;
}

export interface GameEvent {
  type: 'gameCreated' | 'gameJoined' | 'gameUpdate' | 'playerLeft' | 'playerReconnected' | 'error';
  payload: any;
}
