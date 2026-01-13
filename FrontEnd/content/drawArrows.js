const NS = 'http://www.w3.org/2000/svg';
let svg = null;
let currentFrom = null;
let isWKeyPressed = false;

// --- HIGHLIGHT & VARIATION LOGIC ---
let isHighlightActive = false;
let highlightBuffer = "";
let isVariationHighlightActive = false;
let variationHighlightBuffer = "";
let currentVariationID = 0;
let toggledHighlight = { number: null, color: null };

// --- STATE & RENDERING ---
let renderedArrows = [];
let historyLog = [[]];
let currentHistoryIndex = 0;

// --- BOARD MANAGEMENT ---
let currentBoardId = crypto.randomUUID?.() || ('board-' + Date.now() + Math.random().toString(36).slice(2));
let currentArrowsOnBoard = [];

// Colors
const COLOR_GREEN     = 'green';
const COLOR_CTRL      = 'red';
const COLOR_ALT       = 'blue';
const COLOR_SHIFT_ALT = 'orange';
const COLOR_YELLOW    = 'yellow';
const COLOR_PINK      = 'deeppink';
const COLOR_ROSE      = 'hotpink';

// Backend
const backendUrl = "http://localhost:5000/api";

// Arrowhead mapping
const ARROWHEAD_MAP = {
  [COLOR_GREEN]:     'arrowhead-green',
  [COLOR_CTRL]:      'arrowhead-red',
  [COLOR_ALT]:       'arrowhead-blue',
  [COLOR_SHIFT_ALT]: 'arrowhead-orange',
  [COLOR_YELLOW]:    'arrowhead-yellow',
  [COLOR_PINK]:      'arrowhead-pink',
  [COLOR_ROSE]:      'arrowhead-rose',
  'hidden':          'arrowhead-hidden'
};

// ────────────────────────────────────────────────
// Missing highlight clearing functions (added back)
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

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

function getBoard() {
  return document.querySelector('cg-board') || document.querySelector('.cg-board');
}

function ensureSvg() {
  const board = getBoard();
  if (!board) return null;
  if (svg) return svg;

  const parent = board.parentElement;
  if (!parent) return null;

  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-0.5 -0.5 8 8');
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '10';
  svg.classList.add('checkm8-arrows');

  parent.style.position = 'relative';
  parent.appendChild(svg);

  addArrowHeadDefs();
  return svg;
}

function pixelToSquare(x, y, board) {
  const rect = board.getBoundingClientRect();
  const size = rect.width / 8;
  const file = Math.floor((x - rect.left) / size);
  const rank = 7 - Math.floor((y - rect.top) / size);
  return String.fromCharCode(97 + file) + (rank + 1);
}

function keyToXY(key) {
  const file = key.charCodeAt(0) - 97;
  const rank = parseInt(key[1]) - 1;
  return { x: file, y: 7 - rank };
}

function getLoggedInUser() {
  return new Promise(resolve => {
    chrome.storage?.sync?.get(["loggedInUser"], res => {
      resolve(res?.loggedInUser || null);
    });
  });
}

async function getCurrentFEN() {
  let fen = document.querySelector('input.copyable')?.value?.trim();
  if (fen && fen.includes('/')) return fen;

  fen = document.querySelector('cg-helper')?.getAttribute('fen');
  if (fen) return fen;

  return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
}

async function analyzeArrow(fromSq, toSq) {
  const fen = await getCurrentFEN();
  const move = fromSq + toSq;

  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: "ANALYZE_FEN",
      fen,
      requestedMove: move
    }, response => {
      if (chrome.runtime.lastError || !response || !response.bestMoves) {
        console.warn("Stockfish analysis failed", chrome.runtime.lastError);
        return resolve('unknown');
      }

      const { bestMoves = [], scores = [] } = response;

      if (bestMoves[0] === move) {
        resolve('best');
      } else if (bestMoves.includes(move)) {
        const idx = bestMoves.indexOf(move);
        const cpLoss = Math.abs(scores[0] - scores[idx]);
        resolve(cpLoss <= 50 ? 'good' : 'bad');
      } else {
        resolve('bad');
      }
    });
  });
}

