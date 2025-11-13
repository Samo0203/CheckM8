overlay.appendChild(arrow);

const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
label.setAttribute("x", (x1 + x2) / 2);
label.setAttribute("y", (y1 + y2) / 2 - 10); 
label.setAttribute("fill", color);
label.setAttribute("font-size", "20");
label.setAttribute("font-weight", "bold");
label.textContent = moveCount;
overlay.appendChild(label);
