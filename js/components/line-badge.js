export function lineBadge(line, opts = {}) {
  const { size = "md", as = "span" } = opts;
  const el = document.createElement(as);
  el.className = `line-badge line-badge--${size}`;
  el.style.background = line.colorHex;
  el.style.color = line.textColorHex;
  el.title = line.name;
  el.textContent = formatLineLabel(line.id);
  return el;
}

export function formatLineLabel(id) {
  if (id.endsWith("bis")) {
    const num = id.replace("bis", "");
    return num + "ᵇⁱˢ";
  }
  return id;
}

export function lineBadgeHTML(line, opts = {}) {
  const size = opts.size || "md";
  const label = formatLineLabel(line.id);
  return `<span class="line-badge line-badge--${size}" style="background:${line.colorHex};color:${line.textColorHex}" title="${line.name}">${label}</span>`;
}
