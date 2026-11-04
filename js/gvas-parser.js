/**
 * gvas-parser.js — Unreal Engine GVAS (.sav) 存档解析
 *
 * 结构概览：
 *   [4]  "GVAS"
 *   u32  SaveGameFileVersion
 *   ---- version >= 3 ----
 *        u16 EngineMajor / u16 EngineMinor / u16 EnginePatch
 *        u32 Changelist / FString Branch
 *        u32 LicenseeVersion
 *   ---- version < 3 ----
 *        u32 PackageFileVersion
 *   u32  CustomFormatVersion   (3 = 附带版本名称)
 *   u32  CustomVersionCount
 *        每个版本：FGuid(16) + i32 + [FString name]
 *   FString SaveGameClassName
 *   ---- 属性列表（以 "None" 结束）----
 *   u8   TagName / u8 TypeName / i32 Size / i32 ArrayIndex
 *        StructProperty 追加：FString StructName + FGuid StructGuid
 *        BoolProperty  追加：u8 BoolValue
 *        u8 HasPropertyGuid（为 1 时追加 FGuid）
 *
 * 该实现不依赖具体游戏，尽量容错：解析失败时按声明长度对齐继续，
 * 并在结果中带回 warning 列表。
 */
(function (global) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var SaveReader = isNode
    ? require('./gvas-reader.js').SaveReader
    : global.PBZ.SaveReader;

  var COMPRESSED_MAGIC = 0x9e2a83c1;
  var MAX_DEPTH = 32;

  /* ------------------------------------------------------------------ *
   * 原生（非 tagged）结构体
   * ------------------------------------------------------------------ */
  var NATIVE_STRUCTS = {
    Guid: function (r) {
      return r.guid();
    },
    DateTime: function (r) {
      return r.i64();
    },
    Timespan: function (r) {
      return r.i64();
    },
    Vector: function (r, ctx, size) {
      return readFloatTuple(r, size, 3);
    },
    Vector2D: function (r, ctx, size) {
      return readFloatTuple(r, size, 2);
    },
    Vector4: function (r, ctx, size) {
      return readFloatTuple(r, size, 4);
    },
    Rotator: function (r, ctx, size) {
      return readFloatTuple(r, size, 3);
    },
    Quat: function (r, ctx, size) {
      return readFloatTuple(r, size, 4);
    },
    LinearColor: function (r, ctx, size) {
      return readFloatTuple(r, size, 4);
    },
    Color: function (r) {
      return { r: r.u8(), g: r.u8(), b: r.u8(), a: r.u8() };
    },
    IntPoint: function (r) {
      return { x: r.i32(), y: r.i32() };
    },
    IntVector: function (r) {
      return { x: r.i32(), y: r.i32(), z: r.i32() };
    }
  };

  function readFloatTuple(r, size, count) {
    var useDouble = size === count * 8;
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push(useDouble ? r.f64() : r.f32());
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 工具
   * ------------------------------------------------------------------ */
  function isPropName(s) {
    if (typeof s !== 'string' || s.length === 0 || s.length > 160) return false;
    if (s.indexOf('\uFFFD') >= 0) return false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x20 || c === 0x7f) return false;
    }
    return true;
  }

  function isPropType(s) {
    return typeof s === 'string' && /^[A-Za-z0-9_]+Property$/.test(s);
  }

  function preview(s) {
    if (typeof s !== 'string') return String(s);
    return s.length > 24 ? s.slice(0, 24) + '…' : s;
  }

  function createContext(options) {
    return {
      options: options || {},
      warnings: [],
      fatal: null,
      leafCount: 0,
      warn: function (msg) {
        if (this.warnings.length < 200) this.warnings.push(msg);
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 属性列表
   * ------------------------------------------------------------------ */
  function readPropertyList(r, ctx, end, depth) {
    var props = [];
    var guard = 0;

    while (r.pos < end) {
      if (++guard > 120000) {
        ctx.warn('属性数量异常，停止解析 @' + r.pos);
        break;
      }

      var offset = r.pos;
      var name;
      try {
        name = r.fstring();
      } catch (e) {
        ctx.warn('属性名读取失败 @' + offset);
        break;
      }

      if (name === 'None' || name === '') break;

      if (!isPropName(name)) {
        ctx.warn('属性名非法 @' + offset + ' “' + preview(name) + '”，解析中止');
        r.pos = offset;
        break;
      }

      var type;
      try {
        type = r.fstring();
      } catch (e) {
        ctx.warn('属性类型读取失败 @' + offset);
        r.pos = offset;
        break;
      }

      if (!isPropType(type)) {
        ctx.warn('属性类型非法 @' + offset + ' “' + preview(type) + '”，解析中止');
        r.pos = offset;
        break;
      }

      var size = 0;
      var arrayIndex = 0;
      try {
        size = r.i32();
        arrayIndex = r.i32();
      } catch (e) {
        ctx.warn('属性长度读取失败 @' + offset);
        r.pos = offset;
        break;
      }

      if (size < 0 || size > r.bytes.length) {
        ctx.warn('属性 ' + name + ' 长度异常（' + size + '），解析中止');
        r.pos = offset;
        break;
      }

      var node = {
        name: name,
        type: type,
        size: size,
        arrayIndex: arrayIndex,
        offset: offset
      };

      try {
        if (type === 'StructProperty') {
          node.structName = r.fstring();
          node.structGuid = r.guid();
        } else if (type === 'BoolProperty') {
          node.value = r.u8() !== 0;
        }

        // PropertyGuid（现代引擎版本固定存在 1 字节标志）
        if (ctx.options.propertyGuid !== false) {
          var hasGuid = r.u8();
          if (hasGuid === 1) r.guid();
        }
      } catch (e) {
        ctx.warn('属性 ' + name + ' 头部解析失败：' + e.message);
        r.pos = offset;
        break;
      }

      if (type === 'BoolProperty') {
        ctx.leafCount++;
        props.push(node);
        continue;
      }

      var valueStart = r.pos;
      var valueEnd = valueStart + size;

      try {
        node.value = readValue(r, ctx, type, node.structName, size, depth + 1);
      } catch (e) {
        ctx.warn('属性 ' + name + '（' + type + '）解析失败：' + e.message);
        r.pos = valueStart;
        node.value = null;
        node.raw = r.raw(Math.min(size, r.remaining()));
        node.truncated = true;
      }

      if (r.pos !== valueEnd) {
        if (r.pos < valueEnd && node.value != null && !node.truncated) {
          ctx.warn('属性 ' + name + ' 长度偏差 ' + (r.pos - valueEnd) + ' 字节，已按声明长度对齐');
        }
        node.uncertain = true;
        r.pos = Math.min(valueEnd, r.bytes.length);
      }

      props.push(node);
    }

    return props;
  }

  /* ------------------------------------------------------------------ *
   * 值读取
   * ------------------------------------------------------------------ */
  function readValue(r, ctx, type, structName, size, depth) {
    if (depth > MAX_DEPTH) throw new RangeError('嵌套层级过深');

    switch (type) {
      case 'IntProperty':
        return r.i32();
      case 'Int8Property':
        return r.i8();
      case 'Int16Property':
        return r.i16();
      case 'Int64Property':
        return r.i64();
      case 'UInt16Property':
        return r.u16();
      case 'UInt32Property':
        return r.u32();
      case 'UInt64Property':
        return r.u64();
      case 'FloatProperty':
        return r.f32();
      case 'DoubleProperty':
        return r.f64();
      case 'StrProperty':
      case 'NameProperty':
      case 'ObjectProperty':
      case 'SoftObjectProperty':
      case 'ClassProperty':
      case 'SoftClassProperty':
      case 'InterfaceProperty':
        return r.fstring();
      case 'EnumProperty':
        return r.fstring();
      case 'BoolProperty':
        return r.u8() !== 0;
      case 'TextProperty':
        return readText(r);
      case 'ByteProperty':
        return readByte(r, size);
      case 'StructProperty':
        return readStructBody(r, ctx, structName, size, depth);
      case 'ArrayProperty':
        return readArrayBody(r, ctx, depth);
      case 'SetProperty':
        return readSetBody(r, ctx, depth);
      case 'MapProperty':
        return readMapBody(r, ctx, depth);
      default:
        throw new Error('未支持的类型 ' + type);
    }
  }

  function readByte(r, size) {
    if (size === 1) return r.u8();
    if (size === 4) return r.u32();
    if (size === 8) {
      // 可能是枚举名（FName）
      var save = r.pos;
      try {
        var s = r.fstring();
        if (isPropName(s)) return s;
      } catch (e) {
        r.pos = save;
      }
      return r.u64();
    }
    return { hex: r.hex(Math.min(size, 64)) };
  }

  function readText(r) {
    r.u32(); // flags
    var history = r.i8();
    if (history === -1) return '';
    if (history === 0) {
      var ns = r.fstring();
      var key = r.fstring();
      var source = r.fstring();
      return source || key || ns;
    }
    if (history === 11) {
      r.fstring(); // table id
      return r.fstring();
    }
    throw new Error('文本 history 类型 ' + history);
  }

  function readStructBody(r, ctx, structName, size, depth) {
    var native = structName && NATIVE_STRUCTS[structName];
    if (native) return native(r, ctx, size);

    var children = readPropertyList(r, ctx, r.bytes.length, depth + 1);
    return { __struct: structName || 'Struct', __children: children };
  }

  function readArrayBody(r, ctx, depth) {
    var typeStart = r.pos;
    var inner = null;
    try {
      inner = r.fstring();
    } catch (e) {
      inner = null;
    }
    var explicitType = inner && isPropType(inner);
    if (!explicitType) {
      // 字节数组不写 InnerType
      r.pos = typeStart;
      inner = 'ByteProperty';
    }

    var count = r.i32();
    if (count < 0 || count > 8000000) {
      throw new RangeError('数组元素数量异常：' + count);
    }

    var items = [];
    for (var i = 0; i < count; i++) {
      if (r.remaining() <= 0) {
        ctx.warn('数组提前结束（' + i + '/' + count + '）');
        break;
      }
      var child = { name: '[' + i + ']', type: inner, index: i };
      try {
        if (inner === 'StructProperty') {
          child.value = readStructBody(r, ctx, null, -1, depth + 1);
        } else if (inner === 'ByteProperty') {
          child.value = r.u8();
        } else {
          child.value = readValue(r, ctx, inner, null, 0, depth + 1);
        }
      } catch (e) {
        ctx.warn('数组元素 ' + i + ' 解析失败：' + e.message);
        break;
      }
      ctx.leafCount++;
      items.push(child);
    }

    return { __array: inner, __children: items };
  }

  function readSetBody(r, ctx, depth) {
    var inner = r.fstring();
    if (!isPropType(inner)) throw new Error('集合元素类型异常');
    var removeCount = r.i32();
    var count = r.i32();
    if (count < 0 || count > 8000000) throw new RangeError('集合元素数量异常：' + count);

    var items = [];
    for (var i = 0; i < count; i++) {
      var child = { name: '[' + i + ']', type: inner, index: i };
      if (inner === 'StructProperty') {
        child.value = readStructBody(r, ctx, null, -1, depth + 1);
      } else {
        child.value = readValue(r, ctx, inner, null, 0, depth + 1);
      }
      ctx.leafCount++;
      items.push(child);
    }
    return { __set: inner, __removeCount: removeCount, __children: items };
  }

  function readMapBody(r, ctx, depth) {
    var keyType = r.fstring();
    var valueType = r.fstring();
    if (!isPropType(keyType) || !isPropType(valueType)) {
      throw new Error('映射类型异常：' + keyType + ' → ' + valueType);
    }
    var removeCount = r.i32();
    var count = r.i32();
    if (count < 0 || count > 2000000) throw new RangeError('映射条目数量异常：' + count);

    var entries = [];
    for (var i = 0; i < count; i++) {
      var entry = { index: i };
      try {
        entry.key = readTyped(r, ctx, keyType, 0, depth + 1);
        entry.value = readTyped(r, ctx, valueType, -1, depth + 1);
      } catch (e) {
        ctx.warn('映射条目 ' + i + ' 解析失败：' + e.message);
        break;
      }
      ctx.leafCount++;
      entries.push(entry);
    }
    return { __map: keyType + ' → ' + valueType, __keyType: keyType, __valueType: valueType, __removeCount: removeCount, __children: entries };
  }

  function readTyped(r, ctx, type, size, depth) {
    if (type === 'StructProperty') return readStructBody(r, ctx, null, size, depth);
    if (type === 'ByteProperty') return r.u8();
    return readValue(r, ctx, type, null, size, depth);
  }

  /* ------------------------------------------------------------------ *
   * 头部
   * ------------------------------------------------------------------ */
  function readHeader(r, ctx) {
    var magicBytes = r.raw(4);
    var magic = String.fromCharCode.apply(null, magicBytes);
    if (magic !== 'GVAS') {
      throw new Error('不是有效的 GVAS 存档（文件头为 “' + preview(magic) + '”）');
    }

    var header = { magic: magic };
    header.saveGameVersion = r.u32();

    if (header.saveGameVersion >= 3) {
      header.engineVersion = {
        major: r.u16(),
        minor: r.u16(),
        patch: r.u16(),
        changelist: r.u32(),
        branch: r.fstring()
      };
      header.licenseeVersion = r.u32();
    } else {
      header.packageFileVersion = r.u32();
    }

    header.customFormatVersion = r.u32();
    var customCount = r.u32();
    if (customCount > 20000) throw new Error('自定义版本数量异常：' + customCount);

    header.customVersions = [];
    for (var i = 0; i < customCount; i++) {
      var item = { guid: r.guid(), version: r.i32() };
      if (header.customFormatVersion >= 3) item.name = r.fstring();
      header.customVersions.push(item);
    }

    header.saveGameClassName = r.fstring();
    header.headerSize = r.pos;
    return header;
  }

  /* ------------------------------------------------------------------ *
   * 主入口
   * ------------------------------------------------------------------ */
  function runParse(bytes, options) {
    var r = new SaveReader(bytes);
    var ctx = createContext(options);
    var header = readHeader(r, ctx);
    var root = readPropertyList(r, ctx, bytes.length, 0);

    // 末尾可能有一个 int32 0 终止符
    var trailing = r.remaining();
    if (trailing > 0 && trailing <= 8) {
      header.trailingBytes = trailing;
    } else if (trailing > 8) {
      ctx.warn('属性列表结束后仍有 ' + trailing + ' 字节未解析数据');
    }

    return {
      header: header,
      root: root,
      ctx: ctx,
      consumed: r.pos / bytes.length,
      leafCount: ctx.leafCount
    };
  }

  function parseGvas(bytes) {
    var variants = [
      { propertyGuid: true },
      { propertyGuid: false }
    ];
    var best = null;

    for (var i = 0; i < variants.length; i++) {
      var out = null;
      var ctx = null;
      try {
        out = runParse(bytes, variants[i]);
        ctx = out.ctx;
      } catch (e) {
        ctx = createContext(variants[i]);
        ctx.fatal = e.message;
      }

      var score = ctx.fatal ? -1000 : out.leafCount * 4 + out.consumed * 60 - ctx.warnings.length * 6;
      if (!best || score > best.score) {
        best = { out: out, ctx: ctx, score: score, options: variants[i] };
      }
      // 首个变体完全干净时无需再试
      if (!ctx.fatal && ctx.warnings.length === 0 && out.leafCount > 0) break;
    }

    if (!best.out) {
      throw new Error(best.ctx.fatal || '存档解析失败');
    }

    return {
      header: best.out.header,
      root: best.out.root,
      warnings: best.ctx.warnings,
      options: best.options,
      consumedRatio: best.out.consumed,
      leafCount: best.out.leafCount,
      size: bytes.length
    };
  }

  /* ------------------------------------------------------------------ *
   * 压缩支持（UE 分块 zlib）
   * ------------------------------------------------------------------ */
  function isCompressed(bytes) {
    if (bytes.length < 16) return false;
    var v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return v.getUint32(0, true) === COMPRESSED_MAGIC;
  }

  async function inflate(data) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('当前环境不支持 DecompressionStream，无法解压存档');
    }
    var ds = new DecompressionStream('deflate');
    var stream = new Blob([data]).stream().pipeThrough(ds);
    var buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  async function decompressBlocks(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var p = 0;
    p += 4; // magic
    p += 4; // block size
    var totalCompressed = view.getUint32(p, true);
    p += 4;
    var totalUncompressed = view.getUint32(p, true);
    p += 4;

    if (totalUncompressed > 512 * 1024 * 1024) throw new Error('解压后体积异常');

    var out = new Uint8Array(totalUncompressed);
    var op = 0;

    while (p + 8 <= bytes.length && op < totalUncompressed) {
      var cSize = view.getUint32(p, true);
      p += 4;
      var uSize = view.getUint32(p, true);
      p += 4;
      var chunk = bytes.subarray(p, p + cSize);
      p += cSize;
      if (cSize === uSize) {
        out.set(chunk, op);
      } else {
        var plain = await inflate(chunk);
        out.set(plain.subarray(0, uSize), op);
      }
      op += uSize;
    }

    if (op === 0) throw new Error('压缩块为空');
    return out.subarray(0, op);
  }

  async function parseSave(input) {
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    var compressed = false;
    var source = bytes;

    if (isCompressed(bytes)) {
      source = await decompressBlocks(bytes);
      compressed = true;
    }

    var result = parseGvas(source);
    result.compressed = compressed;
    result.originalSize = bytes.length;
    return result;
  }

  var api = {
    parseSave: parseSave,
    parseGvas: parseGvas,
    isCompressed: isCompressed,
    decompressBlocks: decompressBlocks,
    isPropName: isPropName,
    isPropType: isPropType
  };

  if (isNode) {
    module.exports = api;
  } else {
    global.PBZ = global.PBZ || {};
    global.PBZ.GvasParser = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
