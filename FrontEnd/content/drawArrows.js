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
            console.log("400 details – check Network tab for response body");
            alert("Save arrow failed (400) – likely missing variationID or analysis. Check console.");
        }
    }
}

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
        positionMoveCounts.get(key).set(moveKey, {
            total: entry.count || 0,
            possible: entry.possibleCount || 0,
            mainline: entry.mainlineCount || 0
        });
    });
}

function getMoveRepeatCount(fen, from, to) {
    const moves = positionMoveCounts.get(fen);
    if (!moves) return { total: 0, possible: 0, mainline: 0 };
    return moves.get(from + to) || { total: 0, possible: 0, mainline: 0 };
}

// Helper function for zero padding
function padZero(num) {
    return num < 10 ? `0${num}` : `${num}`;
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
        this.count = { total: 0, possible: 0, mainline: 0 };
        
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

// Repeat count cache: fen → move (from-to) → {total, possible, mainline}
let positionMoveCounts = new Map();

// Stats for current position only
let currentPositionStats = null;

// Track if we're in the process of saving
let isSaving = false;

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
        const counts = getMoveRepeatCount(fen, child.moveData.from, child.moveData.to);
        child.count = counts;
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
    console.log("Loading stats for FEN:", fen);

    try {
        const res = await proxyApiCall(`get-move-counts/${user}/${encodedFen}`, "GET");
        console.log("get-move-counts raw response:", res);

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
            stats.totalReaches += (entry.count || 0) + (entry.possibleCount || 0) + (entry.mainlineCount || 0);
            
            const total = (entry.count || 0) + (entry.possibleCount || 0) + (entry.mainlineCount || 0);
            
            stats.nextMoves.push({
                from: entry.from,
                to: entry.to,
                total: total,
                possible: entry.possibleCount || 0,
                mainline: entry.mainlineCount || 0,
                san: entry.san || "",
                isPossible: (entry.possibleCount || 0) > 0
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

async function incrementMoveCount(fen, from, to, type = 'mainline') {
    const user = await getLoggedInUser();
    if (!user) return;

    const payload = { 
        user, 
        fen, 
        from, 
        to,
        type: type
    };

    try {
        await proxyApiCall("increment-move-count", "POST", payload);
    } catch (err) {
        console.error("Failed to increment move count:", err);
    }
}

async function savePosition() {
    if (isSaving) return; // Prevent multiple saves
    isSaving = true;
    
    const user = await getLoggedInUser();
    if (!user) {
        alert("Please login first.");
        isSaving = false;
        return;
    }

    const fen = getCurrentFEN(currentState.currentNode);

    // FIX 1: Remove duplicate possible moves that are also mainline moves
    // Group moves by from-to to identify duplicates
    const moveMap = new Map();
    
    function collectMoves(n = currentState.currentNode, currentFen = fen) {
        for (const child of n.children) {
            const moveKey = child.moveData.from + child.moveData.to;
            const existing = moveMap.get(moveKey);
            
            if (existing) {
                // If we have both possible and mainline versions, keep only mainline
                if (existing.type === 'possible' && child.customColor !== 'yellow') {
                    // Replace possible with mainline
                    moveMap.set(moveKey, {
                        node: child,
                        fen: currentFen,
                        type: 'mainline'
                    });
                }
            } else {
                moveMap.set(moveKey, {
                    node: child,
                    fen: currentFen,
                    type: child.customColor === 'yellow' ? 'possible' : 'mainline'
                });
            }

            const nextFen = getCurrentFEN(child);
            collectMoves(child, nextFen);
        }
    }

    collectMoves();

    // Save only unique moves (no duplicates)
    for (const [moveKey, moveInfo] of moveMap) {
        const { node, fen: moveFen, type } = moveInfo;
        
        await incrementMoveCount(moveFen, node.moveData.from, node.moveData.to, type);
        
        if (!positionMoveCounts.has(moveFen)) {
            positionMoveCounts.set(moveFen, new Map());
        }
        const movesMap = positionMoveCounts.get(moveFen);
        const currentCounts = movesMap.get(moveKey) || { total: 0, possible: 0, mainline: 0 };
        
        if (type === 'possible') {
            currentCounts.possible = (currentCounts.possible || 0) + 1;
        } else {
            currentCounts.mainline = (currentCounts.mainline || 0) + 1;
        }
        currentCounts.total = currentCounts.total + 1;
        
        movesMap.set(moveKey, currentCounts);
        node.count = currentCounts;
    }

    // Update all node counts in the tree
    function updateTreeCounts(n = currentState.currentNode, currentFen = fen) {
        for (const child of n.children) {
            const moveKey = child.moveData.from + child.moveData.to;
            const counts = positionMoveCounts.get(currentFen)?.get(moveKey) || { total: 0, possible: 0, mainline: 0 };
            child.count = counts;
            
            const nextFen = getCurrentFEN(child);
            updateTreeCounts(child, nextFen);
        }
    }
    
    updateTreeCounts();

    await updateCurrentPositionStats();
    
    renderBoardVisuals();
    renderNotationPanel();

    alert("Position saved! Move counts and statistics have been updated.");
    isSaving = false;
}

// ==========================================
// 4. UI SETUP
// ==========================================
let overlayElement = null;
let svgCanvas = null;
let lastClickTime = 0;
const CLICK_DELAY = 300; // ms delay between clicks

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
        .move-ring { fill: transparent; stroke-width: 3px; cursor: pointer; transition: stroke-width 0.1s; pointer-events: auto; }
        .move-ring:hover { stroke-width: 4px; }
        .ring-green { stroke: #2ecc71; }
        .ring-yellow { stroke: #f1c40f; }
        .ring-blue { stroke: #3498db; }
        .ring-red { stroke: #e74c3c; }
        .ring-orange { stroke: #e67e22; }
        .arrow-number { 
            font-size: 14px; 
            fill: white; 
            font-weight: bold; 
            text-shadow: 1px 1px 2px black; 
            pointer-events: none;
            user-select: none;
            -webkit-user-select: none;
        }
        .head-count { font-size: 12px; fill: white; font-weight: bold; text-shadow: 1px 1px 2px black; pointer-events: none; text-anchor: middle; }
        .project-btn { width: 45%; font-size: 10px; background: #333; color: white; border: 1px solid #555; cursor: pointer; margin-top: 5px; padding: 4px; }
        .project-btn:hover { background: #555; }
        .nav-btn { width: 45px; font-size: 12px; background: #444; color: white; border: 1px solid #666; cursor: pointer; margin: 2px; padding: 4px; }
        .nav-btn:hover { background: #555; }
        .nav-btn:disabled { background: #222; color: #666; cursor: not-allowed; }
        .btn-row { display: flex; justify-content: space-between; margin: 2px 0; }
        #nav-input { width: 100%; margin: 5px 0; padding: 4px; background: #222; color: white; border: 1px solid #444; }
        #move-list { margin-top: 10px; max-height: 200px; overflow-y: auto; font-size: 12px; }
        .notation-line { padding: 2px 5px; margin: 1px 0; border-radius: 3px; }
        .notation-turn { color: #888; margin-right: 5px; }
        .notation-move { cursor: pointer; }
        .notation-active { background: #2ecc71; color: white !important; padding: 0 5px; border-radius: 3px; }
        .variation-container { color: #666; margin-left: 5px; }
        .variation-link { color: #3498db; cursor: pointer; margin-left: 3px; }
        .variation-link:hover { text-decoration: underline; }
        .possible-move { color: #f1c40f; }
        .mainline-move { color: #2ecc71; }
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

        <div id="notation-panel">
    <div id="position-stats"></div>   <!-- FIXED -->
    <div id="move-list"></div>        <!-- SCROLL -->
    </div>

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

async function addMove(from, to, modifiers) {
    const now = Date.now();
    if (now - lastClickTime < CLICK_DELAY) return; // Prevent rapid clicks
    lastClickTime = now;
    
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
        
        newNode.count = { total: 0, possible: 0, mainline: 0 };
        
        currentState.currentNode.children.push(newNode);
        
        saveArrow({
            from: from,
            to: to,
            color: color || 'green',
            number: moveIdCounter
        });
    }
    await updateCurrentPositionStats();
    renderBoardVisuals();
    renderNotationPanel();
}

function toggleHintMode() {
    currentState.isHintMode = !currentState.isHintMode;
    const btn = document.getElementById('btn-hint-toggle');
    if (btn) {
        btn.textContent = currentState.isHintMode ? "Hide Hint Board" : "Show Hint Board";
        btn.classList.toggle('active', currentState.isHintMode);
    }
    
    // Reset screen navigation when toggling hint mode
    if (!currentState.isHintMode) {
        const currentPath = getPathToCurrent();
        const currentLen = currentPath.length;
        const currentScreenIdx = Math.floor(Math.max(0, currentLen - 1) / MOVES_PER_SCREEN);
        document.getElementById('status-text').innerText = `Screen ${currentScreenIdx + 1}`;
    }
    
    renderBoardVisuals();
}

function handleRingClick(node, clickType, modifiers) {
    const now = Date.now();
    if (now - lastClickTime < CLICK_DELAY) return; // Prevent rapid clicks
    lastClickTime = now;
    
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
    // If in hint mode, exit hint mode first
    if (currentState.isHintMode) {
        currentState.isHintMode = false;
        document.getElementById('btn-hint-toggle').textContent = "Show Hint Board";
    }
    
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
    // If in hint mode, exit hint mode first
    if (currentState.isHintMode) {
        currentState.isHintMode = false;
        document.getElementById('btn-hint-toggle').textContent = "Show Hint Board";
    }
    
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
// 6. SERIALIZATION & FILE LOGIC
// ==========================================

function serializeTree(node) {
    return {
        id: node.id,
        moveData: node.moveData, 
        customColor: node.customColor,
        count: node.count,
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
        newNode.count = childData.count || { total: 0, possible: 0, mainline: 0 };
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
// 7. RENDERING
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
    
    if (currentState.isHintMode) {
        dimmer.style.display = 'block';
        if (ghostLayer) ghostLayer.style.display = 'block';
        if (gridLayer) gridLayer.style.display = 'block';

        renderVirtualBoard(); 
        
        // Draw the current move path in hint mode with labels
        const currentPath = getPathToCurrent();
        if (currentPath.length > 0) {
            // Get the correct label for the last move
            const lastNode = currentPath[currentPath.length - 1];
            if (lastNode) {
                const arrowColor = lastNode.customColor || "green";
                const ringColor = lastNode.customColor || "green";
                
                // Get the label for this move
                let isWhiteStart = true;
                if (currentPath.length > 0) {
                    const rank = parseInt(currentPath[0].moveData.from.slice(1));
                    if (rank > 4) isWhiteStart = false; 
                }
                
                // Calculate the index of this move in the full path
                const fullIndex = currentPath.length - 1;
                const label = getMoveLabel(fullIndex, isWhiteStart);
                
                // Draw the arrow with its label
                drawArrowWithLabel(lastNode, arrowColor, ringColor, label);
            }
        }
        
        // Draw possible moves (children)
        if (!currentState.isCleanView) {
            currentState.currentNode.children.forEach((child, index) => {
                const arrowColor = child.customColor || "yellow";
                const label = (index + 1).toString();
                drawArrowWithLabel(child, arrowColor, "yellow", label);
                
                // Show possible move count on arrow head
                if (child.children.length > 1) {
                    drawHeadText(child.moveData.to, child.children.length);
                }
            });
        }
        
        return; 
    }

    // NORMAL MODE (not hint mode)
    dimmer.style.display = 'none';
    if (ghostLayer) ghostLayer.style.display = 'none';
    if (gridLayer) gridLayer.style.display = 'none';

    const currentPath = getPathToCurrent();
    const currentLen = currentPath.length;
    const currentScreenIdx = Math.floor(Math.max(0, currentLen - 1) / MOVES_PER_SCREEN);
    const startIndex = currentScreenIdx * MOVES_PER_SCREEN;
    const endIndex = startIndex + MOVES_PER_SCREEN;
    const visiblePath = currentPath.slice(startIndex, endIndex);

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
        
        // Always draw the arrow with label (even if empty)
        drawArrowWithLabel(node, arrowColor, ringColor, label);
        
        // Show count on arrow head if > 1
        if (node.count.total > 1) {
            drawHeadText(node.moveData.to, node.count.total);
        }
        
        // Show possible move count on arrow head
        if (node.children.length > 1) {
            drawHeadText(node.moveData.to, node.children.length);
        }
    });

    if (!currentState.isCleanView) {
        currentState.currentNode.children.forEach((child, index) => {
            const arrowColor = child.customColor || "yellow";
            const label = (index + 1).toString();
            drawArrowWithLabel(child, arrowColor, "yellow", label);
            
            // Show count on arrow head if > 1
            if (child.count.total > 1) {
                drawHeadText(child.moveData.to, child.count.total);
            }
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
        if (index === 0) return "1W"; // Keep "1W" for white's first move
        return (Math.floor(index / 2) + 1).toString();
    } else {
        if (index === 0) return "1B"; // Keep "1B" for black's first move if starting
        return (Math.floor((index + 1) / 2)).toString();
    }
}

// ==========================================
// 8. RENDER NOTATION PANEL
// ==========================================

function renderNotationPanel() {
    const statsContainer = document.getElementById('position-stats');
    const moveContainer = document.getElementById('move-list');

    if (!statsContainer || !moveContainer) return;

    statsContainer.innerHTML = '';
    moveContainer.innerHTML = '';

    // ============================================================
    // 1. FIXED TOP STATS SECTION (Position Statistics)
    // ============================================================
    if (currentPositionStats) {
        const statsDiv = document.createElement('div');
        statsDiv.style.color = '#ffeb3b';
        statsDiv.style.padding = '8px 6px';
        statsDiv.style.borderBottom = '1px solid #444';
        statsDiv.style.fontSize = '13px';
        statsDiv.style.lineHeight = '1.5';

        const totalStr = padZero(currentPositionStats.totalReaches);

        let positionHeader = "";
        if (currentState.currentNode === rootNode) {
            positionHeader = `Start Position (${totalStr})`;
        } else {
            const path = getPathToCurrent();
            const ply = path.length - 1;
            const moveNum = Math.floor((ply + 1) / 2);
            const isWhite = (ply % 2 !== 0);

            const movePrefix = isWhite ? `${moveNum}.` : `${moveNum}...`;
            const moveSan = currentState.currentNode.san || "Move";
            positionHeader = `${movePrefix} ${moveSan} (${totalStr})`;
        }

        let nextMovesText = "";
        if (currentPositionStats.nextMoves.length > 0) {
            const path = getPathToCurrent();
            const currentPly = path.length - 1;
            const nextPly = currentPly + 1;
            const nextMoveNum = Math.ceil(nextPly / 2);
            const nextPrefix = (nextPly % 2 !== 0) ? `${nextMoveNum}.` : `${nextMoveNum}...`;

            const movesStrings = currentPositionStats.nextMoves.map(m => {
                const moveLabel = m.san || `${m.from}-${m.to}`;
                const parts = [];
                if (m.possible > 0) parts.push(`${padZero(m.possible)}P`);
                if (m.mainline > 0) parts.push(padZero(m.mainline));
                const countStr = parts.length ? `(${parts.join(',')})` : '';

                return `<span class="${m.possible > 0 ? 'possible-move' : 'mainline-move'}">${moveLabel}</span>
                        <span style="color:#ffeb3b">${countStr}</span>`;
            });

            nextMovesText = `
                <div style="margin-top:5px;color:#a4a4a4;">
                    ${nextPrefix} ${movesStrings.join(' , ')}
                </div>
                <div style="color:#888;font-size:10px;margin-top:3px;">
                    <span class="possible-move">Yellow</span>: Possible |
                    <span class="mainline-move">Green</span>: Mainline
                </div>
            `;
        } else {
            nextMovesText = `
                <div style="color:#777;font-style:italic;margin-top:5px;">
                    No saved moves from this position
                </div>`;
        }

        statsDiv.innerHTML = `
            <strong style="color:#2ecc71">${positionHeader}</strong>
            <div style="color:#a4a4a4;font-size:11px;margin-top:2px;">
                Position reached ${totalStr} time${currentPositionStats.totalReaches === 1 ? '' : 's'}
            </div>
            ${nextMovesText}
        `;

        statsContainer.appendChild(statsDiv);
    } else {
        const statsDiv = document.createElement('div');
        statsDiv.style.color = '#e74c3c';
        statsDiv.style.padding = '8px 6px';
        statsDiv.style.borderBottom = '1px solid #444';
        statsDiv.style.fontSize = '13px';

        statsDiv.innerHTML = `
            <strong>Unsaved Position</strong>
            <div style="color:#a4a4a4;font-size:11px;margin-top:2px;">
                Click "Save Position" to record move statistics
            </div>
            <div style="color:#888;font-size:10px;margin-top:3px;">
                Click = mainline | Alt+click = possible
            </div>
        `;
        statsContainer.appendChild(statsDiv);
    }

    // ============================================================
    // 2. SCROLLABLE NOTATION LIST (Moves Only)
    // ============================================================
    const activePath = getPathToCurrent();
    let futurePath = [];
    let temp = currentState.currentNode;

    while (temp.children.length > 0) {
        temp = temp.children[0];
        futurePath.push(temp);
    }

    const displayPath = [...activePath, ...futurePath];

    let moveCounter = 1;
    let isWhiteTurn = true;

    displayPath.forEach((node, index) => {
        if (!node.moveData) return;

        const div = document.createElement('div');
        div.className = 'notation-line';

        if (isWhiteTurn || index === 0) {
            const numSpan = document.createElement('span');
            numSpan.className = 'notation-turn';
            numSpan.innerText = isWhiteTurn ? `${moveCounter}.` : `${moveCounter}...`;
            div.appendChild(numSpan);
        }

        const moveSpan = document.createElement('span');
        moveSpan.className = 'notation-move';
        moveSpan.innerHTML = node.san;

        if (node.count.total > 0) {
            const countSpan = document.createElement('span');
            countSpan.style.marginLeft = '3px';
            countSpan.style.fontSize = '0.9em';
            countSpan.style.color = node.customColor === 'yellow' ? '#f1c40f' : '#2ecc71';

            const parts = [];
            if (node.count.possible > 0) parts.push(`${node.count.possible}P`);
            if (node.count.mainline > 0) parts.push(`${node.count.mainline}`);

            countSpan.innerText = `×${parts.length ? parts.join(',') : node.count.total}`;
            moveSpan.appendChild(countSpan);
        }

        if (node === currentState.currentNode) {
            moveSpan.classList.add('notation-active');
            setTimeout(() => moveSpan.scrollIntoView({ block: 'nearest' }), 10);
        } else if (activePath.includes(node)) {
            moveSpan.style.color = node.customColor === 'yellow' ? '#f1c40f' : '#2ecc71';
        } else {
            moveSpan.style.color = '#888';
        }

        moveSpan.addEventListener('click', () => {
            currentState.currentNode = node;
            renderBoardVisuals();
            renderNotationPanel();
        });

        div.appendChild(moveSpan);
        moveContainer.appendChild(div);

        if (!isWhiteTurn) moveCounter++;
        isWhiteTurn = !isWhiteTurn;
    });
}


// ==========================================
// 9. DRAWING HELPERS
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

    // Create a transparent rectangle behind the text to prevent clicks
    const textBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    textBg.setAttribute("x", (labelX - 3) + "%");
    textBg.setAttribute("y", (labelY - 1.5) + "%");
    textBg.setAttribute("width", "6%");
    textBg.setAttribute("height", "3%");
    textBg.setAttribute("fill", "transparent");
    textBg.setAttribute("pointer-events", "none");
    textLayer.appendChild(textBg);

    const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textEl.setAttribute("x", labelX + "%");
    textEl.setAttribute("y", labelY + "%");
    textEl.setAttribute("class", "arrow-number");
    textEl.setAttribute("pointer-events", "none");
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
    textEl.setAttribute("pointer-events", "none");
    textEl.textContent = text;
    container.appendChild(textEl);
}

// ==========================================
// 10. INPUT (FIXED for click issues)
// ==========================================
function setupMouseInteractions(overlay) {
    let startSquare = null;
    let isDrawing = false;
    let mouseDownTime = 0;
    
    overlay.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        mouseDownTime = Date.now();
        
        // Check if clicking on interactive elements
        if (e.target.tagName === 'circle' || 
            e.target.tagName === 'INPUT' || 
            e.target.tagName === 'BUTTON' ||
            e.target.tagName === 'text') {
            return;
        }
        
        const svg = document.getElementById('arrow-canvas');
        if(svg) {
            const rect = svg.getBoundingClientRect(); 
            startSquare = getSquareFromEvent(e, rect);
            isDrawing = true;
        }
    });
    
    overlay.addEventListener('mousemove', (e) => {
        if (!isDrawing || !startSquare) return;
    });
    
    overlay.addEventListener('mouseup', (e) => {
        if (!isDrawing || !startSquare) return;
        
        // Check if this was a quick click (not a drag)
        const clickDuration = Date.now() - mouseDownTime;
        if (clickDuration > 200) {
            const svg = document.getElementById('arrow-canvas');
            if(svg) {
                const rect = svg.getBoundingClientRect();
                const endSquare = getSquareFromEvent(e, rect);
                if (endSquare && startSquare !== endSquare) {
                    const modifiers = { 
                        alt: e.altKey, 
                        shift: e.shiftKey 
                    };
                    addMove(startSquare, endSquare, modifiers);
                }
            }
        }
        
        startSquare = null;
        isDrawing = false;
        mouseDownTime = 0;
    });
    
    // Add a simple click handler for navigation (not drawing)
    overlay.addEventListener('click', (e) => {
        // Only handle clicks on the board background, not on interactive elements
        if (e.target.id === 'board-dimmer' || 
            e.target.tagName === 'rect' || 
            e.target.tagName === 'svg') {
            
            // Check if this was a quick click
            if (Date.now() - mouseDownTime < 200) {
                console.log("Board background clicked");
            }
        }
    });
    
    // Add touch support
    overlay.addEventListener('touchstart', (e) => {
        if (e.target.tagName === 'circle' || e.target.tagName === 'text') return;
        const touch = e.touches[0];
        const svg = document.getElementById('arrow-canvas');
        if(svg) {
            const rect = svg.getBoundingClientRect();
            startSquare = getSquareFromEvent({
                clientX: touch.clientX,
                clientY: touch.clientY
            }, rect);
            isDrawing = true;
        }
    });
    
    overlay.addEventListener('touchend', (e) => {
        if (!isDrawing || !startSquare) return;
        const touch = e.changedTouches[0];
        const svg = document.getElementById('arrow-canvas');
        if(svg) {
            const rect = svg.getBoundingClientRect();
            const endSquare = getSquareFromEvent({
                clientX: touch.clientX,
                clientY: touch.clientY
            }, rect);
            if (endSquare && startSquare !== endSquare) {
                addMove(startSquare, endSquare, { alt: false, shift: false });
            }
        }
        startSquare = null;
        isDrawing = false;
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
    // Load any previously saved counts
    await loadRepeatCounts();
    assignRepeatCountsToTree();
    
    // Load current position stats
    await updateCurrentPositionStats();
    
    console.log("Arrow Navigator initialized - use 'Save Position' to record move statistics");
    console.log("Yellow arrows = Possible moves | Green arrows = Mainline moves");
}

// Call init when ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}