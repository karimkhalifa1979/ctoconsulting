// Parses a Policy Requirements Register workbook into the tool's data model.
// Works on a library-agnostic representation: [{ name, rows: any[][] }], so the
// same code runs in the Node seed script and in the browser import feature.

export const REQ_FIELDS = [
  ['id', 'Requirement ID', 'Identification'],
  ['policyTitle', 'Target Policy Title', 'Identification'],
  ['policyNumber', 'Policy Number', 'Identification'],
  ['policyDomain', 'Policy Domain', 'Identification'],
  ['section', 'Policy Section / Clause', 'Identification'],
  ['title', 'Requirement Title', 'Requirement Core'],
  ['obligationDescription', 'Obligation Description', 'Requirement Core'],
  ['requirement', 'Policy Requirement', 'Requirement Core'],
  ['type', 'Requirement Type', 'Requirement Core'],
  ['priority', 'Priority / Criticality', 'Requirement Core'],
  ['obligationRef', 'Obligation Reference', 'Regulatory Basis'],
  ['ismControls', 'Linked ISM Control(s)', 'Regulatory Basis'],
  ['otherStandards', 'Other Standards / Frameworks', 'Regulatory Basis'],
  ['controlCategory', 'Control Category', 'Control Classification'],
  ['controlObjective', 'Control Objective', 'Control Classification'],
  ['threat', 'Threat / Risk Addressed', 'Control Classification'],
  ['riskRating', 'Risk Rating (if unmet)', 'Control Classification'],
  ['applicability', 'Applicability / Scope', 'Scope & Applicability'],
  ['excluded', 'Excluded from Scope', 'Scope & Applicability'],
  ['guidance', 'Implementation Guidance', 'Implementation'],
  ['technicalControls', 'Technical Controls Required', 'Implementation'],
  ['processSteps', 'Process / Procedural Steps', 'Implementation'],
  ['accountable', 'Accountable Role', 'Roles & Responsibilities'],
  ['responsible', 'Responsible Roles', 'Roles & Responsibilities'],
  ['consulted', 'Consulted Roles', 'Roles & Responsibilities'],
  ['informed', 'Informed Roles', 'Roles & Responsibilities'],
  ['exceptionsPermitted', 'Exceptions Permitted?', 'Exceptions'],
  ['exceptionProcess', 'Exception Process', 'Exceptions'],
  ['exceptionAuthority', 'Exception Approval Authority', 'Exceptions'],
  ['verification', 'Verification Method', 'Verification & Evidence'],
  ['evidence', 'Evidence / Artefacts Required', 'Verification & Evidence'],
  ['auditFrequency', 'Audit Frequency', 'Verification & Evidence'],
  ['relatedPolicies', 'Related Policies', 'Related Documents'],
  ['relatedProcedures', 'Related Procedures / Guidelines', 'Related Documents'],
  ['status', 'Requirement Status', 'Review & Lifecycle'],
  ['reviewFrequency', 'Review Frequency', 'Review & Lifecycle'],
  ['reviewTriggers', 'Review Triggers', 'Review & Lifecycle'],
  ['dateCaptured', 'Date Captured', 'Review & Lifecycle'],
  ['lastReviewed', 'Last Reviewed', 'Review & Lifecycle'],
  ['owner', 'Requirement Owner (SME)', 'Ownership'],
  ['notes', 'Notes / Additional Context', 'Ownership'],
].map(([key, label, group]) => ({ key, label, group }));

export const OBL_FIELDS = [
  ['policyNumber', 'Policy Number'],
  ['id', 'Obligation ID'],
  ['requirementIds', 'Policy Requirement ID Mapping'],
  ['name', 'Obligation Name'],
  ['reference', 'Obligation Reference'],
  ['description', 'Obligation Description'],
  ['applicability', 'Applicability'],
  ['source', 'Obligation Source'],
  ['publisher', 'Publisher'],
  ['type', 'Obligation Type'],
  ['urls', 'Source URLs'],
].map(([key, label]) => ({ key, label }));

