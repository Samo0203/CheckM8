const NS = 'http://www.w3.org/2000/svg';
let svg = null;
let currentFrom = null;
let isWKeyPressed = false;
let isBKeyPressed = false; 

// --- HIGHLIGHT & VARIATION LOGIC ---
let isHighlightActive = false; // "H" key state
let highlightBuffer = "";
let isVariationHighlightActive = false; // "G" key state
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

// Tracks the total number of "plies" (half-moves) accumulated from previous boards
let globalPlyCount = 0; 

// Tracks if the CURRENT board specifically started with a B-skip
let currentBoardStartedWithB = false;

// Colors
const COLOR_GREEN     = 'green';
const COLOR_CTRL      = 'red';
const COLOR_ALT       = 'blue';
const COLOR_SHIFT_ALT = 'orange';
const COLOR_YELLOW    = 'yellow';
const COLOR_PINK      = 'deeppink'; 
const COLOR_ROSE      = 'hotpink';

// Backend base URL
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
// Constants for Perfect Lichess Sizing
// ────────────────────────────────────────────────

const STROKE_WIDTH_MAIN = 0.15625; 
const STROKE_WIDTH_SHINE = 0.21;
const RADIUS_MAIN = 0.25;

const STROKE_WIDTH_VAR = 0.08; 
const STROKE_WIDTH_SHINE_VAR = 0.13;
const RADIUS_VAR = 0.25; 

const HEAD_WIDTH_MAIN = 0.75;      
const HEAD_HEIGHT_MAIN = 0.75;
const HEAD_REF_X_MAIN = 0.6;       

const HEAD_WIDTH_SHINE = 0.85;     
const HEAD_HEIGHT_SHINE = 0.85;
const HEAD_REF_X_SHINE = 0.65;    

// ────────────────────────────────────────────────
// UI Injection (Controls)
// ────────────────────────────────────────────────
function injectUI() {
  if (document.getElementById('checkm8-controls')) return;

  const container = document.createElement('div');
  container.id = 'checkm8-controls';
  container.style.position = 'fixed';
  container.style.top = '80px'; 
  container.style.right = '20px';
  container.style.zIndex = '99999';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';

  const btnNew = document.createElement('button');
  btnNew.innerText = 'New Board';
  btnNew.style.padding = '10px 14px';
  btnNew.style.background = '#3692e7'; 
  btnNew.style.color = 'white';
  btnNew.style.border = 'none';
  btnNew.style.borderRadius = '4px';
  btnNew.style.cursor = 'pointer';
  btnNew.style.fontWeight = 'bold';
  btnNew.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
  btnNew.onclick = handleNewBoard;

  const btnShow = document.createElement('button');
  btnShow.innerText = 'Show Boards'; 
  btnShow.style.padding = '10px 14px';
  btnShow.style.background = '#629924'; 
  btnShow.style.color = 'white';
  btnShow.style.border = 'none';
  btnShow.style.borderRadius = '4px';
  btnShow.style.cursor = 'pointer';
  btnShow.style.fontWeight = 'bold';
  btnShow.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
  btnShow.onclick = handleShowBoards;

  container.appendChild(btnNew);
  container.appendChild(btnShow);
  document.body.appendChild(container);
}

async function handleNewBoard() {
  await saveCurrentBoard();
  
  const state = historyLog[currentHistoryIndex] || [];
  let mainArrowCount = 0;
  state.forEach(a => {
      if (!a.isVariation && a.isCounted) {
          mainArrowCount++;
      }
  });

  const offset = currentBoardStartedWithB ? 1 : 0;
  globalPlyCount += mainArrowCount + offset;

  currentBoardStartedWithB = false;
  currentBoardId = crypto.randomUUID?.() || ('board-' + Date.now() + Math.random().toString(36).slice(2));
  currentArrowsOnBoard = [];
  historyLog = [[]];
  currentHistoryIndex = 0;
  
  clearSvg();
  
  const nextMove = Math.ceil((globalPlyCount + 1) / 2);
  console.log(`New Board. Continuing from Ply: ${globalPlyCount}. Next Move: ${nextMove}`);
}

