console.log("Lichess Arrow Navigator: Phase 55 (Position Repeats - Next Moves Stats)");

// ==========================================
// 0. AUTH & API HELPERS
// ==========================================

function getLoggedInUser() {
    return new Promise(resolve => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.get(["loggedInUser"], res => {
                resolve(res?.loggedInUser || null);
            });
        } else {
            console.warn("Chrome storage not available. returning null user.");
            resolve(null);
        }
    });
}

async function proxyApiCall(endpoint, method, body) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: "PROXY_API_CALL",
            endpoint,
            method,
            body
        }, response => {
            if (chrome.runtime.lastError) {
                console.error("Runtime error:", chrome.runtime.lastError.message);
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (response?.success) {
                resolve(response.data || response);
            } else {
                reject(new Error(response?.error || "Proxy call failed"));
            }
        });
    });
}

async function saveArrow(arrowData) {
    const user = await getLoggedInUser();
    if (!user) {
        console.log("User not logged in. Move added locally only.");
        return;
    }

    const payload = {
        from: arrowData.from,
        to: arrowData.to,
        color: arrowData.color || "green",
        number: arrowData.number,
        user: user,
        boardId: window.location.pathname.split('/').pop() || "default-board",
        variationID: 0,
        analysis: "unknown"
    };

    console.log("Sending arrow payload:", payload);

        try {
        const response = await proxyApiCall("save-arrow", "POST", payload);
        console.log("Arrow saved successfully:", response);
    } catch (err) {
        console.error("Failed to save arrow:", err);
        if (err.message.includes("400")) {
            // Log full error for debugging
            console.log("400 details – check Network tab for response body");
            alert("Save arrow failed (400) – likely missing variationID or analysis. Check console.");
        }
    }
}

// Add this right after proxyApiCall() and saveArrow()

async function loadRepeatCounts() {
    const user = await getLoggedInUser();
    if (!user) return;

    const res = await proxyApiCall(`get-all-move-counts/${user}`, "GET");
    if (!res?.success || !res.data) return;

    positionMoveCounts.clear();
    res.data.forEach(entry => {
        const key = entry.fen;
        if (!positionMoveCounts.has(key)) {
            positionMoveCounts.set(key, new Map());
        }
        const moveKey = entry.from + entry.to;
        positionMoveCounts.get(key).set(moveKey, entry.count);
    });
}

function getMoveRepeatCount(fen, from, to) {
    const moves = positionMoveCounts.get(fen);
    if (!moves) return 0;
    return moves.get(from + to) || 0;
}

// ==========================================
// 1. DATA STRUCTURE (STATE BASED)
// ==========================================
class MoveNode {
    constructor(id, parent, moveData, color = null) {
        this.id = id;
        this.parent = parent;
        this.children = [];
        this.moveData = moveData; 
        this.customColor = color;
        this.count = 0;
        
        if (parent) {
            const preMoveState = parent.boardState;
            const pieceCode = preMoveState[moveData.from] || ""; 
            this.pieceType = getPieceTypeFromCode(pieceCode); 
            
            const targetCode = preMoveState[moveData.to];
            const isCapture = !!targetCode;
            this.san = generateSan(this.pieceType, moveData.from, moveData.to, isCapture);
            
            this.boardState = applyMoveToState(preMoveState, moveData.from, moveData.to, pieceCode);
        } else {
            this.pieceType = null;
            this.san = "";
            this.boardState = scanFullBoard(); 
        }
    }
}

let rootNode = new MoveNode("root", null, null);

let currentState = {
    currentNode: rootNode, 
    activeChild: null,
    isCleanView: false,
    isHintMode: false 
};
let moveIdCounter = 0;
const MOVES_PER_SCREEN = 8; 
let initialBoardState = {}; 
let isBoardScanned = false;

// Repeat count cache: fen → move (from-to) → count
let positionMoveCounts = new Map();

// Stats for current position only
let currentPositionStats = null; // { totalReaches: N, nextMoves: [{from,to,count,isPossible,mainlineCount}] }

// ==========================================
// 2. STATE ENGINE HELPERS
// ==========================================

function getPieceTypeFromCode(code) {
    if (!code) return "";
    const type = code[1];
    return type === 'P' ? '' : type;
}

function generateSan(pieceType, from, to, isCapture) {
    if (pieceType === 'K') {
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const fIdx = files.indexOf(from[0]);
        const tIdx = files.indexOf(to[0]);
        if (tIdx - fIdx === 2) return "0-0";
        if (tIdx - fIdx === -2) return "0-0-0";
    }
    if (pieceType === '') {
        if (isCapture || from[0] !== to[0]) return from[0] + 'x' + to;
        return to;
    }
    return pieceType + (isCapture ? 'x' : '') + to;
}

