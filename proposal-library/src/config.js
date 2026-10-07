// Runtime configuration, read from Vite env variables (see .env.example).
const env = import.meta.env;

const trimSlashes = (p) => String(p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

export const config = {
  clientId: env.VITE_AZURE_CLIENT_ID || '',
  tenantId: env.VITE_AZURE_TENANT_ID || 'organizations',
  spHostname: env.VITE_SP_HOSTNAME || 'ctoconsul.sharepoint.com',
  spSitePath: '/' + trimSlashes(env.VITE_SP_SITE_PATH || '/sites/CTOConsulting'),
  spLibrary: env.VITE_SP_LIBRARY || 'Documents',
  clientsPath: trimSlashes(env.VITE_CLIENTS_PATH || 'Clients'),
  resumesPath: trimSlashes(env.VITE_RESUMES_PATH || 'Sales and Marketing/People/Resumes/Originals'),
  selectionsPath: trimSlashes(env.VITE_SELECTIONS_PATH || 'Sales and Marketing/Proposal Library/proposal-library-selections.json'),
};

export const demoMode = !config.clientId;

// The two lists the app manages. `key` is the property in the saved selections file.
export const LISTS = {
  proposals: {
    key: 'proposalFiles',
    folder: config.clientsPath,
    title: 'Proposal library',
    eyebrow: 'Clients folder',
    intro: 'Every file in the Clients folder. Tick the files you want to reuse in future proposals, then save.',
    selectLabel: 'Use for proposals',
    selectedLabel: 'Selected for proposals',
    rootLabel: 'All clients',
  },
  resumes: {
    key: 'activeResumes',
    folder: config.resumesPath,
    title: 'Active resumes',
    eyebrow: 'Resumes › Originals',
    intro: 'Every resume in the Originals folder. Mark the resumes that are active, then save.',
    selectLabel: 'Active',
    selectedLabel: 'Active resumes',
    rootLabel: 'All resumes',
  },
};
