/* ============================================================
 * S-TabClean · 标签工坊 · 主程序
 *
 * 设计目标：
 *   - 智能标签(Auto-Tags)：根据 URL/title 自动归类
 *   - 时间衰减(Aging)：基于 lastAccessed 显示冷却时长
 *   - 会话快照(Snapshot)：一键存档当前所有标签，可恢复
 *   - 命令栏(Palette)：⌘K 全局跳转 / 关闭
 *   - 水墨褪色：原创关闭动画
 *
 * 数据存储均落地 chrome.storage.local，零外部依赖。
 * ============================================================ */
'use strict';

// -------------------- 常量 --------------------
const STORAGE_KEYS = {
  SNAPSHOTS:    'stc:snapshots',
  THEME:        'stc:theme',
};

// 智能标签规则：URL 或 title 匹配则归入对应类别
const AUTO_TAG_RULES = [
  { id: 'code',     name: '代码仓库', emoji: '💻', test: /github\.com|gitlab|bitbucket|gitee|git\.woa\.com|stackoverflow/i },
  { id: 'ai',       name: 'AI工具',  emoji: '🤖', test: /openai|chatgpt|claude\.ai|anthropic|gemini|copilot|perplexity|cursor|midjourney|huggingface/i },
  { id: 'video',    name: '视频',    emoji: '🎬', test: /youtube\.com|bilibili|netflix|vimeo|twitch|iqiyi|youku/i },
  { id: 'social',   name: '社交',    emoji: '💬', test: /twitter\.com|x\.com|linkedin|weibo|reddit|zhihu|facebook|instagram/i },
  { id: 'doc',      name: '文档',    emoji: '📖', test: /docs\.|notion\.so|confluence|wiki|readme|developer\.|mdn|devdocs/i },
  { id: 'mail',     name: '邮件',    emoji: '✉️', test: /mail\.google|outlook|exmail|qq\.com\/cgi-bin/i },
  { id: 'shop',     name: '购物',    emoji: '🛒', test: /amazon|taobao|jd\.com|tmall|pinduoduo|ebay/i },
  { id: 'localdev', name: '本地开发', emoji: '🛠️', test: /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i, useUrl: true },
  { id: 'other',    name: '其它',    emoji: '📦', test: null }, // 兜底分类，未命中以上规则的 tab 都归到这里
];

const AGE_THRESHOLDS = {
  COOLING_MS: 24 * 60 * 60 * 1000,        // 24h 起 → 冷却中
  COLD_MS:    3  * 24 * 60 * 60 * 1000,   // 72h 起 → 冷透
};

// -------------------- 全局状态 --------------------
const state = {
  tabs: [],
  snapshots: [],               // [{id,name,createdAt,tabs:[{url,title}]}]
  filter: 'all',               // all/stale/dup/active
  activeAutoTag: null,         // 单选某个 auto-tag 时
  theme: 'ink',
  paletteOpen: false,
  paletteIndex: 0,
  paletteFiltered: [],
  drawerOpen: false,
};

// -------------------- 工具函数 --------------------
const $ = (id) => document.getElementById(id);
const create = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls)  el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function faviconFor(url) {
  const host = safeHostname(url);
  if (!host) return '';
  // 用 Google 公共 favicon 接口（不会向用户服务器发请求；S-TabClean 不会主动下载）
  return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
}

function isRealWeb(url = '') {
  return !!url && !/^(chrome|edge|brave|about|chrome-extension|view-source):/.test(url);
}

function ageLabel(ms) {
  if (ms < 60_000)            return '刚刚';
  if (ms < 60 * 60_000)       return Math.floor(ms / 60_000) + 'm';
  if (ms < 24 * 60 * 60_000)  return Math.floor(ms / 3_600_000) + 'h';
  return Math.floor(ms / 86_400_000) + 'd';
}

function ageBucket(ms) {
  if (ms >= AGE_THRESHOLDS.COLD_MS)    return 'cold';
  if (ms >= AGE_THRESHOLDS.COOLING_MS) return 'cooling';
  return 'fresh';
}

function classifyTab(tab) {
  for (const rule of AUTO_TAG_RULES) {
    if (!rule.test) continue; // 兜底项没有正则，跳过
    const target = rule.useUrl ? (tab.url || '') : ((tab.url || '') + ' ' + (tab.title || ''));
    if (rule.test.test(target)) return rule.id;
  }
  return 'other'; // 没命中任何规则 → 归入「其它」
}

