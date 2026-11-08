const $ = (id) => document.getElementById(id);
const switchView = $('switch-view');
const editView = $('edit-view');
const err = $('err');

const TRASH =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>';

let state = { active: null, modes: [] };

function el(tag, props = {}, children = []) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

async function send(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  err.textContent = res.ok ? '' : res.error;
  if (res.modes) state = { active: res.active, modes: res.modes };
  render();
  return res.ok;
}

function render() {
  renderSwitch();
  renderEdit();
}

function renderSwitch() {
  $('modes').replaceChildren(
    ...state.modes.map((m) => {
      const b = el('button', { className: 'mode' + (m.active ? ' active' : ''), disabled: m.active }, [
        el('span', { textContent: m.name }),
        el('span', { className: 'count', textContent: m.count }),
      ]);
      b.onclick = () => {
        document.querySelectorAll('.mode').forEach((x) => (x.disabled = true));
        send({ type: 'switch', mode: m.name });
      };
      return b;
    }),
  );
}

function renderEdit() {
  // 入力中の行を再描画で潰さない
  if (editView.contains(document.activeElement) && document.activeElement.dataset.mode) return;
  $('edit-list').replaceChildren(...state.modes.map(editRow));
}

function editRow(m) {
  const input = el('input', {
    value: m.name,
    maxLength: 30,
    className: m.active ? 'active' : '',
    title: m.active ? '使用中のモード（クリックして名前を変更）' : 'クリックして名前を変更',
  });
  input.dataset.mode = m.name;
  const commit = async () => {
    const to = input.value.trim();
    if (to === m.name) return;
    input.blur();
    if (!(await send({ type: 'rename', from: m.name, to }))) input.value = m.name;
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = m.name; input.blur(); e.preventDefault(); }
  };
  input.onblur = commit;

  const del = el('button', {
    className: 'icon-btn del',
    innerHTML: TRASH,
    disabled: m.active,
    title: m.active ? '使用中のモードは削除できない' : `「${m.name}」を削除`,
  });
  let armed = null;
  del.onclick = () => {
    if (!armed) {
      // 1 回目: 確認表示に切り替える。3 秒で元に戻す
      del.classList.add('confirm');
      del.textContent = m.count ? `${m.count}件ごと削除` : '削除する';
      armed = setTimeout(() => {
        armed = null;
        del.classList.remove('confirm');
        del.innerHTML = TRASH;
      }, 3000);
      return;
    }
    clearTimeout(armed);
    send({ type: 'delete', name: m.name });
  };

  return el('div', { className: 'row' }, [
    input,
    el('span', { className: 'count', textContent: m.count, title: 'ブックマーク数' }),
    del,
  ]);
}

$('add-form').onsubmit = async (e) => {
  e.preventDefault();
  const input = $('add-name');
  if (await send({ type: 'add', name: input.value })) input.value = '';
  input.focus();
};

function showEdit(on) {
  switchView.hidden = on;
  editView.hidden = !on;
  err.textContent = '';
  if (on) $('add-name').focus();
}
$('open-edit').onclick = () => showEdit(true);
$('close-edit').onclick = () => showEdit(false);

send({ type: 'state' });
