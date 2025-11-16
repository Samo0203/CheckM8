// drawArrows.js
const NS = 'http://www.w3.org/2000/svg';
let svg, currentFrom;
let isWKeyPressed = false; // Tracks if 'w' key is pressed

// Color definitions
const COLOR_GREEN = 'green';
const COLOR_CTRL = 'red';
const COLOR_ALT = 'blue';
const COLOR_SHIFT_ALT = 'orange';

// We will track the "source of truth" in moveHistory
let moveHistory = []; // Stores {from, to, color, player, isCounted}

// Get chessboard
function getBoard() {
  return document.querySelector('cg-board') || document.querySelector('.cg-board');
}

// Create SVG overlay if missing (with z-index fix)
function ensureSvg() {
  const board = getBoard();
  if (!board) return null;
  if (svg) return svg;

  const boardParent = board.parentElement;
  if (!boardParent) return null;

  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-0.5 -0.5 8 8');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none'; // Main SVG is invisible to mouse
  svg.style.zIndex = '10'; // Makes sure SVG is on top of pieces
  svg.classList.add('checkm8-arrows');
  
  boardParent.style.position = 'relative';
  boardParent.appendChild(svg);
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

// Adds all required arrowhead definitions (colors + hidden)
function addArrowHeadDefs() {
  if (!svg) return;
  const defs = document.createElementNS(NS, 'defs');
  
  const colors = [
    { id: 'arrowhead-green', color: COLOR_GREEN },
    { id: 'arrowhead-red', color: COLOR_CTRL },
    { id: 'arrowhead-blue', color: COLOR_ALT },
    { id: 'arrowhead-orange', color: COLOR_SHIFT_ALT },
    { id: 'arrowhead-hidden', color: 'transparent' } // The hidden one
  ];

  colors.forEach(item => {
    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', item.id);
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerWidth', '4');
    marker.setAttribute('markerHeight', '4');
    marker.setAttribute('refX', '2.05');
    marker.setAttribute('refY', '2.01');

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M0,0 V4 L3,2 Z');
    path.setAttribute('fill', item.color); // Use the specific color
    marker.appendChild(path);
    defs.appendChild(marker);
  });
  
  svg.appendChild(defs);
}

// This function now draws the arrow (hidden) AND the tag (visible)
function createArrow(from, to, number, color) {
  const { x: x1, y: y1 } = keyToXY(from);
  const { x: x2, y: y2 } = keyToXY(to);
  const cx = (x1 + x2) / 2; // Arrow center X
  const cy = (y1 + y2) / 2; // Arrow center Y
  
  // --- DYNAMIC TAG POSITIONING ---
  const offset = 0.4; // Tag line length
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const perpendicularAngle = angle + Math.PI / 2; 
  const nx = cx + offset * Math.cos(perpendicularAngle);
  const ny = cy + offset * Math.sin(perpendicularAngle);
  // --- END DYNAMIC ---

  // Determine the correct marker URL
  let markerUrl;
  if (color === COLOR_GREEN) markerUrl = 'url(#arrowhead-green)';
  else if (color === COLOR_CTRL) markerUrl = 'url(#arrowhead-red)';
  else if (color === COLOR_ALT) markerUrl = 'url(#arrowhead-blue)';
  else if (color === COLOR_SHIFT_ALT) markerUrl = 'url(#arrowhead-orange)';
  else markerUrl = 'url(#arrowhead-hidden)';

  // 1. The Arrow Line (as a highlight)
  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '0.15');
  line.setAttribute('stroke-opacity', '0'); // Hidden by default
  line.setAttribute('marker-end', 'url(#arrowhead-hidden)'); // Use hidden marker
  svg.appendChild(line);

  // 2. Create a <g> group for all tag elements
  const g = document.createElementNS(NS, 'g');
  g.style.pointerEvents = 'auto'; // Make this group hoverable
  g.style.cursor = 'pointer';

  // 3. The "Tag Line"
  const tagLine = document.createElementNS(NS, 'line');
  tagLine.setAttribute('x1', cx);
  tagLine.setAttribute('y1', cy);
  tagLine.setAttribute('x2', nx);
  tagLine.setAttribute('y2', ny);
  tagLine.setAttribute('stroke', 'white');
  tagLine.setAttribute('stroke-width', '0.05');
  g.appendChild(tagLine);

  // 4. The "Ring"
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', nx);
  circle.setAttribute('cy', ny);
  circle.setAttribute('r', '0.25');
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', '0.03');
  g.appendChild(circle);

  // 5. The Number
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', nx);
  text.setAttribute('y', ny);
  text.setAttribute('fill', 'white');
  text.setAttribute('font-size', '0.3');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.textContent = number;
  g.appendChild(text);

  // 6. Add Hover Listeners to the group
  g.addEventListener('mouseenter', () => {
    svg.appendChild(line); 
    svg.appendChild(g);
    
    line.setAttribute('stroke-opacity', '1.0');
    line.setAttribute('stroke-width', '0.2');
    line.setAttribute('marker-end', markerUrl); // Show colored arrowhead
  });
  
  g.addEventListener('mouseleave', () => {
    line.setAttribute('stroke-opacity', '0');
    line.setAttribute('stroke-width', '0.15');
    line.setAttribute('marker-end', 'url(#arrowhead-hidden)'); // Use hidden marker
  });
  
  // 7. Add the finished group to the SVG
  svg.appendChild(g);
}