// -------------------- 存储读写 --------------------
async function loadPersisted() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.SNAPSHOTS,
    STORAGE_KEYS.THEME,
  ]);

  state.snapshots   = data[STORAGE_KEYS.SNAPSHOTS]   || [];
  state.theme       = data[STORAGE_KEYS.THEME]       || 'ink';
  document.body.dataset.theme = state.theme;
}

async function persistSnapshots() {
  await chrome.storage.local.set({ [STORAGE_KEYS.SNAPSHOTS]: state.snapshots });
}
async function persistTheme() {
  await chrome.storage.local.set({ [STORAGE_KEYS.THEME]: state.theme });
}

// -------------------- Chrome Tab 操作 --------------------
async function fetchTabs() {
  const all = await chrome.tabs.query({});
  const extId = chrome.runtime.id;
  const newtabUrl = `chrome-extension://${extId}/index.html`;
  const now = Date.now();
  state.tabs = all
    .filter(t => isRealWeb(t.url) && t.url !== newtabUrl)
    .map(t => ({
      id: t.id,
      url: t.url,
      title: t.title || safeHostname(t.url) || '(无标题)',
      windowId: t.windowId,
      active: t.active,
      pinned: t.pinned,
      lastAccessed: t.lastAccessed || now,    // Chrome 117+ 提供
      ageMs: Math.max(0, now - (t.lastAccessed || now)),
      autoTag: null,
    }));

  // 智能标签分类
  state.tabs.forEach(t => { t.autoTag = classifyTab(t); });
}

async function focusTabById(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {}
}

async function closeTabsByIds(ids) {
  if (!ids?.length) return;
  try { await chrome.tabs.remove(ids); } catch {}
}

// -------------------- 局部更新：删除 tab 后不全量重渲 --------------------
// 依赖当前架构：
//  - .group-card 已有 transition: transform .25s，带 transform 定位
//  - .tab-item 上有 dataset.tabId
// 思路：仅动必要的 DOM，让现有卡片过渡到新位置，避免 innerHTML='' 中的整体闪烁。
function applyTabRemoval(ids) {
  if (!ids?.length) return;
  const idSet = new Set(ids);

  // 1. 同步内存状态
  state.tabs = state.tabs.filter(t => !idSet.has(t.id));

  // 2. 逐个淘汰 .tab-item DOM，记录受影响的 group-card
  const affectedCards = new Set();
  ids.forEach(id => {
    const item = document.querySelector(`.tab-item[data-tab-id="${id}"]`);
    if (!item) return;
    const card = item.closest('.group-card');
    if (card) affectedCards.add(card);
    item.classList.add('fading');
    // 淑出后才从父节点里 remove，不会在过渡期间造成高度突变
    setTimeout(() => item.remove(), 320);
  });

  // 3. 同步头部计数与空卡销毁
  affectedCards.forEach(card => {
    const list = card.querySelector('.tab-list');
    const remaining = list ? list.querySelectorAll('.tab-item:not(.fading)').length : 0;
    if (remaining === 0) {
      // 整组被清空 → 水墨溶解后移除整张卡片
      card.classList.add('dissolving');
      setTimeout(() => card.remove(), 600);
    } else {
      // 更新计数徽章
      const cnt = card.querySelector('.group-count');
      if (cnt) cnt.textContent = remaining;
    }
  });

  // 4. 下一帧重新进行瀑布流布局，现有卡片会过渡滑到新位置
  // 给 fading/dissolving 动画一点时间后再布局，避免高度跳变
  requestAnimationFrame(() => {
    layoutMasonry();
    setTimeout(layoutMasonry, 340); // 等 fading tab 真正从 DOM 移除后再修正一次高度
    setTimeout(layoutMasonry, 640); // 等空 group-card 也移除后最后修正
  });

  // 5. 轻量同步顶部概览（仅文字，不重建）
  renderMoodStrip();
  // 分类 chip 重算：这里可能会出现某个 chip 计数变 0，需要添减，直接重渲 chip 带不了多少开销
  renderAutoTags();

  // 6. 抑制 chrome.tabs.onRemoved 被动触发的全量刷新（双保险）
  state.suppressAutoRefresh = true;
  clearTimeout(state._suppressTimer);
  state._suppressTimer = setTimeout(() => {
    state.suppressAutoRefresh = false;
  }, 900);
}

