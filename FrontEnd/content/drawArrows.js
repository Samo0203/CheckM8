// drawArrows.js
const NS = 'http://www.w3.org/2000/svg';
let svg, currentFrom, currentColorIndex = 0, arrowCount = 0;
let numberingStyle = "number"; // number, roman, letter
const colors = ['red', 'green', 'blue', 'yellow'];
let arrowHistory = [];
let legendVisible = false;

// Convert number to Roman numeral
function toRoman(num) {
  const roman = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
  const val = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  let res = "";
  for (let i = 0; i < val.length; i++) {
    while (num >= val[i]) {
      res += roman[i];
      num -= val[i];
    }
  }
  return res;
}

// Convert number to letter sequence
function toLetter(num) {
  return String.fromCharCode(64 + num);
}

function getBoard() {
  return document.querySelector('cg-board') || document.querySelector('.cg-board');
}

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

// Create arrow
function createArrow(from, to, color, number) {
  const { x: x1, y: y1 } = keyToXY(from);
  const { x: x2, y: y2 } = keyToXY(to);

  const board = getBoard();
  const rect = board.getBoundingClientRect();
  const lineWidth = 0.08; // reduced arrow width

  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', lineWidth);
  line.setAttribute('marker-end', 'url(#arrowhead)');
  line.style.transition = "0.2s";

  line.addEventListener('mouseenter', () => line.setAttribute('stroke-width', lineWidth * 2));
  line.addEventListener('mouseleave', () => line.setAttribute('stroke-width', lineWidth));

  svg.appendChild(line);

  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', (x1 + x2) / 2);
  text.setAttribute('y', (y1 + y2) / 2);
  text.setAttribute('fill', 'white');
  text.setAttribute('font-size', '0.45');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');

  if (numberingStyle === "roman") text.textContent = toRoman(number);
  else if (numberingStyle === "letter") text.textContent = toLetter(number);
  else text.textContent = number;

  svg.appendChild(text);

  arrowHistory.push({ line, text, color });
  updateArrowHeadColor(color); // update arrowhead color dynamically
}

// Add arrowhead
function addArrowHead() {
  const defs = document.createElementNS(NS, 'defs');
  const marker = document.createElementNS(NS, 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerWidth', '3'); // reduced size
  marker.setAttribute('markerHeight', '3'); // reduced size
  marker.setAttribute('refX', '2.05');
  marker.setAttribute('refY', '1.5');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M0,0 V3 L3,1.5 Z');
  path.setAttribute('fill', 'currentColor'); // dynamic fill
  marker.appendChild(path);
  defs.appendChild(marker);
  svg.appendChild(defs);
}

// Update arrowhead color dynamically
function updateArrowHeadColor(color) {
  const marker = svg.querySelector("#arrowhead path");
  if (marker) marker.setAttribute("fill", color);
}

// Create on-screen legend
function createLegend() {
  let legend = document.getElementById("arrowLegend");
  if (!legend) {
    legend = document.createElement("div");
    legend.id = "arrowLegend";
    legend.style.position = "absolute";
    legend.style.bottom = "10px";
    legend.style.right = "10px";
    legend.style.background = "rgba(0,0,0,0.5)";
    legend.style.color = "white";
    legend.style.padding = "8px";
    legend.style.fontSize = "12px";
    legend.style.borderRadius = "6px";
    legend.style.zIndex = "500";
    legend.style.display = "none";
    document.body.appendChild(legend);
  }

  legend.innerHTML = `
    <b>CheckM8</b><br>
    Color: <span id="currentColor">${colors[currentColorIndex]}</span><br>
    Shortcuts: C = Change Color, D = Undo, X = Clear, N = Change Numbering, G = Legend
  `;
  return legend;
}

// Initialize
function initDrawArrows() {
  const board = getBoard();
  if (!board) return;
  ensureSvg();
  addArrowHead();
  const legend = createLegend();

  board.addEventListener('contextmenu', e => e.preventDefault());

  board.addEventListener('mousedown', e => {
    if (e.button !== 2) return;
    currentFrom = pixelToSquare(e.clientX, e.clientY, board);
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
    const legendColor = document.getElementById("currentColor");

    if (e.key.toLowerCase() === 'c') {
      currentColorIndex = (currentColorIndex + 1) % colors.length;
      if (legendColor) legendColor.textContent = colors[currentColorIndex];
    }

    if (e.key.toLowerCase() === 'd') {
      const lastArrow = arrowHistory.pop();
      if (lastArrow) {
        lastArrow.line.remove();
        lastArrow.text.remove();
        arrowCount = Math.max(0, arrowCount - 1);
      }
    }

    if (e.key.toLowerCase() === 'x') {
      svg.innerHTML = '';
      addArrowHead();
      arrowCount = 0;
      arrowHistory = [];
    }

    if (e.key.toLowerCase() === 'n') {
      if (numberingStyle === "number") numberingStyle = "roman";
      else if (numberingStyle === "roman") numberingStyle = "letter";
      else numberingStyle = "number";
    }

    if (e.key.toLowerCase() === 'g') {
      legendVisible = !legendVisible;
      legend.style.display = legendVisible ? "block" : "none";
    }
  });
}

setTimeout(initDrawArrows, 2000);
