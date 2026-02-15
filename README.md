# GameDock
![Version](https://img.shields.io/badge/version-2.1.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

A free, lightweight widget-style game launcher for Windows — lives in the bottom right corner of your desktop.

<img width="276" height="599" alt="Screenshot 2026-02-15 110519" src="https://github.com/user-attachments/assets/5a33c464-37dc-4908-a1ac-9bd71bb246c3" />
<img width="274" height="596" alt="Screenshot 2026-02-15 110528" src="https://github.com/user-attachments/assets/c678cc4c-803b-409c-9c4c-0d8df0776561" />
<img width="274" height="597" alt="Screenshot 2026-02-15 110536" src="https://github.com/user-attachments/assets/3d7a1693-46c2-4808-b1da-ca9d013284d3" />

---

## 📥 Download

👉 **[Click here to download the latest release](https://github.com/kevclint/GameDock/releases/latest)**

> No installation needed — just download and run the `.exe` directly!

---

## ✨ Features

- 🎮 Add and launch PC games with one click
- 🖼️ Automatically extracts game icons from `.exe` files
- 📂 Organize games by category (FPS, MOBA, RPG, RTS, Other)
- 🔍 Search games instantly
- 🖱️ Right-click a game to select and delete it
- 📌 Docks to the bottom right corner of your screen
- 🕐 Tracks last played time and launch count
- 🔔 Minimize to system tray
- ⚙️ Settings: Always on top, start with Windows, minimize to tray
- 🌙 Dark UI, minimal and distraction-free

---

## 🖥️ How to Use

```
1. Run GameDock.exe
2. Click "+ Add Game"
3. Browse to your game's .exe file
4. Click the game card to launch it
5. Right-click a game card to delete it
```

---

## 🛠️ Build From Source

### 1. Clone the repo

```bash
git clone https://github.com/kevclint/GameDock.git
cd GameDock
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the app

```bash
npm start
```

### 4. Build your own `.exe`

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
npm run build
```

Your `.exe` will appear in the `dist/` folder.

---

## 📦 Built With

- [Electron](https://electronjs.org) — Desktop app framework
- HTML + CSS + JavaScript — UI

---

## ⭐ Support

If you find this useful, give it a **star** on GitHub! 🙏

[![Star on GitHub](https://img.shields.io/github/stars/kevclint/GameDock?style=social)](https://github.com/kevclint/GameDock/stargazers)
