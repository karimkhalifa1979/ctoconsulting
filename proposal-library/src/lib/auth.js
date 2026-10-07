// Microsoft Entra ID sign-in (MSAL, delegated permissions). The app reads SharePoint as the signed-in user,
// so people only ever see files they already have access to.
import { PublicClientApplication } from '@azure/msal-browser';
import { config } from '../config.js';

// Files.ReadWrite.All: read the Clients and Resumes folders and write the shared selections file.
export const SCOPES = ['User.Read', 'Files.ReadWrite.All'];

let pca = null;

export async function initAuth() {
  pca = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: window.location.origin + window.location.pathname,
    },
    cache: { cacheLocation: 'localStorage' },
  });
  await pca.initialize();
  const result = await pca.handleRedirectPromise();
  if (result?.account) pca.setActiveAccount(result.account);
  if (!pca.getActiveAccount()) {
    const [first] = pca.getAllAccounts();
    if (first) pca.setActiveAccount(first);
  }
  return pca.getActiveAccount();
}

export const signIn = () => pca.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
export const signOut = () => pca.logoutRedirect({ account: pca.getActiveAccount() });

export async function getToken() {
  const account = pca.getActiveAccount();
  if (!account) throw new Error('Not signed in');
  try {
    const r = await pca.acquireTokenSilent({ scopes: SCOPES, account });
    return r.accessToken;
  } catch (err) {
    // Consent or an expired session needs the user: send them through sign-in and come back.
    await pca.acquireTokenRedirect({ scopes: SCOPES, account });
    throw err;
  }
}
