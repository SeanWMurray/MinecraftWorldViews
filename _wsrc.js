const TAG_END=0,TAG_BYTE=1,TAG_SHORT=2,TAG_INT=3,TAG_LONG=4,TAG_FLOAT=5,TAG_DOUBLE=6,TAG_BYTE_ARRAY=7,TAG_STRING=8,TAG_LIST=9,TAG_COMPOUND=10,TAG_INT_ARRAY=11,TAG_LONG_ARRAY=12;
const CLASS_EMPTY=0,CLASS_OPAQUE=1,CLASS_TRANSPARENT=2,CLASS_CROSS=3,CLASS_FLUID=4;
const AIR=new Set(["minecraft:air","minecraft:cave_air","minecraft:void_air"]);
const TRANSPARENT=new Set(["minecraft:glass","minecraft:ice","minecraft:frosted_ice","minecraft:slime_block","minecraft:honey_block"]);
const TRANSPARENT_SUFFIX=["_leaves","_glass","_glass_pane"];
const FLUID=new Set(["minecraft:water","minecraft:lava","minecraft:flowing_water","minecraft:flowing_lava","minecraft:bubble_column"]);
const CROSS=new Set(["minecraft:grass","minecraft:short_grass","minecraft:tall_grass","minecraft:fern","minecraft:large_fern","minecraft:dandelion","minecraft:poppy","minecraft:dead_bush","minecraft:sugar_cane","minecraft:wheat","minecraft:carrots","minecraft:potatoes","minecraft:cornflower","minecraft:blue_orchid","minecraft:allium","minecraft:azure_bluet","minecraft:oxeye_daisy","minecraft:lily_of_the_valley","minecraft:red_tulip","minecraft:orange_tulip","minecraft:white_tulip","minecraft:pink_tulip","minecraft:sweet_berry_bush","minecraft:nether_wart","minecraft:brown_mushroom","minecraft:red_mushroom","minecraft:seagrass","minecraft:bush","minecraft:firefly_bush","minecraft:short_dry_grass","minecraft:tall_dry_grass","minecraft:cactus_flower","minecraft:wildflowers","minecraft:leaf_litter","minecraft:tall_seagrass","minecraft:kelp","minecraft:kelp_plant","minecraft:hanging_roots","minecraft:spore_blossom","minecraft:pink_petals"]);
const CROSS_SUFFIX=["_sapling","_tulip","_mushroom","_fern","_bush","_grass","_flower","_roots","_sprouts","_fungus"];
const NON_SOLID=new Set(["minecraft:fire","minecraft:redstone_wire","minecraft:rail","minecraft:torch","minecraft:wall_torch","minecraft:ladder","minecraft:snow"]);
const NON_SOLID_SUFFIX=["_button","_pressure_plate","_carpet"];
const BLOCK_COLORS={"minecraft:stone":8224125,"minecraft:deepslate":5263446,"minecraft:dirt":8806467,"minecraft:grass_block":6132282,"minecraft:sand":14405518,"minecraft:gravel":8683132,"minecraft:bedrock":3684408,"minecraft:oak_log":7033904,"minecraft:spruce_log":3810576,"minecraft:birch_log":12694407,"minecraft:oak_leaves":3965500,"minecraft:spruce_leaves":2972205,"minecraft:birch_leaves":7048518,"minecraft:oak_planks":10518861,"minecraft:cobblestone":7237230,"minecraft:coal_ore":4671306,"minecraft:iron_ore":11968903,"minecraft:snow_block":15791605,"minecraft:snow":15791605,"minecraft:glass":13100268,"minecraft:ice":10206704,"minecraft:packed_ice":8236543,"minecraft:sandstone":14076554,"minecraft:clay":10133933,"minecraft:granite":9791318,"minecraft:diorite":12369084,"minecraft:andesite":8947849,"minecraft:netherrack":6366758,"minecraft:terracotta":9985603,"minecraft:water":4159204,"minecraft:obsidian":1380894,"minecraft:mud":3946812,"minecraft:moss_block":5860653,"minecraft:podzol":5914403,"minecraft:mycelium":7299945,"minecraft:calcite":14672092,"minecraft:tuff":7106151,"minecraft:grass":8174955,"minecraft:short_grass":8174955,"minecraft:tall_grass":8174955,"minecraft:fern":8174955,"minecraft:large_fern":8174955,"minecraft:vine":8174955,"minecraft:sugar_cane":9551193,"minecraft:lily_pad":5282352,"minecraft:bush":8174955,"minecraft:firefly_bush":8174955,"minecraft:leaf_litter":10123850,"minecraft:bubble_column":4159204,"minecraft:tall_seagrass":5217850,"minecraft:seagrass":5217850,"minecraft:kelp":5217850,"minecraft:kelp_plant":5217850};
const TINTED=new Set(["minecraft:grass_block","minecraft:grass","minecraft:short_grass","minecraft:tall_grass","minecraft:fern","minecraft:large_fern","minecraft:water","minecraft:flowing_water","minecraft:bubble_column","minecraft:vine","minecraft:lily_pad","minecraft:sugar_cane","minecraft:bush","minecraft:firefly_bush","minecraft:leaf_litter","minecraft:tall_seagrass","minecraft:seagrass","minecraft:kelp","minecraft:kelp_plant"]);
const TINTED_SUFFIX=["_leaves"];
const HASH_COLORS=new Map();
function nbtReader(data) {
        return { data, view: new DataView(data.buffer, data.byteOffset, data.byteLength), pos: 0 };
      }