// --- MODIFIED FUNCTION ---
// This function recalculates and draws ALL arrows based on the history
function redrawAllArrows() {
  if (!svg) return;
  svg.innerHTML = ''; // Clear the board completely
  addArrowHeadDefs(); // Must re-add defs after clearing
  
  let countedArrowIndex = 0; // Only tracks "counted" arrows
  let lastCountedNumber = 1; // Tracks the last "real" number

  moveHistory.forEach(move => {
    let numberToDisplay;

    if (move.isCounted) {
      // This is a "real" move, part of the 1,1,2,2 sequence
      countedArrowIndex++;
      numberToDisplay = Math.ceil(countedArrowIndex / 2);
      lastCountedNumber = numberToDisplay; // Store this number
    } else {
      // This is a "w" move. Use the last real number.
      numberToDisplay = lastCountedNumber;
    }
    
    // Draw the arrow with the calculated number
    createArrow(move.from, move.to, numberToDisplay, move.color);
  });
}
// --- END MODIFIED FUNCTION ---

// Clears all arrows and resets the state
function clearAllArrows() {
  if (svg) {
    svg.innerHTML = '';
    // We must re-add the defs even after clearing
    addArrowHeadDefs(); 
  }
  moveHistory = [];
}

// Initialize
function initDrawArrows() {
  const board = getBoard();
  if (!board) return;
  ensureSvg(); // <-- FIXED
  addArrowHeadDefs(); // Add arrowhead definitions on init

  board.addEventListener('contextmenu', e => e.preventDefault());

  board.addEventListener('mousedown', e => {
    // Left-click (button 0) clears arrows
    if (e.button === 0) { 
      clearAllArrows();
      return;
    }
    
    // Only respond to right-click (button 2) for drawing
    if (e.button !== 2) return; 

    const square = pixelToSquare(e.clientX, e.clientY, board);
    currentFrom = square;
  });

  board.addEventListener('mouseup', e => {
    if (e.button !== 2 || !currentFrom) return;
    
    const toSquare = pixelToSquare(e.clientX, e.clientY, board);
    
    if (toSquare !== currentFrom) {
      const existingMoveIndex = moveHistory.findIndex(
        move => move.from === currentFrom && move.to === toSquare
      );

      if (existingMoveIndex !== -1) {
        moveHistory.splice(existingMoveIndex, 1);
      } else {
        let arrowColor;
        let player; 
        
        if (e.shiftKey && e.altKey) {
          arrowColor = COLOR_SHIFT_ALT;
          player = 'black';
        } else if (e.altKey) {
          arrowColor = COLOR_ALT;
          player = 'white';
        } else if (e.ctrlKey) {
          arrowColor = COLOR_CTRL;
          player = 'white';
        } else {
          arrowColor = COLOR_GREEN;
          player = 'black';
        }
        
        moveHistory.push({
          from: currentFrom,
          to: toSquare,
          color: arrowColor,
          player: player,
          isCounted: !isWKeyPressed // Don't count if 'w' is pressed
        });
      } // <-- FIXED

      redrawAllArrows();
    }
    currentFrom = null;
  });

  // Add key state listeners for 'w'
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'w') {
      isWKeyPressed = true;
    }
    if (e.key.toLowerCase() === 'x') {
      clearAllArrows();
    }
  });

  window.addEventListener('keyup', e => {
    if (e.key.toLowerCase() === 'w') {
      isWKeyPressed = false;
    }
  });
}

setTimeout(initDrawArrows, 2000);