function applyMoveToState(oldState, from, to, pieceCode) {
    const newState = { ...oldState };
    delete newState[from];
    newState[to] = pieceCode;
    if (pieceCode.includes('K')) {
        if (from === 'e1' && to === 'g1') { delete newState['h1']; newState['f1'] = 'wR'; }
        if (from === 'e1' && to === 'c1') { delete newState['a1']; newState['d1'] = 'wR'; }
        if (from === 'e8' && to === 'g8') { delete newState['h8']; newState['f8'] = 'bR'; }
        if (from === 'e8' && to === 'c8') { delete newState['a8']; newState['d8'] = 'bR'; }
    }
    return newState;
}

function scanFullBoard() {
    const state = {};
    const board = document.querySelector('cg-board');
    if (!board) return {};
    const boardRect = board.getBoundingClientRect();
    const isBlackOriented = document.querySelector('.cg-wrap')?.classList.contains('orientation-black');
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    
    document.querySelectorAll('piece').forEach(p => {
        const rect = p.getBoundingClientRect();
        const relX = (rect.left + rect.width/2 - boardRect.left) / boardRect.width;
        const relY = (rect.top + rect.height/2 - boardRect.top) / boardRect.height;
        
        let file, rank;
        if(isBlackOriented) {
            file = 7 - Math.floor(relX * 8);
            rank = Math.floor(relY * 8); 
        } else {
            file = Math.floor(relX * 8);
            rank = 7 - Math.floor(relY * 8);
        }
        
        if (file >= 0 && file <= 7 && rank >= 0 && rank <= 7) {
            const square = files[file] + (rank + 1);
            
            const rawClass = (p.getAttribute('class') || "").toLowerCase();
            let bgUrl = "";
            try {
                bgUrl = (window.getComputedStyle(p).backgroundImage || "").toLowerCase();
            } catch(e) {}

            let color = 'w';
            if (rawClass.includes('black') || rawClass.includes(' b ') || bgUrl.includes('bp') || bgUrl.includes('br') || bgUrl.includes('bn') || bgUrl.includes('bb') || bgUrl.includes('bq') || bgUrl.includes('bk')) {
                color = 'b';
            }

            let type = 'P';
            if (rawClass.includes('rook') || rawClass.includes('role-r') || bgUrl.includes('wr.') || bgUrl.includes('br.') || bgUrl.includes('/r.') || bgUrl.includes('_r.')) type = 'R';
            else if (rawClass.includes('queen') || rawClass.includes('role-q') || bgUrl.includes('wq.') || bgUrl.includes('bq.') || bgUrl.includes('/q.') || bgUrl.includes('_q.')) type = 'Q';
            else if (rawClass.includes('king') || rawClass.includes('role-k') || bgUrl.includes('wk.') || bgUrl.includes('bk.') || bgUrl.includes('/k.') || bgUrl.includes('_k.')) type = 'K';
            else if (rawClass.includes('bishop') || rawClass.includes('role-b') || bgUrl.includes('wb.') || bgUrl.includes('bb.') || bgUrl.includes('/b.') || bgUrl.includes('_b.')) type = 'B';
            else if (rawClass.includes('knight') || rawClass.includes('role-n') || bgUrl.includes('wn.') || bgUrl.includes('bn.') || bgUrl.includes('/n.') || bgUrl.includes('_n.')) type = 'N';
            
            if (type === 'P') {
                if (square === 'a8' || square === 'h8') { type = 'R'; color = 'b'; }
                else if (square === 'a1' || square === 'h1') { type = 'R'; color = 'w'; }
            }
            if (square === 'd1') { type = 'Q'; color = 'w'; }

            state[square] = color + type;
        }
    });
    return state;
}

function getCurrentFEN(node) {
    const pieces = node.boardState || {};
    const ranks = Array(8).fill(null).map(() => Array(8).fill(''));
    
    Object.entries(pieces).forEach(([sq, code]) => {
        const file = 'abcdefgh'.indexOf(sq[0]);
        const rank = 8 - parseInt(sq[1]);
        ranks[rank][file] = code;
    });
    
    let fen = '';
    for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let f = 0; f < 8; f++) {
            if (ranks[r][f]) {
                fen += empty ? empty : '';
                fen += ranks[r][f].toLowerCase();
                empty = 0;
            } else {
                empty++;
            }
        }
        fen += empty ? empty : '';
        if (r < 7) fen += '/';
    }
    return fen + ' w - - 0 1';
}

function assignRepeatCountsToTree(node = rootNode, fen = getCurrentFEN(rootNode)) {
    node.children.forEach(child => {
        child.count = getMoveRepeatCount(fen, child.moveData.from, child.moveData.to);
        const nextFen = getCurrentFEN(child);
        assignRepeatCountsToTree(child, nextFen);
    });
}

// ==========================================
// 3. POSITION REPEAT STATISTICS
// ==========================================

