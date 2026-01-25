const NS = 'http://www.w3.org/2000/svg';
let svg = null;
let currentFrom = null;
let isWKeyPressed = false;
let isBKeyPressed = false;

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

// Ply tracking
let globalPlyCount = 0;
let currentBoardStartedWithB = false;

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

// Sizing constants
const STROKE_WIDTH_MAIN = 0.16;
const STROKE_WIDTH_SHINE = 0.22;
const RADIUS_MAIN = 0.25;

const STROKE_WIDTH_VAR = 0.09;
const STROKE_WIDTH_SHINE_VAR = 0.14;
const RADIUS_VAR = 0.25;

const HEAD_WIDTH_MAIN = 0.75;
const HEAD_HEIGHT_MAIN = 0.6;
const HEAD_REF_X_MAIN = 0.6;

// Repeat count cache + last drawn move
let arrowRepeatCache = {};
let lastDrawnMove = null; // "e2e4", "d7d5", etc.

// ─── EARLY HELPERS ───
function getBoard() {
  return document.querySelector('cg-board') || document.querySelector('.cg-board');
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

function proxyApiCall(endpoint, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: "PROXY_API_CALL",
      endpoint,
      method,
      body
    }, response => {
      if (response?.success) resolve(response.data);
      else reject(new Error(response?.error || 'Proxy failed'));
    });
  });
}

// ─── SAVE & LOGGING ───
async function saveArrow(arrow) {
  const user = await getLoggedInUser();
  if (!user) return;

  try {
    await proxyApiCall("save-arrow", "POST", {
      from: arrow.from,
      to: arrow.to,
      color: arrow.color,
      number: arrow.number,
      user,
      boardId: currentBoardId,
      variationID: arrow.variationID || 0,
      analysis: arrow.analysis || 'unknown'
    });
    console.log("arrow saved");

    // Update repeat count cache + last drawn
    const moveKey = `${arrow.from}${arrow.to}`;
    arrowRepeatCache[moveKey] = (arrowRepeatCache[moveKey] || 0) + 1;
    lastDrawnMove = moveKey;

    updateRepeatInterface();
  } catch (err) {
    console.error("Save arrow failed:", err);
  }
}

async function saveCurrentBoard() {
  const user = await getLoggedInUser();
  if (!user) return;

  const fen = await getCurrentFEN();
  try {
    await proxyApiCall("save-board", "POST", { user, boardId: currentBoardId, fen });
    console.log("board saved");
  } catch (err) {
    console.error("Save board failed:", err);
  }
}

function clearSvg() {
  if (svg) {
    svg.innerHTML = '';
    console.log("Arrows are cleared by clicking board");
  }
  renderedArrows = [];
}

// ─── NEW BOARD & SHOW BOARDS ───
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

// ─── UI INJECTION ───
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

// ─── GLOBAL DEFS FOR ARROWHEADS ───
let defsSvg = null;

function createGlobalDefs() {
  if (defsSvg) return;

  defsSvg = document.createElementNS(NS, 'svg');
  defsSvg.style.position = 'absolute';
  defsSvg.style.width = '0';
  defsSvg.style.height = '0';
  defsSvg.style.overflow = 'hidden';
  document.body.appendChild(defsSvg);

  const defs = document.createElementNS(NS, 'defs');

  Object.entries(ARROWHEAD_MAP).forEach(([key, id]) => {
    if (id === 'arrowhead-hidden') return;

    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerWidth', '1');
    marker.setAttribute('markerHeight', '1');
    marker.setAttribute('refX', '0.8');
    marker.setAttribute('refY', '0.5');

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M0,0 L1,0.5 L0,1 Z');
    path.setAttribute('fill', key);
    marker.appendChild(path);
    defs.appendChild(marker);
  });

  const shineMarker = document.createElementNS(NS, 'marker');
  shineMarker.setAttribute('id', 'arrowhead-shine');
  shineMarker.setAttribute('markerUnits', 'userSpaceOnUse');
  shineMarker.setAttribute('orient', 'auto');
  shineMarker.setAttribute('markerWidth', '1');
  shineMarker.setAttribute('markerHeight', '1');
  shineMarker.setAttribute('refX', '0.8');
  shineMarker.setAttribute('refY', '0.5');

  const shinePath = document.createElementNS(NS, 'path');
  shinePath.setAttribute('d', 'M0,0 L1,0.5 L0,1 Z');
  shinePath.setAttribute('fill', 'white');
  shineMarker.appendChild(shinePath);
  defs.appendChild(shineMarker);

  const hidden = document.createElementNS(NS, 'marker');
  hidden.setAttribute('id', 'arrowhead-hidden');
  hidden.setAttribute('orient', 'auto');
  hidden.setAttribute('markerWidth', '1');
  hidden.setAttribute('markerHeight', '1');
  hidden.setAttribute('refX', '0.5');
  hidden.setAttribute('refY', '0.5');
  defs.appendChild(hidden);

  defsSvg.appendChild(defs);
  console.log("Global arrowhead defs created");
}

