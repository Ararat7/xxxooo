import { Socket } from 'socket.io';

export interface Game {
  id: string;
  board: (string | null)[];
  players: string[];
  currentPlayer: 'X' | 'O';
  status: 'waiting' | 'in-progress' | 'finished';
  winner?: 'X' | 'O' | 'draw';
  lastActivity: Date;
}

export interface GameMove {
  gameId: string;
  position: number;
}

export interface GameEvent {
  type: 'create' | 'join' | 'move' | 'leave';
  payload: any;
}

export interface SocketWithGame extends Socket {
  gameId?: string;
}
