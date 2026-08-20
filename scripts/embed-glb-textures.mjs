/**
 * 把《鳄龙咆哮》Kenney Blaster Kit GLB 的外部贴图内嵌为 GLB 自带 bufferView。
 *
 * 背景：crate-*.glb / blaster-*.glb 的 images[].uri 指向外部
 * `Textures/colormap.png`。开发模式下该相对路径在源码目录存在，能正常加载；
 * 但 Vite 生产构建会把 .glb 哈希化复制到 dist/assets/，外部贴图文件不会跟随，
 * GLTFLoader 按相对路径请求 404 → 材质回退为白色（箱子/枪全白）。
 * 内嵌后每个 GLB 自包含贴图，任何环境（dev/build/打包）都不再依赖外部文件。
 *
 * 素材为 Kenney Blaster Kit 2.1（CC0，允许修改）；原贴图文件保留在
 * assets/models/Textures/ 供重新生成时使用。
 *
 * 用法：node scripts/embed-glb-textures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelDir = path.join(root, 'games/corcodragon-fight/assets/models');
const texturePath = path.join(modelDir, 'Textures/colormap.png');
const targets = [
  'crate-small.glb',
  'crate-medium.glb',
  'crate-wide.glb',
  'blaster-a.glb',
  'blaster-e.glb',
  'blaster-h.glb',
];

const png = fs.readFileSync(texturePath);
if (png.length === 0) throw new Error(`贴图为空：${texturePath}`);

function embed(modelName) {
  const modelPath = path.join(modelDir, modelName);
  const buf = fs.readFileSync(modelPath);
  if (buf.toString('ascii', 0, 4) !== 'glTF' || buf.readUInt32LE(4) !== 2) {
    throw new Error(`${modelName} 不是 GLB v2`);
  }
  const jsonLen = buf.readUInt32LE(12);
  if (buf.toString('ascii', 16, 20) !== 'JSON') throw new Error(`${modelName} 缺少 JSON chunk`);
  const binOffset = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binOffset);
  if (buf.toString('ascii', binOffset + 4, binOffset + 8) !== 'BIN\0') {
    throw new Error(`${modelName} 缺少 BIN chunk`);
  }
  const oldBin = buf.subarray(binOffset + 8, binOffset + 8 + binLen);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

  if ((json.images ?? []).every((img) => img.bufferView !== undefined && img.uri === undefined)) {
    console.log(`⏭️ 已内嵌，跳过：${modelName}`);
    return false;
  }

  const binPaddedLen = Math.ceil((oldBin.length + png.length) / 4) * 4;
  const viewIndex = json.bufferViews?.length ?? 0;
  json.bufferViews = [
    ...(json.bufferViews ?? []),
    { buffer: 0, byteOffset: oldBin.length, byteLength: png.length },
  ];
  json.images = (json.images ?? []).map((img) => ({
    name: img.name ?? 'colormap',
    mimeType: 'image/png',
    bufferView: viewIndex,
  }));
  json.buffers = (json.buffers ?? []).map((b, i) =>
    i === 0 ? { ...b, byteLength: binPaddedLen } : b,
  );

  const newBin = Buffer.concat([oldBin, png, Buffer.alloc(binPaddedLen - oldBin.length - png.length)]);
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const total = 12 + 8 + jsonBuf.length + 8 + newBin.length;
  const out = Buffer.alloc(total);
  out.write('glTF', 0, 'ascii');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.write('JSON', 16, 'ascii');
  jsonBuf.copy(out, 20);
  const newBinOffset = 20 + jsonBuf.length;
  out.writeUInt32LE(newBin.length, newBinOffset);
  out.write('BIN\0', newBinOffset + 4, 'ascii');
  newBin.copy(out, newBinOffset + 8);

  fs.writeFileSync(modelPath, out);
  console.log(`✅ 已内嵌贴图：${modelName}（${buf.length} → ${out.length} bytes，贴图 ${png.length} bytes）`);
  return true;
}

let changed = 0;
for (const t of targets) if (embed(t)) changed += 1;
if (changed === 0) console.log('无需修改');
console.log(`完成：${changed}/${targets.length} 个模型已内嵌贴图`);
