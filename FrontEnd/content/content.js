console.log("CheckM8 content script loaded");

// Wait for board
const observer = new MutationObserver(() => {
  const board = document.querySelector(".cg-board");
  if (board && !document.querySelector("svg.checkm8-arrows")) {
    chrome.storage.sync.get(["loggedInUser"], (res) => {
      if (res.loggedInUser) {
        // Arrow enhancer initialized via drawArrows.js
        console.log("Initializing arrow enhancer for user:", res.loggedInUser);
      }
    });
  }
});

observer.observe(document.body, { childList: true, subtree: true });