createGlobalDefs();

// ─── SVG OVERLAY ───
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

  injectUI();
  return svg;
}

// ─── ANALYSIS ───
async function analyzeArrow(fromSq, toSq) {
  const fen = await getCurrentFEN();
  const move = fromSq + toSq;

  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: "ANALYZE_FEN",
      fen,
      move
    }, response => {
      if (!response?.success || !response.data?.bestMoves || !response.data?.scores) {
        console.warn("Stockfish failed:", response);
        return resolve('unknown');
      }

      const { bestMoves = [], scores = [] } = response.data;
      const bestScore = Math.max(...scores);
      const idx = bestMoves.indexOf(move);

      if (idx === -1) resolve('bad');
      else if (idx === 0) resolve('best');
      else {
        const ourScore = scores[idx];
        if (ourScore >= bestScore - 50) resolve('good');
        else if (ourScore >= bestScore - 150) resolve('inaccuracy');
        else resolve('bad');
      }
    });
  });
}

// ─── REPEAT COUNTS INTERFACE ───
async function loadArrowRepeatCounts() {
  const user = await getLoggedInUser();
  if (!user) return;

  try {
    const repeats = await proxyApiCall(`arrow-repeats/${encodeURIComponent(user)}`, "GET");
    arrowRepeatCache = {};
    repeats.forEach(r => {
      const key = `${r._id.from}${r._id.to}`;
      arrowRepeatCache[key] = r.count;
    });
    console.log("Arrow repeat counts loaded:", arrowRepeatCache);
    updateRepeatInterface();
  } catch (err) {
    console.warn("Could not load repeat counts:", err);
  }
}

function updateRepeatInterface() {
  let repeatEl = document.getElementById('checkm8-repeats');
  if (!repeatEl) {
    repeatEl = document.createElement('div');
    repeatEl.id = 'checkm8-repeats';
    repeatEl.style.position = 'fixed';
    repeatEl.style.bottom = '20px';
    repeatEl.style.left = '20px';
    repeatEl.style.background = 'rgba(255,255,255,0.95)';
    repeatEl.style.padding = '12px';
    repeatEl.style.borderRadius = '8px';
    repeatEl.style.maxWidth = '300px';
    repeatEl.style.overflowY = 'auto';
    repeatEl.style.maxHeight = '220px';
    repeatEl.style.zIndex = '99999';
    repeatEl.style.fontSize = '13px';
    repeatEl.style.color = '#222';           // darker text
    repeatEl.style.boxShadow = '0 3px 12px rgba(0,0,0,0.25)';
    document.body.appendChild(repeatEl);
  }

  let html = '<b>Arrow Repeats:</b><ul style="margin:10px 0 0 20px; padding:0; list-style:none;">';

  // 1. Most recently drawn/repeated arrow first (if exists)
  if (lastDrawnMove && arrowRepeatCache[lastDrawnMove]) {
    const count = arrowRepeatCache[lastDrawnMove];
    const isRepeat = count >= 2;
    html += `<li style="color: ${isRepeat ? '#c00' : '#222'}; font-weight: ${isRepeat ? 'bold' : 'normal'}; margin-bottom: 4px;">
      ${lastDrawnMove} — ${count}×
    </li>`;
  }

  // 2. All others (sorted by count descending)
  const sortedEntries = Object.entries(arrowRepeatCache)
    .filter(([key]) => key !== lastDrawnMove)
    .sort(([,a], [,b]) => b - a);

  sortedEntries.forEach(([key, count]) => {
    html += `<li style="margin-bottom: 4px;">${key} — ${count}×</li>`;
  });

  html += '</ul>';

  repeatEl.innerHTML = html || '<b>Arrow Repeats:</b><br>No arrows drawn yet.';
}

// ─── RENDERING ───
function getAnalysisStyle(analysis) {
  switch (analysis) {
    case 'best': return { borderColor: '#2196f3', title: 'Best move' };
    case 'good': return { borderColor: '#4caf50', title: 'Good move' };
    case 'bad':  return { borderColor: '#f44336', title: 'Bad move' };
    default:     return { borderColor: '#9e9e9e', title: 'Unknown' };
  }
}

