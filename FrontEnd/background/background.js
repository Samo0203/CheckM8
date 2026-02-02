console.log("🔥 ChckM8 background loaded");

async function createOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("offscreen.html"),
    reasons: ['WORKERS'],
    justification: 'Stockfish engine for arrow analysis'
  });
  console.log("Offscreen document created");
}

createOffscreen();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Forward Stockfish analysis requests
  if (message.type === "ANALYZE_MOVE") {
    chrome.runtime.sendMessage({
      type: "ANALYZE_FEN",
      fen: message.fen,
      move: message.move   
    }, response => {
      sendResponse(response);
    });
    return true;
  }

  // Direct forward for ANALYZE_FEN 
  if (message.type === "ANALYZE_FEN") {
    chrome.runtime.sendMessage(message, response => {
      sendResponse(response);
    });
    return true;
  }

  // Backend proxy
  if (message.type === "PROXY_API_CALL") {
    const { endpoint, method = 'POST', body } = message;
    fetch(`http://localhost:5000/api/${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    })
      .then(r => r.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

console.log("Background ready – proxy for backend requests enabled");
