console.log("🔥 Background service worker loaded");

// Create offscreen document if not exists
async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) {
    console.log("♟️ Offscreen already exists");
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["WORKERS"],
    justification: "Run Stockfish chess engine"
  });

  console.log("✅ Offscreen document created");
}

// Start on load
ensureOffscreen();

// Receive messages from offscreen (Stockfish output)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STOCKFISH_OUTPUT") {
    console.log("♟️ SF:", msg.data);
  }
});
