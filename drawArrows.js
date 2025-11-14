// drawArrows.js
const NS = 'http://www.w3.org/2000/svg';
let svg, currentFrom, currentColorIndex = 0, arrowCount = 0;
const colors = ['red', 'green', 'blue', 'yellow'];
let arrowHistory = []; // ✅ Track drawn arrows

// Get chessboard
function getBoard() {
  return document.querySelector('cg-board') || document.querySelector('.cg-board');
}

// Create SVG overlay if missing
function ensureSvg() {
  const board = getBoard();
  if (!board) return null;
  if (svg) return svg;

  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-0.5 -0.5 8 8');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.classList.add('checkm8-arrows');
  board.appendChild(svg);
  return svg;
}

// Convert pixel to board coordinate
function pixelToSquare(x, y, board) {
  const rect = board.getBoundingClientRect();
  const size = rect.width / 8;
  const file = Math.floor((x - rect.left) / size);
  const rank = 7 - Math.floor((y - rect.top) / size);
  return String.fromCharCode(97 + file) + (rank + 1);
}

// Map algebraic key (e4) → 0–8 board coordinate
function keyToXY(key) {
  const file = key.charCodeAt(0) - 97;
  const rank = parseInt(key[1]) - 1;
  return { x: file, y: 7 - rank };
}

// Create an SVG arrow
function createArrow(from, to, color, number) {
  const { x: x1, y: y1 } = keyToXY(from);
  const { x: x2, y: y2 } = keyToXY(to);

  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '0.15');
  line.setAttribute('marker-end', 'url(#arrowhead)');
  svg.appendChild(line);

  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', (x1 + x2) / 2);
  text.setAttribute('y', (y1 + y2) / 2);
  text.setAttribute('fill', 'white');
  text.setAttribute('font-size', '0.45');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.textContent = number;
  svg.appendChild(text);

  // ✅ Store elements in history for Undo functionality
  arrowHistory.push({ line, text });
}

// Add arrowhead defs
function addArrowHead() {
  const defs = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerWidth', '4');
  marker.setAttribute('markerHeight', '4');
  marker.setAttribute('refX', '2.05');
  marker.setAttribute('refY', '2.01');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M0,0 V4 L3,2 Z');
  path.setAttribute('fill', 'currentColor');
  marker.appendChild(path);
  defs.appendChild(marker);
  svg.appendChild(defs);
}

// Initialize
function initDrawArrows() {
  const board = getBoard();
  if (!board) return;
  ensureSvg();
  addArrowHead();

  board.addEventListener('contextmenu', e => e.preventDefault()); // disable default right-click

  board.addEventListener('mousedown', e => {
    if (e.button !== 2) return; // right click only
    const square = pixelToSquare(e.clientX, e.clientY, board);
    currentFrom = square;
  });

  board.addEventListener('mouseup', e => {
    if (e.button !== 2 || !currentFrom) return;
    const toSquare = pixelToSquare(e.clientX, e.clientY, board);
    if (toSquare !== currentFrom) {
      arrowCount++;
      createArrow(currentFrom, toSquare, colors[currentColorIndex], arrowCount);
    }
    currentFrom = null;
  });

  window.addEventListener('keydown', e => {
    // Cycle Colors (C)
    if (e.key.toLowerCase() === 'c') {
      currentColorIndex = (currentColorIndex + 1) % colors.length;
    }
    
    // ✅ Undo Arrow (Z) - Deletes arrow by arrow
    if (e.key.toLowerCase() === 'z') {
      const lastArrow = arrowHistory.pop();
      if (lastArrow) {
        lastArrow.line.remove();
        lastArrow.text.remove();
        arrowCount = Math.max(0, arrowCount - 1);
      }
    }

    // Clear All (X)
    if (e.key.toLowerCase() === 'x') {
      svg.innerHTML = ''; 
      addArrowHead();
      arrowCount = 0;
      arrowHistory = []; // ✅ Clear history
    }
  });
}

setTimeout(initDrawArrows, 2000);