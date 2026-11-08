// モード管理のコアロジック。
// 「その他のブックマーク」直下の CONTAINER フォルダに待機中モードのサブフォルダを置く。
// アクティブなモードはブックマークバーに展開されていて、コンテナには存在しない。
// 状態はフォルダ構成そのもので、storage には何も持たない。

export const CONTAINER = 'Bookmark Modes';
const DEFAULT_MODES = ['普段', '開発']; // 先頭が初期アクティブ

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

async function getContainer(other, { create }) {
  const children = await chrome.bookmarks.getChildren(other.id);
  let c = children.find((n) => !n.url && n.title === CONTAINER);
  if (!c && create) {
    c = await chrome.bookmarks.create({ parentId: other.id, title: CONTAINER });
    // 初回: 現在のバーを DEFAULT_MODES[0] とみなし、残りを空フォルダで用意する
    await chrome.bookmarks.create({ parentId: c.id, title: '__active__:' + DEFAULT_MODES[0] });
    for (const m of DEFAULT_MODES.slice(1)) {
      await chrome.bookmarks.create({ parentId: c.id, title: m });
    }
  }
  return c;
}

// コンテナ内の "__active__:<name>" という空フォルダがアクティブモード名のマーカー。
// バー側に目印を置かないので、バーの見た目は一切汚れない。
const MARK = '__active__:';

export async function getState() {
  const { bar, other } = await getRoots();
  const c = await getContainer(other, { create: true });
  const kids = (await chrome.bookmarks.getChildren(c.id)).filter((n) => !n.url);
  const marker = kids.find((n) => n.title.startsWith(MARK));
  const active = marker ? marker.title.slice(MARK.length) : DEFAULT_MODES[0];
  const inactive = kids.filter((n) => n !== marker).map((n) => n.title);
  return { bar, container: c, marker, active, modes: [active, ...inactive].sort(order) };
}

function order(a, b) {
  const ia = DEFAULT_MODES.indexOf(a), ib = DEFAULT_MODES.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.localeCompare(b, 'ja');
}

async function moveAll(fromId, toId) {
  const items = await chrome.bookmarks.getChildren(fromId);
  for (let i = 0; i < items.length; i++) {
    await chrome.bookmarks.move(items[i].id, { parentId: toId, index: i });
  }
}

let busy = false;

export async function switchTo(target) {
  if (busy) throw new Error('切替中だ。少し待て');
  busy = true;
  try {
    const st = await getState();
    if (target === st.active) return st;
    const kids = await chrome.bookmarks.getChildren(st.container.id);
    const dest = kids.find((n) => !n.url && n.title === target);
    if (!dest) throw new Error(`モード "${target}" が見つからない`);

    // 1. 現在のバーを退避フォルダへ
    const park = await chrome.bookmarks.create({ parentId: st.container.id, title: st.active });
    await moveAll(st.bar.id, park.id);
    // 2. 対象モードをバーへ
    await moveAll(dest.id, st.bar.id);
    await chrome.bookmarks.remove(dest.id);
    // 3. マーカー更新
    if (st.marker) {
      await chrome.bookmarks.update(st.marker.id, { title: MARK + target });
    } else {
      await chrome.bookmarks.create({ parentId: st.container.id, title: MARK + target });
    }
    return await getState();
  } finally {
    busy = false;
  }
}

export async function cycle() {
  const st = await getState();
  const i = st.modes.indexOf(st.active);
  return switchTo(st.modes[(i + 1) % st.modes.length]);
}