// -------------------- 增量协调：外部 tab 变化的最小化 DOM 更新 --------------------
// 触发场景：onCreated / onRemoved / onUpdated / onActivated（用户在浏览器自身关 tab、新开 tab、切 tab 等）
// 核心目标：杜绝 wrap.innerHTML='' 全量重建带来的"从左上角重绘"观感
async function reconcileTabs() {
  // 抓取最新 tab 集合
  const prevById = new Map(state.tabs.map(t => [t.id, t]));
  await fetchTabs(); // 这会重写 state.tabs
  const currById = new Map(state.tabs.map(t => [t.id, t]));

  // 计算差异
  const added = [];
  const removed = [];
  const changed = []; // { prev, curr }
  for (const [id, t] of currById) {
    if (!prevById.has(id)) added.push(t);
    else {
      const p = prevById.get(id);
      if (p.url !== t.url || p.title !== t.title || p.autoTag !== t.autoTag) {
        changed.push({ prev: p, curr: t });
      }
    }
  }
  for (const [id, t] of prevById) {
    if (!currById.has(id)) removed.push(t);
  }

  // 没差异 → 啥都不干（onActivated 经常会进到这里）
  if (!added.length && !removed.length && !changed.length) {
    return;
  }

  // 容器一开始就是空的（首次或之前是空状态）→ 走全量
  const wrap = $('groups');
  const hasExistingDom = wrap && wrap.querySelector('.group-card');
  if (!hasExistingDom) {
    render();
    return;
  }

  // 1) 删除：复用已有的局部移除（带动画 + transform 平滑滑动）
  //    注意：applyTabRemoval 内部会 splice state.tabs，但这里 fetchTabs 已经把 state.tabs 写为最新值，
  //    所以传 ids 给 applyTabRemoval 不会出错（再 filter 一次新值不变）
  if (removed.length) {
    applyTabRemoval(removed.map(t => t.id));
  }

  // 2) 属性变化：原地改 DOM，不动卡片位置
  if (changed.length) {
    for (const { curr } of changed) {
      applyTabUpdate(curr);
    }
  }

  // 3) 新增：append 到匹配分组；不存在的分组就新建一张卡片
  if (added.length) {
    applyTabAddition(added);
  }

  // 顶部统计同步
  renderMoodStrip();
  renderAutoTags();

  // 抑制后续可能仍由同一批操作触发的 onRemoved（自身刚处理过）
  state.suppressAutoRefresh = true;
  clearTimeout(state._suppressTimer);
  state._suppressTimer = setTimeout(() => {
    state.suppressAutoRefresh = false;
  }, 600);
}

// 原地更新单个 tab 的 DOM 属性（标题、favicon、age 标签等）。不重排不重建。
function applyTabUpdate(t) {
  const item = document.querySelector(`.tab-item[data-tab-id="${t.id}"]`);
  if (!item) return;
  // 标题
  const titleEl = item.querySelector('.tab-title');
  if (titleEl && titleEl.textContent !== t.title) {
    titleEl.textContent = t.title;
  }
  item.title = t.title + '\n' + t.url;
  // favicon
  const favEl = item.querySelector('.tab-favicon');
  if (favEl && favEl.tagName === 'IMG') {
    const newFav = faviconFor(t.url);
    if (newFav && favEl.src !== newFav) favEl.src = newFav;
  }
  // age 标签：用最新桶刷新
  const agePill = item.querySelector('.age-pill');
  if (agePill) {
    const bucket = ageBucket(t.ageMs);
    agePill.className = `age-pill ${bucket}`;
    agePill.textContent = ageLabel(t.ageMs);
  }
}

