const NS = 'http://www.w3.org/2000/svg';
let svg, currentFrom;
let isWKeyPressed = false; // Tracks if 'w' key is pressed

// --- HIGHLIGHT LOGIC ---
let isHighlightActive = false; // Tracks if 'h' key is pressed
let highlightBuffer = ""; // Stores the number for 'h'
let isVariationHighlightActive = false; // Tracks if 'g' key is pressed
let variationHighlightBuffer = ""; // Stores the variation ID for 'g'
let currentVariationID = 0; // 0=Main, 1=Var 1, 2=Var 2, etc. (Now "sticky")
let toggledHighlight = { number: null, color: null }; // For click-toggle
// --- END HIGHLIGHT LOGIC ---

let renderedArrows = []; // Stores all drawn elements for key lookup

// Color definitions
const COLOR_GREEN = 'green';
const COLOR_CTRL = 'red';
const COLOR_ALT = 'blue';
const COLOR_SHIFT_ALT = 'orange';
const COLOR_YELLOW = 'yellow'; // Variation Color
const COLOR_PINK = 'deeppink'; // 'h' key highlight color
const COLOR_ROSE = 'hotpink'; // 'g' key (and hover) highlight color

// --- STATE MANAGEMENT ---
let historyLog = [ [] ]; // Array of "snapshots"
let currentHistoryIndex = 0; // Tracks our position in the log
// --- END STATE MANAGEMENT ---


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