async function loadPositionStats(fen) {
    const user = await getLoggedInUser();
    if (!user) {
        console.log("No user logged in – cannot load stats");
        return null;
    }

    const encodedFen = encodeURIComponent(fen);
    console.log("Loading stats for user:", user, "FEN:", fen, "Encoded:", encodedFen);

    try {
        const res = await proxyApiCall(`get-move-counts/${user}/${encodedFen}`, "GET");
        console.log("get-move-counts raw response:", res);

        // Handle both {success: true, data: [...]} and direct array [...]
        let countsArray = res;
        if (res && res.success && Array.isArray(res.data)) {
            countsArray = res.data;
        } else if (!Array.isArray(res)) {
            console.log("Unexpected response format:", res);
            return null;
        }

        if (countsArray.length === 0) {
            console.log("No moves found for this position");
            return {
                totalReaches: 0,
                nextMoves: []
            };
        }

        const stats = {
            totalReaches: 0,
            nextMoves: []
        };

        countsArray.forEach(entry => {
            stats.totalReaches += entry.count;
            stats.nextMoves.push({
                from: entry.from,
                to: entry.to,
                count: entry.count,
                isPossible: true,
                mainlineCount: 0
            });
        });

        console.log("Parsed stats:", stats);
        return stats;
    } catch (err) {
        console.error("Failed to load position stats:", err.message);
        return null;
    }
}

async function updateCurrentPositionStats() {
    const fen = getCurrentFEN(currentState.currentNode);
    currentPositionStats = await loadPositionStats(fen);
    renderNotationPanel();
}

async function incrementMoveCount(fen, from, to) {
    const user = await getLoggedInUser();
    if (!user) return;

    const payload = { user, fen, from, to };

    try {
        await proxyApiCall("increment-move-count", "POST", payload);
    } catch (err) {
        console.error("Failed to increment move count:", err);
    }
}

async function savePosition() {
    const user = await getLoggedInUser();
    if (!user) {
        alert("Please login first.");
        return;
    }

    const fen = getCurrentFEN(currentState.currentNode);

    async function saveTree(n = currentState.currentNode, currentFen = fen) {
        for (const child of n.children) {
            await incrementMoveCount(currentFen, child.moveData.from, child.moveData.to);
            const nextFen = getCurrentFEN(child);
            await saveTree(child, nextFen);
        }
    }

    await saveTree();

    await updateCurrentPositionStats();

    alert("Position saved – statistics updated for current board position.");
}

// ==========================================
// 4. UI SETUP
// ==========================================
let overlayElement = null;
let svgCanvas = null;

setInterval(() => {
    const board = document.querySelector('cg-board');
    if (board) {
        if (!document.getElementById('arrow-extension-overlay')) {
            getLoggedInUser().then(user => {
                if (!document.getElementById('arrow-extension-overlay')) {
                    createFloatingOverlay();
                    rootNode.boardState = scanFullBoard();
                    initialBoardState = { ...rootNode.boardState };
                    if(user) console.log(`Arrow Navigator initialized for user: ${user}`);
                }
            });
        } else {
            updateOverlayPosition(board);
        }
    }
}, 500);

