# Tic Tac Toe Multiplayer Game

A multiplayer Tic Tac Toe game built with Node.js, MongoDB, React, and Socket.io.

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (running locally or accessible via connection string)
- npm or yarn

## Setup

1. Clone the repository
2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

4. Create a `.env` file in the backend directory with the following content:
   ```
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/tic-tac-toe
   ```

## Running the Application

1. Start the backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. Start the frontend development server:
   ```bash
   cd frontend
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173`

## Features

- Real-time multiplayer gameplay using WebSockets
- Game lobby showing available games
- Ability to create new games
- Join existing games
- Real-time game updates
- Winner detection
- Draw detection
- Player disconnection handling

## Technologies Used

- Backend:
  - Node.js
  - Express
  - Socket.io
  - MongoDB

- Frontend:
  - React
  - TypeScript
  - Socket.io-client
  - Tailwind CSS
  - React Router