(r) => r.data[r.pos++]
(r) => r.view.getInt8(r.pos++)
(r) => { const v = r.view.getUint16(r.pos); r.pos += 2; return v; }
(r) => { const v = r.view.getInt32(r.pos); r.pos += 4; return v; }
function readStr(r) {
        const n = u16(r);
        let s = '';
        for (let i = 0; i < n; i++) s += String.fromCharCode(r.data[r.pos + i]);
        r.pos += n;
        return s;
      }
(r) => { r.pos += 2 + r.view.getUint16(r.pos); }
function skipValue(r, type) {
        switch (type) {
          case TAG_BYTE: r.pos += 1; return;
          case TAG_SHORT: r.pos += 2; return;
          case TAG_INT: case TAG_FLOAT: r.pos += 4; return;
          case TAG_LONG: case TAG_DOUBLE: r.pos += 8; return;
          case TAG_BYTE_ARRAY: r.pos += 4 + r.view.getInt32(r.pos); return;
          case TAG_STRING: skipStr(r); return;
          case TAG_LIST: {
            const itemType = u8(r), count = i32(r);
            if (count <= 0) return;
            switch (itemType) {
              case TAG_BYTE: r.pos += count; return;
              case TAG_SHORT: r.pos += count * 2; return;
              case TAG_INT: case TAG_FLOAT: r.pos += count * 4; return;
              case TAG_LONG: case TAG_DOUBLE: r.pos += count * 8; return;
              default: for (let i = 0; i < count; i++) skipValue(r, itemType); return;
            }
          }
          case TAG_COMPOUND:
            for (;;) {
              const id = u8(r);
              if (id === TAG_END) return;
              skipStr(r);
              skipValue(r, id);
            }
          case TAG_INT_ARRAY: r.pos += 4 + r.view.getInt32(r.pos) * 4; return;
          case TAG_LONG_ARRAY: r.pos += 4 + r.view.getInt32(r.pos) * 8; return;
          default: throw new Error(`invalid NBT tag ${type} at byte ${r.pos}`);
        }
      }
(size) => Math.max(4, 32 - Math.clz32(size - 1))
function unpackPackedInts(view, byteOffset, longCount, bits, out) {
        const entriesPerLong = (64 / bits) | 0;
        const mask = (1 << bits) - 1;
        let i = 0;
        for (let l = 0; l < longCount && i < out.length; l++) {
          const hi = view.getUint32(byteOffset + l * 8);
          const lo = view.getUint32(byteOffset + l * 8 + 4);
          for (let e = 0; e < entriesPerLong && i < out.length; e++) {
            const bit = e * bits;
            out[i++] =
              bit + bits <= 32 ? (lo >>> bit) & mask :
              bit >= 32 ? (hi >>> (bit - 32)) & mask :
              ((lo >>> bit) | (hi << (32 - bit))) & mask;
          }
        }
      }
