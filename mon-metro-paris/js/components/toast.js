const ROOT_ID = "toast-root";

export function showToast(message, opts = {}) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast" + (opts.variant ? ` toast--${opts.variant}` : "");
  if (opts.icon) {
    const i = document.createElement("span");
    i.textContent = opts.icon;
    el.append(i);
  }
  const span = document.createElement("span");
  span.textContent = message;
  el.append(span);
  root.append(el);
  setTimeout(() => el.remove(), 3000);
}
