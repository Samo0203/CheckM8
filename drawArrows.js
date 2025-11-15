// drawArrows.js
const NS = 'http://www.w3.org/2000/svg';
let svg, currentFrom, arrowCount = 0;
// Color definitions
const COLOR_GREEN = 'green';
const COLOR_CTRL = 'red';
const COLOR_ALT = 'blue';
const COLOR_SHIFT_ALT = 'orange';
let drawnArrows = []; // Tracks all drawn arrows

// Get chessboard
function getBoard() {
  return document.querySelector('cg-board') || document.querySelector('.cg-board');
}

// --- MODIFIED FUNCTION ---
// Create SVG overlay if missing
function ensureSvg() {
  const board = getBoard();
  if (!board) return null;
  if (svg) return svg;

  // We will attach the SVG to the board's PARENT
  const boardParent = board.parentElement;
  if (!boardParent) return null; // Safety check

  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-0.5 -0.5 8 8');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';

  // --- NEW LINES ---
  // This is the fix:
  // A high z-index makes the SVG layer sit on top of the pieces.
  svg.style.zIndex = '10';
  // --- END NEW LINES ---

  svg.classList.add('checkm8-arrows');

  // --- MODIFIED LINES ---
  // Make the parent the positioning context
  boardParent.style.position = 'relative';
  // Append the SVG to the PARENT, not the board
  boardParent.appendChild(svg);
  // --- END MODIFIED ---
  
  return svg;
}
// --- END OF MODIFIED FUNCTION ---

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

// Create an SVG arrow with an attached number tag
function createArrow(from, to, number, color) {
  const { x: x1, y: y1 } = keyToXY(from);
  const { x: x2, y: y2 } = keyToXY(to);

  // 1. The Arrow Line (is hidden)
  
  // 2. Calculate positions for the "tag"
  const cx = (x1 + x2) / 2; // Arrow center X
  const cy = (y1 + y2) / 2; // Arrow center Y
  
  const offset = 0.3; // How far the tag is from the arrow
  const nx = cx + offset; // Tag X
  const ny = cy + offset; // Tag Y

  // 3. The "Tag Line" (connects arrow to ring)
  const tagLine = document.createElementNS(NS, 'line');
  tagLine.setAttribute('x1', cx);
  tagLine.setAttribute('y1', cy);
  tagLine.setAttribute('x2', nx);
  tagLine.setAttribute('y2', ny);
  tagLine.setAttribute('stroke', 'white'); // Small white connector
  tagLine.setAttribute('stroke-width', '0.05');
  svg.appendChild(tagLine);

  // 4. The "Ring" (a circle)
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', nx);
  circle.setAttribute('cy', ny);
  circle.setAttribute('r', '0.25'); // Radius of the ring
  circle.setAttribute('fill', color); // Uses the passed-in color
  circle.setAttribute('stroke', 'white'); // Small white border
  circle.setAttribute('stroke-width', '0.03');
  svg.appendChild(circle); // Add circle FIRST

  // 5. The Number (text)
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', nx); // Position in center of circle
  text.setAttribute('y', ny); // Position in center of circle
  text.setAttribute('fill', 'white'); // White text
  text.setAttribute('font-size', '0.3'); // Font to fit inside ring
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.textContent = number;
  svg.appendChild(text); // Add text SECOND (on top)
  
  // Return all visible parts
  return { tagLine, circle, text };
}


// Clears all arrows from the board and resets counters
function clearAllArrows() {
  svg.innerHTML = ''; // Clear SVG content
  arrowCount = 0;
  drawnArrows = [];  // Clear the tracking array
}

// Initialize
function initDrawArrows() {
  const board = getBoard();
  if (!board) return;
  ensureSvg();

  board.addEventListener('contextmenu', e => e.preventDefault()); // Disables default right-click menu

  board.addEventListener('mousedown', e => {
    // MODIFIED: Left-click (button 0) now clears arrows
    if (e.button === 0) { 
      clearAllArrows();
      return;
    }
    
    // MODIFIED: Only respond to right-click (button 2) for drawing
    if (e.button !== 2) return; 

    const square = pixelToSquare(e.clientX, e.clientY, board);
    currentFrom = square;
  });

  board.addEventListener('mouseup', e => {
    // MODIFIED: Only respond to right-click (button 2)
    if (e.button !== 2 || !currentFrom) return;
    
    const toSquare = pixelToSquare(e.clientX, e.clientY, board);
    
    if (toSquare !== currentFrom) {
      // Feature 2 - Toggle arrow on redraw
      
      // Check if this exact arrow already exists
      const existingArrowIndex = drawnArrows.findIndex(
        arrow => arrow.from === currentFrom && arrow.to === toSquare
      );

      if (existingArrowIndex !== -1) {
        // Arrow EXISTS: Remove it
        const arrowToRemove = drawnArrows[existingArrowIndex];
        arrowToRemove.tagLine.remove();
        arrowToRemove.text.remove();
        arrowToRemove.circle.remove();
        drawnArrows.splice(existingArrowIndex, 1);
      } else {
        // Arrow does NOT exist: Create it
        arrowCount++;
        const numberToDisplay = Math.ceil(arrowCount / 2); // 1,1,2,2 logic

        // Determine color based on modifier keys
        let arrowColor;
        if (e.shiftKey && e.altKey) {
          arrowColor = COLOR_SHIFT_ALT; // orange
        } else if (e.altKey) {
          arrowColor = COLOR_ALT; // blue
        } else if (e.ctrlKey) {
          arrowColor = COLOR_CTRL; // red
        } else {
          arrowColor = COLOR_GREEN; // green (default for right-click)
        }
        
        const { tagLine, circle, text } = createArrow(
          currentFrom, 
          toSquare, 
          numberToDisplay,
          arrowColor // Pass the determined color
        );
        
        // Store all parts
        drawnArrows.push({ from: currentFrom, to: toSquare, tagLine, circle, text });
      }
    }
    currentFrom = null;
  });

  window.addEventListener('keydown', e => {
    // 'x' key still clears all arrows
    if (e.key.toLowerCase() === 'x') {
      clearAllArrows();
  _ }
  });
}

setTimeout(initDrawArrows, 2000);