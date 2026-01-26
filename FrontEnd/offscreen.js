console.log("♟️ Offscreen document loaded");

let engineReady = false;

// In offscreen.js – replace the worker line
const engine = new Worker(chrome.runtime.getURL("stockfish/stockfish.js"));

engine.postMessage("uci");

engine.onmessage = (e) => {
  const line = e.data;
  console.log("♟️ SF:", line);

  if (line === "uciok") {
    engineReady = true;
    console.log("✅ Stockfish ready");
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
      console.warn("⚠️ Stockfish not ready yet");
      sendResponse({ error: "Engine not ready" });
      return true;
    }

    engine.postMessage("stop");
    engine.postMessage("position fen " + msg.fen);
    engine.postMessage("setoption name MultiPV value 3");
    engine.postMessage("go depth 15");

    let evalData = { bestMoves: [], scores: [] };
    const listener = (e) => {
      const line = e.data;
      if (line.startsWith('info depth 15')) {
        const multipvMatch = line.match(/multipv (\d+)/);
        const scoreMatch = line.match(/score cp (-?\d+)/);
        const pvMatch = line.match(/pv (\w{4})/);
        if (multipvMatch && scoreMatch && pvMatch) {
          const idx = parseInt(multipvMatch[1]) - 1;
          evalData.bestMoves[idx] = pvMatch[1];
          evalData.scores[idx] = parseInt(scoreMatch[1]);
        }
      } else if (line.startsWith('bestmove')) {
        engine.onmessage = null;
        sendResponse(evalData);
      }
    };
    engine.onmessage = listener;
    return true;
  }
});