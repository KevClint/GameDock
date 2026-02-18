<div align="center">

# 🎮 GameDock

[![Version](https://img.shields.io/badge/version-3.1.1-blue?style=for-the-badge)](https://github.com/kevclint/GameDock/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey?style=for-the-badge)](https://github.com/kevclint/GameDock/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

**Your library, docked.**
A lightweight, non-intrusive desktop game launcher for Windows that docks seamlessly to the bottom-right of your screen.

[**⬇️ Download Latest Version**](https://github.com/kevclint/GameDock/releases/latest)

*Portable • Fast • Auto-Icon Extraction*

</div>

---

## 📸 Gallery

<div align="center">
  <table>
    <tr>
      <td width="33%"><img src="https://github.com/user-attachments/assets/b6d4096f-ddc6-4b60-abde-2d996e84d2f9" alt="Library View" width="100%"></td>
      <td width="33%"><img src="https://github.com/user-attachments/assets/25152749-fff7-4e4e-be11-8f101f66c464" alt="Game Details" width="100%"></td>
      <td width="33%"><img src="https://github.com/user-attachments/assets/5734841e-89c5-4e3d-b945-64db4b8efa03" alt="Search" width="100%"></td>
    </tr>
    <tr>
      <td width="33%"><img src="https://github.com/user-attachments/assets/263dc798-fcab-47d3-aa2a-18fee2b8f6f0" alt="News Feed" width="100%"></td>
      <td width="33%"><img src="https://github.com/user-attachments/assets/186b14bb-71e9-4378-81f8-c3f9764e63a9" alt="Settings" width="100%"></td>
      <td width="33%" align="center"><b>See your stats,<br>launch games,<br>and stay updated.</b></td>
    </tr>
  </table>
</div>

---

## ✨ Features

### 🕹️ Library Management
* **Quick Launch:** Docked interface allows for instant access to your games.
* **Auto-Icons:** Automatically extracts high-quality icons from game `.exe` files.
* **Smart Sorting:** Organize by Categories (FPS, MOBA, RPG, RTS) or Sort by Name/Date.
* **Search:** Instantly filter your library to find exactly what you want to play.

### 📊 Stats & Tools
* **Playtime Tracking:** Keeps a log of your "Last Played" date and total launch count.
* **Context Menu:** Right-click any game to Edit, Favorite, or Delete.
* **System Tray:** Minimizes quietly to the tray to save taskbar space.

### 🌐 Social & Discovery
* **Community Feed:** Stay up to date with gaming news directly in the launcher.
* **Discover:** Get game suggestions based on trending titles.

---
## 🚀 Quick Start

GameDock is fully portable—no installer wizard required.

1.  **[Download the .exe](https://github.com/kevclint/GameDock/releases/latest)** from the releases page.
2.  **Run** `GameDock.exe`.
3.  **Click** `+ Add Game` in the top corner.
4.  **Select** your game's executable file.
5.  **Play!** Click the card to launch.

> **Tip:** Go to *Settings* to toggle "Always on Top" or "Launch on Startup" for a seamless experience.

---

## 🛠️ Configuration

You can customize the launcher behavior in the **Settings** tab:

| Setting | Description |
| :--- | :--- |
| **Always on Top** | Keeps the dock visible over other windows. |
| **Launch on Startup** | Starts GameDock automatically when Windows boots. |
| **Notifications** | Toggle system toasts for game launches/updates. |
| **Simple Cards** | Hides extra details for a cleaner, minimalist look. |
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