function createFloatingOverlay() {
    overlayElement = document.createElement('div');
    overlayElement.id = 'arrow-extension-overlay';
    overlayElement.style.position = 'fixed';
    overlayElement.style.zIndex = '9999';
    overlayElement.style.pointerEvents = 'auto';
    overlayElement.style.backgroundColor = 'transparent'; 
    
    const style = document.createElement('style');
    style.innerHTML = `
        .grid-square { fill: none; stroke: white; stroke-width: 2px; opacity: 0.6; pointer-events: none; }
        .board-blur { fill: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px); pointer-events: auto; }
        .ghost-piece { font-family: "Noto Sans Symbols", "Chess Merida", sans-serif; font-weight: bold; font-size: 80px; dominant-baseline: central; text-anchor: middle; pointer-events: none; }
        .piece-w { fill: #000000; stroke: #fff; stroke-width: 1px; }
        .piece-b { fill: #ffffff; stroke: #000; stroke-width: 1px; filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.9)) drop-shadow(0 0 15px rgba(255, 255, 255, 0.6)); }
        .custom-arrow { stroke-width: 10px; stroke-opacity: 0.8; stroke-linecap: round; }
        .arrow-green { stroke: #2ecc71; }
        .arrow-yellow { stroke: #f1c40f; }
        .arrow-blue { stroke: #3498db; }
        .arrow-red { stroke: #e74c3c; }
        .arrow-orange { stroke: #e67e22; }
        .arrow-ghost { stroke: #bdc3c7; stroke-opacity: 0.3; }
        .link-line { stroke-width: 2px; stroke-dasharray: 4; }
        .move-ring { fill: transparent; stroke-width: 3px; cursor: pointer; }
        .ring-green { stroke: #2ecc71; }
        .ring-yellow { stroke: #f1c40f; }
        .ring-blue { stroke: #3498db; }
        .ring-red { stroke: #e74c3c; }
        .ring-orange { stroke: #e67e22; }
        .arrow-number { font-size: 14px; fill: white; font-weight: bold; text-shadow: 1px 1px 2px black; pointer-events: none; }
        .head-count { font-size: 12px; fill: white; font-weight: bold; text-shadow: 1px 1px 2px black; pointer-events: none; text-anchor: middle; }
        .project-btn { width: 45%; font-size: 10px; background: #333; color: white; border: 1px solid #555; cursor: pointer; margin-top: 5px; }
        .project-btn:hover { background: #555; }
    `;
    document.head.appendChild(style);

    const controls = document.createElement('div');
    controls.id = 'arrow-controls';
    
    controls.innerHTML = `
        <div id="status-text" style="color:#aaa; font-size:11px; text-align:center;">Screen 1</div>
        <button id="btn-hint-toggle" class="nav-btn" style="margin-bottom:5px;">Show Hint Board</button>
        <div class="btn-row">
            <button id="btn-screen-prev" class="nav-btn screen-btn" disabled>&lt;&lt;</button>
            <button id="btn-screen-next" class="nav-btn screen-btn" disabled>&gt;&gt;</button>
        </div>
        <div class="btn-row">
             <button id="btn-prev" class="nav-btn">&lt;</button>
            <button id="btn-next" class="nav-btn">&gt;</button>
        </div>
        <input type="text" id="nav-input" placeholder="Jump (e.g. 1.1, 2.1)">
        
        <div class="btn-row" style="margin-top:5px; border-top:1px solid #444; padding-top:5px;">
            <button id="btn-save-position" class="project-btn">Save Position</button>
            <button id="btn-save-proj" class="project-btn">Save File</button>
            <button id="btn-load-proj" class="project-btn">Load File</button>
        </div>

        <div id="move-list"></div>
    `;
    controls.addEventListener('mousedown', e => e.stopPropagation());
    controls.addEventListener('input', (e) => {
        if(e.target.id === 'nav-input') handleNavigationInput(e.target.value);
    });
    controls.querySelector('#btn-prev').addEventListener('click', stepBack);
    controls.querySelector('#btn-next').addEventListener('click', stepForward);
    controls.querySelector('#btn-screen-prev').addEventListener('click', prevScreen);
    controls.querySelector('#btn-screen-next').addEventListener('click', nextScreen);
    controls.querySelector('#btn-hint-toggle').addEventListener('click', toggleHintMode);
    controls.querySelector('#btn-save-position').addEventListener('click', savePosition);
    controls.querySelector('#btn-save-proj').addEventListener('click', saveProjectToFile);
    controls.querySelector('#btn-load-proj').addEventListener('click', loadProjectFromFile);

    const svgContainer = document.createElement('div');
    svgContainer.style.width = '100%';
    svgContainer.style.height = '100%';

    svgContainer.innerHTML = `
        <svg id="arrow-canvas" style="width:100%; height:100%;">
            <defs>
                ${createMarker("green", "#2ecc71")}
                ${createMarker("yellow", "#f1c40f")}
                ${createMarker("blue", "#3498db")}
                ${createMarker("red", "#e74c3c")}
                ${createMarker("orange", "#e67e22")}
                <marker id="arrowhead-ghost" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
                    <path d="M0,0 L4,2 L0,4 Z" fill="#bdc3c7" />
                </marker>
            </defs>
            <rect id="board-dimmer" class="board-blur" width="100%" height="100%" style="display:none;"></rect>
            <g id="grid-layer" style="display:none;"></g> 
            <g id="ghost-layer" style="display:none;"></g> 
            <g id="arrows-layer"></g>
            <g id="links-layer"></g>
            <g id="rings-layer"></g>
            <g id="text-layer"></g>
        </svg>
    `;

    overlayElement.appendChild(controls);
    overlayElement.appendChild(svgContainer);
    document.body.appendChild(overlayElement);
    svgCanvas = document.getElementById('arrow-canvas');
    setupMouseInteractions(overlayElement);
    renderBoardVisuals(); 
    renderNotationPanel();
}

function createMarker(name, color) {
    return `
        <marker id="arrowhead-${name}" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4 Z" fill="${color}" />
        </marker>
    `;
}

function updateOverlayPosition(board) {
    if (!overlayElement) return;
    const rect = board.getBoundingClientRect();
    const svgDiv = overlayElement.querySelector('div[style*="width: 100%"]');
    if(svgDiv) {
        overlayElement.style.top = rect.top + 'px';
        overlayElement.style.left = rect.left + 'px';
        overlayElement.style.width = rect.width + 'px';
        overlayElement.style.height = rect.height + 'px';
    }
}

// ==========================================
// 5. NAVIGATION LOGIC
// ==========================================

function toggleHintMode() {
    currentState.isHintMode = !currentState.isHintMode;
    const btn = document.getElementById('btn-hint-toggle');
    if (btn) btn.classList.toggle('active', currentState.isHintMode);
    renderBoardVisuals();
}

