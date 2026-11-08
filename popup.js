const box = document.getElementById('modes');
const err = document.getElementById('err');

function render(res) {
  err.textContent = res.ok ? '' : res.error;
  if (!res.ok) return;
  box.replaceChildren(
    ...res.modes.map((m) => {
      const b = document.createElement('button');
      b.textContent = m;
      b.disabled = m === res.active;
      b.onclick = async () => {
        box.querySelectorAll('button').forEach((x) => (x.disabled = true));
        render(await chrome.runtime.sendMessage({ type: 'switch', mode: m }));
      };
      return b;
    }),
  );
}

chrome.runtime.sendMessage({ type: 'state' }).then(render);