async function handleShowBoards() {
  await saveCurrentBoard();
  const viewUrl = `http://localhost:5000/view/${currentBoardId}`;
  window.open(viewUrl, '_blank');
}

// ────────────────────────────────────────────────
// Highlight clearing functions
// ────────────────────────────────────────────────
function clearToggledHighlight() {
  if (toggledHighlight.number) {
    renderedArrows
      .filter(el => el.number.toString() === toggledHighlight.number && el.color === toggledHighlight.color)
      .forEach(hideArrow);
    toggledHighlight = { number: null, color: null };
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
  if (svg) {
      injectUI(); 
      return svg;
  }

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
  injectUI();
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

function proxyApiCall(endpoint, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: "PROXY_API_CALL",
      endpoint,
      method,
      body
    }, response => {
      if (response?.success) {
        resolve(response.data);
      } else {
        console.warn(`Proxy call failed for /${endpoint}:`, response?.error);
        reject(new Error(response?.error || 'Proxy request failed'));
      }
    });
  });
}

async function saveArrowToBackend(arrow) {
  const user = await getLoggedInUser();
  if (!user || !arrow.from || !arrow.to) return false;

  const payload = {
    user,
    boardId: currentBoardId,
    from: arrow.from,
    to: arrow.to,
    color: arrow.color,
    number: arrow.number,
    variationID: arrow.variationID,
    analysis: arrow.analysis || 'unknown'
  };

  try {
    await proxyApiCall("save-arrow", "POST", payload);
    return true;
  } catch (err) {
    console.warn("Failed to save arrow via proxy", err);
    return false;
  }
}

async function saveCurrentBoard() {
  const user = await getLoggedInUser();
  if (!user) return false;
  const fen = await getCurrentFEN();
  try {
    await proxyApiCall("save-board", "POST", { user, boardId: currentBoardId, fen });
    console.log("Board saved.");
    return true;
  } catch (err) {
    return false;
  }
}

// ────────────────────────────────────────────────
// Arrow Head Definitions
// ────────────────────────────────────────────────

function addArrowHeadDefs() {
  if (!svg || svg.querySelector('defs')) return;

  const defs = document.createElementNS(NS, 'defs');

  Object.entries(ARROWHEAD_MAP).forEach(([key, id]) => {
    if (id === 'arrowhead-hidden') return;

    const color = key;
    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerWidth', HEAD_WIDTH_MAIN.toString()); 
    marker.setAttribute('markerHeight', HEAD_HEIGHT_MAIN.toString());
    marker.setAttribute('refX', HEAD_REF_X_MAIN.toString()); 
    marker.setAttribute('refY', (HEAD_HEIGHT_MAIN / 2).toString());

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `M0,0 L0,${HEAD_HEIGHT_MAIN} L${HEAD_WIDTH_MAIN},${HEAD_HEIGHT_MAIN/2} Z`);
    path.setAttribute('fill', color);
    marker.appendChild(path);
    defs.appendChild(marker);
  });

  // --- WHITE Shine Marker (For Main Lines) ---
  const shineMarker = document.createElementNS(NS, 'marker');
  shineMarker.setAttribute('id', 'arrowhead-shine');
  shineMarker.setAttribute('markerUnits', 'userSpaceOnUse'); 
  shineMarker.setAttribute('orient', 'auto');
  shineMarker.setAttribute('markerWidth', HEAD_WIDTH_SHINE.toString()); 
  shineMarker.setAttribute('markerHeight', HEAD_HEIGHT_SHINE.toString());
  shineMarker.setAttribute('refX', HEAD_REF_X_SHINE.toString());
  shineMarker.setAttribute('refY', (HEAD_HEIGHT_SHINE / 2).toString());
  
  const shinePath = document.createElementNS(NS, 'path');
  shinePath.setAttribute('d', `M0,0 L0,${HEAD_HEIGHT_SHINE} L${HEAD_WIDTH_SHINE},${HEAD_HEIGHT_SHINE/2} Z`);
  shinePath.setAttribute('fill', 'white'); 
  shineMarker.appendChild(shinePath);
  defs.appendChild(shineMarker);

  // --- BLACK Shine Marker (For Variations) --- [NEW]
  const shineBlackMarker = document.createElementNS(NS, 'marker');
  shineBlackMarker.setAttribute('id', 'arrowhead-shine-black');
  shineBlackMarker.setAttribute('markerUnits', 'userSpaceOnUse'); 
  shineBlackMarker.setAttribute('orient', 'auto');
  shineBlackMarker.setAttribute('markerWidth', HEAD_WIDTH_SHINE.toString()); 
  shineBlackMarker.setAttribute('markerHeight', HEAD_HEIGHT_SHINE.toString());
  shineBlackMarker.setAttribute('refX', HEAD_REF_X_SHINE.toString());
  shineBlackMarker.setAttribute('refY', (HEAD_HEIGHT_SHINE / 2).toString());
  
  const shineBlackPath = document.createElementNS(NS, 'path');
  shineBlackPath.setAttribute('d', `M0,0 L0,${HEAD_HEIGHT_SHINE} L${HEAD_WIDTH_SHINE},${HEAD_HEIGHT_SHINE/2} Z`);
  shineBlackPath.setAttribute('fill', 'black'); 
  shineBlackMarker.appendChild(shineBlackPath);
  defs.appendChild(shineBlackMarker);

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

