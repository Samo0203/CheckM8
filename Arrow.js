export function drawArrow({
  container,
  startX,
  startY,
  endX,
  endY,
  color = "#00aaff",
  hoverColor = "#ff9900",
  number = null
}) {
  const svgNS = "http://www.w3.org/2000/svg";


  let svg = container.querySelector(".arrow-layer");
  if (!svg) {
    svg = document.createElementNS(svgNS, "svg");
    svg.classList.add("arrow-layer");
    svg.style.position = "absolute";
    svg.style.top = 0;
    svg.style.left = 0;
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.pointerEvents = "none";
    container.appendChild(svg);
  }

  
  const g = document.createElementNS(svgNS, "g");
  g.style.pointerEvents = "auto";


  const line = document.createElementNS(svgNS, "line");
  line.setAttribute("x1", startX);
  line.setAttribute("y1", startY);
  line.setAttribute("x2", endX);
  line.setAttribute("y2", endY);
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", "6");
  line.setAttribute("stroke-linecap", "round");
  g.appendChild(line);

  
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = 14;

  const arrowHead = document.createElementNS(svgNS, "polygon");
  const points = `
    ${endX},${endY}
    ${endX - headLength * Math.cos(angle - 0.4)},${endY - headLength * Math.sin(angle - 0.4)}
    ${endX - headLength * Math.cos(angle + 0.4)},${endY - headLength * Math.sin(angle + 0.4)}
  `;
  arrowHead.setAttribute("points", points);
  arrowHead.setAttribute("fill", color);
  g.appendChild(arrowHead);


  let textEl = null;
  if (number !== null) {
    textEl = document.createElementNS(svgNS, "text");
    textEl.setAttribute("x", (startX + endX) / 2);
    textEl.setAttribute("y", (startY + endY) / 2 - 10);
    textEl.setAttribute("font-size", "20px");
    textEl.setAttribute("text-anchor", "middle");
    textEl.setAttribute("fill", color);
    textEl.textContent = number;
    textEl.style.pointerEvents = "auto";
    g.appendChild(textEl);
  }


  const applyHover = () => {
    line.setAttribute("stroke", hoverColor);
    arrowHead.setAttribute("fill", hoverColor);
    if (textEl) textEl.setAttribute("fill", hoverColor);
  };

  const removeHover = () => {
    line.setAttribute("stroke", color);
    arrowHead.setAttribute("fill", color);
    if (textEl) textEl.setAttribute("fill", color);
  };

  g.addEventListener("mouseenter", applyHover);
  g.addEventListener("mouseleave", removeHover);

  svg.appendChild(g);

  return g;
}
