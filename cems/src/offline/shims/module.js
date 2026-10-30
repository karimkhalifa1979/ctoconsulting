// node:module: optional native modules (resvg) are absent in the browser.
export function createRequire() {
  return (id) => { throw new Error(`${id} is not available in the offline edition`); };
}
export default { createRequire };