// Add Yellow Arrowhead
function addArrowHeadDefs() {
  if (!svg) return;
  const defs = document.createElementNS(NS, 'defs');
  
  const colors = [
    { id: 'arrowhead-green', color: COLOR_GREEN },
    { id: 'arrowhead-red', color: COLOR_CTRL },
    { id: 'arrowhead-blue', color: COLOR_ALT },
    { id: 'arrowhead-orange', color: COLOR_SHIFT_ALT },
    { id: 'arrowhead-yellow', color: COLOR_YELLOW }, 
    { id: 'arrowhead-pink', color: COLOR_PINK },
    { id: 'arrowhead-rose', color: COLOR_ROSE }, 
    { id: 'arrowhead-hidden', color: 'transparent' } 
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

// --- EDITED HELPER FUNCTION ---
function showArrow(arrowElements, color, markerUrl) {
  const { line, g } = arrowElements; 
  svg.appendChild(line); // Bring to front
  svg.appendChild(g);     // Bring to front
  line.setAttribute('stroke-opacity', '1.0');

  // --- NEW LOGIC: All arrows are normal size ---
  line.setAttribute('stroke-width', '0.2'); 
  // --- END NEW LOGIC ---
  
  line.setAttribute('stroke', color);
  line.setAttribute('marker-end', markerUrl);
}

function hideArrow(arrowElements) {
  const { line, color } = arrowElements;
  
  const isHKeyHighlighted = isHighlightActive && highlightBuffer === arrowElements.number.toString();
  const isGKeyHighlighted = isVariationHighlightActive && variationHighlightBuffer && 
                            arrowElements.variationID === parseInt(variationHighlightBuffer);
  const isToggled = toggledHighlight.number === arrowElements.number.toString() &&
                    toggledHighlight.color === arrowElements.color;

  if (!isHKeyHighlighted && !isGKeyHighlighted && !isToggled) { // Only hide if NOTHING is active
    line.setAttribute('stroke-opacity', '0');
    line.setAttribute('stroke-width', '0.15');
    line.setAttribute('stroke', color); // Reset to original color
    line.setAttribute('marker-end', 'url(#arrowhead-hidden)');
  }
}
// --- END HELPER FUNCTIONS ---


// --- HELPER: clearSvg ---
function clearSvg() {
  if (svg) {
    svg.innerHTML = '';
    addArrowHeadDefs();
  }
  renderedArrows = []; // Clear the lookup array
}
// --- END NEW HELPER ---


// --- NEW HELPER: clearToggledHighlight ---
function clearToggledHighlight() {
  if (toggledHighlight.number) {
    renderedArrows
      .filter(el => el.number.toString() === toggledHighlight.number && el.color === toggledHighlight.color)
      .forEach(hideArrow);
    toggledHighlight = { number: null, color: null };
  }
}
// --- END NEW HELPER ---


// --- NEW HELPER: clearHHighlight ---
function clearHHighlight() {
  if (isHighlightActive) {
    isHighlightActive = false;
    renderedArrows
      .filter(arrow => arrow.number.toString() === highlightBuffer)
      .forEach(hideArrow);
    highlightBuffer = "";
  }
}
// --- END NEW HELPER ---


// --- NEW HELPER: clearGHighlight ---
function clearGHighlight() {
  if (isVariationHighlightActive) {
    isVariationHighlightActive = false;
    const varID = parseInt(variationHighlightBuffer);
    if (!isNaN(varID)) {
      renderedArrows
        .filter(arrow => arrow.variationID === varID)
        .forEach(hideArrow);
    }
    variationHighlightBuffer = "";
  }
}
// --- END NEW HELPER ---


// --- EDITED: recordNewAction ---
function recordNewAction(newState) {
  clearToggledHighlight(); // A new action clears any toggle
  clearHHighlight();
  clearGHighlight();
  
  historyLog = historyLog.slice(0, currentHistoryIndex + 1);
  historyLog.push(newState);
  currentHistoryIndex = historyLog.length - 1;
  
  // This call will draw all arrows as HIDDEN
  redrawAllArrows(); 
}
// --- END EDITED ---


// --- EDITED: showAllArrowsInCurrentState ---
function showAllArrowsInCurrentState() {
  clearToggledHighlight(); // Undo/Redo clears any toggle
  
  renderedArrows.forEach(elements => {
    const isHKeyHighlighted = isHighlightActive && highlightBuffer === elements.number.toString();
    const isGKeyHighlighted = isVariationHighlightActive && variationHighlightBuffer && 
                              elements.variationID === parseInt(variationHighlightBuffer);

    if (isHKeyHighlighted) {
      showArrow(elements, COLOR_PINK, 'url(#arrowhead-pink)');
    } else if (isGKeyHighlighted) {
      showArrow(elements, COLOR_ROSE, 'url(#arrowhead-rose)');
    } else {
      showArrow(elements, elements.color, elements.markerUrl);
    }
  });
}
// --- END EDITED ---


// --- Undo/Redo Functions ---
function undoMove() {
  currentHistoryIndex = Math.max(0, currentHistoryIndex - 1);
  redrawAllArrows(); // Draws the state (hidden)
  showAllArrowsInCurrentState(); // <-- Makes them visible
}

function redoMove() {
  currentHistoryIndex = Math.min(historyLog.length - 1, currentHistoryIndex + 1);
  redrawAllArrows(); // Draws the state (hidden)
  showAllArrowsInCurrentState(); // <-- Makes them visible
}
// --- END Undo/Redo Functions ---


// --- EDITED: createArrow (Hover Logic) ---
function createArrow(from, to, number, color, isCounted, variationID) {
  const { x: x1, y: y1 } = keyToXY(from);
  const { x: x2, y: y2 } = keyToXY(to);
  const cx = (x1 + x2) / 2; // Arrow center X
  const cy = (y1 + y2) / 2; // Arrow center Y
  
  const offset = 0.4; // Tag line length
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const perpendicularAngle = angle + Math.PI / 2; 
  const nx = cx + offset * Math.cos(perpendicularAngle);
  const ny = cy + offset * Math.sin(perpendicularAngle);
  
  let markerUrl;
  if (color === COLOR_GREEN) markerUrl = 'url(#arrowhead-green)';
  else if (color === COLOR_CTRL) markerUrl = 'url(#arrowhead-red)';
  else if (color === COLOR_ALT) markerUrl = 'url(#arrowhead-blue)';
  else if (color === COLOR_SHIFT_ALT) markerUrl = 'url(#arrowhead-orange)';
  else if (color === COLOR_YELLOW) markerUrl = 'url(#arrowhead-yellow)';
  else markerUrl = 'url(#arrowhead-hidden)'; // Default to hidden

  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', color);
  
  // Make arrow HIDDEN by default
  line.setAttribute('stroke-width', '0.15');
  line.setAttribute('stroke-opacity', '0'); 
  line.setAttribute('marker-end', 'url(#arrowhead-hidden)'); 
  
  svg.appendChild(line);

  const g = document.createElementNS(NS, 'g');
  g.style.pointerEvents = 'auto'; // Make this group hoverable
  g.style.cursor = 'pointer';

  const tagLine = document.createElementNS(NS, 'line');
  tagLine.setAttribute('x1', cx);
  tagLine.setAttribute('y1', cy);
  tagLine.setAttribute('x2', nx);
  tagLine.setAttribute('y2', ny);
  tagLine.setAttribute('stroke', 'white');
  tagLine.setAttribute('stroke-width', '0.05');
  g.appendChild(tagLine);

  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', nx);
  circle.setAttribute('cy', ny);
  circle.setAttribute('r', '0.25');
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', '0.03');
  g.appendChild(circle);

  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', nx);
  text.setAttribute('y', ny);
  text.setAttribute('fill', 'white');
  text.setAttribute('font-size', '0.3');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.textContent = number; 
  g.appendChild(text);

  const arrowElements = { line, g, number, markerUrl, color, isCounted, variationID };
  
  // --- EDITED: mouseenter listener ---
  g.addEventListener('mouseenter', () => {
    // Mouse hover always wins
    if (!isCounted) {
      // It's a variation. Show ROSE on hover.
      showArrow(arrowElements, COLOR_ROSE, 'url(#arrowhead-rose)');
    } else {
      // It's a main line arrow. Show its original color.
      showArrow(arrowElements, color, markerUrl);
    }
  });
  // --- END EDITED ---
  
  // --- EDITED: mouseleave (checks all states) ---
  g.addEventListener('mouseleave', () => {
    const isHKeyHighlighted = isHighlightActive && highlightBuffer === arrowElements.number.toString();
    const isGKeyHighlighted = isVariationHighlightActive && variationHighlightBuffer &&
                              arrowElements.variationID === parseInt(variationHighlightBuffer);
    const isToggled = toggledHighlight.number === arrowElements.number.toString() &&
                      toggledHighlight.color === arrowElements.color;
    
    if (isHKeyHighlighted) {
      showArrow(arrowElements, COLOR_PINK, 'url(#arrowhead-pink)');
    } else if (isGKeyHighlighted) {
      showArrow(arrowElements, COLOR_ROSE, 'url(#arrowhead-rose)');
    } else if (isToggled) {
      showArrow(arrowElements, color, markerUrl);
    } else {
      hideArrow(arrowElements);
    }
  });
  // --- END EDITED ---
  
  // --- Click listener to toggle highlight ---
  g.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation(); 

    const { number, color, markerUrl } = arrowElements;
    const isAlreadyToggled = toggledHighlight.number === number.toString() &&
                             toggledHighlight.color === color;
    
    clearToggledHighlight();
    clearHHighlight();
    clearGHighlight();

    if (isAlreadyToggled) {
      // We just cleared it
    } else {
      // Not toggled, so set it
      toggledHighlight = { number: number.toString(), color: color };
      // And show all arrows in this sequence
      renderedArrows
        .filter(el => el.number.toString() === number.toString() && el.color === color)
        .forEach(el => showArrow(el, el.color, el.markerUrl));
    }
  });
  
  svg.appendChild(g);
  return arrowElements;
}