function checkOverlaps() {
  renderedArrows.forEach(arrow => {
    if (arrow.ringGroup) arrow.ringGroup.style.opacity = '1';
    arrow.isOverlapped = false;
  });

  for (let i = renderedArrows.length - 1; i >= 0; i--) {
    const top = renderedArrows[i];
    for (let j = i - 1; j >= 0; j--) {
      const bottom = renderedArrows[j];
      const dx = top.ringCoords.x - bottom.ringCoords.x;
      const dy = top.ringCoords.y - bottom.ringCoords.y;
      if (Math.sqrt(dx*dx + dy*dy) < (top.isVariation ? RADIUS_VAR : RADIUS_MAIN) * 2.2) {
        bottom.isOverlapped = true;
        if (bottom.ringGroup) bottom.ringGroup.style.opacity = '0';
      }
    }
  }
}

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

  const isVariation = variationID > 0;
  const strokeWidth = isVariation ? STROKE_WIDTH_VAR : STROKE_WIDTH_MAIN;
  const shineWidth = isVariation ? STROKE_WIDTH_SHINE_VAR : STROKE_WIDTH_SHINE;
  const radius = RADIUS_MAIN;

  const wrapper = document.createElementNS(NS, 'g');
  wrapper.classList.add('arrow-wrapper');
  wrapper.style.pointerEvents = 'auto';

  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', strokeWidth);
  line.setAttribute('stroke-opacity', '1');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('marker-end', markerUrl);
  wrapper.appendChild(line);

  // White shine line
  const shineLine = line.cloneNode(true);
  shineLine.setAttribute('stroke', 'white');
  shineLine.setAttribute('stroke-width', shineWidth);
  shineLine.style.opacity = '0';
  shineLine.style.pointerEvents = 'none';
  shineLine.style.transition = 'opacity 0.2s';
  wrapper.insertBefore(shineLine, line);

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
  circle.setAttribute('r', radius.toString());
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', '0.03');
  ringGroup.appendChild(circle);

  const style = getAnalysisStyle(analysis);
  circle.setAttribute('stroke', style.borderColor);
  circle.setAttribute('stroke-width', '0.08');
  ringGroup.setAttribute('title', style.title);

  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', nx);
  text.setAttribute('y', ny + 0.015);
  text.setAttribute('fill', 'white');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');

  if (isVariation) {
    const tsMove = document.createElementNS(NS, 'tspan');
    tsMove.textContent = number;
    tsMove.setAttribute('font-size', '0.20');
    text.appendChild(tsMove);

    const tsVar = document.createElementNS(NS, 'tspan');
    tsVar.textContent = variationID;
    tsVar.setAttribute('font-size', '0.10');
    tsVar.setAttribute('dy', '0.06');
    text.appendChild(tsVar);
  } else {
    text.setAttribute('font-size', '0.28');
    text.textContent = labelText || number;
  }
  ringGroup.appendChild(text);

  wrapper.appendChild(ringGroup);

  const el = {
    line,
    shineLine,
    ringGroup,
    arrowWrapper: wrapper,
    number,
    color,
    markerUrl,
    originalMarker: markerUrl,
    shineMarker: 'url(#arrowhead-shine)',
    isCounted,
    variationID,
    isVariation,
    from,
    to,
    analysis,
    labelText,
    ringCoords: { x: nx, y: ny },
    isOverlapped: false
  };

  ringGroup.addEventListener('mouseenter', () => {
    shineLine.style.opacity = '0.8';
    el.line.setAttribute('marker-end', el.shineMarker);
  });

  ringGroup.addEventListener('mouseleave', () => {
    shineLine.style.opacity = '0';
    el.line.setAttribute('marker-end', el.originalMarker);
  });

  wrapper.addEventListener('mouseenter', () => {
    if (wrapper.nextSibling) wrapper.parentNode.appendChild(wrapper);
    ringGroup.style.opacity = '1';
  });

  wrapper.addEventListener('mouseleave', () => {
    if (wrapper.parentNode) wrapper.parentNode.prepend(wrapper);
    if (el.isOverlapped) ringGroup.style.opacity = '0';
  });

  wrapper.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey) {
      const idx = historyLog[currentHistoryIndex].findIndex(a => 
        a.from === from && a.to === to && a.number === number
      );
      if (idx !== -1) {
        historyLog[currentHistoryIndex].splice(idx, 1);
        recordNewAction([...historyLog[currentHistoryIndex]]);
        wrapper.remove();
      }
      return;
    }

    clearToggledHighlight();

    const already = toggledHighlight.number === number.toString() &&
                    toggledHighlight.color === color;

    if (!already) {
      toggledHighlight = { number: number.toString(), color };
      showArrow(el, color, el.originalMarker);
    }
  });

  svgEl.appendChild(wrapper);
  return el;
}

function showArrow(el, color, marker) {
  el.line.setAttribute('stroke', color);
  el.line.setAttribute('stroke-opacity', '1');
  el.line.setAttribute('marker-end', marker);
  if (el.ringGroup) el.ringGroup.style.display = 'block';
}

