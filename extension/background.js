/**
 * background.js — S-TabClean 服务工作线程
 *
 * 职责：
 *   1. 维护工具栏徽标，显示当前真实网页 tab 数量；
 *   2. 根据数量映射心情色（青/黄/朱），让你一眼感知"今天几本书摊在桌上"；
 *   3. 监听快捷键，转发到新标签页打开命令栏。
 *
 * 设计原则：极简、零依赖、不做埋点，所有数据本地化。
 */

'use strict';

const MOOD = {
  CALM:    { max: 8,  color: '#3a7d6e' }, // 墨青：心如止水
  WARM:    { max: 18, color: '#c9954a' }, // 暮黄：略有杂思
  ALERT:   { max: 99, color: '#b04848' }, // 朱砂：该清理了
};

/** 判定一个 URL 是否属于"真实网页"，浏览器内部页一律忽略。 */
function isRealWebPage(url = '') {
  return !!url && !/^(chrome|edge|brave|about|chrome-extension|view-source):/.test(url);
}

/** 根据 tab 数量挑一个对应的颜色档位。 */
function pickMoodColor(count) {
  if (count <= MOOD.CALM.max)  return MOOD.CALM.color;
  if (count <= MOOD.WARM.max)  return MOOD.WARM.color;
  return MOOD.ALERT.color;
}

/** 刷新工具栏徽标。 */
async function refreshBadge() {
  try {
    const tabs = await chrome.tabs.query({});
    const count = tabs.filter(t => isRealWebPage(t.url)).length;

    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    if (count === 0) return;

    await chrome.action.setBadgeBackgroundColor({ color: pickMoodColor(count) });
  } catch {
    chrome.action.setBadgeText({ text: '' });
  }
}

// 安装/启动/Tab 变化时刷新
chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.tabs.onCreated.addListener(refreshBadge);
chrome.tabs.onRemoved.addListener(refreshBadge);
chrome.tabs.onUpdated.addListener(refreshBadge);

// 命令栏快捷键：转发给当前活动的 S-TabClean 新标签页
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'open-command-palette') return;
  const extId = chrome.runtime.id;
  const newtabUrl = `chrome-extension://${extId}/index.html`;
  const tabs = await chrome.tabs.query({});
  const target = tabs.find(t => t.url === newtabUrl);
  if (target) {
    await chrome.tabs.update(target.id, { active: true });
    await chrome.windows.update(target.windowId, { focused: true });
    chrome.tabs.sendMessage(target.id, { type: 'OPEN_PALETTE' }).catch(() => {});
  } else {
    await chrome.tabs.create({ url: 'chrome://newtab/' });
  }
});

// 首次加载即跑一遍
refreshBadge();
