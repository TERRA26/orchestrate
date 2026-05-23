import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import Game2048 from "./games/Game2048.tsx";
import MemoryMatchGame from "./games/MemoryMatchGame.tsx";
import SnakeGame from "./games/SnakeGame.tsx";
import TicTacToeGame from "./games/TicTacToeGame.tsx";
import Home from "./pages/Home.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/games/snake" element={<SnakeGame />} />
          <Route path="/games/2048" element={<Game2048 />} />
          <Route path="/games/tic-tac-toe" element={<TicTacToeGame />} />
          <Route path="/games/memory-match" element={<MemoryMatchGame />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