function readPalette(r) {
        const itemType = u8(r), count = i32(r);
        const palette = [];
        if (itemType !== TAG_COMPOUND) {
          for (let i = 0; i < count; i++) skipValue(r, itemType);
          return palette;
        }
        for (let i = 0; i < count; i++) {
          let name = '';
          for (;;) {
            const id = u8(r);
            if (id === TAG_END) break;
            const key = readStr(r);
            if (id === TAG_STRING && key === 'Name') name = readStr(r);
            else skipValue(r, id);
          }
          palette.push(name);
        }
        return palette;
      }
function readSection(r) {
        let y = 0, palette = null, dataOffset = -1, dataLongs = 0;
        for (;;) {
          const id = u8(r);
          if (id === TAG_END) break;
          const name = readStr(r);
          if (id === TAG_BYTE && name === 'Y') y = i8(r);
          else if (id === TAG_COMPOUND && name === 'block_states') {
            for (;;) {
              const innerId = u8(r);
              if (innerId === TAG_END) break;
              const innerName = readStr(r);
              if (innerId === TAG_LIST && innerName === 'palette') palette = readPalette(r);
              else if (innerId === TAG_LONG_ARRAY && innerName === 'data') {
                dataLongs = i32(r); dataOffset = r.pos; r.pos += dataLongs * 8;
              } else skipValue(r, innerId);
            }
          } else if (id === TAG_LIST && name === 'Palette') palette = readPalette(r);
          else if (id === TAG_LONG_ARRAY && name === 'BlockStates') {
            dataLongs = i32(r); dataOffset = r.pos; r.pos += dataLongs * 8;
          } else skipValue(r, id);
        }
        if (palette === null || palette.length === 0) return null;
        let blocks = null;
        if (palette.length > 1 && dataOffset >= 0) {
          blocks = new Uint16Array(4096);
          unpackPackedInts(r.view, dataOffset, dataLongs, bitsForPalette(palette.length), blocks);
        }
        return { y, palette, blocks };
      }
function readChunkCompound(r, chunk, allowLevel) {
        for (;;) {
          const id = u8(r);
          if (id === TAG_END) return;
          const name = readStr(r);
          if (id === TAG_INT && name === 'xPos') chunk.x = i32(r);
          else if (id === TAG_INT && name === 'zPos') chunk.z = i32(r);
          else if (id === TAG_LIST && (name === 'sections' || name === 'Sections')) {
            const itemType = u8(r), count = i32(r);
            if (itemType === TAG_COMPOUND) {
              for (let i = 0; i < count; i++) {
                const section = readSection(r);
                if (section !== null) chunk.sections.push(section);
              }
            } else {
              for (let i = 0; i < count; i++) skipValue(r, itemType);
            }
          } else if (id === TAG_COMPOUND && name === 'Level' && allowLevel) {
            readChunkCompound(r, chunk, false);
          } else skipValue(r, id);
        }
      }
function parseChunk(nbt) {
        const r = nbtReader(nbt);
        if (u8(r) !== TAG_COMPOUND) throw new Error('chunk NBT must start with a compound');
        skipStr(r);
        const chunk = { x: 0, z: 0, sections: [] };
        readChunkCompound(r, chunk, true);
        chunk.sections.sort((a, b) => a.y - b.y); // ascending y for meshing
        return chunk;
      }
function classifyName(name) {
        if (AIR.has(name)) return CLASS_EMPTY;
        if (FLUID.has(name)) return CLASS_FLUID;
        if (CROSS.has(name)) return CLASS_CROSS;
        for (const s of CROSS_SUFFIX) if (name.endsWith(s)) return CLASS_CROSS;
        if (NON_SOLID.has(name)) return CLASS_EMPTY;
        for (const s of NON_SOLID_SUFFIX) if (name.endsWith(s)) return CLASS_EMPTY;
        if (TRANSPARENT.has(name)) return CLASS_TRANSPARENT;
        for (const s of TRANSPARENT_SUFFIX) if (name.endsWith(s)) return CLASS_TRANSPARENT;
        return CLASS_OPAQUE;
      }
