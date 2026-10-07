import { useMemo, useState } from 'react';

// Two-column chooser: what is available (grouped, searchable) on the left, what is in the proposal on the right.
// Used for supporting documents (from the Proposal library) and the proposed team (from active resumes).
export default function Picker({
  available, chosen, onAdd, onRemove, onUpdate,
  groupOf, labelOf, subOf, featuredGroup, featuredLabel,
  extra, noun, emptyLibrary,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState({});
  const chosenIds = new Set(chosen.map((c) => c.id));
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of available) {
      if (chosenIds.has(item.id)) continue;
      if (q && !`${labelOf(item)} ${item.name} ${item.path}`.toLowerCase().includes(q)) continue;
      const g = groupOf(item);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(item);
    }
    const out = [...map.entries()].map(([name, items]) => ({ name, items: items.sort((a, b) => labelOf(a).localeCompare(labelOf(b))) }));
    out.sort((a, b) => (b.name === featuredGroup) - (a.name === featuredGroup) || a.name.localeCompare(b.name));
    return out;
  }, [available, chosen, q, featuredGroup]);

  const chosenGroups = useMemo(() => {
    const map = new Map();
    for (const c of chosen) {
      const g = groupOf(c);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(c);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chosen, groupOf]);

  const libraryIds = new Set(available.map((a) => a.id));
  // Groups start expanded when searching, for the featured group (e.g. this client), or when the list is short.
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const isOpen = (name) => open[name] ?? (Boolean(q) || name === featuredGroup || groups.length <= 3 || shown <= 30);

  return (
    <div className="picker">
      <div className="picker-col">
        <div className="picker-head">
          <h3>Available <span className="muted tabular">({available.length - chosen.filter((c) => libraryIds.has(c.id)).length})</span></h3>
          <input type="search" placeholder={`Search ${noun.plural}`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${noun.plural}`} />
        </div>
        <div className="picker-list">
          {!available.length && <div className="picker-empty">{emptyLibrary}</div>}
          {available.length > 0 && !groups.length && <div className="picker-empty">{q ? 'Nothing matches your search.' : `Every ${noun.singular} has been added.`}</div>}
          {groups.map((g) => (
            <div key={g.name} className="pgroup">
              <div className="pgroup-head">
                <button className="pgroup-toggle" onClick={() => setOpen((o) => ({ ...o, [g.name]: !isOpen(g.name) }))} aria-expanded={isOpen(g.name)}>
                  <span className="twist">{isOpen(g.name) ? '▾' : '▸'}</span>
                  <span className="pgroup-name">{g.name}</span>
                  {g.name === featuredGroup && <span className="badge badge-teal">{featuredLabel}</span>}
                  <span className="muted small tabular">{g.items.length}</span>
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => g.items.forEach(onAdd)}>Add all</button>
              </div>
              {isOpen(g.name) && (
                <ul className="pitems">
                  {g.items.map((item) => (
                    <li key={item.id}>
                      <div className="pitem-text">
                        <span className="pitem-label">{labelOf(item)}</span>
                        <span className="pitem-sub">{subOf(item)}</span>
                      </div>
                      <button className="btn btn-sm" onClick={() => onAdd(item)} aria-label={`Add ${labelOf(item)}`}>Add</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="picker-col chosen">
        <div className="picker-head">
          <h3>In this proposal <span className="muted tabular">({chosen.length})</span></h3>
        </div>
        <div className="picker-list">
          {!chosen.length && <div className="picker-empty">No {noun.plural} added yet. Use <b>Add</b> on the left.</div>}
          {chosenGroups.map(([name, items]) => (
            <div key={name} className="pgroup">
              <div className="pgroup-title">{name}</div>
              <ul className="pitems">
                {items.map((c) => (
                  <li key={c.id} className="pitem-chosen">
                    <div className="pitem-text">
                      <span className="pitem-label">
                        {c.webUrl && c.webUrl !== '#' ? <a href={c.webUrl} target="_blank" rel="noreferrer">{labelOf(c)}</a> : labelOf(c)}
                        {!libraryIds.has(c.id) && <span className="badge badge-gold" title="Removed from the library since it was added">not in library</span>}
                      </span>
                      <span className="pitem-sub">{subOf(c)}</span>
                      <input
                        type="text"
                        className="pitem-extra"
                        list={extra.list}
                        placeholder={extra.placeholder}
                        aria-label={`${extra.label} for ${labelOf(c)}`}
                        value={c[extra.key] || ''}
                        onChange={(e) => onUpdate(c.id, { [extra.key]: e.target.value })}
                      />
                    </div>
                    <button className="btn btn-sm btn-ghost remove" onClick={() => onRemove(c.id)} aria-label={`Remove ${labelOf(c)}`}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