function getAnalysisStyle(analysis) {
  switch (analysis) {
    case 'best': return { borderColor: '#2196f3', title: 'Best move' };
    case 'good': return { borderColor: '#4caf50', title: 'Good move' };
    case 'bad':  return { borderColor: '#f44336', title: 'Bad move' };
    default:     return { borderColor: '#9e9e9e', title: 'Unknown' };
  }
}

// ────────────────────────────────────────────────
// Overlap Detection
// ────────────────────────────────────────────────

function checkOverlaps() {
  renderedArrows.forEach(arrow => {
    if (arrow.ringGroup) arrow.ringGroup.style.opacity = '1';
    arrow.isOverlapped = false;
  });

  for (let i = renderedArrows.length - 1; i >= 0; i--) {
    const topArrow = renderedArrows[i];
    for (let j = i - 1; j >= 0; j--) {
      const bottomArrow = renderedArrows[j];
      const dx = topArrow.ringCoords.x - bottomArrow.ringCoords.x;
      const dy = topArrow.ringCoords.y - bottomArrow.ringCoords.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      const radius = topArrow.isVariation ? RADIUS_VAR * 2.2 : RADIUS_MAIN * 2.2;
      
      if (dist < radius) { 
        bottomArrow.isOverlapped = true;
        if (bottomArrow.ringGroup) {
          bottomArrow.ringGroup.style.opacity = '0'; 
        }
      }
    }
  }
}

// ────────────────────────────────────────────────
// Arrow Rendering
// ────────────────────────────────────────────────