async function saveArrowToBackend(arrow) {
  const user = await getLoggedInUser();
  if (!user || !arrow.from || !arrow.to) return;

  try {
    await fetch(`${backendUrl}/save-arrow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user,
        boardId: currentBoardId,
        from: arrow.from,
        to: arrow.to,
        color: arrow.color,
        number: arrow.number,
        variationID: arrow.variationID,
        analysis: arrow.analysis || 'unknown'
      })
    });
  } catch (err) {
    console.warn("Failed to save arrow", err);
  }
}

async function saveCurrentBoard() {
  const user = await getLoggedInUser();
  if (!user) return;

  const fen = await getCurrentFEN();

  try {
    await fetch(`${backendUrl}/save-board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, boardId: currentBoardId, fen })
    });
  } catch (err) {
    console.warn("Failed to save board", err);
  }
}

// ────────────────────────────────────────────────
// Arrow Head Definitions – made a bit bigger
// ────────────────────────────────────────────────

function addArrowHeadDefs() {
  if (!svg || svg.querySelector('defs')) return;

  const defs = document.createElementNS(NS, 'defs');

  Object.entries(ARROWHEAD_MAP).forEach(([key, id]) => {
    if (id === 'arrowhead-hidden') return;

    const color = key;
    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerWidth', '5.5');   // increased size
    marker.setAttribute('markerHeight', '5.5');
    marker.setAttribute('refX', '5.0');          // adjusted for larger head
    marker.setAttribute('refY', '2.75');

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M0,0 L0,5.5 L5.5,2.75 Z');  // scaled up triangle
    path.setAttribute('fill', color);
    marker.appendChild(path);
    defs.appendChild(marker);
  });

  const hidden = document.createElementNS(NS, 'marker');
  hidden.setAttribute('id', 'arrowhead-hidden');
  hidden.setAttribute('orient', 'auto');
  hidden.setAttribute('markerWidth', '1');
  hidden.setAttribute('markerHeight', '1');
  hidden.setAttribute('refX', '0.5');
  hidden.setAttribute('refY', '0.5');
  defs.appendChild(hidden);

  svg.appendChild(defs);
}

// ────────────────────────────────────────────────
// Arrow Rendering
// ────────────────────────────────────────────────

