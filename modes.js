// モード管理のコアロジック。
// 「その他のブックマーク」直下の CONTAINER フォルダに、モードごとのサブフォルダを並べる。
// アクティブなモードの中身はブックマークバーに展開されていて、そのスロットには
// "__active__:<名前>" という空フォルダ（マーカー）が置かれる。
// 状態はフォルダ構成そのもので、storage には何も持たない。
// モードの表示順 = コンテナ内のフォルダ順（マーカーがアクティブモードの位置を占める）。

export const CONTAINER = 'Bookmark Modes';
const DEFAULT_MODES = ['普段', '開発']; // 初回作成時のみ使う。先頭が初期アクティブ
const MARK = '__active__:';
const MAX_NAME = 30;

async function getRoots() {
  const [root] = await chrome.bookmarks.getTree();
  const kids = root.children;
  // Chrome 134+ は folderType / syncing を返す。アカウント保存とローカル保存で
  // バーが 2 つある場合は同期対象側を優先する。
  const bars = kids.filter((n) => n.folderType === 'bookmarks-bar');
  const others = kids.filter((n) => n.folderType === 'other');
  const pick = (list, fallback) =>
    list.find((n) => n.syncing) ?? list[0] ?? fallback;
  const bar = pick(bars, kids[0]);
  const other =
    others.find((n) => n.syncing === bar.syncing) ?? pick(others, kids[1]);
  return { bar, other };
}

async function getContainer(other) {
  const children = await chrome.bookmarks.getChildren(other.id);
  let c = children.find((n) => !n.url && n.title === CONTAINER);
  if (!c) {
    c = await chrome.bookmarks.create({ parentId: other.id, title: CONTAINER });
    // 初回: 現在のバーを DEFAULT_MODES[0] とみなし、残りを空フォルダで用意する
    await chrome.bookmarks.create({ parentId: c.id, title: MARK + DEFAULT_MODES[0] });
    for (const m of DEFAULT_MODES.slice(1)) {
      await chrome.bookmarks.create({ parentId: c.id, title: m });
    }
  }
  return c;
}

function countUrls(node) {
  if (node.url) return 1;
  return (node.children ?? []).reduce((s, n) => s + countUrls(n), 0);
}

export async function getState() {
  const { bar, other } = await getRoots();
  const container = await getContainer(other);
  const kids = (await chrome.bookmarks.getChildren(container.id)).filter((n) => !n.url);
  let marker = kids.find((n) => n.title.startsWith(MARK));
  if (!marker) {
    // 切替中にクラッシュした等でマーカーが無い。バーを名前未定のモードとして復旧する
    const used = new Set(kids.map((n) => n.title));
    let name = '復旧', i = 2;
    while (used.has(name)) name = `復旧${i++}`;
    marker = await chrome.bookmarks.create({ parentId: container.id, title: MARK + name });
    kids.push(marker);
  }
  const active = marker.title.slice(MARK.length);
  const [barTree] = await chrome.bookmarks.getSubTree(bar.id);
  const modes = [];
  for (const n of kids) {
    if (n === marker) {
      modes.push({ name: active, count: countUrls(barTree), active: true });
    } else {
      const [t] = await chrome.bookmarks.getSubTree(n.id);
      modes.push({ name: n.title, count: countUrls(t), active: false });
    }
  }
  return { bar, container, marker, active, kids, modes };
}

async function moveAll(fromId, toId) {
  const items = await chrome.bookmarks.getChildren(fromId);
  for (let i = 0; i < items.length; i++) {
    await chrome.bookmarks.move(items[i].id, { parentId: toId, index: i });
  }
}

// 書き込み系は直列化する（ポップアップとショートカットの同時実行対策）
let queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

function findMode(st, name) {
  if (name === st.active) return st.marker;
  const n = st.kids.find((k) => k !== st.marker && k.title === name);
  if (!n) throw new Error(`モード "${name}" が見つからない`);
  return n;
}

function validateName(st, raw, { except } = {}) {
  const name = String(raw ?? '').trim();
  if (!name) throw new Error('名前が空だ');
  if (name.length > MAX_NAME) throw new Error(`名前は ${MAX_NAME} 文字以内にしてくれ`);
  if (name.startsWith(MARK)) throw new Error(`"${MARK}" で始まる名前は使えない`);
  if (name !== except && st.modes.some((m) => m.name === name)) {
    throw new Error(`"${name}" は既にある`);
  }
  return name;
}

export const switchTo = (target) =>
  exclusive(async () => {
    const st = await getState();
    if (target === st.active) return st;
    const dest = findMode(st, target);
    // マーカーフォルダをそのまま退避先にし、dest を新しいマーカーにする。
    // フォルダの位置が動かないので表示順が保たれる。
    await moveAll(st.bar.id, st.marker.id);
    await chrome.bookmarks.update(st.marker.id, { title: st.active });
    await moveAll(dest.id, st.bar.id);
    await chrome.bookmarks.update(dest.id, { title: MARK + target });
    return getState();
  });

export const cycle = () =>
  getState().then((st) => {
    const i = st.modes.findIndex((m) => m.active);
    return switchTo(st.modes[(i + 1) % st.modes.length].name);
  });

export const addMode = (raw) =>
  exclusive(async () => {
    const st = await getState();
    const name = validateName(st, raw);
    await chrome.bookmarks.create({ parentId: st.container.id, title: name });
    return getState();
  });

export const renameMode = (from, raw) =>
  exclusive(async () => {
    const st = await getState();
    const node = findMode(st, from);
    const name = validateName(st, raw, { except: from });
    if (name === from) return st;
    const title = from === st.active ? MARK + name : name;
    await chrome.bookmarks.update(node.id, { title });
    return getState();
  });

export const deleteMode = (name) =>
  exclusive(async () => {
    const st = await getState();
    if (name === st.active) throw new Error('使用中のモードは削除できない');
    const node = findMode(st, name);
    await chrome.bookmarks.removeTree(node.id);
    return getState();
  });