function hideArrow(el) {
  const isG = isVariationHighlightActive && variationHighlightBuffer &&
              el.variationID === parseInt(variationHighlightBuffer);
  const isT = toggledHighlight.number === el.number.toString() &&
              toggledHighlight.color === el.color;

  if (!isG && !isT) {
    el.line.setAttribute('stroke-opacity', '0');
    el.line.setAttribute('marker-end', 'url(#arrowhead-hidden)');
  }
}

function showAllArrowsInCurrentState() {
  renderedArrows.forEach(el => {
    const isG = isVariationHighlightActive && variationHighlightBuffer &&
                el.variationID === parseInt(variationHighlightBuffer);
    showArrow(el, isG ? COLOR_ROSE : el.color, isG ? 'url(#arrowhead-rose)' : el.originalMarker);
  });
}

function redrawAllArrows() {
  clearSvg();
  const state = historyLog[currentHistoryIndex] || [];
  renderedArrows = [];

  state.forEach(a => {
    const el = createArrow(
      a.from, a.to, a.number, a.color, a.isCounted,
      a.variationID, a.analysis, a.labelText
    );
    if (el) {
      renderedArrows.push(el);
      console.log(`Arrow ${a.from}${a.to} (${a.color}) - repeated ${a.repeatCount || 1}×`);
    }
  });

  checkOverlaps();
  showAllArrowsInCurrentState();
}

function recordNewAction(newState) {
  historyLog = historyLog.slice(0, currentHistoryIndex + 1);
  historyLog.push(newState);
  currentHistoryIndex = historyLog.length - 1;
  redrawAllArrows();
}

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

// ─── DRAWING ───
let isDrawing = false;
let previewLine = null;
let startSquare = null;

function initDrawArrows() {
  const board = getBoard();
  if (!board) return;

  ensureSvg();
  loadArrowRepeatCounts();

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

    let existingArrowsCount = 0;
    nextState.forEach(m => {
      if (m.isCounted && !m.isVariation) {
        existingArrowsCount++;
      }
    });

    if (existingArrowsCount === 0 && globalPlyCount === 0 && isBKeyPressed) {
      currentBoardStartedWithB = true; 
    }

    const offset = currentBoardStartedWithB ? 1 : 0;

    let totalMainArrowsSoFar = globalPlyCount + offset + existingArrowsCount;
    if (isCounted) {
      totalMainArrowsSoFar += 1;
    } else {
      if (totalMainArrowsSoFar === 0) totalMainArrowsSoFar = 1;
    }

    const numberToDisplay = Math.ceil(totalMainArrowsSoFar / 2);

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
    const moveKey = `${newArrow.from}${newArrow.to}`;
    newArrow.repeatCount = (arrowRepeatCache[moveKey] || 0) + 1;

    nextState.push(newArrow);
    recordNewAction(nextState);

    currentArrowsOnBoard.push(newArrow);
    await saveArrow(newArrow);

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

    if (key === 'h' && !isUndoRedo) {
      e.preventDefault();
      isHighlightActive = true;
      highlightBuffer = ""; 
      return;
    }

    if (key === 'g' && !isUndoRedo) {
      e.preventDefault();
      clearToggledHighlight();
      isVariationHighlightActive = true;
      variationHighlightBuffer = "";
      return;
    }

    if (key === 'b' && !isUndoRedo) {
      isBKeyPressed = true;
    }

    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 0 && num <= 9) {
      if (isHighlightActive) {
        e.preventDefault();
        highlightBuffer += e.key;
        renderedArrows.forEach(arrow => {
          arrow.shineLine.style.opacity = '0';
          if (arrow.number.toString() === highlightBuffer) {
            arrow.shineLine.style.opacity = '0.8';
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
        a.shineLine.style.opacity = '0';
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

// ─── INIT & OBSERVER ───
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
      } else if (attempt < 15) {
        setTimeout(() => tryLoad(attempt + 1), 600);
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
    await loadArrowRepeatCounts();

    const arrows = await proxyApiCall(
      `get-arrows/${encodeURIComponent(user)}?boardId=${boardId}`,
      "GET"
    );

    if (!Array.isArray(arrows) || arrows.length === 0) return;

    historyLog = [arrows];
    currentHistoryIndex = 0;
    currentArrowsOnBoard = arrows.map(a => ({
      ...a,
      analysis: a.analysis || 'unknown',
      repeatCount: arrowRepeatCache[`${a.from}${a.to}`] || 1
    }));

    if (ensureSvg()) {
      redrawAllArrows();
      console.log(`Loaded board ${boardId} with ${arrows.length} arrows`);
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