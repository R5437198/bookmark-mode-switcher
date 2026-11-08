import { getState, switchTo, cycle } from './modes.js';

async function refreshBadge() {
  const { active } = await getState();
  await chrome.action.setBadgeText({ text: active.slice(0, 2) });
  await chrome.action.setTitle({ title: `ブックマークモード: ${active}` });
}

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'toggle-mode') return;
  await cycle();
  await refreshBadge();
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      const st = msg.type === 'switch' ? await switchTo(msg.mode) : await getState();
      await refreshBadge();
      reply({ ok: true, active: st.active, modes: st.modes });
    } catch (e) {
      reply({ ok: false, error: String(e.message ?? e) });
    }
  })();
  return true; // 非同期 reply
});