function createArrow(from, to, number, color, isCounted, variationID, analysis = 'unknown', labelText = null) {
  const svgEl = ensureSvg();
  if (!svgEl) return null;

  const { x: x1, y: y1 } = keyToXY(from);
  const { x: x2, y: y2 } = keyToXY(to);

  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const offset = 0.38;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const perp = angle + Math.PI / 2;
  const nx = cx + offset * Math.cos(perp);
  const ny = cy + offset * Math.sin(perp);

  const markerId = ARROWHEAD_MAP[color] || 'arrowhead-hidden';
  const markerUrl = `url(#${markerId})`;

  // --- VARIATION LOGIC ---
  const isVariation = variationID > 0;
  const activeStroke = isVariation ? STROKE_WIDTH_VAR : STROKE_WIDTH_MAIN;
  const activeShineWidth = isVariation ? STROKE_WIDTH_SHINE_VAR : STROKE_WIDTH_SHINE;
  const activeRadius = RADIUS_MAIN; 

  // Wrapper Group
  const arrowWrapper = document.createElementNS(NS, 'g');
  arrowWrapper.classList.add('arrow-wrapper');
  arrowWrapper.style.pointerEvents = 'auto'; 
  
  // 1. Line
  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', activeStroke); 
  line.setAttribute('stroke-opacity', '1');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('marker-end', markerUrl);
  arrowWrapper.appendChild(line);

  // 2. Ring Group
  const ringGroup = document.createElementNS(NS, 'g');
  ringGroup.style.cursor = 'pointer';
  ringGroup.style.pointerEvents = 'auto'; 
  ringGroup.style.transition = 'opacity 0.2s'; 

  const tagLine = document.createElementNS(NS, 'line');
  tagLine.setAttribute('x1', cx);
  tagLine.setAttribute('y1', cy);
  tagLine.setAttribute('x2', nx);
  tagLine.setAttribute('y2', ny);
  tagLine.setAttribute('stroke', 'white');
  tagLine.setAttribute('stroke-width', '0.05');
  ringGroup.appendChild(tagLine);

  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', nx);
  circle.setAttribute('cy', ny);
  circle.setAttribute('r', activeRadius.toString());
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', '0.03');
  ringGroup.appendChild(circle);

  const analysisStyle = getAnalysisStyle(analysis);
  circle.setAttribute('stroke', analysisStyle.borderColor);
  circle.setAttribute('stroke-width', '0.08');
  ringGroup.setAttribute('title', analysisStyle.title);

  // 3. TEXT RENDERING
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', nx);
  text.setAttribute('y', ny + 0.015);
  text.setAttribute('fill', 'white');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');

  if (isVariation) {
      // Variation: Move# + VarID (Subscript)
      const tsMove = document.createElementNS(NS, 'tspan');
      tsMove.textContent = number;
      tsMove.setAttribute('font-size', '0.20'); 

      const tsVar = document.createElementNS(NS, 'tspan');
      tsVar.textContent = variationID; 
      tsVar.setAttribute('font-size', '0.10'); 
      tsVar.setAttribute('dy', '0.06');
      
      text.appendChild(tsMove);
      text.appendChild(tsVar);
  } else {
      // Main Line: Use labelText (1W/1B) if available, else number
      text.setAttribute('font-size', '0.28');
      text.textContent = labelText ? labelText : number;
  }
  ringGroup.appendChild(text);

  arrowWrapper.appendChild(ringGroup);

  // ────────────────────────────────────────────────────────
  // SHINE ELEMENT
  // ────────────────────────────────────────────────────────
  const shine = line.cloneNode(true);
  
  // Decide shine color based on arrow type (Black for variations, White for main)
  if (isVariation) {
      shine.setAttribute('stroke', 'black');
      shine.setAttribute('marker-end', 'url(#arrowhead-shine-black)');
  } else {
      shine.setAttribute('stroke', 'white');
      shine.setAttribute('marker-end', 'url(#arrowhead-shine)');
  }
  
  shine.setAttribute('stroke-width', activeShineWidth);
  shine.style.opacity = '0'; 
  shine.style.pointerEvents = 'none'; 
  shine.style.transition = 'opacity 0.2s'; 
  arrowWrapper.insertBefore(shine, line);

  const arrowElements = {
    line,
    ringGroup,
    arrowWrapper,
    shine, 
    number,
    color,
    markerUrl,
    isCounted,
    variationID,
    isVariation,
    from,
    to,
    analysis,
    labelText, // Persist label
    ringCoords: { x: nx, y: ny },
    isOverlapped: false
  };

  // --- HOVER LOGIC ---

  const onArrowEnter = () => {
    if (arrowWrapper.nextSibling) {
      arrowWrapper.parentNode.appendChild(arrowWrapper);
    }
    ringGroup.style.opacity = '1';
  };

  const onRingEnter = (e) => {
    e.stopPropagation();
    shine.style.opacity = '0.8';
  };

  const onRingLeave = () => {
    shine.style.opacity = '0';
  };

  const onArrowLeave = () => {
    shine.style.opacity = '0';

    if (arrowWrapper.parentNode) {
      arrowWrapper.parentNode.prepend(arrowWrapper);
    }

    if (arrowElements.isOverlapped) {
      ringGroup.style.opacity = '0';
    }

    const isT = toggledHighlight.number === arrowElements.number.toString() &&
                toggledHighlight.color === arrowElements.color;

    if (isT) showArrow(arrowElements, color, markerUrl);
    else showArrow(arrowElements, color, markerUrl);
  };

  arrowWrapper.addEventListener('mouseenter', onArrowEnter);
  arrowWrapper.addEventListener('mouseleave', onArrowLeave);
  
  ringGroup.addEventListener('mouseenter', onRingEnter);
  ringGroup.addEventListener('mouseleave', onRingLeave);

  // Click Handler
  arrowWrapper.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey) {
      const currentState = [...(historyLog[currentHistoryIndex] || [])];
      const indexToRemove = currentState.findIndex(a =>
        a.from === from && a.to === to && a.number === number
      );

      if (indexToRemove !== -1) {
        currentState.splice(indexToRemove, 1);
        recordNewAction(currentState);
        
        const trackIndex = currentArrowsOnBoard.findIndex(a =>
          a.from === from && a.to === to && a.number === number
        );
        if (trackIndex !== -1) currentArrowsOnBoard.splice(trackIndex, 1);

        arrowWrapper.style.opacity = '0';
        setTimeout(() => arrowWrapper.remove(), 300);
      }
      return;
    }

    clearToggledHighlight();

    const already = toggledHighlight.number === number.toString() &&
                    toggledHighlight.color === color;

    if (!already) {
      toggledHighlight = { number: number.toString(), color };
      showArrow(arrowElements, color, markerUrl);
    }
  });

  svgEl.appendChild(arrowWrapper);
  return arrowElements;
}

