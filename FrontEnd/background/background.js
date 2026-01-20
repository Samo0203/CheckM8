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
  // ── Existing: Forward Stockfish analysis requests ──
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

  // ── NEW: Proxy handler for backend API calls (bypasses PNA/localhost restrictions) ──
  if (message.type === "PROXY_API_CALL") {
    const { endpoint, method = 'POST', body } = message;

    const url = `http://localhost:5000/api/${endpoint}`;

    fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error("Proxy request failed:", error.message);
        sendResponse({ success: false, error: error.message });
      });

    return true; // keep message channel open for async sendResponse
  }
});

console.log("Background ready – proxy for backend requests enabled");