export const EXM_FIELDS = [
  ['id', 'Exemption ID'], ['policyTitle', 'Target Policy Title'], ['policyNumber', 'Policy Number'],
  ['policyDomain', 'Policy Domain'], ['requirementId', 'Linked Requirement ID'], ['requirementTitle', 'Requirement Title'],
  ['exemptionType', 'Exemption Type'], ['description', 'Exemption Description'], ['justification', 'Business Justification'],
  ['durationType', 'Duration Type'], ['preRisk', 'Pre-Exemption Risk Rating'], ['riskDescription', 'Risk Description'],
  ['compensatingControls', 'Compensating Controls'], ['residualRisk', 'Residual Risk Rating'], ['residualAcceptedBy', 'Residual Risk Accepted By'],
  ['pspfRef', 'PSPF Requirement Reference'], ['pspfContingency', 'PSPF Contingency Provision'], ['ismControls', 'ISM Control(s) Affected'],
  ['approvalAuthority', 'Approval Authority'], ['approvedByName', 'Approved By (Name)'], ['approvedByRole', 'Approved By (Role)'],
  ['dateRequested', 'Date Requested'], ['dateApproved', 'Date Approved'], ['effectiveDate', 'Effective Date'],
  ['expiryDate', 'Expiry / Review Date'], ['status', 'Exemption Status'], ['reviewFrequency', 'Review Frequency'],
  ['lastReviewed', 'Date Last Reviewed'], ['nextReview', 'Next Review Date'], ['owner', 'Exemption Owner (SME)'], ['notes', 'Notes / Additional Context'],
].map(([key, label]) => ({ key, label }));

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return toIsoDate(v);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return cellText(v.result);
    if (v.text) return String(v.text);
    if (v.hyperlink) return String(v.hyperlink);
    return '';
  }
  return String(v).replace(/\r\n/g, '\n').trim();
}

function toIsoDate(d) {
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// Accepts ISO, dd/mm/yyyy, Excel serials and Date objects; returns yyyy-mm-dd or ''.
export function normaliseDate(v) {
  if (!v) return '';
  if (v instanceof Date) return toIsoDate(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return toIsoDate(d);
  }
  return '';
}

function findHeaderRow(rows, predicate, maxScan = 8) {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    if (predicate(rows[i].map(cellText))) return i;
  }
  return -1;
}

function mapRows(rows, headerIdx, fields) {
  const headers = rows[headerIdx].map((h) => norm(cellText(h)));
  const colFor = fields.map((f) => {
    const target = norm(f.label);
    let idx = headers.indexOf(target);
    if (idx < 0) idx = headers.findIndex((h) => h && (h.startsWith(target) || target.startsWith(h) || h.endsWith(target)));
    return idx;
  });
  const out = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.some((c) => cellText(c))) continue;
    const rec = {};
    fields.forEach((f, i) => {
      rec[f.key] = colFor[i] >= 0 ? cellText(row[colFor[i]]) : '';
    });
    out.push(rec);
  }
  return out;
}

// Derive the 3-letter policy code (GOV, CYB, …) from a requirement or policy ID.
export function policyCodeOf(id) {
  const m = String(id || '').match(/-(?:ICT-)?([A-Z]{3})-\d{3}\s*$/);
  return m ? m[1] : '';
}

export function splitList(s) {
  return String(s || '')
    .split(/[;\n]|,(?=\s*[A-Z]{2,}[-\s]?\d)/)
    .map((x) => x.replace(/^\s*[-•\d.)]+\s+/, '').trim())
    .filter(Boolean);
}

export function extractIsmControls(s) {
  const ids = new Set();
  const text = String(s || '');
  for (const m of text.matchAll(/ISM[-\s]?(?:Control\s*)?(\d{3,4})/gi)) ids.add(`ISM-${m[1].padStart(4, '0')}`);
  return [...ids];
}

function detectGenericHeader(rows) {
  // The header is the first row (within the first 8) that has the most populated cells.
  let best = 0, bestCount = -1;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    // Distinct values: exceljs repeats a merged cell's value across the whole merge.
    const count = new Set((rows[i] || []).map((c) => cellText(c)).filter(Boolean)).size;
    if (count > bestCount + 1) { best = i; bestCount = count; }
  }
  return best;
}