// 增量添加新 tab：尽量复用现有 group-card；分组不存在则新建一张并 append 到容器末尾。
function applyTabAddition(tabs) {
  const wrap = $('groups');
  if (!wrap) return;

  // 当前过滤态下，新 tab 是否可见？不可见就跳过 DOM 操作
  const visibleSet = new Set(getVisibleTabs().map(t => t.id));
  const visibleTabs = tabs.filter(t => visibleSet.has(t.id));
  if (!visibleTabs.length) return;

  // 重新算一次 urlCount（含全量 state.tabs，便于 dup-pill 判断）
  const urlCount = new Map();
  state.tabs.forEach(t => urlCount.set(t.url, (urlCount.get(t.url) || 0) + 1));

  // 把要新增的 tab 按 hostname 聚合
  const byKey = new Map();
  for (const t of visibleTabs) {
    let key, label;
    try {
      const u = new URL(t.url);
      if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(u.hostname)) {
        key = `local:${u.port || '80'}`; label = `localhost:${u.port || '80'}`;
      } else if (u.protocol === 'file:') {
        key = 'file:local'; label = '本地文件';
      } else {
        key = u.hostname; label = u.hostname.replace(/^www\./, '');
      }
    } catch { key = 'other'; label = '其他'; }
    if (!byKey.has(key)) byKey.set(key, { key, label, sample: t, tabs: [] });
    byKey.get(key).tabs.push(t);
  }

  // 之前为空状态时把 emptyState 关掉
  $('emptyState').style.display = 'none';

  for (const g of byKey.values()) {
    const existing = wrap.querySelector(`.group-card[data-group-key="${cssEscape(g.key)}"]`);
    if (existing) {
      // 已有分组：把新 tab append 到 .tab-list，不动 group-card 位置
      const list = existing.querySelector('.tab-list');
      g.tabs.forEach(t => list.appendChild(renderTabItem(t, urlCount)));
      const cnt = existing.querySelector('.group-count');
      if (cnt) {
        const n = list.querySelectorAll('.tab-item:not(.fading)').length;
        cnt.textContent = n;
      }
    } else {
      // 不存在的分组：新建卡片 append（layoutMasonry 会把它顺势安置到最矮列）
      const card = buildGroupCard(g, urlCount);
      wrap.appendChild(card);
    }
  }

  // 重新布局；现有卡片有 transition 会丝滑滑动，新卡片首次 layout 直接出现
  requestAnimationFrame(() => {
    layoutMasonry();
    setTimeout(layoutMasonry, 60); // 再校准一次（新插入 .tab-item 的高度可能略晚于第一次 layout）
  });
}

// 简单 CSS 选择器转义，用于 hostname 中可能的 . 字符
function cssEscape(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/([!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, '\\$1');
}


// -------------------- 渲染：心情指示 --------------------
function renderMoodStrip() {
  const tabs = state.tabs;
  const total = tabs.length;
  const stale = tabs.filter(t => t.ageMs >= AGE_THRESHOLDS.COOLING_MS).length;

  // 重复检测
  const urlCount = new Map();
  tabs.forEach(t => urlCount.set(t.url, (urlCount.get(t.url) || 0) + 1));
  let dup = 0;
  for (const c of urlCount.values()) if (c > 1) dup += c - 1;

  // 活跃数：24h 内访问过
  const active = total - stale;

  $('statTotal').textContent = total;
  $('statStale').textContent = stale;
  $('statDup').textContent = dup;
  $('statActive').textContent = active;
}

// -------------------- 渲染：智能标签 --------------------
function renderAutoTags() {
  const wrap = $('autoTags');
  wrap.innerHTML = '';

  const counts = new Map();
  state.tabs.forEach(t => {
    if (!t.autoTag) return;
    counts.set(t.autoTag, (counts.get(t.autoTag) || 0) + 1);
  });

  if (counts.size === 0) return;

  AUTO_TAG_RULES.forEach(rule => {
    const c = counts.get(rule.id);
    if (!c) return;
    const chip = create('div', 'auto-tag' + (state.activeAutoTag === rule.id ? ' active' : ''));
    chip.innerHTML = `${rule.emoji} ${rule.name} · ${c}`;
    chip.addEventListener('click', () => {
      state.activeAutoTag = state.activeAutoTag === rule.id ? null : rule.id;
      render();
    });
    wrap.appendChild(chip);
  });
}

// -------------------- 渲染：分组 ---------------------
function getVisibleTabs() {
  let list = state.tabs.slice();

  // 普通筛选
  if (state.filter === 'stale') {
    list = list.filter(t => t.ageMs >= AGE_THRESHOLDS.COOLING_MS);
  } else if (state.filter === 'dup') {
    const dupUrls = new Set();
    const seen = new Map();
    state.tabs.forEach(t => {
      seen.set(t.url, (seen.get(t.url) || 0) + 1);
    });
    seen.forEach((c, u) => { if (c > 1) dupUrls.add(u); });
    list = list.filter(t => dupUrls.has(t.url));
  } else if (state.filter === 'active') {
    list = list.filter(t => t.ageMs < AGE_THRESHOLDS.COOLING_MS);
  }

  // 智能标签筛选
  if (state.activeAutoTag) {
    list = list.filter(t => t.autoTag === state.activeAutoTag);
  }

  return list;
}

function groupTabs(tabs) {
  // 按 hostname 分组；localhost 按端口区分
  const map = new Map();
  for (const t of tabs) {
    let key, label;
    try {
      const u = new URL(t.url);
      if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(u.hostname)) {
        key = `local:${u.port || '80'}`;
        label = `localhost:${u.port || '80'}`;
      } else if (u.protocol === 'file:') {
        key = 'file:local';
        label = '本地文件';
      } else {
        key = u.hostname;
        label = u.hostname.replace(/^www\./, '');
      }
    } catch {
      key = 'other'; label = '其他';
    }
    if (!map.has(key)) map.set(key, { key, label, tabs: [], sample: t });
    map.get(key).tabs.push(t);
  }

  // 按数量倒序，平局按 label 字母顺序
  return [...map.values()].sort((a, b) => b.tabs.length - a.tabs.length || a.label.localeCompare(b.label));
}

