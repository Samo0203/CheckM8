const NS = 'http://www.w3.org/2000/svg';
let svg, currentFrom;
let isWKeyPressed = false; 
let highlightedNumberKey = null; 
let renderedArrows = []; 

// Color definitions
const COLOR_GREEN = 'green';
const COLOR_CTRL = 'red';
const COLOR_ALT = 'blue';
const COLOR_SHIFT_ALT = 'orange';
const COLOR_PINK = 'deeppink'; 

let moveHistory = []; 

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

function addArrowHeadDefs() {
  if (!svg) return;
  const defs = document.createElementNS(NS, 'defs');
  
  const colors = [
    { id: 'arrowhead-green', color: COLOR_GREEN },
    { id: 'arrowhead-red', color: COLOR_CTRL },
    { id: 'arrowhead-blue', color: COLOR_ALT },
    { id: 'arrowhead-orange', color: COLOR_SHIFT_ALT },
    { id: 'arrowhead-pink', color: COLOR_PINK },
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
  
  if (arrowElements.number.toString() !== highlightedNumberKey) {
    line.setAttribute('stroke-opacity', '0');
    line.setAttribute('stroke-width', '0.15');
    line.setAttribute('stroke', color); 
    line.setAttribute('marker-end', 'url(#arrowhead-hidden)');
  }
}

function createArrow(from, to, number, color) {
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
  else markerUrl = 'url(#arrowhead-hidden)';

  // The Arrow Line 
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

  // Create a <g> group for all tag elements
  const g = document.createElementNS(NS, 'g');
  g.style.pointerEvents = 'auto';
  g.style.cursor = 'pointer';

  // The "Tag Line"
  const tagLine = document.createElementNS(NS, 'line');
  tagLine.setAttribute('x1', cx);
  tagLine.setAttribute('y1', cy);
  tagLine.setAttribute('x2', nx);
  tagLine.setAttribute('y2', ny);
  tagLine.setAttribute('stroke', 'white');
  tagLine.setAttribute('stroke-width', '0.05');
  g.appendChild(tagLine);

  // The "Ring"
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', nx);
  circle.setAttribute('cy', ny);
  circle.setAttribute('r', '0.25');
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', '0.03');
  g.appendChild(circle);

  // The Number
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', nx);
  text.setAttribute('y', ny);
  text.setAttribute('fill', 'white');
  text.setAttribute('font-size', '0.3');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.textContent = number;
  g.appendChild(text);

  const arrowElements = { line, g, number, markerUrl, color };
  
  //Add Hover Listeners to the group
  g.addEventListener('mouseenter', () => {
    showArrow(arrowElements, color, markerUrl);
  });
  
  g.addEventListener('mouseleave', () => {
    if (highlightedNumberKey === number.toString()) {
      showArrow(arrowElements, COLOR_PINK, 'url(#arrowhead-pink)');
    } else {
      hideArrow(arrowElements);
    }
  });
  
  // Add the finished group to the SVG and return elements
  svg.appendChild(g);
  return arrowElements;
}

function redrawAllArrows() {
  if (!svg) return;
  svg.innerHTML = ''; 
  addArrowHeadDefs(); 
  
  renderedArrows = [];
  let countedArrowIndex = 0;
  let lastCountedNumber = 1;

  moveHistory.forEach(move => {
    let numberToDisplay;

    if (move.isCounted) {
      countedArrowIndex++;
      numberToDisplay = Math.ceil(countedArrowIndex / 2);
      lastCountedNumber = numberToDisplay;
    } else {
      numberToDisplay = lastCountedNumber;
    }
    
    const elements = createArrow(move.from, move.to, numberToDisplay, move.color);
    renderedArrows.push(elements);
  });
}

function clearAllArrows() {
  if (svg) {
    svg.innerHTML = '';
    addArrowHeadDefs();
  }
  moveHistory = [];
  renderedArrows = [];
}

function initDrawArrows() {
  const board = getBoard();
  if (!board) return;
  ensureSvg();
  addArrowHeadDefs(); 
  board.addEventListener('contextmenu', e => e.preventDefault());

  board.addEventListener('mousedown', e => {
    if (e.button === 0) { 
      clearAllArrows();
      return;
    }
    
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
          isCounted: !isWKeyPressed
        });
      }

      redrawAllArrows();
    }
    currentFrom = null;
  });

  window.addEventListener('keydown', e => {
    if (e.repeat) return; 

    const key = e.key;
    if (key.toLowerCase() === 'w') {
      isWKeyPressed = true;
    }
    if (key.toLowerCase() === 'x') {
      clearAllArrows();
    }
    
    const num = parseInt(key);
    if (!isNaN(num) && num >= 0 && num <= 9) {
      if (highlightedNumberKey && highlightedNumberKey !== key) {
        renderedArrows
          .filter(arrow => arrow.number.toString() === highlightedNumberKey)
          .forEach(hideArrow);
      }
      
      highlightedNumberKey = key;
      renderedArrows
        .filter(arrow => arrow.number.toString() === key)
        .forEach(elements => {
          showArrow(elements, COLOR_PINK, 'url(#arrowhead-pink)');
        });
    }
  });

  window.addEventListener('keyup', e => {
    const key = e.key;
    if (key.toLowerCase() === 'w') {
      isWKeyPressed = false;
    }

    if (key === highlightedNumberKey) {
      highlightedNumberKey = null; 
      renderedArrows
        .filter(arrow => arrow.number.toString() === key)
        .forEach(hideArrow);
    }
  });
}

setTimeout(initDrawArrows, 2000);