import { getState, switchTo, cycle, addMode, renameMode, deleteMode } from './modes.js';

async function refreshBadge(st) {
  const { active } = st ?? (await getState());
  await chrome.action.setBadgeText({ text: active.slice(0, 2) });
  await chrome.action.setTitle({ title: `ブックマークモード: ${active}` });
}

chrome.runtime.onInstalled.addListener(() => refreshBadge());
chrome.runtime.onStartup.addListener(() => refreshBadge());

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'toggle-mode') return;
  await refreshBadge(await cycle());
});

const handlers = {
  state: () => getState(),
  switch: (m) => switchTo(m.mode),
  add: (m) => addMode(m.name),
  rename: (m) => renameMode(m.from, m.to),
  delete: (m) => deleteMode(m.name),
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      const handler = handlers[msg.type];
      if (!handler) throw new Error(`unknown message: ${msg.type}`);
      const st = await handler(msg);
      await refreshBadge(st);
      reply({ ok: true, active: st.active, modes: st.modes });
    } catch (e) {
      // 失敗時も最新状態を返し、UI を実際の状態に合わせる
      const st = await getState().catch(() => null);
      reply({ ok: false, error: String(e.message ?? e), active: st?.active, modes: st?.modes });
    }
  })();
  return true; // 非同期 reply
});
