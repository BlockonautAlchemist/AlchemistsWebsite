import fs from 'node:fs';
import { readRgbaPng } from './lib/png.js';
import { CAMPER_SHEETS } from '../src/command-center/camperSheets.mjs';
import { PROP_SHEETS, propAnchorFor } from '../src/command-center/propSheets.mjs';
import { COMMAND_CENTER_PROPS } from '../src/command-center/sceneConfig.mjs';
export function measure(entry) {
  const { width, height, pixels } = readRgbaPng(`public${entry.art}`);
  const fw = entry.frameWidth || width, fh = entry.frameHeight || height;
  const frames = [];
  for (let f = 0; f < (entry.frames || 1); f++) {
    const points = [];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (pixels[(y * width + f * fw + x) * 4 + 3]) points.push([x,y]);
    }
    const bounds = (p) => ({ left: Math.min(...p.map(v=>v[0])), right: Math.max(...p.map(v=>v[0])) + 1,
      top: Math.min(...p.map(v=>v[1])), bottom: Math.max(...p.map(v=>v[1])) + 1 });
    const visual = bounds(points);
    frames.push({ visual, contact: bounds(points.filter(p => p[1] >= visual.bottom - 8)) });
  }
  return { width: fw, height: fh, frames };
}
const data = {};
for (const entry of [...CAMPER_SHEETS, ...PROP_SHEETS]) {
  if (!fs.existsSync(`public${entry.art}`)) continue;
  data[entry.key || entry.textureKey] = measure(entry);
}
fs.writeFileSync('src/command-center/assetMeasurements.json', JSON.stringify(data, null, 2)+'\n');
for (const entry of PROP_SHEETS) {
  const m = data[entry.textureKey]; if (!m || entry.id === 'wall_sigil') continue;
  const box = COMMAND_CENTER_PROPS.find(p=>p.key===entry.covers[0]), at=propAnchorFor(entry,box);
  const v=m.frames[0].visual, c=m.frames[0].contact;
  console.log(entry.id, JSON.stringify({zone:box.zone,x:at.x,y:at.y,visual:[at.x-m.width/2+v.left,at.y-m.height+v.top,at.x-m.width/2+v.right,at.y-m.height+v.bottom],contact:[at.x-m.width/2+c.left,at.y-m.height+c.top,at.x-m.width/2+c.right,at.y-m.height+c.bottom]}));
}