export function parseRegister(sheets) {
  const byName = Object.fromEntries(sheets.map((s) => [s.name.trim(), s]));
  const result = { requirements: [], obligations: [], exemptions: [], pspf: [], sheets: [] };

  // Requirements: prefer the consolidated 'Requirements' sheet, else merge all requirement sheets.
  const reqSheets = sheets.filter((s) => findHeaderRow(s.rows, (r) => norm(r[0]) === 'requirement id') >= 0);
  const master = byName['Requirements'] && reqSheets.includes(byName['Requirements']) ? [byName['Requirements']] : reqSheets;
  const seen = new Set();
  for (const s of master) {
    const h = findHeaderRow(s.rows, (r) => norm(r[0]) === 'requirement id');
    for (const rec of mapRows(s.rows, h, REQ_FIELDS)) {
      rec.id = rec.id.trim();
      if (!rec.id || seen.has(rec.id)) continue;
      seen.add(rec.id);
      rec.policyCode = policyCodeOf(rec.id) || policyCodeOf(rec.policyNumber);
      rec.dateCaptured = normaliseDate(rec.dateCaptured) || rec.dateCaptured;
      rec.lastReviewed = normaliseDate(rec.lastReviewed) || rec.lastReviewed;
      rec.ismList = extractIsmControls(rec.ismControls);
      result.requirements.push(rec);
    }
  }

  const oblSheet = sheets.find((s) => findHeaderRow(s.rows, (r) => r.some((c) => norm(c) === 'obligation id') && r.some((c) => norm(c) === 'obligation description')) >= 0);
  if (oblSheet) {
    const h = findHeaderRow(oblSheet.rows, (r) => r.some((c) => norm(c) === 'obligation id'));
    result.obligations = mapRows(oblSheet.rows, h, OBL_FIELDS)
      .filter((o) => o.id)
      .map((o, i) => ({
        ...o,
        key: `${o.id}#${i}`,
        requirementIds: o.requirementIds.split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean),
        policyCode: policyCodeOf(o.policyNumber),
      }));
  }

  const exmSheet = sheets.find((s) => findHeaderRow(s.rows, (r) => norm(r[0]) === 'exemption id') >= 0);
  if (exmSheet) {
    const h = findHeaderRow(exmSheet.rows, (r) => norm(r[0]) === 'exemption id');
    result.exemptions = mapRows(exmSheet.rows, h, EXM_FIELDS).filter((e) => e.id).map((e) => ({
      ...e,
      dateRequested: normaliseDate(e.dateRequested) || e.dateRequested,
      dateApproved: normaliseDate(e.dateApproved) || e.dateApproved,
      effectiveDate: normaliseDate(e.effectiveDate) || e.effectiveDate,
      expiryDate: normaliseDate(e.expiryDate) || e.expiryDate,
      lastReviewed: normaliseDate(e.lastReviewed) || e.lastReviewed,
      nextReview: normaliseDate(e.nextReview) || e.nextReview,
    }));
  }

  const pspfSheet = byName['PSPF Requirements Master'];
  if (pspfSheet) {
    const h = findHeaderRow(pspfSheet.rows, (r) => r.some((c) => norm(c) === 'pspf req reference'));
    const headers = pspfSheet.rows[h].map(cellText);
    const policyCols = headers.map((x, i) => [x, i]).slice(11).filter(([x]) => x);
    for (let r = h + 1; r < pspfSheet.rows.length; r++) {
      const row = pspfSheet.rows[r].map(cellText);
      if (!row[1]) continue;
      result.pspf.push({
        number: row[0], ref: row[1], requirement: row[2], domain: row[3], section: row[4],
        applicability: row[5], startDate: normaliseDate(row[6]), decision: row[7], questionType: row[8],
        mandatory: row[9], scored: row[10],
        policies: policyCols.map(([, i]) => row[i]).filter((v) => v && v !== 'NA'),
      });
    }
  }

  // Every worksheet, verbatim, so nothing in the register is lost.
  for (const s of sheets) {
    const rows = s.rows.map((r) => {
      // Blank out repeated merged-cell values so banner rows render once.
      const vals = (r || []).map(cellText);
      return vals.map((v, i) => (i > 0 && v && v === vals[i - 1] && v.length > 25 ? '' : v));
    });
    while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
    const width = rows.reduce((w, r) => {
      let last = r.length; while (last > 0 && !r[last - 1]) last--; return Math.max(w, last);
    }, 0);
    const trimmed = rows.map((r) => r.slice(0, width).concat(Array(Math.max(0, width - r.length)).fill('')));
    const headerRow = detectGenericHeader(trimmed);
    result.sheets.push({
      name: s.name.trim(),
      title: headerRow > 0 ? trimmed[0].find(Boolean) || '' : '',
      preamble: trimmed.slice(0, headerRow).map((r) => r.filter(Boolean).join(' | ')).filter(Boolean),
      headers: trimmed[headerRow] || [],
      rows: trimmed.slice(headerRow + 1).filter((r) => r.some(Boolean)),
    });
  }
  return result;
}

// Convert an exceljs Workbook into the library-agnostic sheet list.
export function sheetsFromExcelJs(workbook) {
  const sheets = [];
  workbook.eachSheet((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { vals[col - 1] = cell.value; });
      rows[rowNumber - 1] = vals;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name: ws.name, rows });
  });
  return sheets;
}
