# ♟️ CheckM8: Interactive Chess Learning and Analysis System

**CheckM8** is an extension designed primarily for **beginner-level chess players** to enhance learning on Lichess.org. It extends the native arrow tool with persistent, colored, numbered, and engine-analyzed arrows, move repetition tracking, and intuitive legal-move visualization to help newcomers understand piece movement and basic strategy.

While advanced players may find some features useful for opening exploration or variation review, the core focus is on supporting early-stage learners by making chess concepts more visual and interactive.

## 🚀 Key Features

### 🔐 User Authentication
- Secure login/signup with username and password
- Optional email with OTP-based password reset
- All data (arrows, move counts, statistics) saved to the user account for persistence

### 👶 Beginner-Friendly Legal Moves
- **left-click** on any piece shows **white shiny dots** on all legal destination squares
- Helps beginners quickly learn and visualize how each piece moves

### ♟️ Enhanced Arrow System
- Draw arrows with **left-click drag**
- **Custom colors** via modifiers:
  - No modifier → Green (mainline)
  - Shift → Red
  - Alt → Blue
  - Alt+Shift → Orange
  - Yellow automatically used for possible moves
- **Automatic numbering** on arrows
- **Stockfish-powered analysis**:
  - Arrows colored by quality: Blue (best), Green (good), Red (bad)

### 📊 Move Statistics & Learning Insights
- Track how often you've played or considered moves in each position
- Distinction between mainline (green) and possible (yellow) moves
- Visual counts on arrow heads and notation panel
- "Save Position" records current variation tree frequencies

### 🧭 Navigation & Hint Mode
- Navigate your arrow tree with prev/next buttons
- Screen-based view (8 moves per screen)
- **Hint Mode**: Shows moved ghost pieces

### 💾 Save & Load
- Save/load entire arrow tree + position to local JSON file
- Persistent per-game/analysis board

### 📝 Notation Panel
- Live move list with SAN notation
- Click moves to navigate
- Position reach counts and next-move suggestions with frequencies

## 🛠️ Installation

1. Clone or download this repository
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder
5. Visit lichess.org — CheckM8 panel appears on the right of the board

**Note**: Full persistence requires the companion backend server running locally or deployed. 

## 🤝 About This Project

This extension was developed as a **group project** by **Group 9**, third-year students at the **University of Vavuniya**, Sri Lanka.


## 🙏 Acknowledgments
- Our project supervisor for guidance and support
- All Group members for their collaborative effort

---

**CheckM8** — Level up your chess understanding, one arrow at a time. ♟️
