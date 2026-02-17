# GameDock
![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

A lightweight desktop game launcher for Windows that docks to the bottom-right corner of your screen.

<img width="641" height="757" alt="Screenshot 2026-02-17 113057" src="https://github.com/user-attachments/assets/b6d4096f-ddc6-4b60-abde-2d996e84d2f9" />
<img width="641" height="740" alt="Screenshot 2026-02-17 113113" src="https://github.com/user-attachments/assets/25152749-fff7-4e4e-be11-8f101f66c464" />
<img width="635" height="746" alt="Screenshot 2026-02-17 113122" src="https://github.com/user-attachments/assets/5734841e-89c5-4e3d-b945-64db4b8efa03" />
<img width="634" height="740" alt="Screenshot 2026-02-17 113131" src="https://github.com/user-attachments/assets/263dc798-fcab-47d3-aa2a-18fee2b8f6f0" />
<img width="634" height="748" alt="Screenshot 2026-02-17 113145" src="https://github.com/user-attachments/assets/186b14bb-71e9-4378-81f8-c3f9764e63a9" />

---

## Download

[Download the latest release](https://github.com/kevclint/GameDock/releases/latest)

No installation needed. Download and run the `.exe`.

---

## Features

- Add and launch PC games quickly
- Automatically extract game icons from `.exe` files
- Organize games by category (FPS, MOBA, RPG, RTS, Other)
- Search and sort your library
- Discover feed for game suggestions
- Community news feed
- Right-click actions: Edit, Favorite, Select, Delete
- Tracks last played time and launch count
- Minimize to system tray
- Settings for always-on-top, startup behavior, notifications, and simplified game cards

---

## How to Use

```text
1. Open GameDock.exe.
2. Click + Add Game.
3. Select your game executable (.exe).
4. Click a game card to launch.
5. Right-click a game card for actions (Edit, Favorite, Select, Delete).
```

---

## Build From Source

### 1. Clone the repository

```bash
git clone https://github.com/kevclint/GameDock.git
cd GameDock
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and set your API keys:

```powershell
Copy-Item .env.example .env
```

`.env` keys:

```env
RAWG_API_KEY=your_rawg_api_key_here
NEWS_API_KEY=your_news_api_key_here
STEAMGRIDDB_API_KEY=your_steamgriddb_api_key_here
```

Notes:
- `RAWG_API_KEY` is used for Discover game data.
- `NEWS_API_KEY` is used for Community news.
- `STEAMGRIDDB_API_KEY` is optional and used for SteamGridDB artwork lookup.

### 4. Run locally

```bash
npm start
```

### 5. Build Windows executable (x64 portable)

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
npm run build
```

Build output is generated in `dist/`.

---

## Built With

- [Electron](https://electronjs.org)
- [electron-builder](https://www.electron.build/)
- HTML, CSS, JavaScript

---

## Support

If this project helps you, consider starring the repo.

[![Star on GitHub](https://img.shields.io/github/stars/kevclint/GameDock?style=social)](https://github.com/kevclint/GameDock/stargazers)
