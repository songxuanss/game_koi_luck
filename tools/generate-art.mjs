import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = resolve(ROOT, 'client/art-source');
const OUT = resolve(ROOT, 'client/assets/resources/art');

const background = () => `<svg width="750" height="1624" viewBox="0 0 750 1624" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#06152b"/><stop offset=".52" stop-color="#0a3b4a"/><stop offset="1" stop-color="#062b38"/></linearGradient>
  <linearGradient id="river" x2="0" y2="1"><stop stop-color="#0b5260" stop-opacity=".28"/><stop offset=".45" stop-color="#07394d" stop-opacity=".82"/><stop offset="1" stop-color="#031a2c"/></linearGradient>
  <radialGradient id="moon"><stop stop-color="#fff9cf"/><stop offset=".34" stop-color="#ffe8a0" stop-opacity=".82"/><stop offset="1" stop-color="#ffd77c" stop-opacity="0"/></radialGradient>
  <linearGradient id="mountain" x2="0" y2="1"><stop stop-color="#1b6770" stop-opacity=".64"/><stop offset="1" stop-color="#07333f" stop-opacity=".16"/></linearGradient>
  <filter id="blur"><feGaussianBlur stdDeviation="18"/></filter>
  <filter id="soft"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="grain"><feTurbulence baseFrequency=".65" numOctaves="3" seed="19" type="fractalNoise"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .045 0"/></filter>
</defs>
<rect width="750" height="1624" fill="url(#sky)"/>
<ellipse cx="610" cy="220" rx="210" ry="210" fill="url(#moon)" opacity=".68"/>
<circle cx="610" cy="220" r="59" fill="#fff2bd" opacity=".92"/>
<circle cx="591" cy="205" r="12" fill="#e7d99f" opacity=".2"/>
<g fill="#b9f4ed" opacity=".48">
  <circle cx="95" cy="156" r="2"/><circle cx="183" cy="91" r="1.5"/><circle cx="308" cy="182" r="1.4"/><circle cx="425" cy="76" r="2"/><circle cx="690" cy="410" r="1.4"/><circle cx="61" cy="382" r="1.2"/><circle cx="496" cy="334" r="1.5"/>
</g>
<g fill="none" stroke="#a5ded7" stroke-linecap="round" opacity=".18">
  <path d="M-70 330 C30 265 102 355 186 305 S356 266 405 307" stroke-width="15" filter="url(#soft)"/>
  <path d="M425 408 C510 352 593 410 680 348 S812 359 845 334" stroke-width="11" filter="url(#soft)"/>
</g>
<path d="M0 630 L105 439 193 573 318 337 439 562 554 412 750 620 V890 H0Z" fill="url(#mountain)"/>
<path d="M0 704 L144 537 248 664 390 490 510 671 635 522 750 650 V935 H0Z" fill="#082f3d" opacity=".72"/>
<path d="M0 782 C150 714 239 803 375 744 S603 708 750 776 V1624 H0Z" fill="url(#river)"/>
<g fill="none" stroke="#8be4dc" opacity=".13">
  <path d="M-60 912 C121 850 220 974 410 899 S681 878 809 927"/>
  <path d="M-75 1082 C99 1014 252 1120 427 1054 S667 1032 812 1075"/>
  <path d="M-45 1288 C149 1224 264 1328 458 1256 S688 1252 800 1280"/>
</g>
<g fill="#ffd68a">
  <circle cx="87" cy="744" r="15" opacity=".18" filter="url(#blur)"/><circle cx="87" cy="744" r="3" opacity=".75"/>
  <circle cx="682" cy="858" r="18" opacity=".16" filter="url(#blur)"/><circle cx="682" cy="858" r="3" opacity=".65"/>
  <circle cx="534" cy="1130" r="12" opacity=".14" filter="url(#blur)"/><circle cx="534" cy="1130" r="2" opacity=".6"/>
</g>
<rect width="750" height="1624" filter="url(#grain)" opacity=".5"/>
<rect x="9" y="9" width="732" height="1606" rx="32" fill="none" stroke="#d6b875" stroke-opacity=".12" stroke-width="2"/>
</svg>`;