// 单独构建一张 group-card（提取出来便于增量添加场景复用）
function buildGroupCard(g, urlCount) {
  const card = create('div', 'group-card');
  card.dataset.groupKey = g.key;

  const head = create('div', 'group-head');
  const fav = faviconFor(g.sample.url);
  head.innerHTML = `
    <div class="group-title">
      ${fav ? `<img class="group-favicon" src="${fav}" alt="" referrerpolicy="no-referrer">` : '<span class="group-favicon" style="background:var(--bg);"></span>'}
      <span class="group-domain" title="${escapeHtml(g.label)}">${escapeHtml(g.label)}</span>
    </div>
    <span class="group-count">${g.tabs.length}</span>
    <div class="group-actions">
      <button class="icon-btn" data-act="focus-first" title="跳到第一个">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <button class="icon-btn danger" data-act="close-group" title="关闭整组">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>
      </button>
    </div>
  `;
  card.appendChild(head);

  // 事件回调实时根据当前 DOM 收集 ids，避免闭包过期
  head.querySelector('[data-act="focus-first"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const firstItem = card.querySelector('.tab-item:not(.fading)');
    if (firstItem) focusTabById(Number(firstItem.dataset.tabId));
  });
  head.querySelector('[data-act="close-group"]').addEventListener('click', async (e) => {
    e.stopPropagation();
    const ids = Array.from(card.querySelectorAll('.tab-item:not(.fading)'))
      .map(el => Number(el.dataset.tabId));
    if (!ids.length) return;
    playSoftChime();
    closeTabsByIds(ids);
    applyTabRemoval(ids);
  });

  const list = create('div', 'tab-list');
  g.tabs.forEach(t => list.appendChild(renderTabItem(t, urlCount)));
  card.appendChild(list);

  return card;
}

function renderGroups() {
  const wrap = $('groups');
  wrap.innerHTML = '';
  // 重新渲染前先移除布局标记，让新卡片在 layout 完成前保持透明
  wrap.classList.remove('laid');

  const visible = getVisibleTabs();

  if (visible.length === 0) {
    $('emptyState').style.display = 'block';
    wrap.style.height = '0px';
    return;
  }
  $('emptyState').style.display = 'none';

  // 重复检测
  const urlCount = new Map();
  state.tabs.forEach(t => urlCount.set(t.url, (urlCount.get(t.url) || 0) + 1));

  const groups = groupTabs(visible);
  groups.forEach(g => wrap.appendChild(buildGroupCard(g, urlCount)));

  // 渲染完后进行瀑布流布局（下一帧等 layout 完成，以获得准确高度）
  requestAnimationFrame(layoutMasonry);
}

// -------------------- 瀑布流布局 --------------------
// 算法：按卡片在 DOM 中的顺序，每张都放到当前「最矮列」下；出现平列时优先左边列。
// 列数策略：固定 5 列；当容器宽度不够保证最小列宽时，自动降到 4/3/2/1 列，避免迷你卡。
const MASONRY = {
  TARGET_COLS: 5,       // 期望列数（设计稿要求）
  MIN_COL_WIDTH: 220,   // 单列允许的最小宽度，低于此值则降列
  GAP: 16,              // 列间距 / 行间距
};

function layoutMasonry() {
  const wrap = $('groups');
  if (!wrap) return;
  const cards = Array.from(wrap.children).filter(el => el.classList?.contains('group-card'));
  if (!cards.length) {
    wrap.style.height = '0px';
    wrap.classList.add('laid');
    return;
  }

  const containerWidth = wrap.clientWidth;
  if (containerWidth <= 0) return;

  // 优先尝试 5 列；若每列宽度低于 MIN_COL_WIDTH 则递减列数
  let cols = MASONRY.TARGET_COLS;
  while (cols > 1) {
    const w = (containerWidth - MASONRY.GAP * (cols - 1)) / cols;
    if (w >= MASONRY.MIN_COL_WIDTH) break;
    cols--;
  }

  const colWidth = (containerWidth - MASONRY.GAP * (cols - 1)) / cols;
  const colHeights = new Array(cols).fill(0);

  for (const card of cards) {
    // 先应用列宽，才能获得真实高度
    card.style.width = colWidth + 'px';

    // 选中当前最矮的列（平列时取最左）
    let minCol = 0;
    for (let i = 1; i < cols; i++) {
      if (colHeights[i] < colHeights[minCol]) minCol = i;
    }

    const x = minCol * (colWidth + MASONRY.GAP);
    const y = colHeights[minCol];
    card.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    colHeights[minCol] += card.offsetHeight + MASONRY.GAP;
  }

  wrap.style.height = (Math.max(...colHeights) - MASONRY.GAP) + 'px';
  wrap.classList.add('laid');
}

