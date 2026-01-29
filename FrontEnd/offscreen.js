console.log("♟️ Offscreen document loaded");

let engineReady = false;
let pendingResponse = null;
let currentAnalysis = null;

const engine = new Worker(
  chrome.runtime.getURL("stockfish/stockfish.js")
);

// Initialize Stockfish
engine.postMessage("uci");

engine.onmessage = (e) => {
  const line = e.data;
  // console.log("♟️ SF:", line);

  if (line === "uciok") {
    engineReady = true;
    console.log("✅ Stockfish ready");
    return;
  }

  if (!currentAnalysis) return;

  // Capture best move (MultiPV 1)
  if (line.startsWith('info depth 13')) {  // or your depth
  const multipvMatch = line.match(/multipv (\d+)/);
  const scoreMatch = line.match(/score cp (-?\d+)/);
  const pvMatch = line.match(/pv (\w{4})/);

  if (multipvMatch && scoreMatch && pvMatch) {
    const rank = parseInt(multipvMatch[1], 10);
    const move = pvMatch[1];
    const cp = parseInt(scoreMatch[1], 10);

    if (rank === 1) {
      currentAnalysis.bestMove = move;
      currentAnalysis.bestScore = cp;
    }

    if (currentAnalysis.candidateMove === move) {
      currentAnalysis.candidateRank = rank;
      currentAnalysis.candidateScore = cp;
    }
  }
}

  // Finish analysis
  if (line.startsWith("bestmove")) {
    pendingResponse?.({
      bestMove: currentAnalysis.bestMove,
      bestScore: currentAnalysis.bestScore,
      candidateRank: currentAnalysis.candidateRank,
      candidateScore: currentAnalysis.candidateScore
    });

    pendingResponse = null;
    currentAnalysis = null;
  }

  chrome.runtime.sendMessage({
    type: "STOCKFISH_OUTPUT",
    data: line
  });
};

engine.onerror = (err) => {
  console.error("❌ Stockfish Worker error:", err);
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ANALYZE_FEN") {
    if (!engineReady) {
      sendResponse({ error: "Engine not ready" });
      return true;
    }

    currentAnalysis = {
      candidateMove: msg.move || null,
      bestMove: null,
      bestScore: null,
      candidateRank: null,
      candidateScore: null
    };

    pendingResponse = sendResponse;

    engine.postMessage("stop");
    engine.postMessage("position fen " + msg.fen);
    engine.postMessage("setoption name MultiPV value 7");
    engine.postMessage("go depth 13");

    return true; // async response
  }
});
