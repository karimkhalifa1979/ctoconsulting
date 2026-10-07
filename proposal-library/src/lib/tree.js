// Builds a folder tree from file paths so the browser can filter by client / sub-folder.

export function buildTree(files, isSelected) {
  const root = { name: '', path: '', children: new Map(), files: 0, selected: 0 };
  for (const f of files) {
    const sel = isSelected(f.id) ? 1 : 0;
    root.files += 1;
    root.selected += sel;
    let node = root;
    if (!f.path) continue;
    for (const part of f.path.split('/')) {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path: node.path ? `${node.path}/${part}` : part, children: new Map(), files: 0, selected: 0 };
        node.children.set(part, child);
      }
      child.files += 1;
      child.selected += sel;
      node = child;
    }
  }
  return root;
}

export function sortedChildren(node) {
  return [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

export function inFolder(file, folder) {
  return !folder || file.path === folder || file.path.startsWith(folder + '/');
}