// 窗口尺寸变化时重新布局（防抖 120ms）
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(layoutMasonry, 120);
});

function renderTabItem(t, urlCount) {
  const item = create('div', 'tab-item');
  item.dataset.tabId = t.id;
  item.title = t.title + '\n' + t.url;

  const fav = faviconFor(t.url);
  const bucket = ageBucket(t.ageMs);
  const ageTxt = ageLabel(t.ageMs);
  const isDup = (urlCount.get(t.url) || 0) > 1;

  item.innerHTML = `
    ${fav ? `<img class="tab-favicon" src="${fav}" alt="" referrerpolicy="no-referrer">` : '<span class="tab-favicon" style="background:var(--bg);"></span>'}
    <span class="tab-title">${escapeHtml(t.title)}</span>
    <span class="tab-meta">
      ${isDup ? '<span class="dup-pill">×' + urlCount.get(t.url) + '</span>' : ''}
      <span class="age-pill ${bucket}">${ageTxt}</span>
      <button class="tab-close" title="关闭">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M6 6l12 12M6 18 18 6"/>
        </svg>
      </button>
    </span>
  `;

  // 点击跳转
  item.addEventListener('click', (e) => {
    if (e.target.closest('.tab-close')) return;
    focusTabById(t.id);
  });

  // 单关
  item.querySelector('.tab-close').addEventListener('click', async (e) => {
    e.stopPropagation();
    playSoftChime();
    // 先发起关闭请求，同时局部更新界面（不等 await，避免增加延迟感）
    closeTabsByIds([t.id]);
    applyTabRemoval([t.id]);
  });

  return item;
}