function createArrow(from, to, number, color, isCounted, variationID) {
  const svgEl = ensureSvg();
  if (!svgEl) return null;

  const { x: x1, y: y1 } = keyToXY(from);
  const { x: x2, y: y2 } = keyToXY(to);

  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const offset = 0.38;  // slightly adjusted for larger head
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const perp = angle + Math.PI / 2;
  const nx = cx + offset * Math.cos(perp);
  const ny = cy + offset * Math.sin(perp);

  const markerId = ARROWHEAD_MAP[color] || 'arrowhead-hidden';
  const markerUrl = `url(#${markerId})`;

  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '0.16');
  line.setAttribute('stroke-opacity', '0');
  line.setAttribute('marker-end', 'url(#arrowhead-hidden)');

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
  circle.setAttribute('r', '0.25');  // slightly larger bubble to match head
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', '0.03');
  g.appendChild(circle);

  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', nx);
  text.setAttribute('y', ny + 0.015);
  text.setAttribute('fill', 'white');
  text.setAttribute('font-size', '0.28');  // slightly larger number
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.textContent = number;
  g.appendChild(text);

  const arrowElements = {
    line,
    g,
    number,
    color,
    markerUrl,
    isCounted,
    variationID,
    from,
    to
  };

  g.addEventListener('mouseenter', () => {
    if (!isCounted) {
      showArrow(arrowElements, COLOR_ROSE, 'url(#arrowhead-rose)');
    } else {
      showArrow(arrowElements, color, markerUrl);
    }
  });

  g.addEventListener('mouseleave', () => {
    const isH = isHighlightActive && highlightBuffer === arrowElements.number.toString();
    const isG = isVariationHighlightActive && variationHighlightBuffer &&
                arrowElements.variationID === parseInt(variationHighlightBuffer);
    const isT = toggledHighlight.number === arrowElements.number.toString() &&
                toggledHighlight.color === arrowElements.color;

    if (isH) showArrow(arrowElements, COLOR_PINK, 'url(#arrowhead-pink)');
    else if (isG) showArrow(arrowElements, COLOR_ROSE, 'url(#arrowhead-rose)');
    else if (isT) showArrow(arrowElements, color, markerUrl);
    else hideArrow(arrowElements);
  });

  g.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();

    const { number, color, from, to, variationID, isCounted } = arrowElements;

    // Shift + click → delete this specific arrow
    if (e.shiftKey) {
      const currentState = [...(historyLog[currentHistoryIndex] || [])];
      const indexToRemove = currentState.findIndex(a =>
        a.from === from &&
        a.to === to &&
        a.number === number &&
        a.color === color &&
        a.variationID === variationID &&
        a.isCounted === isCounted
      );

      if (indexToRemove !== -1) {
        currentState.splice(indexToRemove, 1);
        recordNewAction(currentState);

        const trackIndex = currentArrowsOnBoard.findIndex(a =>
          a.from === from && a.to === to && a.number === number
        );
        if (trackIndex !== -1) currentArrowsOnBoard.splice(trackIndex, 1);

        // Visual feedback
        g.style.transition = 'opacity 0.4s';
        g.style.opacity = '0.15';
        setTimeout(() => {
          line.remove();
          g.remove();
        }, 450);
      }

      return;
    }

    // Normal toggle behavior
    clearToggledHighlight();
    clearHHighlight();
    clearGHighlight();

    const already = toggledHighlight.number === number.toString() &&
                    toggledHighlight.color === color;

    if (!already) {
      toggledHighlight = { number: number.toString(), color };
      showArrow(arrowElements, color, markerUrl);
    }
  });

  svgEl.appendChild(line);
  svgEl.appendChild(g);

  return arrowElements;
}

function showArrow(el, color, marker) {
  el.line.setAttribute('stroke', color);
  el.line.setAttribute('stroke-opacity', '1');
  el.line.setAttribute('stroke-width', '0.2');
  el.line.setAttribute('marker-end', marker);
}

function hideArrow(el) {
  const isH = isHighlightActive && highlightBuffer === el.number.toString();
  const isG = isVariationHighlightActive && variationHighlightBuffer &&
              el.variationID === parseInt(variationHighlightBuffer);
  const isT = toggledHighlight.number === el.number.toString() &&
              toggledHighlight.color === el.color;

  if (!isH && !isG && !isT) {
    el.line.setAttribute('stroke-opacity', '0');
    el.line.setAttribute('marker-end', 'url(#arrowhead-hidden)');
  }
}

function clearSvg() {
  if (svg) {
    svg.innerHTML = '';
    addArrowHeadDefs();
  }
  renderedArrows = [];
}

function redrawAllArrows() {
  clearSvg();
  const state = historyLog[currentHistoryIndex] || [];
  state.forEach(a => {
    const el = createArrow(a.from, a.to, a.number, a.color, a.isCounted, a.variationID);
    if (el) renderedArrows.push(el);
  });
  showAllArrowsInCurrentState();
}

function showAllArrowsInCurrentState() {
  renderedArrows.forEach(el => {
    const isH = isHighlightActive && highlightBuffer === el.number.toString();
    const isG = isVariationHighlightActive && variationHighlightBuffer &&
                el.variationID === parseInt(variationHighlightBuffer);

    if (isH) showArrow(el, COLOR_PINK, 'url(#arrowhead-pink)');
    else if (isG) showArrow(el, COLOR_ROSE, 'url(#arrowhead-rose)');
    else showArrow(el, el.color, el.markerUrl);
  });
}

