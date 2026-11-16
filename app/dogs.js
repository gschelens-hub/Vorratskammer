// 552 – Hundekörbchen: hand-drawn SVG dogs (Hazel = Nova Scotia Duck Tolling Retriever, Koko = Vizsla).
// All animation is done in CSS (styles.css, section "dog basket").

export const DOGS = {
  hazel: { name: 'Hazel', breed: 'Nova Scotia' },
  koko: { name: 'Koko', breed: 'Vizsla' },
};

// Basket position in the furniture plan (same units as PLAN in logic.js): left of Julia's desk.
export const BASKET = { x: 1165, y: 455, w: 330, h: 340 };

const basketBack = `
  <ellipse cx="160" cy="232" rx="150" ry="62" fill="#7a4a22"/>
  <ellipse cx="160" cy="236" rx="132" ry="50" fill="#e9dcc6"/>
  <path d="M40 236 Q160 196 280 236" fill="none" stroke="#d7c6aa" stroke-width="6" stroke-linecap="round"/>
  <path d="M52 250 Q160 214 268 250" fill="none" stroke="#d7c6aa" stroke-width="6" stroke-linecap="round"/>`;

const basketFront = `
  <clipPath id="basket552Clip"><path d="M10 232 A150 62 0 0 0 310 232 L303 262 Q288 326 160 328 Q32 326 17 262 Z"/></clipPath>
  <path d="M10 232 A150 62 0 0 0 310 232 L303 262 Q288 326 160 328 Q32 326 17 262 Z" fill="#a8733f"/>
  <g fill="none" stroke="#8a5a2c" stroke-width="5" stroke-linecap="round" opacity=".7" clip-path="url(#basket552Clip)">
    <path d="M22 272 Q160 318 298 272"/>
    <path d="M40 300 Q160 336 280 300"/>
    <path d="M70 286 l10 28 M110 292 l8 30 M150 296 l4 31 M190 296 l-2 31 M230 292 l-6 30 M266 284 l-9 28"/>
  </g>
  <path d="M10 232 A150 62 0 0 0 310 232" fill="none" stroke="#6e421d" stroke-width="16" stroke-linecap="round"/>
  <path d="M14 228 A146 58 0 0 0 306 228" fill="none" stroke="#c28a50" stroke-width="5" stroke-linecap="round" opacity=".8"/>`;

const eyes = (iris) => `
  <g class="eyes">
    <ellipse cx="141" cy="124" rx="8" ry="8.5" fill="${iris}"/>
    <ellipse cx="179" cy="124" rx="8" ry="8.5" fill="${iris}"/>
    <circle cx="142" cy="125" r="4.2" fill="#1a0e07"/>
    <circle cx="180" cy="125" r="4.2" fill="#1a0e07"/>
    <circle cx="144.5" cy="121.5" r="2" fill="#fff"/>
    <circle cx="182.5" cy="121.5" r="2" fill="#fff"/>
  </g>`;

function hazel() {
  const fur = '#c65d23';
  const dark = '#a2461a';
  return `
  <g class="dog dog-hazel">
    <g class="tail"><path d="M246 222 C276 206 300 180 312 150 C316 172 304 204 278 226 Z" fill="${fur}"/><path d="M304 160 C310 152 314 146 316 140 C320 156 314 170 306 178 Z" fill="#fbf6ee"/></g>
    <g class="body">
      <ellipse cx="160" cy="232" rx="104" ry="42" fill="${fur}"/>
      <path d="M118 200 Q160 250 202 200 L196 250 Q160 266 124 250 Z" fill="#fbf6ee"/>
    </g>
    <g class="head">
      <g class="ear ear-l"><path d="M114 96 C96 106 92 136 104 154 C116 146 126 126 128 104 Z" fill="${dark}"/></g>
      <g class="ear ear-r"><path d="M206 96 C224 106 228 136 216 154 C204 146 194 126 192 104 Z" fill="${dark}"/></g>
      <path d="M160 70 C204 70 218 104 214 134 C210 166 190 188 160 190 C130 188 110 166 106 134 C102 104 116 70 160 70 Z" fill="${fur}"/>
      <path d="M154 74 Q160 72 166 74 L172 140 Q160 146 148 140 Z" fill="#fbf6ee"/>
      <ellipse cx="160" cy="164" rx="27" ry="23" fill="#fbf6ee"/>
      ${eyes('#8a4a14')}
      <ellipse cx="160" cy="154" rx="11" ry="8" fill="#5b2e22"/>
      <ellipse cx="156" cy="151" rx="3" ry="1.8" fill="#8a5446"/>
      <path d="M144 168 Q160 182 176 168 Q170 186 160 186 Q150 186 144 168 Z" fill="#4a1a17"/>
      <path class="tongue" d="M152 176 Q160 174 168 176 L167 192 Q160 199 153 192 Z" fill="#ef7f92"/>
    </g>
  </g>`;
}
const hazelPaws = `<g class="paws"><ellipse cx="126" cy="272" rx="17" ry="11" fill="#fbf6ee"/><ellipse cx="194" cy="272" rx="17" ry="11" fill="#fbf6ee"/></g>`;