// -------------------- 快照 --------------------
function renderSnapshots() {
  const list = $('snapshotList');
  const empty = $('snapshotEmpty');
  list.innerHTML = '';

  if (!state.snapshots.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  state.snapshots
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach(snap => {
      const item = create('div', 'snapshot-item');
      const date = new Date(snap.createdAt);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

      item.innerHTML = `
        <div class="snapshot-name">
          <span title="${escapeHtml(snap.name)}">${escapeHtml(snap.name)}</span>
        </div>
        <div class="snapshot-meta">${dateStr} · ${snap.tabs.length} 个标签</div>
        <div class="snapshot-actions">
          <button data-act="restore">恢复</button>
          <button data-act="copy">复制链接</button>
          <button class="danger" data-act="del">删除</button>
        </div>
      `;

      item.querySelector('[data-act="restore"]').addEventListener('click', () => restoreSnapshot(snap.id));
      item.querySelector('[data-act="copy"]').addEventListener('click', () => copySnapshotUrls(snap.id));
      item.querySelector('[data-act="del"]').addEventListener('click', () => deleteSnapshot(snap.id));

      list.appendChild(item);
    });
}

function openSnapshotModal() {
  $('snapshotPreviewCount').textContent = state.tabs.length;
  $('snapshotName').value = '';
  $('snapshotModal').classList.add('show');
  setTimeout(() => $('snapshotName').focus(), 60);
}
function closeSnapshotModal() {
  $('snapshotModal').classList.remove('show');
}

// -------------------- 快照抽屉 --------------------
function openSnapshotDrawer() {
  state.drawerOpen = true;
  $('snapshotTabCount').textContent = state.tabs.length;
  $('snapshotDrawer').classList.add('show');
  renderSnapshots();
}
function closeSnapshotDrawer() {
  state.drawerOpen = false;
  $('snapshotDrawer').classList.remove('show');
}

async function confirmSnapshot() {
  let name = $('snapshotName').value.trim();
  if (!name) {
    const d = new Date();
    name = `快照 · ${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const snap = {
    id: 'snap_' + Date.now().toString(36),
    name,
    createdAt: Date.now(),
    tabs: state.tabs.map(t => ({ url: t.url, title: t.title })),
  };
  state.snapshots.unshift(snap);
  // 限制最多保存 20 个
  state.snapshots = state.snapshots.slice(0, 20);
  await persistSnapshots();
  closeSnapshotModal();
  renderSnapshots();
  toast(`已保存「${snap.name}」`);
}

async function restoreSnapshot(id) {
  const snap = state.snapshots.find(s => s.id === id);
  if (!snap) return;
  if (!confirm(`将打开「${snap.name}」中的 ${snap.tabs.length} 个标签？`)) return;

  for (const t of snap.tabs) {
    try { await chrome.tabs.create({ url: t.url, active: false }); } catch {}
  }
  toast('已恢复快照');
  setTimeout(refreshAll, 600);
}

async function deleteSnapshot(id) {
  const snap = state.snapshots.find(s => s.id === id);
  if (!snap) return;
  if (!confirm(`删除快照「${snap.name}」？`)) return;
  state.snapshots = state.snapshots.filter(s => s.id !== id);
  await persistSnapshots();
  renderSnapshots();
  toast('已删除');
}

async function copySnapshotUrls(id) {
  const snap = state.snapshots.find(s => s.id === id);
  if (!snap) return;
  const text = snap.tabs.map(t => `- [${t.title}](${t.url})`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制为 Markdown 列表');
  } catch {
    toast('复制失败');
  }
}

// -------------------- 命令栏 --------------------
function openPalette() {
  state.paletteOpen = true;
  state.paletteIndex = 0;
  $('paletteMask').classList.add('show');
  $('paletteInput').value = '';
  refreshPalette('');
  setTimeout(() => $('paletteInput').focus(), 60);
}

function closePalette() {
  state.paletteOpen = false;
  $('paletteMask').classList.remove('show');
}

function refreshPalette(q) {
  const list = $('paletteList');
  list.innerHTML = '';
  const query = (q || '').trim().toLowerCase();

  let filtered = state.tabs.slice();
  if (query) {
    filtered = filtered.filter(t =>
      (t.title || '').toLowerCase().includes(query) ||
      (t.url || '').toLowerCase().includes(query)
    );
  }
  filtered = filtered.slice(0, 20);
  state.paletteFiltered = filtered;
  state.paletteIndex = 0;

  if (!filtered.length) {
    list.innerHTML = '<li class="p-empty">没有匹配的标签</li>';
    return;
  }

  filtered.forEach((t, i) => {
    const li = document.createElement('li');
    if (i === 0) li.classList.add('selected');
    const fav = faviconFor(t.url);
    li.innerHTML = `
      ${fav ? `<img class="p-icon" src="${fav}" referrerpolicy="no-referrer">` : '<span class="p-icon"></span>'}
      <span class="p-title">${escapeHtml(t.title)}</span>
      <span class="p-host">${escapeHtml(safeHostname(t.url))}</span>
    `;
    li.addEventListener('click', () => {
      focusTabById(t.id);
      closePalette();
    });
    list.appendChild(li);
  });
}

function movePaletteSelection(delta) {
  const total = state.paletteFiltered.length;
  if (!total) return;
  state.paletteIndex = (state.paletteIndex + delta + total) % total;
  $('paletteList').querySelectorAll('li').forEach((li, i) => {
    li.classList.toggle('selected', i === state.paletteIndex);
    if (i === state.paletteIndex) li.scrollIntoView({ block: 'nearest' });
  });
}

async function activatePaletteItem(closeMode) {
  const item = state.paletteFiltered[state.paletteIndex];
  if (!item) return;
  if (closeMode) {
    await closeTabsByIds([item.id]);
    toast('已关闭');
    closePalette();
    refreshAll();
  } else {
    focusTabById(item.id);
    closePalette();
  }
}

// -------------------- 水墨"叮"音效（Web Audio 合成，无外部资源）--------------------
let _audioCtx = null;
function playSoftChime() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.45);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  } catch {}
}

// -------------------- 全部关闭 --------------------
// 关闭除当前 S-TabClean 页面以外的所有真实网页标签。
// 采用应用内自建 modal 进行二次确认（New Tab 页面上 window.confirm 会被浏览器静默拦截）。
function openCloseAllModal() {
  const ids = state.tabs.map(t => t.id);
  if (ids.length === 0) {
    toast('没有可关闭的标签');
    return;
  }
  $('closeAllCount').textContent = ids.length;
  $('closeAllModal').classList.add('show');
}

function closeCloseAllModal() {
  $('closeAllModal').classList.remove('show');
}

async function confirmCloseAll() {
  closeCloseAllModal();
  const ids = state.tabs.map(t => t.id);
  if (ids.length === 0) return;

  playSoftChime();
  closeTabsByIds(ids);
  applyTabRemoval(ids);
  toast(`已关闭 ${ids.length} 个标签`);
}

// -------------------- Toast --------------------
let _toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// -------------------- 主题切换 --------------------
async function toggleTheme() {
  state.theme = state.theme === 'ink' ? 'bamboo' : 'ink';
  document.body.dataset.theme = state.theme;
  await persistTheme();
  toast(state.theme === 'ink' ? '已切换：墨青 · 夜读' : '已切换：竹简 · 日间');
}

// -------------------- 顶部主渲染 --------------------
function render() {
  renderMoodStrip();
  renderAutoTags();
  renderGroups();
  // 快照仅在抽屉打开时刷新，避免无谓 DOM 操作
  if (state.drawerOpen) renderSnapshots();
}

async function refreshAll() {
  await fetchTabs();
  render();
}

// -------------------- 事件绑定 --------------------
function bindEvents() {
  // 顶栏
  $('snapshotBtn').addEventListener('click', openSnapshotDrawer);
  $('closeAllBtn').addEventListener('click', openCloseAllModal);
  $('themeBtn').addEventListener('click', toggleTheme);

  // 快照抽屉
  $('drawerCloseBtn').addEventListener('click', closeSnapshotDrawer);
  $('snapshotDrawer').addEventListener('click', (e) => {
    if (e.target.id === 'snapshotDrawer') closeSnapshotDrawer();
  });
  $('newSnapshotBtn').addEventListener('click', openSnapshotModal);

  // 筛选
  $('filterRow').addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderGroups();
  });

  // 快照模态
  $('snapshotModal').addEventListener('click', (e) => {
    const act = e.target.dataset?.action;
    if (act === 'cancel-snapshot' || e.target.id === 'snapshotModal') closeSnapshotModal();
    if (act === 'confirm-snapshot') confirmSnapshot();
  });
  $('snapshotName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSnapshot();
    if (e.key === 'Escape') closeSnapshotModal();
  });

  // 全部关闭确认模态
  $('closeAllModal').addEventListener('click', (e) => {
    const act = e.target.dataset?.action;
    if (act === 'cancel-close-all' || e.target.id === 'closeAllModal') closeCloseAllModal();
    if (act === 'confirm-close-all') confirmCloseAll();
  });

  // 命令栏
  $('paletteMask').addEventListener('click', (e) => {
    if (e.target.id === 'paletteMask') closePalette();
  });
  $('paletteInput').addEventListener('input', (e) => refreshPalette(e.target.value));
  $('paletteInput').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); movePaletteSelection(+1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); movePaletteSelection(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); activatePaletteItem(false); }
    else if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); activatePaletteItem(true); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });

  // 全局快捷键：⌘K 打开命令栏；Esc 关闭一切
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !state.paletteOpen) {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape') {
      if (state.paletteOpen)  { closePalette();        return; }
      if ($('closeAllModal').classList.contains('show')) { closeCloseAllModal(); return; }
      if (state.drawerOpen)   { closeSnapshotDrawer(); return; }
    }
  });

  // service worker 通知（外部快捷键）
  chrome.runtime.onMessage?.addListener((msg) => {
    if (msg?.type === 'OPEN_PALETTE') openPalette();
  });

  // 监听 Tab 变化，做最小化的增量协调（自身发起的关闭会被 suppress 跳过，避免重复重渲）
  // - onCreated / onRemoved / onUpdated 走 reconcileTabs：DOM diff，不再 innerHTML='' 重建
  // - onActivated 不影响列表内容，直接跳过（避免任何潜在重排）
  const triggerReconcile = debounce(() => {
    if (state.suppressAutoRefresh) return;
    reconcileTabs();
  }, 250);
  chrome.tabs.onCreated.addListener(triggerReconcile);
  chrome.tabs.onRemoved.addListener(triggerReconcile);
  // onUpdated 会在每次 URL/标题/状态变化时触发，频率高，用更长的 debounce
  const triggerUpdated = debounce(() => {
    if (state.suppressAutoRefresh) return;
    reconcileTabs();
  }, 400);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    // 只对实质性变化响应：URL/标题/favIcon。loading 状态变化忽略
    if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl) {
      triggerUpdated();
    }
  });
  // onActivated 不触发任何重渲染，列表内容不会变化
}

function debounce(fn, ms) {
  let h;
  return (...args) => {
    clearTimeout(h);
    h = setTimeout(() => fn(...args), ms);
  };
}

// -------------------- 启动 --------------------
async function main() {
  await loadPersisted();
  await fetchTabs();
  render();
  bindEvents();
}

document.addEventListener('DOMContentLoaded', main);
