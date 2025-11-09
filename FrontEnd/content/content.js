console.log("Lichess Arrow Enhancer: Active");

// Wait for chessboard
const observer = new MutationObserver(() => {
  const board = document.querySelector(".cg-board");
  if (board && !document.querySelector("#arrow-overlay")) {
    initArrowEnhancer(board);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

let startSquare = null;
let moveCount = 0;
let arrowColor = "#00ff00"; // default color

chrome.storage.sync.get(["arrowColor"], (result) => {
  if (result.arrowColor) arrowColor = result.arrowColor;
});

function initArrowEnhancer(board) {
  console.log("Chessboard detected ✅");

  // Overlay for arrows
  const overlay = document.createElement("svg");
  overlay.id = "arrow-overlay";
  overlay.style.position = "absolute";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.pointerEvents = "none";
  board.parentElement.appendChild(overlay);

  board.addEventListener("mousedown", (e) => {
    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    startSquare = { x, y };
  });

  board.addEventListener("mouseup", (e) => {
    if (!startSquare) return;

    const rect = board.getBoundingClientRect();
    const x2 = e.clientX - rect.left;
    const y2 = e.clientY - rect.top;
    drawArrow(startSquare.x, startSquare.y, x2, y2);
    startSquare = null;
  });
}

function drawArrow(x1, y1, x2, y2) {
  moveCount++;
  const overlay = document.getElementById("arrow-overlay");

  // Create arrow line
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "line");
  arrow.setAttribute("x1", x1);
  arrow.setAttribute("y1", y1);
  arrow.setAttribute("x2", x2);
  arrow.setAttribute("y2", y2);
  arrow.setAttribute("stroke", arrowColor);
  arrow.setAttribute("stroke-width", "4");
  arrow.setAttribute("marker-end", "url(#arrowhead)");

  // Create arrowhead
  if (!overlay.querySelector("defs")) {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="arrowhead" markerWidth="10" markerHeight="7"
        refX="10" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="${arrowColor}" />
      </marker>`;
    overlay.appendChild(defs);
  }

  // Create move number
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", (x1 + x2) / 2);
  text.setAttribute("y", (y1 + y2) / 2);
  text.setAttribute("fill", "black");
  text.setAttribute("font-size", "16");
  text.setAttribute("font-weight", "bold");
  text.textContent = moveCount;

  overlay.appendChild(arrow);
  overlay.appendChild(text);

  console.log(`Arrow ${moveCount} drawn with color ${arrowColor}`);
}
