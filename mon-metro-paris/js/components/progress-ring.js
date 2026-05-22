export function progressRing({ percentage, label, sublabel, size = 200, color }) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - Math.max(0, Math.min(1, percentage)));

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "progress-ring");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${Math.round(percentage * 100)} pour cent`);

  const track = document.createElementNS(ns, "circle");
  track.setAttribute("class", "progress-ring__track");
  track.setAttribute("cx", size / 2);
  track.setAttribute("cy", size / 2);
  track.setAttribute("r", radius);

  const bar = document.createElementNS(ns, "circle");
  bar.setAttribute("class", "progress-ring__bar");
  bar.setAttribute("cx", size / 2);
  bar.setAttribute("cy", size / 2);
  bar.setAttribute("r", radius);
  bar.setAttribute("stroke-dasharray", circ);
  bar.setAttribute("stroke-dashoffset", offset);
  if (color) bar.style.stroke = color;

  const text = document.createElementNS(ns, "text");
  text.setAttribute("class", "progress-ring__text");
  text.setAttribute("x", "50%");
  text.setAttribute("y", "50%");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.textContent = label;

  const sub = document.createElementNS(ns, "text");
  sub.setAttribute("class", "progress-ring__sub");
  sub.setAttribute("x", "50%");
  sub.setAttribute("y", "66%");
  sub.setAttribute("text-anchor", "middle");
  sub.textContent = sublabel ?? "";

  svg.append(track, bar, text, sub);
  return svg;
}