function colorForName(name) {
        const known = BLOCK_COLORS[name];
        if (known !== undefined) return known;
        let c = HASH_COLORS.get(name);
        if (c !== undefined) return c;
        let h = 0x811c9dc5;
        for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        const r = 80 + ((h >>> 16) & 0x7f), g = 80 + ((h >>> 8) & 0x7f), b = 80 + (h & 0x7f);
        c = (r << 16) | (g << 8) | b;
        HASH_COLORS.set(name, c);
        return c;
      }
function tintForName(name) {
        if (TINTED.has(name)) return 1;
        for (const s of TINTED_SUFFIX) if (name.endsWith(s)) return 1;
        return 0;
      }
function buildGridWorker(chunk) {
        const sections = chunk.sections;
        if (sections.length === 0) return null;
        const minY = sections[0].y, maxY = sections[sections.length - 1].y;
        const sizeY = (maxY - minY + 1) * 16;
        const baseY = minY * 16;
        const idByName = new Map([['', 0]]);
        const names = [''];
        const classes = [CLASS_EMPTY];
        const colors = [0];
        const localLayers = [-1];   // chunk-local layer per id (-1 = empty)
        const layerNames = [];      // local layer index → block name
        const tints = [0];
        const strideZ = 18, strideY = 18 * 18;
        const ids = new Uint16Array(strideY * (sizeY + 2));
        for (const s of sections) {
          const localToGlobal = new Uint16Array(s.palette.length);
          for (let p = 0; p < s.palette.length; p++) {
            const cls = classifyName(s.palette[p]);
            if (cls === CLASS_EMPTY) { localToGlobal[p] = 0; continue; }
            const name = s.palette[p];
            let gid = idByName.get(name);
            if (gid === undefined) {
              gid = classes.length;
              idByName.set(name, gid);
              names.push(name);
              classes.push(cls);
              colors.push(colorForName(name));
              localLayers.push(layerNames.length); // chunk-local layer
              layerNames.push(name);
              tints.push(tintForName(name));
            }
            localToGlobal[p] = gid;
          }
          const yOff = (s.y - minY) * 16;
          if (s.blocks === null) {
            const gid = localToGlobal[0];
            if (gid === 0) continue;
            for (let y = 0; y < 16; y++)
              for (let z = 0; z < 16; z++) {
                let o = 1 + (z + 1) * strideZ + (yOff + y + 1) * strideY;
                for (let x = 0; x < 16; x++) ids[o++] = gid;
              }
            continue;
          }
          for (let y = 0; y < 16; y++)
            for (let z = 0; z < 16; z++) {
              let src = (((y << 4) | z) << 4);
              let dst = 1 + (z + 1) * strideZ + (yOff + y + 1) * strideY;
              for (let x = 0; x < 16; x++) ids[dst++] = localToGlobal[s.blocks[src++]];
            }
        }
        return {
          sizeX: 16, sizeY, sizeZ: 16, baseY, names, layerNames,
          ids, classes, colors, layers: localLayers, tints, strideZ, strideY,
          idAt(x, y, z) { return this.ids[(x + 1) + (z + 1) * this.strideZ + (y + 1) * this.strideY]; },
        };
      }
function faceVisible(hereClass, hereId, thereClass, thereId) {
        if (thereClass === CLASS_EMPTY || thereClass === CLASS_CROSS) return true;
        if (thereClass === CLASS_OPAQUE) return false;
        // neighbour is transparent or fluid
        if ((hereClass === CLASS_TRANSPARENT || hereClass === CLASS_FLUID) && hereId === thereId) {
          return false;
        }
        return true;
      }
