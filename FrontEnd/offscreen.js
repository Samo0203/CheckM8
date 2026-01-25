console.log("♟️ Offscreen document loaded");

let engineReady = false;
const engine = new Worker(chrome.runtime.getURL("stockfish/stockfish.js"));

engine.postMessage("uci");

engine.onmessage = (e) => {
  const line = e.data.trim();
  console.log("♟️ SF:", line);

  if (line.includes("uciok")) {
    engineReady = true;
    console.log("✅ Stockfish ready");
  }
};

engine.onerror = (err) => {
  console.error("❌ Stockfish Worker error:", err);
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "ANALYZE_FEN") return false;

  if (!engineReady) {
    console.warn("⚠️ Stockfish not ready yet");
    sendResponse({ success: false, error: "Engine not ready" });
    return true;
  }

  const { fen, move } = msg;

  // Get side to move ('w' or 'b')
  const side = fen.split(" ")[1];
  const scoreMultiplier = side === "b" ? -1 : 1;  // Flip black scores → positive = good for current player

  engine.postMessage("stop");
  engine.postMessage(`position fen ${fen}`);
  engine.postMessage("setoption name MultiPV value 5");  // Ask for more lines to be safe
  engine.postMessage("go depth 18");  // Reasonable depth

  const evalData = {
    bestMoves: Array(5).fill(null),
    scores: Array(5).fill(null)
  };

  let timeoutId = setTimeout(() => {
    engine.postMessage("stop");
    finalize("Analysis timeout (30s)");
  }, 30000);

  const listener = (e) => {
    const line = e.data.trim();

    if (line.startsWith("info")) {
      const multipvMatch = line.match(/multipv (\d+)/);
      const scoreMatch = line.match(/score cp (-?\d+)/);
      const pvMatch = line.match(/pv ([a-h][1-8][a-h][1-8])/);

      if (multipvMatch && scoreMatch && pvMatch) {
        const multipv = parseInt(multipvMatch[1]) - 1;
        if (multipv >= 0 && multipv < 5) {
          const rawCp = parseInt(scoreMatch[1]);
          const normalized = rawCp * scoreMultiplier;  // Now positive = better for side to move

          evalData.bestMoves[multipv] = pvMatch[1];
          evalData.scores[multipv] = normalized;

          console.log(`PV${multipv+1}: ${pvMatch[1]} → ${normalized} cp (raw: ${rawCp})`);
        }
      }
    }

    if (line.startsWith("bestmove")) {
      clearTimeout(timeoutId);
      finalize();
    }
  };

  function finalize(errorMsg = null) {
    engine.removeEventListener("message", listener);

    if (errorMsg) {
      console.warn(errorMsg);
      sendResponse({ success: false, error: errorMsg });
      return;
    }

    const validScores = evalData.scores.filter(s => s !== null);
    if (validScores.length === 0) {
      sendResponse({ success: true, data: { bestMoves: [], scores: [], classifications: [] } });
      return;
    }

    const bestScore = Math.max(...validScores);

    const classifications = evalData.scores.map(s => {
      if (s === null) return "unknown";
      if (s >= bestScore) return "best";
      if (s > bestScore - 50) return "good";
      if (s > bestScore - 150) return "inaccuracy";
      return "bad";
    });

    sendResponse({
      success: true,
      data: {
        bestMoves: evalData.bestMoves,
        scores: evalData.scores,
        classifications
      }
    });

    console.log("Analysis sent:", { bestScore, classifications });
  }

  engine.addEventListener("message", listener);
  return true;
});