async function addMove(from, to, modifiers) {
    currentState.isCleanView = false;
    const existingIndex = currentState.currentNode.children.findIndex(
        child => child.moveData.from === from && child.moveData.to === to
    );
    if (existingIndex > -1) {
        currentState.currentNode.children.splice(existingIndex, 1);
    } else {
        moveIdCounter++;
        let color = null;
        if (modifiers.alt && modifiers.shift) color = 'orange';
        else if (modifiers.alt) color = 'blue';
        else if (modifiers.shift) color = 'red';
        
        const newNode = new MoveNode(`move_${moveIdCounter}`, currentState.currentNode, { from, to }, color);
        
        const fen = getCurrentFEN(currentState.currentNode);
        newNode.count = getMoveRepeatCount(fen, from, to) + 1;

        currentState.currentNode.children.push(newNode);
        
        saveArrow({
            from: from,
            to: to,
            color: color || 'green',
            number: moveIdCounter
        });

        try {
            await incrementMoveCount(fen, from, to);
        } catch (err) {
            console.error("Failed to increment move count:", err);
        }
    }
    await updateCurrentPositionStats();
    renderBoardVisuals();
    renderNotationPanel();
}

function handleRingClick(node, clickType, modifiers) {
    if (modifiers.alt || modifiers.shift) {
        if (modifiers.alt && modifiers.shift) node.customColor = 'orange';
        else if (modifiers.alt) node.customColor = 'blue';
        else if (modifiers.shift) node.customColor = 'red';
        renderBoardVisuals();
        renderNotationPanel();
        return;
    }

    if (clickType === 'single') {
        currentState.isCleanView = false;
        if (currentState.currentNode === node) {
             stepBack();
        } else {
             currentState.currentNode = node;
             currentState.activeChild = null; 
        }
    } else if (clickType === 'double') {
        currentState.isCleanView = !currentState.isCleanView;
    }
    renderBoardVisuals();
    renderNotationPanel();
}

function stepBack() {
    if (currentState.currentNode.parent) {
        currentState.currentNode = currentState.currentNode.parent;
        currentState.activeChild = null;
    }
    updateCurrentPositionStats();
    renderBoardVisuals(); 
    renderNotationPanel();
}

function stepForward() {
    if (currentState.currentNode.children.length > 0) {
        currentState.currentNode = currentState.currentNode.children[0];
        currentState.activeChild = null;
    }
    updateCurrentPositionStats();
    renderBoardVisuals();
    renderNotationPanel();
}

function prevScreen() {
    const path = getPathToCurrent();
    const currentScreenIdx = Math.floor(Math.max(0, path.length - 1) / MOVES_PER_SCREEN);
    if (currentScreenIdx > 0) {
        const targetLen = (currentScreenIdx * MOVES_PER_SCREEN) - 1;
        let temp = currentState.currentNode;
        let steps = path.length - (targetLen + 1);
        while(steps > 0 && temp.parent) {
            temp = temp.parent;
            steps--;
        }
        currentState.currentNode = temp;
    }
    updateCurrentPositionStats();
    renderBoardVisuals();
    renderNotationPanel();
}

function nextScreen() {
    let temp = currentState.currentNode;
    let limit = MOVES_PER_SCREEN;
    while(temp.children.length > 0 && limit > 0) {
        temp = temp.children[0];
        limit--;
    }
    currentState.currentNode = temp;
    updateCurrentPositionStats();
    renderBoardVisuals();
    renderNotationPanel();
}

function handleNavigationInput(text) {
    if (!text) return;
    const parts = text.split(/[,]+/).map(s => s.trim()).filter(s => s !== "");
    const commandQueues = {};
    let maxRequestedMove = 0;
    for (let part of parts) {
        const split = part.split('.').map(s => s.trim());
        if (split.length >= 2) {
            const moveNum = parseInt(split[0]);
            const option = parseInt(split[1]);
            if (!isNaN(moveNum) && !isNaN(option) && option > 0) {
                if (!commandQueues[moveNum]) commandQueues[moveNum] = [];
                commandQueues[moveNum].push(option - 1); 
                if (moveNum > maxRequestedMove) maxRequestedMove = moveNum;
            }
        }
    }
    
    let tempNode = rootNode;
    let moveCounter = 1;
    let isWhiteTurn = true;
    
    while (tempNode.children.length > 0) {
        let nextIndex = 0;
        let hasCommand = false;

        if (commandQueues[moveCounter] && commandQueues[moveCounter].length > 0) {
            nextIndex = commandQueues[moveCounter].shift();
            hasCommand = true;
        }
        
        if (!hasCommand && moveCounter > maxRequestedMove && tempNode.children.length > 1) {
            break;
        }

        if (tempNode.children[nextIndex]) {
            tempNode = tempNode.children[nextIndex];
        } else {
            break;
        }
        
        if (!isWhiteTurn) moveCounter++;
        isWhiteTurn = !isWhiteTurn;
    }
    
    currentState.currentNode = tempNode;
    updateCurrentPositionStats();
    renderBoardVisuals();
    renderNotationPanel();
}

function getPathToCurrent() {
    let path = [];
    let temp = currentState.currentNode;
    while(temp.parent) {
        path.unshift(temp); 
        temp = temp.parent;
    }
    return path;
}

// ==========================================
// 5. SERIALIZATION & FILE LOGIC
// ==========================================

function serializeTree(node) {
    return {
        id: node.id,
        moveData: node.moveData, 
        customColor: node.customColor,
        children: node.children.map(child => serializeTree(child))
    };
}