function showArrow(el, color, marker) {
  el.line.setAttribute('stroke', color);
  el.line.setAttribute('stroke-opacity', '1');
  el.line.setAttribute('marker-end', marker);
  if (el.ringGroup) el.ringGroup.style.display = 'block';
}

function hideArrow(el) {
  // G+Number check
  const isG = isVariationHighlightActive && variationHighlightBuffer &&
              el.variationID === parseInt(variationHighlightBuffer);
  
  const isT = toggledHighlight.number === el.number.toString() &&
              toggledHighlight.color === el.color;

  if (!isG && !isT) {
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
    const el = createArrow(a.from, a.to, a.number, a.color, a.isCounted, a.variationID, a.analysis, a.labelText);
    if (el) renderedArrows.push(el);
  });
  checkOverlaps();
  showAllArrowsInCurrentState();
}

function showAllArrowsInCurrentState() {
  renderedArrows.forEach(el => {
    const isG = isVariationHighlightActive && variationHighlightBuffer &&
                el.variationID === parseInt(variationHighlightBuffer);
    
    if (isG) showArrow(el, COLOR_ROSE, 'url(#arrowhead-rose)');
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
// Drawing Logic
// ────────────────────────────────────────────────
let isDrawing = false;
let previewLine = null;
let startSquare = null;

function initDrawArrows() {
  const board = getBoard();
  if (!board) return;

  ensureSvg();

  board.addEventListener('contextmenu', e => e.preventDefault());

  board.addEventListener('mousedown', e => {
    if (e.button !== 2) return;
    e.preventDefault();

    startSquare = pixelToSquare(e.clientX, e.clientY, board);
    if (!startSquare) return;

    isDrawing = true;

    const svgEl = ensureSvg();
    if (svgEl) {
      const strokeWidth = isWKeyPressed ? STROKE_WIDTH_VAR : STROKE_WIDTH_MAIN;

      previewLine = document.createElementNS(NS, 'line');
      const xy = keyToXY(startSquare);
      previewLine.setAttribute('x1', xy.x);
      previewLine.setAttribute('y1', xy.y);
      previewLine.setAttribute('x2', xy.x);
      previewLine.setAttribute('y2', xy.y);
      previewLine.setAttribute('stroke', '#888');
      previewLine.setAttribute('stroke-width', strokeWidth);
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

    // DRAW-TO-DELETE LOGIC
    const currentState = historyLog[currentHistoryIndex] || [];
    const nextState = [...currentState];

    const isCounted = !isWKeyPressed;
    let arrowColor = COLOR_GREEN;

    if (isWKeyPressed) arrowColor = COLOR_YELLOW;
    else if (e.shiftKey && e.altKey) arrowColor = COLOR_SHIFT_ALT;
    else if (e.altKey) arrowColor = COLOR_ALT;
    else if (e.ctrlKey) arrowColor = COLOR_CTRL;

    const existingIndex = nextState.findIndex(a => 
      a.from === startSquare && a.to === endSquare
    );

    if (existingIndex !== -1) {
      const existing = nextState[existingIndex];
      nextState.splice(existingIndex, 1);
      
      const trackIdx = currentArrowsOnBoard.findIndex(a => 
        a.from === startSquare && a.to === endSquare
      );
      if (trackIdx !== -1) currentArrowsOnBoard.splice(trackIdx, 1);

      if (existing.color === arrowColor) {
        recordNewAction(nextState);
        startSquare = null;
        return;
      }
    }

    // ──────────────────────────────────────────────
    // CONTINUOUS PLY LOGIC (1W -> 1B -> 2 -> 2 -> 3)
    // ──────────────────────────────────────────────
    
    // 1. Calculate arrows ALREADY on the board (Main Lines)
    let existingArrowsCount = 0;
    nextState.forEach(m => {
      if (m.isCounted && !m.isVariation) {
        existingArrowsCount++;
      }
    });

    // 2. Handle B-Key Start (If this is the very first arrow)
    if (existingArrowsCount === 0 && globalPlyCount === 0 && isBKeyPressed) {
        currentBoardStartedWithB = true; 
    }

    const offset = currentBoardStartedWithB ? 1 : 0;

    // 3. Absolute Ply Index
    let totalMainArrowsSoFar = globalPlyCount + offset + existingArrowsCount;
    // If MAIN line, increment
    if (isCounted) {
        totalMainArrowsSoFar += 1;
    } 
    // If VARIATION, use last main line count (default to 1)
    else {
        if (totalMainArrowsSoFar === 0) totalMainArrowsSoFar = 1;
    }

    // 4. Move Number
    const numberToDisplay = Math.ceil(totalMainArrowsSoFar / 2);

    // 5. Label Logic
    let labelText = null;
    if (isCounted && !isWKeyPressed) {
        if (numberToDisplay === 1) {
             if (totalMainArrowsSoFar === 1) labelText = "1W";
             else if (totalMainArrowsSoFar === 2) {
                 if (currentBoardStartedWithB) labelText = "1B";
                 else labelText = "1";
             }
        }
    }

    const newArrow = {
      from: startSquare,
      to: endSquare,
      color: arrowColor,
      number: numberToDisplay,
      isCounted,
      variationID: isWKeyPressed ? currentVariationID : 0,
      analysis: 'unknown',
      labelText: labelText 
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

  board.addEventListener('click', e => {
    if (e.button !== 0) return;
    if (e.target.closest('g')) return;
    if (e.target.tagName === 'line' && e.target.parentElement.classList.contains('checkm8-arrows')) return;

    if (historyLog[currentHistoryIndex]?.length > 0) {
      historyLog = [[]];
      currentHistoryIndex = 0;
      currentArrowsOnBoard = [];
      clearSvg();
    }
  });

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    const isUndoRedo = e.ctrlKey || e.metaKey;

    if (isUndoRedo && key === 'z') { e.preventDefault(); undoMove(); return; }
    if (isUndoRedo && key === 'y') { e.preventDefault(); redoMove(); return; }

    // H Logic
    if (key === 'h' && !isUndoRedo) {
      e.preventDefault();
      isHighlightActive = true;
      highlightBuffer = ""; 
      return;
    }

    // G Logic
    if (key === 'g' && !isUndoRedo) {
      e.preventDefault();
      clearToggledHighlight();
      isVariationHighlightActive = true;
      variationHighlightBuffer = "";
      return;
    }

    // B Logic (for 1B)
    if (key === 'b' && !isUndoRedo) {
        isBKeyPressed = true;
    }

    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 0 && num <= 9) {
      
      if (isHighlightActive) {
        e.preventDefault();
        highlightBuffer += e.key;
        renderedArrows.forEach(arrow => {
          arrow.shine.style.opacity = '0';
          if (arrow.number.toString() === highlightBuffer) {
             arrow.shine.style.opacity = '0.8';
             if (arrow.arrowWrapper.parentNode) {
                 arrow.arrowWrapper.parentNode.appendChild(arrow.arrowWrapper);
             }
             arrow.ringGroup.style.opacity = '1';
          }
        });
        return;
      }
      
      if (isVariationHighlightActive) {
        e.preventDefault();
        variationHighlightBuffer += e.key;
        const targetVarID = parseInt(variationHighlightBuffer);
        if (!isNaN(targetVarID)) {
          renderedArrows.forEach(arrow => {
            if (arrow.variationID === targetVarID) {
              showArrow(arrow, COLOR_ROSE, 'url(#arrowhead-rose)');
            }
          });
        }
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
    
    if (key === 'h') { 
        e.preventDefault(); 
        isHighlightActive = false;
        highlightBuffer = "";
        renderedArrows.forEach(a => {
            a.shine.style.opacity = '0';
            if (a.arrowWrapper.parentNode) {
               a.arrowWrapper.parentNode.prepend(a.arrowWrapper);
            }
        });
        checkOverlaps();
    }

    if (key === 'g') { 
      e.preventDefault(); 
      isVariationHighlightActive = false;
      variationHighlightBuffer = "";
      showAllArrowsInCurrentState();
    }

    if (key === 'w') isWKeyPressed = false;
    if (key === 'b') isBKeyPressed = false;
  });
}

// ────────────────────────────────────────────────
// Initialization
// ────────────────────────────────────────────────
let lastKnownFen = null;
setInterval(async () => {
  const currentFen = await getCurrentFEN();
  if (lastKnownFen && currentFen !== lastKnownFen && currentArrowsOnBoard.length > 0) {
    currentArrowsOnBoard = [];
    historyLog = [[]];
    currentHistoryIndex = 0;
    clearSvg();
  }
  lastKnownFen = currentFen;
}, 2200);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "LOAD_BOARD" && msg.boardId) {
    const tryLoad = (attempt = 0) => {
      if (getBoard()) {
        loadSavedBoard(msg.boardId);
        sendResponse({ status: "loaded" });
      } else if (attempt < 10) {
        setTimeout(() => tryLoad(attempt + 1), 500);
      } else {
        sendResponse({ status: "board_not_ready" });
      }
    };
    tryLoad();
    return true;
  }
});

async function loadSavedBoard(boardId) {
  const user = await getLoggedInUser();
  if (!user) return;

  try {
    const arrows = await proxyApiCall(
      `get-arrows/${encodeURIComponent(user)}?boardId=${boardId}`,
      "GET"
    );

    if (!Array.isArray(arrows) || arrows.length === 0) return;

    historyLog = [arrows];
    currentHistoryIndex = 0;
    currentArrowsOnBoard = arrows.map(a => ({ ...a, analysis: a.analysis || 'unknown' }));

    if (ensureSvg()) {
      redrawAllArrows();
    }
  } catch (err) {
    console.error("[loadSavedBoard] Failed:", err.message);
  }
}

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