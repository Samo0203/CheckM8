console.log("🔥 ChckM8 background loaded");

async function createOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Stockfish engine for arrow analysis'
  });
  console.log("Offscreen document created");
}

createOffscreen();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYZE_MOVE") {
    chrome.runtime.sendMessage({
      type: "ANALYZE_FEN",
      fen: message.fen,
      move: message.move   // added move we want to classify
    }, response => {
      sendResponse(response);
    });
    return true; // keep channel open for async response
  }
});