let targetNodeForResume = null; 
function rebuildTree(data, parentNode, targetId) {
    data.children.forEach(childData => {
        const newNode = new MoveNode(
            childData.id, 
            parentNode, 
            childData.moveData, 
            childData.customColor
        );
        parentNode.children.push(newNode);

        if (newNode.id === targetId) {
            targetNodeForResume = newNode;
        }

        rebuildTree(childData, newNode, targetId);
    });
}

function saveProjectToFile() {
    const dataToSave = {
        tree: serializeTree(rootNode),
        currentId: currentState.currentNode.id, 
        maxId: moveIdCounter,
        savedAt: Date.now()
    };
    
    const jsonString = JSON.stringify(dataToSave, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `lichess_arrows_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("Project File Downloaded!");
    const btn = document.getElementById('btn-save-proj');
    const originalText = btn.innerText;
    btn.innerText = "Downloaded!";
    setTimeout(() => btn.innerText = originalText, 1500);
}

function loadProjectFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const jsonString = event.target.result;
                const data = JSON.parse(jsonString);

                rootNode = new MoveNode("root", null, null); 
                
                moveIdCounter = data.maxId || 0;
                targetNodeForResume = rootNode; 
                
                rebuildTree(data.tree, rootNode, data.currentId);
                
                currentState.currentNode = targetNodeForResume;
                currentState.activeChild = null;
                currentState.isCleanView = false;

                renderBoardVisuals();
                renderNotationPanel();
                
                console.log("Project Loaded from File! Resumed at " + currentState.currentNode.id);
                
                const btn = document.getElementById('btn-load-proj');
                const originalText = btn.innerText;
                btn.innerText = "Loaded!";
                setTimeout(() => btn.innerText = originalText, 1500);

            } catch (err) {
                console.error("Error parsing JSON file:", err);
                alert("Invalid project file.");
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}

// ==========================================
// 6. RENDERING (Dual Mode)
// ==========================================

function renderBoardVisuals() {
    if (!svgCanvas) return;
    ['arrows-layer', 'links-layer', 'rings-layer', 'text-layer', 'ghost-layer', 'grid-layer'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerHTML = '';
    });
    const dimmer = document.getElementById('board-dimmer');
    const ghostLayer = document.getElementById('ghost-layer');
    const gridLayer = document.getElementById('grid-layer');
    
    const currentPath = getPathToCurrent();
    const currentLen = currentPath.length;
    const currentScreenIdx = Math.floor(Math.max(0, currentLen - 1) / MOVES_PER_SCREEN);
    const startIndex = currentScreenIdx * MOVES_PER_SCREEN;
    const endIndex = startIndex + MOVES_PER_SCREEN;
    const visiblePath = currentPath.slice(startIndex, endIndex);

    if (currentState.isHintMode) {
        dimmer.style.display = 'block';
        if (ghostLayer) ghostLayer.style.display = 'block';
        if (gridLayer) gridLayer.style.display = 'block';

        renderVirtualBoard(); 
        
        if (!currentState.isCleanView) {
            currentState.currentNode.children.forEach((child, index) => {
                const arrowColor = child.customColor || "yellow";
                const label = (index + 1).toString();
                drawArrowWithLabel(child, arrowColor, "yellow", label);
                
                if (child.children.length > 0) drawHeadText(child.moveData.to, child.children.length.toString());
            });
        }
        return; 
    }

    dimmer.style.display = 'none';
    if (ghostLayer) ghostLayer.style.display = 'none';
    if (gridLayer) gridLayer.style.display = 'none';

    document.getElementById('status-text').innerText = `Screen ${currentScreenIdx + 1}`;
    document.getElementById('btn-screen-prev').disabled = (currentScreenIdx === 0);
    
    if (currentScreenIdx > 0 && currentPath[startIndex - 1]) {
        drawArrowWithLabel(currentPath[startIndex - 1], "ghost", "ghost", "");
    }

    let isWhiteStart = true;
    if (currentPath.length > 0) {
        const rank = parseInt(currentPath[0].moveData.from.slice(1));
        if (rank > 4) isWhiteStart = false; 
    }

    visiblePath.forEach((node, idx) => {
        const realIndex = startIndex + idx; 
        const arrowColor = node.customColor || "green";
        const ringColor = node.customColor || "green";
        const label = getMoveLabel(realIndex, isWhiteStart);
        drawArrowWithLabel(node, arrowColor, ringColor, label);
        if (node.count > 1) drawHeadText(node.moveData.to, node.count);
    });

    if (!currentState.isCleanView) {
        currentState.currentNode.children.forEach((child, index) => {
            const arrowColor = child.customColor || "yellow";
            const label = (index + 1).toString();
            drawArrowWithLabel(child, arrowColor, "yellow", label);
            if (child.count > 1) drawHeadText(child.moveData.to, child.count);
        });
    }
}

function renderVirtualBoard() {
    const state = currentState.currentNode.boardState || {};
    const gridLayer = document.getElementById('grid-layer');
    if (gridLayer) {
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                rect.setAttribute("x", (f * 12.5) + "%");
                rect.setAttribute("y", (r * 12.5) + "%");
                rect.setAttribute("width", "12.5%");
                rect.setAttribute("height", "12.5%");
                rect.setAttribute("class", "grid-square");
                gridLayer.appendChild(rect);
            }
        }
    }
    
    const glyphs = {
        'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
        'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟'
    };
    Object.keys(state).forEach(square => {
        const code = state[square];
        const char = glyphs[code];
        if (char) {
            drawGhostPiece(square, char, code.startsWith('w') ? 'w' : 'b');
        }
    });
}

function drawGhostPiece(square, char, colorClass) {
    const container = document.getElementById('ghost-layer');
    const center = getSquareCenter(square);
    const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textEl.setAttribute("x", center.x + "%");
    textEl.setAttribute("y", center.y + "%");
    textEl.setAttribute("class", `ghost-piece piece-${colorClass}`);
    textEl.textContent = char;
    container.appendChild(textEl);
}

function getMoveLabel(index, isWhiteStart) {
    if (isWhiteStart) {
        if (index === 0) return "1W";
        return (Math.floor(index / 2) + 1).toString();
    } else {
        if (index === 0) return "1B";
        return (Math.floor((index + 1) / 2) + 1).toString();
    }
}

// ==========================================
// 7. RENDER NOTATION
// ==========================================

function renderNotationPanel() {
    const container = document.getElementById('move-list');
    if (!container) return;
    container.innerHTML = '';

    // Show current position stats at the top
    if (currentPositionStats) {
        const statsDiv = document.createElement('div');
        statsDiv.style.color = '#ffeb3b';
        statsDiv.style.marginBottom = '12px';
        statsDiv.style.fontSize = '13px';
        statsDiv.innerHTML = `<strong>Position reached ${currentPositionStats.totalReaches} time${currentPositionStats.totalReaches === 1 ? '' : 's'}</strong><br>`;

        if (currentPositionStats.nextMoves.length > 0) {
            let movesText = currentPositionStats.nextMoves.map(m => {
                let str = `${m.from}${m.to} (${m.count}`;
                if (m.isPossible) str += 'P';
                if (m.mainlineCount > 0) str += `,${m.mainlineCount}`;
                str += ')';
                return str;
            });
            statsDiv.innerHTML += 'Next moves: ' + movesText.join(' , ');
        } else {
            statsDiv.innerHTML += 'No previous next moves recorded from this position.';
        }

        container.appendChild(statsDiv);
    } else {
        const loading = document.createElement('div');
        loading.style.color = '#a4a4a4';
        loading.innerText = 'Loading position stats...';
        container.appendChild(loading);
    }

    const activePath = getPathToCurrent();
    let futurePath = [];
    let temp = currentState.currentNode;
    while(temp.children.length > 0) {
        temp = temp.children[0];
        futurePath.push(temp);
    }
    const displayPath = [...activePath, ...futurePath];

    let moveCounter = 1; 
    let isWhiteTurn = true;
    if (displayPath.length > 0) {
         const rank = parseInt(displayPath[0].moveData.from.slice(1));
         if (rank > 4) isWhiteTurn = false; 
    }

    displayPath.forEach((node, index) => {
        const div = document.createElement('div');
        div.className = 'notation-line';

        const numSpan = document.createElement('span');
        numSpan.className = 'notation-turn';
        if (isWhiteTurn) {
            numSpan.innerText = `${moveCounter}.`;
            div.appendChild(numSpan);
        } else if (index === 0) {
            numSpan.innerText = `${moveCounter}...`;
            div.appendChild(numSpan);
        }

        const moveSpan = document.createElement('span');
        moveSpan.className = 'notation-move';
        moveSpan.innerText = node.san;
        
        if (node.count > 1) {
            const countSpan = document.createElement('span');
            countSpan.style.color = '#ffeb3b';
            countSpan.innerText = ` ×${node.count}`;
            moveSpan.appendChild(countSpan);
        }

        if (activePath.includes(node)) {
            if (node === currentState.currentNode) {
                 moveSpan.classList.add('notation-active'); 
                 setTimeout(() => moveSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 10);
             } else {
                 moveSpan.style.color = "#2ecc71";
            }
        } else {
             moveSpan.style.color = "#888";
        }
        
        moveSpan.addEventListener('click', () => {
            currentState.currentNode = node;
            renderBoardVisuals();
            renderNotationPanel();
        });
        div.appendChild(moveSpan);

        if (node.parent && node.parent.children.length > 1) {
            const siblings = node.parent.children.filter(n => n !== node);
            if (siblings.length > 0) {
                const varContainer = document.createElement('span');
                varContainer.className = 'variation-container';
                varContainer.innerText = "or ";
                
                siblings.forEach((sibling, i) => {
                    const link = document.createElement('span');
                    link.className = 'variation-link';
                    link.innerText = sibling.san;
                    if (sibling.count > 1) {
                        link.innerText += ` ×${sibling.count}`;
                    }
                    link.addEventListener('click', () => {
                        currentState.currentNode = sibling;
                        renderBoardVisuals();
                        renderNotationPanel();
                    });
      
                    varContainer.appendChild(link);
                    if (i < siblings.length - 1) {
                        varContainer.appendChild(document.createTextNode(", "));
                    }
                });
                div.appendChild(varContainer);
            }
        }
        container.appendChild(div);
        if (!isWhiteTurn) moveCounter++; 
        isWhiteTurn = !isWhiteTurn;
    });
}

// ==========================================
// 8. DRAWING HELPERS
// ==========================================

function drawArrowWithLabel(node, arrowColor, ringColor, labelText) {
    const arrowLayer = document.getElementById('arrows-layer');
    const linkLayer = document.getElementById('links-layer');
    const ringLayer = document.getElementById('rings-layer');
    const textLayer = document.getElementById('text-layer');

    const start = getSquareCenter(node.moveData.from);
    const end = getSquareCenter(node.moveData.to);
    const cssClass = `custom-arrow arrow-${arrowColor}`;
    const markerId = `url(#arrowhead-${arrowColor})`;
    
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", start.x + "%");
    line.setAttribute("y1", start.y + "%");
    line.setAttribute("x2", end.x + "%");
    line.setAttribute("y2", end.y + "%");
    line.setAttribute("class", cssClass);
    line.setAttribute("marker-end", markerId);
    arrowLayer.appendChild(line);
    if (arrowColor === 'ghost') return;

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    const offset = 4; 
    let px = -dy / len * offset;
    let py = dx / len * offset;
    const labelX = midX + px;
    const labelY = midY + py;
    const link = document.createElementNS("http://www.w3.org/2000/svg", "line");
    link.setAttribute("x1", midX + "%");
    link.setAttribute("y1", midY + "%");
    link.setAttribute("x2", labelX + "%");
    link.setAttribute("y2", labelY + "%");
    link.setAttribute("class", `link-line arrow-${arrowColor}`);
    linkLayer.appendChild(link);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", labelX + "%");
    circle.setAttribute("cy", labelY + "%");
    circle.setAttribute("r", "3.5%"); 
    circle.setAttribute("class", `move-ring ring-${ringColor}`);

    circle.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        const modifiers = { alt: e.altKey, shift: e.shiftKey };
        handleRingClick(node, 'single', modifiers); 
    });
    circle.addEventListener('dblclick', (e) => { 
        e.stopPropagation(); 
        handleRingClick(node, 'double', {}); 
    });
    ringLayer.appendChild(circle);

    const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textEl.setAttribute("x", labelX + "%");
    textEl.setAttribute("y", labelY + "%");
    textEl.setAttribute("class", "arrow-number");
    textEl.textContent = labelText;
    textLayer.appendChild(textEl);
}

function drawHeadText(square, text) {
    const container = document.getElementById('text-layer');
    const center = getSquareCenter(square);
    const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textEl.setAttribute("x", center.x + "%");
    textEl.setAttribute("y", center.y + "%");
    textEl.setAttribute("class", "head-count");
    textEl.setAttribute("font-size", "18px"); 
    textEl.setAttribute("dy", "1px"); 
    textEl.textContent = text;
    container.appendChild(textEl);
}

// ==========================================
// 9. INPUT
// ==========================================
function setupMouseInteractions(overlay) {
    let startSquare = null;
    overlay.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.tagName === 'circle') return; 
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return; 
        const svg = document.getElementById('arrow-canvas');
        if(svg) {
            const rect = svg.getBoundingClientRect(); 
            startSquare = getSquareFromEvent(e, rect);
        }
    });
    overlay.addEventListener('mouseup', (e) => {
        if (!startSquare) return;
        const svg = document.getElementById('arrow-canvas');
        if(svg) {
            const rect = svg.getBoundingClientRect();
            const endSquare = getSquareFromEvent(e, rect);
            if (endSquare && startSquare !== endSquare) {
                 const modifiers = { alt: e.altKey, shift: e.shiftKey };
                 addMove(startSquare, endSquare, modifiers);
            }
        }
        startSquare = null;
    });
}

function getSquareFromEvent(event, rect) {
    const isBlack = document.querySelector('.cg-wrap')?.classList.contains('orientation-black');
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    let file = Math.floor(x * 8);
    let rank = 7 - Math.floor(y * 8);
    if (isBlack) { file = 7 - file; rank = 7 - rank; }
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    return files[file] + (rank + 1);
}

function getSquareCenter(square) {
    if(!square) return {x:0, y:0};
    const isBlack = document.querySelector('.cg-wrap')?.classList.contains('orientation-black');
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    let fileIndex = files.indexOf(square[0]);
    let rankIndex = parseInt(square.slice(1)) - 1;
    if (isBlack) { fileIndex = 7 - fileIndex; rankIndex = 7 - rankIndex; }
    return { x: (fileIndex * 12.5) + 6.25, y: ((7 - rankIndex) * 12.5) + 6.25 };
}

// ==========================================
// INITIALIZATION
// ==========================================

async function init() {
    await loadRepeatCounts();
    assignRepeatCountsToTree();
}

init();