const koi = (name, body, light, tail) => `<svg width="320" height="200" viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".38" stop-color="${body}"/><stop offset="1" stop-color="#091c2c"/></linearGradient>
  <linearGradient id="tail" x2="1" y2="1"><stop stop-color="${light}" stop-opacity=".92"/><stop offset=".55" stop-color="${tail}" stop-opacity=".72"/><stop offset="1" stop-color="${tail}" stop-opacity=".05"/></linearGradient>
  <radialGradient id="pearl" cx=".38" cy=".25"><stop stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <filter id="shadow"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<ellipse cx="160" cy="150" rx="112" ry="20" fill="${body}" opacity=".2" filter="url(#shadow)"/>
<path d="M102 91 C64 51 39 34 12 44 C38 72 40 91 17 130 C52 130 76 119 106 111Z" fill="url(#tail)"/>
<path d="M98 96 C59 78 37 76 21 84 C49 97 58 112 31 146 C68 137 85 121 111 111Z" fill="url(#tail)" opacity=".76"/>
<path d="M130 121 C112 153 116 176 146 179 C141 153 156 139 173 125Z" fill="url(#tail)" opacity=".82"/>
<path d="M147 74 C128 42 137 24 165 24 C157 48 173 62 186 73Z" fill="url(#tail)" opacity=".66"/>
<path d="M71 102 C91 46 190 39 269 82 C293 95 292 112 267 128 C192 169 98 151 71 102Z" fill="url(#body)" filter="url(#glow)"/>
<path d="M83 91 C126 52 204 52 263 84 C204 69 139 81 91 116Z" fill="url(#pearl)" opacity=".65"/>
<g fill="none" stroke="${light}" stroke-width="2" opacity=".35">
  <path d="M111 85 Q126 101 111 117 M135 74 Q153 96 135 124 M162 68 Q180 96 162 130 M190 66 Q208 94 192 128 M218 72 Q232 94 219 120"/>
</g>
<path d="M154 129 C139 153 144 163 166 159 C180 151 188 139 195 126Z" fill="url(#tail)" opacity=".8"/>
<ellipse cx="255" cy="92" rx="8" ry="9" fill="#f8f3d9"/><circle cx="258" cy="93" r="4.5" fill="#071522"/><circle cx="260" cy="91" r="1.4" fill="#fff"/>
<path d="M282 105 Q299 111 279 119" fill="none" stroke="${light}" stroke-width="3" stroke-linecap="round"/>
<path d="M267 125 Q278 134 285 126" fill="none" stroke="${light}" stroke-width="2" opacity=".65"/>
</svg>`;

