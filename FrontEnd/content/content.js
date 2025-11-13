<<<<<<< Updated upstream
console.log("CheckM8 content script loaded");
=======
console.log("✅ CheckM8 content script loaded");
>>>>>>> Stashed changes

// Wait for board
const observer = new MutationObserver(() => {
  const board = document.querySelector(".cg-board");
  if (board && !document.getElementById("arrow-overlay")) {
    chrome.storage.sync.get(["loggedInUser"], (res) => {
      if (res.loggedInUser) {
        initArrowEnhancer(board);
      }
    });
  }
});
observer.observe(document.body, { childList: true, subtree: true });

let moveCount = 0;
let startPos = null;
let arrowColor = "#00ff00";

chrome.storage.sync.get(["arrowColor"], (res) => {
  if (res.arrowColor) arrowColor = res.arrowColor;
});

function initArrowEnhancer(board) {
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  overlay.id = "arrow-overlay";
  overlay.style.position = "absolute";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "200";
  board.parentElement.style.position = "relative";
  board.parentElement.appendChild(overlay);

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <marker id="arrowhead" markerWidth="10" markerHeight="7"
      refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${arrowColor}" />
    </marker>`;
  overlay.appendChild(defs);

  board.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // left click only
    const rect = board.getBoundingClientRect();
    startPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  });

  board.addEventListener("mouseup", (e) => {
    if (!startPos) return;
    const rect = board.getBoundingClientRect();
    const endPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    drawArrow(startPos.x, startPos.y, endPos.x, endPos.y, overlay);
    startPos = null;
  });
}

function drawArrow(x1, y1, x2, y2, overlay) {
  moveCount++;
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "line");
  arrow.setAttribute("x1", x1);
  arrow.setAttribute("y1", y1);
  arrow.setAttribute("x2", x2);
  arrow.setAttribute("y2", y2);
  arrow.setAttribute("stroke", arrowColor);
  arrow.setAttribute("stroke-width", "4");
  arrow.setAttribute("marker-end", "url(#arrowhead)");

  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", (x1 + x2) / 2);
  label.setAttribute("y", (y1 + y2) / 2);
  label.setAttribute("fill", "#000");
  label.setAttribute("font-size", "16");
  label.setAttribute("font-weight", "bold");
  label.textContent = moveCount;

  overlay.appendChild(arrow);
  overlay.appendChild(label);
}
