// node:os, node:net, node:http and node:child_process. LibreOffice, ClamAV and listening sockets do
// not exist in the browser, so these report "not available" and the server falls back as it does
// on a machine without them.
const unavailable = (what) => new Error(`${what} is not available in the offline edition`);

export const tmpdir = () => '/tmp';
export const EOL = '\n';
export const platform = () => 'browser';
export const cpus = () => [];
export function execFile(cmd, args, opts, cb) {
  const done = typeof opts === 'function' ? opts : cb;
  setTimeout(() => done?.(unavailable(cmd), '', ''), 0);
}
export function createConnection() { throw unavailable('Network connections'); }
export function createServer() { throw unavailable('A web server'); }
export default { tmpdir, EOL, platform, cpus, execFile, createConnection, createServer };