const gate = () => `<svg width="512" height="384" viewBox="0 0 512 384" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b0"/><stop offset=".32" stop-color="#dcae53"/><stop offset=".64" stop-color="#fff0a4"/><stop offset="1" stop-color="#8e5d24"/></linearGradient>
  <linearGradient id="jade" x2="0" y2="1"><stop stop-color="#50d6c5"/><stop offset="1" stop-color="#0a5961"/></linearGradient>
  <radialGradient id="aura"><stop stop-color="#ffe6a0" stop-opacity=".38"/><stop offset="1" stop-color="#ffe6a0" stop-opacity="0"/></radialGradient>
  <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<ellipse cx="256" cy="202" rx="224" ry="174" fill="url(#aura)"/>
<path d="M107 179 L135 179 130 346 99 346Z M377 179 L405 179 413 346 382 346Z" fill="url(#gold)"/>
<path d="M91 339 H140 L147 357 H82Z M372 339 H421 L430 357 H365Z" fill="#b37c35"/>
<path d="M83 164 H429 L413 190 H99Z" fill="url(#gold)"/>
<path d="M53 143 Q133 121 172 64 Q249 106 340 62 Q378 116 459 143 Q368 136 342 154 H169 Q131 137 53 143Z" fill="url(#gold)" filter="url(#glow)"/>
<path d="M112 133 Q189 120 220 88 Q268 110 305 86 Q340 121 401 133 Q308 128 256 143 Q191 128 112 133Z" fill="url(#jade)"/>
<path d="M149 169 H363 V195 H149Z" fill="#805323" opacity=".72"/>
<path d="M163 171 H349 V183 H163Z" fill="url(#jade)" opacity=".85"/>
<path d="M245 36 L256 12 267 36 256 53Z" fill="#ffeaa2" filter="url(#glow)"/>
<g filter="url(#glow)">
  <path d="M127 187 V222 M385 187 V222" stroke="#e5b95e" stroke-width="3"/>
  <rect x="109" y="218" width="36" height="48" rx="13" fill="#d95447" stroke="#ffd77e" stroke-width="3"/>
  <rect x="367" y="218" width="36" height="48" rx="13" fill="#d95447" stroke="#ffd77e" stroke-width="3"/>
  <path d="M116 230 H138 M116 251 H138 M374 230 H396 M374 251 H396" stroke="#ffd77e" stroke-width="2"/>
  <path d="M127 266 V281 M385 266 V281" stroke="#ffd77e" stroke-width="3"/>
</g>
<path d="M84 357 Q256 320 428 357" fill="none" stroke="#f6d986" stroke-width="3" opacity=".5"/>
</svg>`;

const panel = () => `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#143e50" stop-opacity=".91"/><stop offset="1" stop-color="#061a2a" stop-opacity=".95"/></linearGradient></defs><rect x="6" y="10" width="244" height="240" rx="28" fill="#020b16" opacity=".45"/><rect x="4" y="4" width="248" height="240" rx="28" fill="url(#glass)" stroke="#c6a967" stroke-opacity=".38" stroke-width="2"/><path d="M30 15 H226" stroke="#fff3c0" stroke-opacity=".22" stroke-width="2" stroke-linecap="round"/><rect x="12" y="12" width="232" height="224" rx="22" fill="none" stroke="#86d8d1" stroke-opacity=".08"/></svg>`;
const glow = () => `<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><radialGradient id="g"><stop stop-color="#fffbd8"/><stop offset=".18" stop-color="#ffe89a" stop-opacity=".92"/><stop offset=".5" stop-color="#8be4dc" stop-opacity=".28"/><stop offset="1" stop-color="#8be4dc" stop-opacity="0"/></radialGradient><circle cx="64" cy="64" r="64" fill="url(#g)"/></svg>`;

const assets = [
  ['bg-night-river', background()],
  ['koi-red', koi('red', '#ef6357', '#ffd6a5', '#ff8b72')],
  ['koi-blue', koi('blue', '#22a9c7', '#c4fff3', '#69e6df')],
  ['koi-gold', koi('gold', '#e9b94f', '#fff7c4', '#ffe28a')],
  ['dragon-gate', gate()],
  ['glass-panel', panel()],
  ['glow', glow()],
];
await mkdir(SOURCE, { recursive: true });
await mkdir(OUT, { recursive: true });
for (const [name, svg] of assets) {
  await writeFile(resolve(SOURCE, `${name}.svg`), svg);
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(resolve(OUT, `${name}.png`));
  console.log(`generated art/${name}.png`);
}
await sharp({ create: { width: 1200, height: 900, channels: 4, background: '#071522' } }).composite([
  { input: await sharp(resolve(OUT, 'bg-night-river.png')).resize(416, 900).png().toBuffer(), left: 20, top: 0 },
  { input: await sharp(resolve(OUT, 'dragon-gate.png')).resize(400, 300).png().toBuffer(), left: 500, top: 50 },
  { input: resolve(OUT, 'koi-red.png'), left: 480, top: 420 },
  { input: resolve(OUT, 'koi-blue.png'), left: 820, top: 420 },
  { input: resolve(OUT, 'koi-gold.png'), left: 650, top: 660 },
]).png().toFile(resolve(ROOT, 'artifacts/art-direction.png'));
console.log('generated artifacts/art-direction.png');