function koko() {
  const fur = '#c0733b';
  const ear = '#a65a2a';
  return `
  <g class="dog dog-koko">
    <g class="tail"><path d="M248 226 C274 216 296 198 312 176 C312 190 300 212 276 230 Z" fill="${fur}"/></g>
    <g class="body"><ellipse cx="160" cy="232" rx="104" ry="42" fill="${fur}"/></g>
    <g class="head">
      <g class="ear ear-l"><path d="M118 92 C92 96 82 140 90 186 C98 204 116 200 122 184 C128 156 130 118 128 98 Z" fill="${ear}"/></g>
      <g class="ear ear-r"><path d="M202 92 C228 96 238 140 230 186 C222 204 204 200 198 184 C192 156 190 118 192 98 Z" fill="${ear}"/></g>
      <path d="M160 66 C198 66 208 100 204 130 C202 152 196 168 188 178 C180 190 170 196 160 196 C150 196 140 190 132 178 C124 168 118 152 116 130 C112 100 122 66 160 66 Z" fill="${fur}"/>
      <path d="M140 84 Q160 78 180 84 M146 94 Q160 90 174 94" fill="none" stroke="#a65d2c" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
      <ellipse cx="160" cy="168" rx="26" ry="24" fill="#cd8754"/>
      ${eyes('#a35e1c')}
      <ellipse cx="160" cy="160" rx="13" ry="9.5" fill="#9a5a4b"/>
      <ellipse cx="155" cy="161" rx="2.6" ry="1.8" fill="#5e3027"/>
      <ellipse cx="165" cy="161" rx="2.6" ry="1.8" fill="#5e3027"/>
      <path d="M160 170 L160 178 M148 180 Q160 188 172 180" fill="none" stroke="#7d4130" stroke-width="2.5" stroke-linecap="round"/>
    </g>
  </g>`;
}
const kokoPaws = `<g class="paws"><ellipse cx="126" cy="272" rx="17" ry="11" fill="#c0733b"/><ellipse cx="194" cy="272" rx="17" ry="11" fill="#c0733b"/></g>`;

function empty() {
  return `
  <g class="bone" opacity=".9">
    <rect x="128" y="226" width="64" height="14" rx="7" fill="#f3ede2"/>
    <circle cx="128" cy="226" r="9" fill="#f3ede2"/><circle cx="128" cy="240" r="9" fill="#f3ede2"/>
    <circle cx="192" cy="226" r="9" fill="#f3ede2"/><circle cx="192" cy="240" r="9" fill="#f3ede2"/>
  </g>`;
}

/** Full basket SVG; dog = 'hazel' | 'koko' | null. Layers: basket back, dog, basket front, paws over the rim. */
export function basketSvg(dog) {
  const main = dog === 'hazel' ? hazel() : dog === 'koko' ? koko() : empty();
  const paws = dog === 'hazel' ? hazelPaws : dog === 'koko' ? kokoPaws : '';
  return `<svg viewBox="0 0 320 340" class="basket-svg${dog ? ' has-dog' : ''}" aria-hidden="true">${basketBack}<g class="dog-in">${main}</g>${basketFront}<g class="dog-in">${paws}</g></svg>`;
}

/** Small head-only preview for the chooser. */
export function dogPreviewSvg(dog) {
  return `<svg viewBox="80 56 160 150" class="dog-preview" aria-hidden="true">${dog === 'hazel' ? hazel() : koko()}</svg>`;
}