function emitQuad(positions, normals, colors, uvs, texLayers, tints, indices,
                        baseY, base, du, dv, nx, ny, nz, dir, color, shade, w, h, layer, tint, axis, u, v) {
        const startVertex = positions.length / 3;
        const x0 = base[0], y0 = base[1] + baseY, z0 = base[2];
        const corners = [
          [x0, y0, z0],
          [x0+du[0], y0+du[1], z0+du[2]],
          [x0+du[0]+dv[0], y0+du[1]+dv[1], z0+du[2]+dv[2]],
          [x0+dv[0], y0+dv[1], z0+dv[2]],
        ];

        // Derive each corner's UV straight from its world position so the texture
        // is upright on every face — independent of the mesher's cyclic u/v axis
        // choice (the thing that made side faces look sideways). For each face we
        // pick a horizontal world axis → texture U and vertical → texture V, with
        // V increasing downward (texture row 0 is the top). Coordinates are taken
        // relative to the quad's extent; GL_REPEAT tiles them per block.
        //   top/bottom (axis Y): U = X, V = Z
        //   X faces:             U = Z, V = world Y (down)
        //   Z faces:             U = X, V = world Y (down)
        const yTop = Math.max(corners[0][1], corners[1][1], corners[2][1], corners[3][1]);
        function cornerUV(c) {
          if (axis === 1) return [c[0] - x0, c[2] - z0];   // top/bottom
          if (axis === 0) return [c[2] - z0, yTop - c[1]]; // X face (V down from top)
          return [c[0] - x0, yTop - c[1]];                 // Z face (V down from top)
        }

        const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
        const a = Math.round(shade * 255);
        for (let k = 0; k < 4; k++) {
          const c = corners[k];
          const uvc = cornerUV(c);
          positions.push(c[0], c[1], c[2]);
          normals.push(nx, ny, nz);
          colors.push(r, g, b, a);
          uvs.push(uvc[0], uvc[1]);
          texLayers.push(layer);
          tints.push(tint);
        }
        if (dir > 0) {
          indices.push(startVertex, startVertex+1, startVertex+2, startVertex, startVertex+2, startVertex+3);
        } else {
          indices.push(startVertex, startVertex+2, startVertex+1, startVertex, startVertex+3, startVertex+2);
        }
      }
function emitCross(positions, normals, colors, uvs, texLayers, tints, indices, baseY, x, y, z, color, layer, tint) {
        const y0 = y + baseY;
        const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff, a = 255;
        // Two planes across the block's diagonals, inset slightly from the edges.
        const quads = [
          [[x, y0, z], [x+1, y0, z+1], [x+1, y0+1, z+1], [x, y0+1, z]],       // NW-SE
          [[x+1, y0, z], [x, y0, z+1], [x, y0+1, z+1], [x+1, y0+1, z]],       // NE-SW
        ];
        const uv = [[0, 1], [1, 1], [1, 0], [0, 0]]; // v flipped so the plant stands upright
        for (const q of quads) {
          const sv = positions.length / 3;
          for (let k = 0; k < 4; k++) {
            positions.push(q[k][0], q[k][1], q[k][2]);
            normals.push(0, 1, 0);
            colors.push(r, g, b, a);
            uvs.push(uv[k][0], uv[k][1]);
            texLayers.push(layer);
            tints.push(tint);
          }
          // Two triangles, both windings → double-sided (visible from both faces).
          indices.push(sv, sv+1, sv+2, sv, sv+2, sv+3);
          indices.push(sv, sv+2, sv+1, sv, sv+3, sv+2);
        }
      }
