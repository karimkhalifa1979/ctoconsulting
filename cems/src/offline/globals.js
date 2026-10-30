// Node globals the server code expects. Imported first by the offline entry so they exist
// before any server module or library evaluates.
import { Buffer } from 'buffer';

globalThis.Buffer = Buffer;
globalThis.global = globalThis;
if (!globalThis.process) {
  globalThis.process = {
    env: {}, version: 'browser', versions: {}, platform: 'browser', argv: [],
    cwd: () => '/app', nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
  };
}

// The buffer package predates Node's base64url encoding, which the server uses for session tokens.
const isUrl = (encoding) => String(encoding).toLowerCase() === 'base64url';
const toString = Buffer.prototype.toString;
Buffer.prototype.toString = function (encoding, ...range) {
  if (!isUrl(encoding)) return toString.call(this, encoding, ...range);
  return toString.call(this, 'base64', ...range).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const from = Buffer.from;
Buffer.from = function (value, encoding, ...rest) {
  if (typeof value === 'string' && isUrl(encoding)) return from.call(this, value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return from.call(this, value, encoding, ...rest);
};
