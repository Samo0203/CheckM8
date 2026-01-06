console.log("♟️ Offscreen document loaded");

let engineReady = false;

// Start Stockfish correctly
const engine = new Worker(
  chrome.runtime.getURL("stockfish/stockfish.js"),
  { type: "classic" }
);

// Init UCI
engine.postMessage("uci");

// Receive Stockfish output
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

// Listen messages from background / content
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "ANALYZE_FEN") {
    if (!engineReady) {
      console.warn("⚠️ Stockfish not ready yet");
      return;
    }

    engine.postMessage("stop");
    engine.postMessage("position fen " + msg.fen);
    engine.postMessage("go depth 15");
  }
});
