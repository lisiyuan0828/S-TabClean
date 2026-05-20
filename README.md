<div align="center">

# 🐦 S-TabClean

**A calm, local-first new-tab page that turns your Chrome tabs into an organised, recoverable workshop.**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2f6f4e?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![No Tracking](https://img.shields.io/badge/Tracking-None-success?style=flat-square)](#-privacy)
[![Made with Vanilla JS](https://img.shields.io/badge/Vanilla-JS-yellow?style=flat-square)](#-tech-stack)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [Source on GitHub](https://github.com/lisiyuan0828/S-TabClean)

</div>

---

## 📖 Overview

**S-TabClean** replaces Chrome's new-tab page with an *ink-and-bamboo* control surface for every tab you currently have open. It groups them by domain into a five-column masonry wall, surfaces stale or duplicate tabs at a glance, lets you snapshot whole sessions for later, and closes things down with a quiet sumi-e fade — never with a brutal modal.

It is **fully local**, **dependency-free**, and ships as a single Manifest V3 extension you can sideload in seconds.

> *Order is another kind of freedom.*

---

## 📑 Table of Contents

- [Features](#-features)
- [Screenshots](#-screenshots)
- [Installation](#-installation)
- [Usage](#-usage)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Privacy](#-privacy)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

| Capability | Description |
|---|---|
| 🧱 **Masonry grouping** | Tabs are auto-clustered by hostname into a fixed 5-column shortest-column-first masonry layout that adapts down to 4 / 3 / 2 / 1 columns. |
| 🧠 **Smart auto-tags** | Heuristic classification across *Code, AI, Video, Docs, Mail, Shopping, Social, Tools* — extensible via a single rule array. |
| ⏰ **Time decay** | Each tab shows how long it has been idle; cooled tabs (≥ 24 h) and frozen ones (≥ 72 h) get distinct pills. |
| 📚 **Session snapshots** | One-click named snapshots of all open tabs, restorable in a single window. |
| ⚡ **Command palette** | `⌘ / Ctrl + K` to fuzzy-jump or close any tab without leaving the keyboard. |
| 🌗 **Dual themes** | *Ink · Night* (default dark) and *Bamboo · Day*; persisted across sessions. |
| 💧 **Sumi-e fade** | Original closing animation: ink-bleed + blur + height collapse, with a soft Web-Audio chime. |
| 🪞 **Duplicate detection** | Identical URLs are flagged with an `×N` pill so you can dedupe at a glance. |
| 🧮 **Incremental reconcile** | External tab changes are diffed and patched in-place — never a full re-render. |
| 🔒 **100 % local** | No backend, no telemetry, no account. Settings live only in `chrome.storage.local`. |

---

## 🖼 Screenshots

> Drop screenshots into `docs/screenshots/` and reference them here.

| Ink · Night (default) | Bamboo · Day |
|---|---|
| *coming soon* | *coming soon* |

---

## 🚀 Installation

### Option A — Load unpacked (developer mode)

```bash
git clone https://github.com/lisiyuan0828/S-TabClean.git
cd S-TabClean
```

1. Open `chrome://extensions` in Chromium-based browsers (Chrome / Edge / Brave / Arc).
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `extension/` directory.
4. Open any new tab — the workshop should appear.

### Option B — From a release zip

Download the latest `s-tabclean-x.y.z.zip` from the [Releases](https://github.com/lisiyuan0828/S-TabClean/releases) page, unzip, and follow steps 1 – 4 above against the unpacked folder.

> ✅ Tested on Chrome 122+, Edge 122+, Brave 1.63+, Arc 1.40+.

---

## 🎮 Usage

| Action | How |
|---|---|
| Jump to a tab | Click its title |
| Close one tab | Hover the row → click the `×` |
| Close a whole group | Hover the group card header → click the trash icon |
| Filter by status | Top chips: *All / Cooling / Duplicate / Active* |
| Filter by category | Smart-tag chips beside the divider |
| Save a snapshot | Top-bar **Snapshot** → name → confirm |
| Restore a snapshot | Open the snapshot drawer → **Restore** |
| Close every tab | Top-bar **Close all** → confirm modal |
| Open the palette | `⌘ + K` (macOS) / `Ctrl + K` (Win/Linux) |
| Toggle theme | Top-bar 🌓 |
| Visit the repository | Top-bar GitHub icon |

---

## 🏛 Architecture

```
S-TabClean/
├── extension/                Chrome extension runtime (load this folder)
│   ├── manifest.json         MV3 manifest, permissions, newtab override, shortcut
│   ├── index.html            Page skeleton: topbar / mood / filters / masonry / drawers
│   ├── style.css             Dual themes via [data-theme], all component styles
│   ├── app.js                Main controller: state, Chrome API, render, events
│   ├── background.js         Service worker: badge counter, command relay
│   ├── build-icons.html      Dev tool: rasterise icon.svg into 16/48/128 PNGs
│   └── icons/                Bird-with-leaf icon (svg + 3 sizes)
├── docs/
│   ├── 01-product-spec.md    Product requirements & acceptance criteria
│   ├── 02-architecture.md    Module boundaries & data flow
│   ├── 03-data-model.md      chrome.storage keys & shapes
│   └── 04-roadmap.md         Iteration plan
├── project-map.md            File-level architecture map (read this first)
├── README.md                 You are here
├── README.zh-CN.md           简体中文版
└── LICENSE                   MIT
```

A more granular module map (function-level slices of `app.js`) lives in [`project-map.md`](./project-map.md).

### Data flow

```
chrome.tabs.query  ──►  fetchTabs  ──►  state.tabs ──►  render*  ──►  DOM
chrome.storage     ──►  loadPersisted ──►  state                  ▲
DOM events ──►  user actions ──►  state ──►  chrome.tabs.remove   │
chrome.tabs.onCreated/onRemoved/onUpdated ──►  reconcileTabs ─────┘
```

`reconcileTabs` performs a Map-based diff between the previous and the current tab set, then applies one of three minimal mutations (`applyTabAddition`, `applyTabUpdate`, `applyTabRemoval`) instead of rebuilding the DOM — which keeps masonry positions stable when tabs come and go.

---

## 🛠 Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Extension runtime | Chrome Manifest V3 | Future-proof, service-worker based |
| Language | Vanilla ES2020 | Zero build step, instant load |
| Persistence | `chrome.storage.local` | Sync-ready (one-line swap) |
| Layout | CSS + JS shortest-column masonry | Stable on add / remove |
| Closing animation | CSS keyframes (`ink-fade`, `ink-dissolve`) + transform | GPU-friendly |
| Audio cue | Web Audio API (synthesised) | No audio assets shipped |
| Icons | SVG source → `sips` rasterised PNGs | Single source of truth |

---

## 🔒 Privacy

S-TabClean **does not connect to any server** and **does not emit any telemetry**. The only outbound request is the favicon fetch to `https://www.google.com/s2/favicons`, which is identical to Chrome's own behaviour for omnibox suggestions; you can self-host a favicon proxy by editing `faviconFor()` in `extension/app.js` if you prefer.

All snapshots and preferences live exclusively in `chrome.storage.local` on your machine. Uninstalling the extension removes them.

---

## 🗺 Roadmap

See [`docs/04-roadmap.md`](./docs/04-roadmap.md). High-level next steps:

- [ ] Drag-and-drop merging of group cards
- [ ] Sync snapshots via `chrome.storage.sync` (opt-in)
- [ ] Export snapshot as `.html` bookmark file
- [ ] User-defined smart-tag rules (regex UI)
- [ ] i18n: pull all UI strings into a `_locales/` bundle

---

## 🤝 Contributing

Issues and pull requests are welcome. Before submitting code, please:

1. Read [`project-map.md`](./project-map.md) to identify the impact zone.
2. Keep new modules dependency-free — no `npm install`, no bundlers.
3. Match the existing code style (2-space indent, single quotes in JS).
4. Update the relevant doc under `docs/` and the project map if you touch the architecture.

---

## 📜 License

[MIT](./LICENSE) © Si-Yuan Li

---

<div align="center">
<sub>Built quietly. Updated rarely. Loaded instantly.</sub>
</div>
