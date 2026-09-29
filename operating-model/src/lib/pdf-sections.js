// Report sections (kept separate so the report page loads without the PDF library).
export const REPORT_SECTIONS = [
  { id: 'exec', title: 'Executive summary', default: true },
  { id: 'engagement', title: 'Engagement overview', default: true },
  { id: 'maturity', title: 'Operating model maturity profile', default: true },
  { id: 'dimensions', title: 'Assessment by dimension', default: true },
  { id: 'findings', title: 'Key findings', default: true },
  { id: 'inventories', title: 'Current-state analysis', default: true },
  { id: 'ai', title: 'AI readiness', default: true },
  { id: 'tom', title: 'Target operating model', default: true },
  { id: 'compare', title: 'Current vs target comparison', default: true },
  { id: 'business', title: 'Business case: benefits and costs', default: true },
  { id: 'recommendations', title: 'Recommendations and roadmap', default: true },
  { id: 'transition', title: 'Implementation, change and risk', default: true },
  { id: 'appendixA', title: 'Appendix A: Detailed assessment scores', default: false },
  { id: 'appendixB', title: 'Appendix B: Framework and maturity scale', default: true },
];