function greedyMeshWorker(grid) {
        const dims = [grid.sizeX, grid.sizeY, grid.sizeZ];
        const positions = [], normals = [], colors = [], uvs = [], texLayers = [], tints = [], indices = [];
        const maskSize = Math.max(dims[0]*dims[1], dims[1]*dims[2], dims[0]*dims[2]);
        const mask = new Int32Array(maskSize);
        const FACES = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
        const FACE_SHADE = [0.8, 0.8, 1.0, 0.5, 0.7, 0.6];
        for (let f = 0; f < 6; f++) {
          const [dx, dy, dz] = FACES[f], shade = FACE_SHADE[f];
          const axis = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
          const u = (axis + 1) % 3, v = (axis + 2) % 3;
          const dir = dx + dy + dz;
          const sliceCount = dims[axis], uSize = dims[u], vSize = dims[v];
          const coord = [0,0,0], ncoord = [0,0,0];
          for (let slice = 0; slice < sliceCount; slice++) {
            let m = 0;
            for (let vv = 0; vv < vSize; vv++) {
              for (let uu = 0; uu < uSize; uu++, m++) {
                coord[axis] = slice; coord[u] = uu; coord[v] = vv;
                const hereId = grid.idAt(coord[0], coord[1], coord[2]);
                const hereClass = hereId === 0 ? 0 : grid.classes[hereId];
                if (hereId === 0 || hereClass === CLASS_CROSS) { mask[m] = 0; continue; }
                if (hereClass === CLASS_FLUID && f !== 2) { mask[m] = 0; continue; }
                ncoord[0] = coord[0]+dx; ncoord[1] = coord[1]+dy; ncoord[2] = coord[2]+dz;
                const thereId = grid.idAt(ncoord[0], ncoord[1], ncoord[2]);
                mask[m] = faceVisible(hereClass, hereId, grid.classes[thereId], thereId) ? hereId : 0;
              }
            }
            for (let j = 0; j < vSize; j++) {
              for (let i = 0; i < uSize; ) {
                const start = j * uSize + i, id = mask[start];
                if (id === 0) { i++; continue; }
                let w = 1;
                while (i + w < uSize && mask[start + w] === id) w++;
                let h = 1;
                grow: while (j + h < vSize) {
                  const rowBase = (j + h) * uSize + i;
                  for (let k = 0; k < w; k++) if (mask[rowBase + k] !== id) break grow;
                  h++;
                }
                const base = [0,0,0]; base[axis] = slice + (dir > 0 ? 1 : 0); base[u] = i; base[v] = j;
                const du = [0,0,0]; du[u] = w;
                const dv = [0,0,0]; dv[v] = h;
                emitQuad(positions, normals, colors, uvs, texLayers, tints, indices,
                  grid.baseY, base, du, dv, dx, dy, dz, dir,
                  grid.colors[id], shade, w, h, grid.layers[id], grid.tints[id], axis, u, v);
                for (let b = 0; b < h; b++) {
                  const rowBase = (j + b) * uSize + i;
                  for (let a = 0; a < w; a++) mask[rowBase + a] = 0;
                }
                i += w;
              }
            }
          }
        }
        for (let y = 0; y < grid.sizeY; y++)
          for (let z = 0; z < grid.sizeZ; z++)
            for (let x = 0; x < grid.sizeX; x++) {
              const id = grid.idAt(x, y, z);
              if (id === 0 || grid.classes[id] !== CLASS_CROSS) continue;
              emitCross(positions, normals, colors, uvs, texLayers, tints, indices,
                grid.baseY, x, y, z, grid.colors[id], grid.layers[id], grid.tints[id]);
            }
        return {
          positions: new Float32Array(positions),
          normals: new Int8Array(normals),
          colors: new Uint8Array(colors),
          uvs: new Float32Array(uvs),
          layers: new Float32Array(texLayers),
          tints: new Float32Array(tints),
          indices: new Uint32Array(indices),
          quadCount: indices.length / 6,
        };
      }
function compressionFormat(type) {
        switch (type) {
          case 1: return 'gzip';
          case 2: return 'deflate';
          case 3: return null;
          default: throw new Error(`unsupported chunk compression type ${type}`);
        }
      }
async function inflate(data, format) {
        const stream = new Response(data).body.pipeThrough(new DecompressionStream(format));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
async function meshNbtInWorker(nbt) {
        const chunk = parseChunk(nbt);
        const grid = buildGridWorker(chunk);
        if (!grid) return null;
        const mesh = greedyMeshWorker(grid);
        if (mesh.quadCount === 0) return null;
        return {
          mesh, layerNames: grid.layerNames, names: grid.names,
          ids: grid.ids, baseY: grid.baseY, sizeY: grid.sizeY,
        };
      }
onmessage=async(e)=>{
          const {id,payload,format}=e.data;
          try{
            const nbt=format===null?payload:await inflate(payload,format);
            const res=await meshNbtInWorker(nbt);
            if(!res){postMessage({id,empty:true});return;}
            const t=[res.mesh.positions.buffer,res.mesh.normals.buffer,res.mesh.colors.buffer,
              res.mesh.uvs.buffer,res.mesh.layers.buffer,res.mesh.tints.buffer,
              res.mesh.indices.buffer,res.ids.buffer];
            postMessage({id,res},t);
          }catch(err){postMessage({id,error:String(err&&err.message||err)});}
        };