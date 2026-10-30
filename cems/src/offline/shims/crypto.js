// node:crypto as the server uses it: random bytes from Web Crypto, and a synchronous SHA-256 and
// HMAC-SHA256 (Web Crypto's digest is asynchronous, but the audit chain and file store hash
// synchronously).
import { Buffer } from 'buffer';

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256(msg) {
  const len = msg.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(len / 0x20000000));
  dv.setUint32(total - 4, (len * 8) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
  return out;
}

const bytes = (data, enc) => (typeof data === 'string' ? Buffer.from(data, enc || 'utf8') : data instanceof Uint8Array ? data : Buffer.from(data));
const concat = (parts) => (parts.length === 1 ? parts[0] : Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))));
const encode = (out, enc) => (enc ? Buffer.from(out).toString(enc) : Buffer.from(out));
const checkAlgorithm = (alg) => { if (!/^sha-?256$/i.test(alg)) throw new Error(`${alg} is not available in the offline edition`); };

class Hash {
  constructor(alg) { checkAlgorithm(alg); this.parts = []; }
  update(data, enc) { this.parts.push(bytes(data, enc)); return this; }
  digest(enc) { return encode(sha256(concat(this.parts)), enc); }
}

class Hmac {
  constructor(alg, key) {
    checkAlgorithm(alg);
    let k = bytes(key);
    if (k.length > 64) k = sha256(k);
    this.key = new Uint8Array(64);
    this.key.set(k);
    this.parts = [];
  }
  update(data, enc) { this.parts.push(bytes(data, enc)); return this; }
  digest(enc) {
    const pad = (x) => this.key.map((b) => b ^ x);
    const inner = sha256(concat([pad(0x36), concat(this.parts)]));
    return encode(sha256(concat([pad(0x5c), inner])), enc);
  }
}

export const createHash = (alg) => new Hash(alg);
export const createHmac = (alg, key) => new Hmac(alg, key);
export const randomBytes = (n) => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n)));
export function randomUUID() {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Buffer.from(b).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const timingSafeEqual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
// Single sign-on token checks need a server; the offline edition uses demo sign-in only.
export function createPublicKey() { throw new Error('Single sign-on is not available in the offline edition'); }
export const verify = () => false;

export default { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual, createPublicKey, verify };
