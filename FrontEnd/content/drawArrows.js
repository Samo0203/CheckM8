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
let historyLog = [[]]; // Array of "snapshots"
let currentHistoryIndex = 0; // Tracks our position in the log
// --- END STATE MANAGEMENT ---

const backendUrl = "http://localhost:5000/api"; // Backend URL

// ---------- BOARD & SVG ----------
function getBoard() {
  return document.querySelector('cg-board') || document.querySelector('.cg-board');
}

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
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '10';
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

// ---------- SAVE ARROW ----------
function getLoggedInUser() {
  return new Promise(resolve => {
    if (chrome?.storage?.sync) {
      chrome.storage.sync.get(["loggedInUser"], res => {
        resolve(res?.loggedInUser || "testUser");
      });
    } else {
      resolve("testUser");
    }
  });
}

function saveArrowToBackend(user, arrow) {
  if (!arrow.from || !arrow.to) return;
  fetch(`${backendUrl}/save-arrow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, ...arrow })
  }).catch(() => {});
}

// ---------- DRAWING & HELPERS ----------
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
    path.setAttribute('fill', item.color);
    marker.appendChild(path);
    defs.appendChild(marker);
  });

  svg.appendChild(defs);
}

function showArrow(arrowElements, color, markerUrl) {
  const { line, g } = arrowElements;
  svg.appendChild(line);
  svg.appendChild(g);
  line.setAttribute('stroke-opacity', '1.0');
  line.setAttribute('stroke-width', '0.2');
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

  if (!isHKeyHighlighted && !isGKeyHighlighted && !isToggled) {
    line.setAttribute('stroke-opacity', '0');
    line.setAttribute('stroke-width', '0.15');
    line.setAttribute('stroke', color);
    line.setAttribute('marker-end', 'url(#arrowhead-hidden)');
  }
}

function clearSvg() {
  if (svg) {
    svg.innerHTML = '';
    addArrowHeadDefs();
  }
  renderedArrows = [];
}

function clearToggledHighlight() {
  if (toggledHighlight.number) {
    renderedArrows
      .filter(el => el.number.toString() === toggledHighlight.number && el.color === toggledHighlight.color)
      .forEach(hideArrow);
    toggledHighlight = { number: null, color: null };
  }
}

function clearHHighlight() {
  if (isHighlightActive) {
    isHighlightActive = false;
    renderedArrows
      .filter(arrow => arrow.number.toString() === highlightBuffer)
      .forEach(hideArrow);
    highlightBuffer = "";
  }
}

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

function recordNewAction(newState) {
  clearToggledHighlight();
  clearHHighlight();
  clearGHighlight();

  historyLog = historyLog.slice(0, currentHistoryIndex + 1);
  historyLog.push(newState);
  currentHistoryIndex = historyLog.length - 1;

  redrawAllArrows();
  showAllArrowsInCurrentState();

  // --- SAVE ALL NEW ARROWS TO BACKEND ---
  (async () => {
    const user = await getLoggedInUser();
    newState.forEach(arrow => saveArrowToBackend(user, arrow));
  })();
}

function showAllArrowsInCurrentState() {
  clearToggledHighlight();

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

// --- Undo/Redo ---
function undoMove() {
  currentHistoryIndex = Math.max(0, currentHistoryIndex - 1);
  redrawAllArrows();
  showAllArrowsInCurrentState();
}

function redoMove() {
  currentHistoryIndex = Math.min(historyLog.length - 1, currentHistoryIndex + 1);
  redrawAllArrows();
  showAllArrowsInCurrentState();
}

// --- CREATE ARROW ---
function createArrow(from, to, number, color, isCounted, variationID) {
  const { x: x1, y: y1 } = keyToXY(from);
  const { x: x2, y: y2 } = keyToXY(to);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;

  const offset = 0.4;
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
  else markerUrl = 'url(#arrowhead-hidden)';

  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '0.15');
  line.setAttribute('stroke-opacity', '0');
  line.setAttribute('marker-end', 'url(#arrowhead-hidden)');
  svg.appendChild(line);

  const g = document.createElementNS(NS, 'g');
  g.style.pointerEvents = 'auto';
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

  g.addEventListener('mouseenter', () => {
    if (!isCounted) showArrow(arrowElements, COLOR_ROSE, 'url(#arrowhead-rose)');
    else showArrow(arrowElements, color, markerUrl);
  });

  g.addEventListener('mouseleave', () => {
    const isHKeyHighlighted = isHighlightActive && highlightBuffer === arrowElements.number.toString();
    const isGKeyHighlighted = isVariationHighlightActive && variationHighlightBuffer &&
                              arrowElements.variationID === parseInt(variationHighlightBuffer);
    const isToggled = toggledHighlight.number === arrowElements.number.toString() &&
                      toggledHighlight.color === arrowElements.color;

    if (isHKeyHighlighted) showArrow(arrowElements, COLOR_PINK, 'url(#arrowhead-pink)');
    else if (isGKeyHighlighted) showArrow(arrowElements, COLOR_ROSE, 'url(#arrowhead-rose)');
    else if (isToggled) showArrow(arrowElements, color, markerUrl);
    else hideArrow(arrowElements);
  });

  g.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const { number, color } = arrowElements;
    const isAlreadyToggled = toggledHighlight.number === number.toString() &&
                             toggledHighlight.color === color;

    clearToggledHighlight();
    clearHHighlight();
    clearGHighlight();

    if (!isAlreadyToggled) {
      toggledHighlight = { number: number.toString(), color: color };
      renderedArrows
        .filter(el => el.number.toString() === number.toString() && el.color === color)
        .forEach(el => showArrow(el, el.color, el.markerUrl));
    }
  });

  svg.appendChild(g);
  return arrowElements;
}

function redrawAllArrows() {
  clearSvg();
  const activeHistory = historyLog[currentHistoryIndex] || [];
  activeHistory.forEach(move => {
    const elements = createArrow(move.from, move.to, move.number, move.color, move.isCounted, move.variationID);
    renderedArrows.push(elements);
  });
}

// --- INIT ---
function initDrawArrows() {
  const board = getBoard();
  if (!board) return;
  ensureSvg();
  addArrowHeadDefs();

  board.addEventListener('contextmenu', e => e.preventDefault());

  board.addEventListener('mousedown', e => {
    if (e.button === 0) {
      recordNewAction([]);
      return;
    }
    if (e.button !== 2) return;
    currentFrom = pixelToSquare(e.clientX, e.clientY, board);
  });

  board.addEventListener('mouseup', async e => {
    if (e.button !== 2 || !currentFrom) return;
    const toSquare = pixelToSquare(e.clientX, e.clientY, board);
    if (toSquare === currentFrom) {
      currentFrom = null;
      return;
    }

    const currentState = historyLog[currentHistoryIndex] || [];
    const nextState = [...currentState];

    let arrowColor;
    const isCounted = !isWKeyPressed;
    if (isWKeyPressed) arrowColor = COLOR_YELLOW;
    else if (e.shiftKey && e.altKey) arrowColor = COLOR_SHIFT_ALT;
    else if (e.altKey) arrowColor = COLOR_ALT;
    else if (e.ctrlKey) arrowColor = COLOR_CTRL;
    else arrowColor = COLOR_GREEN;

    let numberToDisplay;
    let lastCountedNumber = 0, countedArrowIndex = 0;
    currentState.forEach(move => { if (move.isCounted) { countedArrowIndex++; lastCountedNumber = move.number; }});
    numberToDisplay = isCounted ? Math.ceil((countedArrowIndex + 1) / 2) : (lastCountedNumber === 0 ? 1 : lastCountedNumber);

    const variationID = isWKeyPressed ? currentVariationID : 0;

    const newArrow = {
      from: currentFrom,
      to: toSquare,
      color: arrowColor,
      isCounted: isCounted,
      number: numberToDisplay,
      variationID
    };

    nextState.push(newArrow);

    recordNewAction(nextState);

    currentFrom = null;
  });

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    const isUndoRedo = e.ctrlKey || e.metaKey;

    if (isUndoRedo && key === 'z') { e.preventDefault(); undoMove(); return; }
    if (isUndoRedo && key === 'y') { e.preventDefault(); redoMove(); return; }

    if (key === 'h' && !isUndoRedo) { e.preventDefault(); clearToggledHighlight(); clearGHighlight(); isHighlightActive = true; highlightBuffer = ""; return; }
    if (key === 'g' && !isUndoRedo) { e.preventDefault(); clearToggledHighlight(); clearHHighlight(); isVariationHighlightActive = true; variationHighlightBuffer = ""; return; }

    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 0 && num <= 9) {
      if (isHighlightActive) {
        e.preventDefault();
        const oldBuffer = highlightBuffer;
        highlightBuffer += e.key;
        if (oldBuffer) renderedArrows.filter(arrow => arrow.number.toString() === oldBuffer).forEach(hideArrow);
        renderedArrows.filter(arrow => arrow.number.toString() === highlightBuffer).forEach(elements => showArrow(elements, COLOR_PINK, 'url(#arrowhead-pink)'));
        return;
      } else if (isVariationHighlightActive) {
        e.preventDefault();
        const oldBuffer = variationHighlightBuffer;
        variationHighlightBuffer += e.key;
        const oldVarID = parseInt(oldBuffer);
        if (!isNaN(oldVarID)) renderedArrows.filter(arrow => arrow.variationID === oldVarID).forEach(hideArrow);
        renderedArrows.filter(arrow => arrow.variationID === parseInt(variationHighlightBuffer)).forEach(elements => showArrow(elements, COLOR_ROSE, 'url(#arrowhead-rose)'));
        return;
      } else if (isWKeyPressed) { e.preventDefault(); currentVariationID = num; return; }
    }

    if (key === 'w') isWKeyPressed = true;
    if (key === 'x') recordNewAction([]);
  });

  window.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    if (key === 'w') isWKeyPressed = false;
    if (key === 'h') { e.preventDefault(); clearHHighlight(); }
    if (key === 'g') { e.preventDefault(); clearGHighlight(); }
  });
}

setTimeout(initDrawArrows, 2000);