// --- Pass all move info to createArrow ---
function redrawAllArrows() {
  clearSvg(); // Start by clearing the board
  
  const activeHistory = historyLog[currentHistoryIndex] || [];

  activeHistory.forEach(move => {
    // Pass all info, including isCounted and variationID
    const elements = createArrow(move.from, move.to, move.number, move.color, move.isCounted, move.variationID);
    renderedArrows.push(elements); // Add to our lookup array
  });
}


// Initialize
function initDrawArrows() {
  const board = getBoard();
  if (!board) return;
  ensureSvg();
  addArrowHeadDefs(); // Add arrowhead definitions on init

  board.addEventListener('contextmenu', e => e.preventDefault());

  // mousedown listener
  board.addEventListener('mousedown', e => {
    if (e.button === 0) { 
      recordNewAction([]);
      return;
    }
    if (e.button !== 2) return; 
    const square = pixelToSquare(e.clientX, e.clientY, board);
    currentFrom = square;
  });

  // --- EDITED mouseup listener (Yellow for Variations) ---
  board.addEventListener('mouseup', e => {
    if (e.button !== 2 || !currentFrom) return;
    
    const toSquare = pixelToSquare(e.clientX, e.clientY, board);
    
    if (toSquare !== currentFrom) {
      const currentState = historyLog[currentHistoryIndex] || [];
      const nextState = [...currentState];
      const existingMoveIndex = nextState.findIndex(
        move => move.from === currentFrom && move.to === toSquare
      );

      if (existingMoveIndex !== -1) {
        // --- DELETE ACTION ---
        nextState.splice(existingMoveIndex, 1);
      } else {
        // --- ADD ACTION ---
        let arrowColor;
        let player; 
        const isCounted = !isWKeyPressed; // Determine if it's a "main" move
        
        // 1. Set player based on keys
        if (e.shiftKey && e.altKey) { player = 'black'; }
        else if (e.altKey) { player = 'white'; }
        else if (e.ctrlKey) { player = 'white'; }
        else { player = 'black'; }

        // 2. --- COLOR LOGIC (Yellow for Variations) ---
        if (isWKeyPressed) {
            // It's a "possible move" (variation), force it to be Yellow
            arrowColor = COLOR_YELLOW;
        } else {
            // It's a "main line" move, use the original key logic
            if (e.shiftKey && e.altKey) { arrowColor = COLOR_SHIFT_ALT; }
            else if (e.altKey) { arrowColor = COLOR_ALT; }
            else if (e.ctrlKey) { arrowColor = COLOR_CTRL; }
            else { arrowColor = COLOR_GREEN; }
        }
        // --- END NEW COLOR LOGIC ---

        // 3. Determine Number (This is the default logic: 1,1,2,2,3,3...)
        let numberToDisplay;
        let lastCountedNumber = 0;
        let countedArrowIndex = 0;
        currentState.forEach(move => {
          if (move.isCounted) {
            countedArrowIndex++;
            lastCountedNumber = move.number; 
          }
        });

        if (isCounted) {
          numberToDisplay = Math.ceil((countedArrowIndex + 1) / 2);
        } else {
          numberToDisplay = (lastCountedNumber === 0) ? 1 : lastCountedNumber;
        }
        
        // 4. --- SET VARIATION ID ---
        const variationID = isWKeyPressed ? currentVariationID : 0; 
        
        nextState.push({
          from: currentFrom,
          to: toSquare,
          color: arrowColor,
          player: player,
          isCounted: isCounted,
          number: numberToDisplay,
          variationID: variationID // <-- STORE THE VARIATION ID
        });
      }
      
      recordNewAction(nextState);
    }
    currentFrom = null;
  });
  // --- END EDITED mouseup listener ---


  // --- EDITED keydown listener ---
  window.addEventListener('keydown', e => {
    if (e.repeat) return; // Ignore key-repeats

    const key = e.key.toLowerCase();
    const isUndoRedo = e.ctrlKey || e.metaKey; 

    // 1. Handle Undo/Redo
    if (isUndoRedo && key === 'z') { e.preventDefault(); undoMove(); return; }
    if (isUndoRedo && key === 'y') { e.preventDefault(); redoMove(); return; }
    
    // 2. Handle Highlight-mode key ('h')
    if (key === 'h' && !isUndoRedo) {
      e.preventDefault();
      clearToggledHighlight();
      clearGHighlight(); // Clear other highlight mode
      isHighlightActive = true;
      highlightBuffer = ""; // Reset buffer
      return;
    }
    
    // 3. Handle Variation Highlight-mode key ('g')
    if (key === 'g' && !isUndoRedo) {
      e.preventDefault();
      clearToggledHighlight();
      clearHHighlight(); // Clear other highlight mode
      isVariationHighlightActive = true;
      variationHighlightBuffer = "";
      return;
    }
    
    // 4. Handle Number keys
    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 0 && num <= 9) {
      
      if (isHighlightActive) {
        // --- 'h' key (by number) logic ---
        e.preventDefault();
        const oldBuffer = highlightBuffer;
        highlightBuffer += e.key; 
        // Hide old
        if(oldBuffer) {
          renderedArrows.filter(arrow => arrow.number.toString() === oldBuffer).forEach(hideArrow);
        }
        // Show new
        renderedArrows
          .filter(arrow => arrow.number.toString() === highlightBuffer)
          .forEach(elements => {
            showArrow(elements, COLOR_PINK, 'url(#arrowhead-pink)');
          });
        return;
      } 
      
      else if (isVariationHighlightActive) {
        // --- 'g' key (by variation ID) logic ---
        e.preventDefault();
        const oldBuffer = variationHighlightBuffer;
        variationHighlightBuffer += e.key;
        const varIDToHighlight = parseInt(variationHighlightBuffer);
        
        // Hide old
        if (oldBuffer) {
          const oldVarID = parseInt(oldBuffer);
          if (!isNaN(oldVarID)) {
             renderedArrows.filter(arrow => arrow.variationID === oldVarID).forEach(hideArrow);
          }
        }
        // Show new
        renderedArrows
          .filter(arrow => arrow.variationID === varIDToHighlight)
          .forEach(elements => {
            showArrow(elements, COLOR_ROSE, 'url(#arrowhead-rose)');
          });
        return;
      } 
      
      else if (isWKeyPressed) {
        // --- 'w' key (set variation ID) logic ---
        e.preventDefault();
        currentVariationID = num; // 'w' + '1' sets varID = 1. 'w' + '0' sets varID = 0.
        return;
      }
    }

    // 5. Handle other keys
    if (key === 'w') {
      isWKeyPressed = true;
    }
    
    if (key === 'x') {
      recordNewAction([]);
    }
  });
  // --- END EDITED keydown ---


  // --- EDITED keyup listener ---
  window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    
    if (key === 'w') {
      isWKeyPressed = false;
      // It's "sticky", so we do NOT reset currentVariationID
    }

    // Check for 'h' key release
    if (key === 'h') {
      e.preventDefault();
      clearHHighlight();
    }
    
    // Check for 'g' key release
    if (key === 'g') {
      e.preventDefault();
      clearGHighlight();
    }
  });
  // --- END EDITED keyup ---
}

setTimeout(initDrawArrows, 2000);