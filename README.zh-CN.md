<div align="center">

# 🐦 S-TabClean

**让 Chrome 标签页变成一座井然有序、可恢复的"案头工坊"。**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2f6f4e?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![No Tracking](https://img.shields.io/badge/Tracking-None-success?style=flat-square)](#-核心特性)
[![Made with Vanilla JS](https://img.shields.io/badge/Vanilla-JS-yellow?style=flat-square)](#-技术栈)

[English](./README.md) · [简体中文](./README.zh-CN.md)

</div>

---

## 📖 项目简介

**S-TabClean** 接管 Chrome 的新标签页，把你当前打开的所有标签页变成一面"水墨与竹简"风格的控制台。它会按域名自动聚合到 5 列瀑布流卡片墙，让冷却或重复的标签一目了然；支持把整个会话拍成快照以备日后召回；关闭标签时是一抹安静的水墨褪色，而不是粗暴的弹窗。

完全 **本地运行**、**零依赖**、以单一 Manifest V3 扩展形态分发，几秒即可加载。

> *井然，是另一种自由。*

---

## 📑 目录

- [核心特性](#-核心特性)
- [截图](#-截图)
- [安装](#-安装)
- [使用](#-使用)
- [技术栈](#-技术栈)
- [开源协议](#-开源协议)

---

## ✨ 核心特性

| 能力 | 说明 |
|---|---|
| 🧱 **瀑布流分组** | 按 hostname 自动聚类，固定 5 列「最矮列优先」排版，自动降级到 4 / 3 / 2 / 1 列 |
| 🧠 **智能标签** | 启发式自动归类：*代码 / AI / 视频 / 文档 / 邮件 / 购物 / 社交 / 工具*；通过单一规则数组扩展 |
| ⏰ **时间衰减** | 每个标签页显示已被冷落多久；冷却（≥ 24 h）与冰封（≥ 72 h）有不同色阶 |
| 📚 **会话快照** | 一键命名快照保存当前所有标签，支持单窗口一键恢复 |
| ⚡ **命令栏** | `⌘ / Ctrl + K` 模糊跳转或关闭任意标签，全程不离开键盘 |
| 🌗 **双主题** | *墨青 · 夜读*（默认深色）/ *竹简 · 日间*；偏好持久化 |
| 💧 **水墨褪色** | 原创关闭动画：墨晕扩散 + 模糊 + 高度收缩，附极轻 Web Audio 合成提示音 |
| 🪞 **重复检测** | 同一 URL 标记为 `×N` 角标，一眼看清哪些标签开了多份 |
| 🧮 **增量协调** | 外部标签变化做差异更新，**永不全量重渲染**，瀑布流位置稳定 |
| 🔒 **100% 本地** | 没有服务器、没有遥测、没有账号；偏好仅存于 `chrome.storage.local` |

---

## 🖼 截图

![S-TabClean 预览](./screenshots/tabclean.png)

---

## 🚀 安装

### 方式 A — 加载已解压扩展（开发者模式）

```bash
git clone https://github.com/lisiyuan0828/S-TabClean.git
cd S-TabClean
```

1. 在 Chromium 系浏览器（Chrome / Edge / Brave / Arc）中打开 `chrome://extensions`。
2. 右上角开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择仓库下的 `extension/` 目录。
4. 打开任意新标签页，即可看到工坊界面。

### 方式 B — 从发行包安装

到 [Releases](https://github.com/lisiyuan0828/S-TabClean/releases) 下载最新 `s-tabclean-x.y.z.zip`，解压后按方式 A 的第 1–4 步加载。

---

## 🎮 使用

| 操作 | 方法 |
|---|---|
| 跳到某个标签 | 点击其标题 |
| 关闭某个标签 | 悬浮该行 → 点击 `×` |
| 关闭整组 | 悬浮卡片头部 → 点击垃圾桶图标 |
| 按状态筛选 | 顶部 chip：*全部 / 冷却中 / 重复 / 活跃* |
| 按类别筛选 | 分隔线右侧的智能标签 chip |
| 保存快照 | 顶栏 **快照** → 命名 → 确认 |
| 恢复快照 | 抽屉中点击对应快照的 **恢复** |
| 关闭所有标签 | 顶栏 **全部关闭** → 二次确认 |
| 唤起命令栏 | `⌘ + K`（macOS） / `Ctrl + K`（Win/Linux） |
| 切换主题 | 顶栏 🌓 |
| 访问仓库 | 顶栏 GitHub 图标 |

---

## 🛠 技术栈

| 维度 | 选型 | 理由 |
|---|---|---|
| 扩展规范 | Chrome Manifest V3 | 面向未来、Service Worker 架构 |
| 语言 | Vanilla ES2020 | 零构建、瞬时加载 |
| 持久化 | `chrome.storage.local` | 一行可切换为 `.sync` |
| 排版 | CSS + JS 最矮列优先瀑布流 | 增删时位置稳定 |
| 关闭动画 | CSS keyframes（`ink-fade` / `ink-dissolve`） + transform | GPU 友好 |
| 提示音 | Web Audio API（实时合成） | 不带任何音频文件 |
| 图标 | SVG 源 → `sips` 渲染为 PNG | 单一来源 |

---

## 📜 开源协议

[MIT](./LICENSE) © 李思远（Si-Yuan Li）

---

<div align="center">
<sub>悄悄构建，少量更新，瞬时加载。</sub>
</div>
