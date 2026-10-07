import { useState } from 'react';
import { sortedChildren } from '../lib/tree.js';

// Collapsible folder tree with file and selection counts; clicking a folder filters the file list to it.
export default function FolderTree({ root, rootLabel, value, onChange }) {
  return (
    <ul className="tree" role="tree">
      <Node node={root} label={rootLabel} depth={0} value={value} onChange={onChange} defaultOpen />
    </ul>
  );
}

function Node({ node, label, depth, value, onChange, defaultOpen = false }) {
  const kids = sortedChildren(node);
  const onPath = value && (value === node.path || value.startsWith(node.path + '/'));
  const [open, setOpen] = useState(defaultOpen || Boolean(onPath && node.path));
  const active = value === node.path;
  return (
    <li role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={active}>
      <div className={`tree-row ${active ? 'active' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}>
        {kids.length ? (
          <button className="tree-twist" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'}>{open ? '▾' : '▸'}</button>
        ) : <span className="tree-twist" />}
        <button className="tree-label" onClick={() => onChange(node.path)} title={label || node.name}>
          <span className="tree-name">{label || node.name}</span>
          <span className="tree-count tabular">
            {node.selected > 0 && <span className="tree-sel">{node.selected}</span>}
            {node.files}
          </span>
        </button>
      </div>
      {open && kids.length > 0 && (
        <ul role="group">
          {kids.map((k) => <Node key={k.path} node={k} depth={depth + 1} value={value} onChange={onChange} />)}
        </ul>
      )}
    </li>
  );
}
