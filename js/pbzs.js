/**
 * pbzs.js — 影之刃零 PBZS v3 存档容器读写
 *
 * 容器结构（全部在浏览器本地完成，文件不上传）：
 *
 *   0x00  4B   magic "PBZS"
 *   0x04  1B   version (3)
 *   0x05  1B   flags
 *   0x06  2B   slotCount       uint16 LE
 *   0x08  4B   directorySize   uint32 LE（含 36 字节封包头）
 *   0x0C  ...  封存块序列
 *
 * 每个封存块的 36 字节前缀：
 *   "PBZS" + 01 01 00 00  |  nonce(12)  |  GCM tag(16)  |  ciphertext
 *
 * 注意 GCM 认证标签在密文**之前**，而 WebCrypto 要求密文在前、标签在后，
 * 所以解密前需要重排。
 *
 * 目录块解密后是一张紧凑表：
 *   uint16 nameLen | name | uint8 algorithm | uint8 flag
 *   | uint32 rawSize | uint32 offset | uint32 blockSize
 *
 * algorithm: 0 = 原始 JSON，1 = zlib，2 = Oodle Kraken
 */
(function (global) {
  'use strict';

  var MAGIC = 'PBZS';
  var BLOCK_HEADER = 36;      // 8 字节标记 + 12 nonce + 16 tag
  var TAG_LEN = 16;
  var NONCE_LEN = 12;

  /* 2026-10-29 发行版（Steam build 26266538）的固定密钥。
     每次游戏大版本更新都可能变化，可用「自定义密钥」覆盖。 */
  var BUILD_KEY = '15a1fe0f55e0eb298e7c9461548351696a2a0700ed2d17ba1f871457e8f93e2d';

  var oozPromise = null;

  function hexToBytes(hex) {
    var clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
    if (clean.length !== 64) throw new Error('密钥必须是 64 位十六进制（32 字节）');
    var out = new Uint8Array(32);
    for (var i = 0; i < 32; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  function readU16(buf, p) { return buf[p] | (buf[p + 1] << 8); }
  function readU32(buf, p) {
    return (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) >>> 0;
  }
  function ascii(buf, p, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += String.fromCharCode(buf[p + i]);
    return s;
  }
  function utf8(buf, start, end) {
    return new TextDecoder('utf-8').decode(buf.subarray(start, end));
  }

  function subtle() {
    var c = global.crypto || global.msCrypto;
    if (!c || !c.subtle) {
      throw new Error('当前环境不支持 WebCrypto（需要 HTTPS 或 localhost）');
    }
    return c.subtle;
  }

  async function importKey(hex) {
    return subtle().importKey('raw', hexToBytes(hex), { name: 'AES-GCM' }, false, ['decrypt']);
  }

  /** 解密一个封存块，返回明文字节 */
  async function openBlock(bytes, start, end, key) {
    if (ascii(bytes, start, 4) !== MAGIC) {
      throw new Error('第 ' + start + ' 字节处不是有效的封存块');
    }
    var body = start + 8;
    var nonce = bytes.subarray(body, body + NONCE_LEN);
    var tag = bytes.subarray(body + NONCE_LEN, body + NONCE_LEN + TAG_LEN);
    var ct = bytes.subarray(start + BLOCK_HEADER, end);

    var combined = new Uint8Array(ct.length + TAG_LEN);
    combined.set(ct, 0);
    combined.set(tag, ct.length);

    var plain;
    try {
      plain = await subtle().decrypt(
        { name: 'AES-GCM', iv: nonce, tagLength: 128 },
        key,
        combined
      );
    } catch (e) {
      throw new Error('AES-GCM 校验失败：密钥与这份存档不匹配（游戏版本可能已更新）');
    }
    return new Uint8Array(plain);
  }

  /** 惰性加载 Oodle Kraken 解码器 */
  function getOoz() {
    if (!oozPromise) {
      oozPromise = import('./vendor/ooz.mjs')
        .then(function (mod) { return mod.default({ print: function () {}, printErr: function () {} }); })
        .catch(function () {
          oozPromise = null;
          throw new Error('Oodle 解码器加载失败，请刷新页面重试');
        });
    }
    return oozPromise;
  }

  /** Oodle Kraken 解压 */
  async function oodleDecompress(data, rawSize) {
    var ooz = await getOoz();
    var srcPtr = ooz._malloc(Math.max(1, data.length));
    var dstPtr = ooz._malloc(rawSize + 64);
    if (!srcPtr || !dstPtr) {
      if (srcPtr) ooz._free(srcPtr);
      if (dstPtr) ooz._free(dstPtr);
      throw new Error('Oodle 解码内存不足');
    }
    try {
      ooz.HEAPU8.set(data, srcPtr);
      var n = ooz._ooz_decompress(srcPtr, data.length, dstPtr, rawSize);
      if (n <= 0) throw new Error('Oodle 解压失败（返回 ' + n + '）');
      return new Uint8Array(ooz.HEAPU8.subarray(dstPtr, dstPtr + n)).slice();
    } finally {
      ooz._free(srcPtr);
      ooz._free(dstPtr);
    }
  }

  /**
   * 打开存档容器，返回目录信息。
   * 只做头部校验 + 目录解密，不碰 slot 内容。
   */
  async function open(input, options) {
    var opts = options || {};
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

    if (bytes.length < 12 || ascii(bytes, 0, 4) !== MAGIC) {
      var err = new Error('不是 PBZS 存档容器');
      err.code = 'NOT_PBZS';
      throw err;
    }

    var header = {
      version: bytes[4],
      flags: bytes[5],
      slotCount: readU16(bytes, 6),
      directorySize: readU32(bytes, 8)
    };

    if (header.version !== 3) {
      var verr = new Error('不支持的容器版本 v' + header.version);
      verr.code = 'BAD_VERSION';
      throw verr;
    }
    if (12 + header.directorySize > bytes.length) {
      var terr = new Error('目录长度越界，文件可能不完整');
      terr.code = 'TRUNCATED';
      throw terr;
    }

    var key = await importKey(opts.key || BUILD_KEY);

    var dirPlain = await openBlock(bytes, 12, 12 + header.directorySize, key);

    var p = 12;   // 目录明文开头回显了 12 字节文件头
    var slots = [];
    for (var i = 0; i < header.slotCount; i++) {
      if (p + 2 > dirPlain.length) break;
      var nameLen = readU16(dirPlain, p); p += 2;
      var name = utf8(dirPlain, p, p + nameLen); p += nameLen;
      var algorithm = dirPlain[p++];
      var flag = dirPlain[p++];
      var rawSize = readU32(dirPlain, p); p += 4;
      var offset = readU32(dirPlain, p); p += 4;
      var blockSize = readU32(dirPlain, p); p += 4;
      slots.push({
        name: name,
        algorithm: algorithm,
        flag: flag,
        rawSize: rawSize,
        offset: offset,
        blockSize: blockSize
      });
    }

    return {
      header: header,
      slots: slots,
      bytes: bytes,
      key: key,
      dataStart: 12 + header.directorySize,

      /** 读取并解析某个 slot 的 JSON */
      readJson: function (slot) {
        return readSlotJson(this, slot);
      }
    };
  }

  async function readSlotJson(save, slot) {
    var start = save.dataStart + slot.offset;
    var end = start + slot.blockSize;
    if (end > save.bytes.length) throw new Error('存档块越界：' + slot.name);

    var packed = await openBlock(save.bytes, start, end, save.key);

    var raw;
    if (slot.algorithm === 0) {
      raw = packed;
    } else if (slot.algorithm === 1) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('当前浏览器不支持 zlib 解压');
      }
      var ds = new DecompressionStream('deflate');
      var stream = new Blob([packed]).stream().pipeThrough(ds);
      raw = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (slot.algorithm === 2) {
      raw = await oodleDecompress(packed, slot.rawSize);
    } else {
      throw new Error('未知的压缩算法：' + slot.algorithm);
    }

    var text = new TextDecoder('utf-8').decode(raw);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(slot.name + ' 内容不是合法 JSON');
    }
  }

  /** 挑出「最近一次游玩」的存档槽 */
  function latestSlot(slots) {
    var best = null;
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (/^(__|Nightmare)/.test(s.name)) continue;
      if (!best || s.rawSize > best.rawSize) best = s;
    }
    return best;
  }

  var api = {
    BUILD_KEY: BUILD_KEY,
    open: open,
    latestSlot: latestSlot,
    hexToBytes: hexToBytes
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.PBZ = global.PBZ || {};
    global.PBZ.Save = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
