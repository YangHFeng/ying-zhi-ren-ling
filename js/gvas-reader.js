/**
 * gvas-reader.js — GVAS 二进制读取器
 *
 * Unreal Engine 存档（.sav）的所有多字节数值均为小端序。
 * 字符串为 FString：int32 长度 + 数据。长度 > 0 表示 UTF-16LE（长度含结尾 \0），
 * 长度 < 0 表示 ANSI（长度取绝对值，含结尾 \0）。
 */
(function (global) {
  'use strict';

  var TEXT_UTF16 = new TextDecoder('utf-16le');
  var TEXT_LATIN1 = new TextDecoder('latin1');
  var MAX_STRING = 0x400000; // 4MB，超过视为解析失步

  function SaveReader(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      bytes = new Uint8Array(bytes);
    }
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
  }

  var P = SaveReader.prototype;

  P.remaining = function () {
    return this.bytes.length - this.pos;
  };

  P._need = function (n) {
    if (this.pos + n > this.bytes.length) {
      throw new RangeError(
        '读取越界 @' + this.pos + '：需要 ' + n + ' 字节，剩余 ' + this.remaining()
      );
    }
  };

  P.u8 = function () {
    this._need(1);
    return this.view.getUint8(this.pos++);
  };

  P.i8 = function () {
    this._need(1);
    return this.view.getInt8(this.pos++);
  };

  P.u16 = function () {
    this._need(2);
    var v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  };

  P.i16 = function () {
    this._need(2);
    var v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  };

  P.u32 = function () {
    this._need(4);
    var v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  };

  P.i32 = function () {
    this._need(4);
    var v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  };

  P.i64 = function () {
    this._need(8);
    var v = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    // 存档中的时间/计数远小于 2^53，安全转 Number
    return Number(v);
  };

  P.u64 = function () {
    this._need(8);
    var v = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    return Number(v);
  };

  P.f32 = function () {
    this._need(4);
    var v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  };

  P.f64 = function () {
    this._need(8);
    var v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  };

  P.skip = function (n) {
    this._need(n);
    this.pos += n;
  };

  P.peekU8 = function (offset) {
    var p = this.pos + (offset || 0);
    if (p < 0 || p >= this.bytes.length) return -1;
    return this.bytes[p];
  };

  /** 读取 n 字节原始数据 */
  P.raw = function (n) {
    this._need(n);
    var out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  };

  P.hex = function (n) {
    var out = this.raw(n);
    var s = '';
    for (var i = 0; i < out.length; i++) {
      s += out[i].toString(16).padStart(2, '0');
    }
    return s;
  };

  /** FString */
  P.fstring = function () {
    var len = this.i32();
    if (len === 0) return '';
    if (len > 0) {
      if (len > MAX_STRING) throw new RangeError('字符串长度异常：' + len);
      this._need(len * 2);
      var end = this.pos + len * 2;
      // 结尾含 \0
      var s = TEXT_UTF16.decode(this.bytes.subarray(this.pos, end - 2));
      this.pos = end;
      return s;
    }
    var n = -len;
    if (n > MAX_STRING) throw new RangeError('字符串长度异常：' + len);
    this._need(n);
    var end2 = this.pos + n;
    var s2 = TEXT_LATIN1.decode(this.bytes.subarray(this.pos, end2 - 1));
    this.pos = end2;
    return s2;
  };

  /** FGuid：4 × uint32，输出 UE 风格 8-4-4-4-12 */
  P.guid = function () {
    var a = this.u32();
    var b = this.u32();
    var c = this.u32();
    var d = this.u32();
    return (
      a.toString(16).padStart(8, '0') + '-' +
      b.toString(16).padStart(8, '0') + '-' +
      c.toString(16).padStart(8, '0') + '-' +
      d.toString(16).padStart(8, '0')
    );
  };

  P.bytesHex = function (len) {
    return this.hex(len);
  };

  SaveReader.TEXT_UTF16 = TEXT_UTF16;
  SaveReader.TEXT_LATIN1 = TEXT_LATIN1;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SaveReader: SaveReader };
  } else {
    global.PBZ = global.PBZ || {};
    global.PBZ.SaveReader = SaveReader;
  }
})(typeof window !== 'undefined' ? window : globalThis);
