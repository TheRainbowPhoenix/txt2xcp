const BIG_ENDIAN = 'big';
const LITTLE_ENDIAN = 'little';
const DEFAULT_OPTIONS = Object.freeze({
  folderName: 'main',
  variableName: 'file',
  convertNewlines: true,
  padByte: 0x00,
});

function toHexNibble(value) {
  return value <= 9 ? 0x30 + value : 0x61 + value - 10;
}

function asciiBytes(value) {
  return Array.from(value, (char) => char.charCodeAt(0) & 0xff);
}

function normalizeName(name, fallback) {
  const cleaned = (name || fallback).trim() || fallback;
  const bytes = asciiBytes(cleaned).filter((byte) => byte !== 0).slice(0, 8);
  return {
    display: String.fromCharCode(...bytes),
    bytes,
    lengthWithTerminator: bytes.length + 1,
    truncated: asciiBytes(cleaned).filter((byte) => byte !== 0).length > 8,
  };
}

function normalizeTextNewlines(text) {
  return text.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
}

class XcpWriter {
  constructor() {
    this.bytes = [];
    this.checksum = 0;
  }

  subtract(value) {
    this.checksum = (this.checksum - (value & 0xff)) & 0xff;
  }

  writeRaw(bytes) {
    for (const byte of bytes) {
      const value = byte & 0xff;
      this.bytes.push(value);
      this.subtract(value);
    }
  }

  writeByte(byte) {
    this.writeRaw([byte]);
  }

  writeHexByte(byte) {
    const value = byte & 0xff;
    this.bytes.push(toHexNibble((value >> 4) & 0x0f), toHexNibble(value & 0x0f));
    this.subtract(value);
  }

  writeHexLong(value) {
    this.writeHexByte((value >>> 24) & 0xff);
    this.writeHexByte((value >>> 16) & 0xff);
    this.writeHexByte((value >>> 8) & 0xff);
    this.writeHexByte(value & 0xff);
  }

  writeBinLong(value, endian) {
    const shifts = endian === BIG_ENDIAN ? [24, 16, 8, 0] : [0, 8, 16, 24];
    for (const shift of shifts) {
      this.writeByte((value >>> shift) & 0xff);
    }
  }

  finish() {
    const finalChecksum = this.checksum & 0xff;
    this.bytes.push(toHexNibble((finalChecksum >> 4) & 0x0f), toHexNibble(finalChecksum & 0x0f));
    return new Uint8Array(this.bytes);
  }
}

export function encodeProgramText(sourceText, options = {}) {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const text = merged.convertNewlines ? normalizeTextNewlines(sourceText) : sourceText;
  return new TextEncoder().encode(text);
}

export function createXcp(inputBytes, options = {}) {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const variable = normalizeName(merged.variableName, DEFAULT_OPTIONS.variableName);
  const folder = normalizeName(merged.folderName, DEFAULT_OPTIONS.folderName);
  const dataLength = inputBytes.length;
  const len2Length = 4;
  const blockZeroLength = 9;
  const eofLength = 2;
  const paddingLength = (0 - (len2Length + blockZeroLength + dataLength + eofLength)) & 0x03;
  const len1 = len2Length + blockZeroLength + dataLength + eofLength + paddingLength;
  const len2 = dataLength + 3;
  const padByte = Number.parseInt(merged.padByte, 10) & 0xff;
  const writer = new XcpWriter();

  writer.writeRaw([...asciiBytes('VCP.XDATA'), 0x00]);
  writer.writeHexLong(0x5f4d4353);
  writer.writeHexByte(folder.lengthWithTerminator);
  writer.writeRaw([...folder.bytes, 0x00]);
  writer.writeHexByte(variable.lengthWithTerminator);
  writer.writeRaw([...variable.bytes, 0x00]);
  writer.writeHexLong(0x00000031);
  writer.writeRaw([...folder.bytes, ...Array(16 - folder.bytes.length).fill(0xff)]);
  writer.writeRaw([...variable.bytes, ...Array(16 - variable.bytes.length).fill(0xff)]);
  writer.writeBinLong(len1, BIG_ENDIAN);
  writer.writeRaw([0x47, 0x55, 0x51, ...Array(10).fill(0xff)]);
  writer.writeHexLong(len1);
  writer.writeBinLong(len2, LITTLE_ENDIAN);
  writer.writeRaw(Array(blockZeroLength).fill(0x00));
  writer.writeRaw(inputBytes);
  writer.writeRaw([0x00, 0xff]);
  writer.writeRaw(Array(paddingLength).fill(padByte));

  return {
    bytes: writer.finish(),
    meta: {
      folderName: folder.display,
      variableName: variable.display,
      folderTruncated: folder.truncated,
      variableTruncated: variable.truncated,
      dataLength,
      len1,
      len2,
      paddingLength,
      checksum: writer.checksum & 0xff,
    },
  };
}

export function convertTextToXcp(sourceText, options = {}) {
  return createXcp(encodeProgramText(sourceText, options), options);
}

export function makeDownloadName(variableName = DEFAULT_OPTIONS.variableName) {
  const safe = normalizeName(variableName, DEFAULT_OPTIONS.variableName).display || DEFAULT_OPTIONS.variableName;
  return `${safe.replace(/[^A-Za-z0-9_-]/g, '_')}.xcp`;
}

export { normalizeTextNewlines };