function recordNewAction(newState) {
  historyLog = historyLog.slice(0, currentHistoryIndex + 1);
  historyLog.push(newState);
  currentHistoryIndex = historyLog.length - 1;
  redrawAllArrows();
}

// ────────────────────────────────────────────────
// Undo / Redo
// ────────────────────────────────────────────────

function undoMove() {
  if (currentHistoryIndex <= 0) return;
  currentHistoryIndex--;
  redrawAllArrows();
}

function redoMove() {
  if (currentHistoryIndex >= historyLog.length - 1) return;
  currentHistoryIndex++;
  redrawAllArrows();
}

// ────────────────────────────────────────────────
// Drawing + deletion logic
// ────────────────────────────────────────────────

let isDrawing = false;
let previewLine = null;
let startSquare = null;

function initDrawArrows() {
  const board = getBoard();
  if (!board) return;

  ensureSvg();

  board.addEventListener('contextmenu', e => e.preventDefault());

  // Right-click drag to draw arrow
  board.addEventListener('mousedown', e => {
    if (e.button !== 2) return;
    e.preventDefault();

    startSquare = pixelToSquare(e.clientX, e.clientY, board);
    if (!startSquare) return;

    isDrawing = true;

    const svgEl = ensureSvg();
    if (svgEl) {
      previewLine = document.createElementNS(NS, 'line');
      const xy = keyToXY(startSquare);
      previewLine.setAttribute('x1', xy.x);
      previewLine.setAttribute('y1', xy.y);
      previewLine.setAttribute('x2', xy.x);
      previewLine.setAttribute('y2', xy.y);
      previewLine.setAttribute('stroke', '#888');
      previewLine.setAttribute('stroke-width', '0.16');
      previewLine.setAttribute('stroke-dasharray', '0.25,0.12');
      previewLine.setAttribute('opacity', '0.7');
      svgEl.appendChild(previewLine);
    }
  });

  document.addEventListener('mousemove', e => {
    if (!isDrawing || !previewLine) return;
    const board = getBoard();
    if (!board) return;

    const sq = pixelToSquare(e.clientX, e.clientY, board);
    if (!sq) return;

    const xy = keyToXY(sq);
    previewLine.setAttribute('x2', xy.x);
    previewLine.setAttribute('y2', xy.y);
  });

  document.addEventListener('mouseup', async e => {
    if (e.button !== 2 || !isDrawing) return;
    isDrawing = false;

    if (previewLine) {
      previewLine.remove();
      previewLine = null;
    }

    const board = getBoard();
    if (!board || !startSquare) return;

    const endSquare = pixelToSquare(e.clientX, e.clientY, board);
    if (!endSquare || endSquare === startSquare) {
      startSquare = null;
      return;
    }

    const currentState = historyLog[currentHistoryIndex] || [];
    const nextState = [...currentState];

    const isCounted = !isWKeyPressed;
    let arrowColor = COLOR_GREEN;

    if (isWKeyPressed) arrowColor = COLOR_YELLOW;
    else if (e.shiftKey && e.altKey) arrowColor = COLOR_SHIFT_ALT;
    else if (e.altKey) arrowColor = COLOR_ALT;
    else if (e.ctrlKey) arrowColor = COLOR_CTRL;

    let lastCountedNumber = 0;
    let countedCount = 0;
    currentState.forEach(m => {
      if (m.isCounted) {
        countedCount++;
        lastCountedNumber = m.number;
      }
    });

    const numberToDisplay = isCounted
      ? Math.ceil((countedCount + 1) / 2)
      : (lastCountedNumber || 1);

    const newArrow = {
      from: startSquare,
      to: endSquare,
      color: arrowColor,
      number: numberToDisplay,
      isCounted,
      variationID: isWKeyPressed ? currentVariationID : 0,
      analysis: 'unknown'
    };

    newArrow.analysis = await analyzeArrow(newArrow.from, newArrow.to);

    nextState.push(newArrow);
    recordNewAction(nextState);

    currentArrowsOnBoard.push(newArrow);
    await saveArrowToBackend(newArrow);

    const countedArrows = nextState.filter(a => a.isCounted).length;
    if (countedArrows >= 20) {
      await saveCurrentBoard();
      currentBoardId = crypto.randomUUID?.() || ('board-' + Date.now() + Math.random().toString(36).slice(2));
      currentArrowsOnBoard = [];
      historyLog = [[]];
      currentHistoryIndex = 0;
      clearSvg();
      setTimeout(() => window.location.href = 'https://lichess.org/analysis', 800);
    }

    startSquare = null;
  });

  // ─── LEFT CLICK on empty board area → DELETE ALL ARROWS ───
  board.addEventListener('click', e => {
    if (e.button !== 0) return;
    if (e.target.closest('g')) return; // ignore bubble clicks

    if (historyLog[currentHistoryIndex]?.length > 0) {
      historyLog = [[]];
      currentHistoryIndex = 0;
      currentArrowsOnBoard = [];
      clearSvg();

      console.log("All arrows cleared by board click");
    }
  });

  // Keyboard handlers
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    const isUndoRedo = e.ctrlKey || e.metaKey;

    if (isUndoRedo && key === 'z') { e.preventDefault(); undoMove(); return; }
    if (isUndoRedo && key === 'y') { e.preventDefault(); redoMove(); return; }

    if (key === 'h' && !isUndoRedo) {
      e.preventDefault();
      clearToggledHighlight();
      clearGHighlight();
      isHighlightActive = true;
      highlightBuffer = "";
      return;
    }

    if (key === 'g' && !isUndoRedo) {
      e.preventDefault();
      clearToggledHighlight();
      clearHHighlight();
      isVariationHighlightActive = true;
      variationHighlightBuffer = "";
      return;
    }

    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 0 && num <= 9) {
      if (isHighlightActive) {
        e.preventDefault();
        const old = highlightBuffer;
        highlightBuffer += e.key;
        if (old) renderedArrows.filter(a => a.number.toString() === old).forEach(hideArrow);
        renderedArrows.filter(a => a.number.toString() === highlightBuffer)
          .forEach(el => showArrow(el, COLOR_PINK, 'url(#arrowhead-pink)'));
        return;
      }
      if (isVariationHighlightActive) {
        e.preventDefault();
        const old = variationHighlightBuffer;
        variationHighlightBuffer += e.key;
        const oldId = parseInt(old);
        if (!isNaN(oldId)) renderedArrows.filter(a => a.variationID === oldId).forEach(hideArrow);
        renderedArrows.filter(a => a.variationID === parseInt(variationHighlightBuffer))
          .forEach(el => showArrow(el, COLOR_ROSE, 'url(#arrowhead-rose)'));
        return;
      }
      if (isWKeyPressed) {
        e.preventDefault();
        currentVariationID = num;
        return;
      }
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

// Board position change detection
let lastKnownFen = null;

setInterval(async () => {
  const currentFen = await getCurrentFEN();
  if (lastKnownFen && currentFen !== lastKnownFen && currentArrowsOnBoard.length > 0) {
    console.log("Board position changed → resetting arrows");
    currentArrowsOnBoard = [];
    historyLog = [[]];
    currentHistoryIndex = 0;
    clearSvg();
  }
  lastKnownFen = currentFen;
}, 2200);

// Start
const observer = new MutationObserver(() => {
  if (getBoard() && !svg) {
    chrome.storage.sync.get(["loggedInUser"], res => {
      if (res.loggedInUser) initDrawArrows();
    });
  }
});

observer.observe(document.body, { childList: true, subtree: true });

setTimeout(() => {
  if (getBoard()) initDrawArrows();
}, 1500);