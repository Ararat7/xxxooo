import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import GameList from './pages/GameList';
import GameBoard from './pages/GameBoard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<GameList />} />
        <Route path="/game/:gameId" element={<GameBoard />} />
      </Routes>
    </Router>
  );
}

export default App;
