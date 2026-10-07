# CTO Consulting — Proposal Library

A CTO Consulting–branded web app that reads the CTO Consulting SharePoint / OneDrive document library and lets you:

1. **Proposal library** — browse every file in the **`Clients`** folder (all client sub-folders) and choose which files to reuse in future proposals.
2. **Active resumes** — browse every resume in **`Sales and Marketing/People/Resumes/Originals`** (including its sub-folders) and mark which ones are active.

Both selections are saved and reloaded every time the app opens, ready for future features (e.g. assembling a proposal from the selected files and active resumes).

## How it works

- **Sign-in:** Microsoft 365 sign-in (MSAL, delegated permissions). The app reads SharePoint *as you*, so it only ever sees files you already have access to. Nothing is copied out of SharePoint.
- **Reading folders:** Microsoft Graph lists each folder and all its sub-folders. The results are cached in the browser so the app opens instantly; **Rescan folder** re-reads it from SharePoint.
- **Browsing:** folder tree (client → engagement → sub-folder) with file and selection counts, search, file-type filters (Word, PDF, PowerPoint, Excel), *All / Selected / Not selected* views, sort, bulk select for the files shown, and a link to open each file in SharePoint.
- **Saving:** ticks are held as *unsaved changes* until you press **Save selections** (the app warns if you close the tab with unsaved changes). Selections are written to a JSON file in the same library — by default `Sales and Marketing/Proposal Library/proposal-library-selections.json` (the folder is created on first save). Because it lives in SharePoint, the selections are shared by everyone who uses the app, are backed up and versioned by SharePoint, and can be read by other tools.
- **Safe concurrent edits:** a save re-reads the latest file and applies only your changes on top of it, using the file's eTag so two people saving at once never overwrite each other.
- **Moved or deleted files:** selections are keyed by the SharePoint item ID, so renamed or moved files stay selected. If a selected file is no longer in the folder, the app flags it so you can review it.

### The saved selections file

```json
{
  "schema": "cto-proposal-library/v1",
  "updatedAt": "2026-10-07T03:12:00.000Z",
  "updatedBy": "…",
  "proposalFiles": {
    "<SharePoint item id>": { "name": "Proposal - Final.docx", "path": "Austrade/Response/Final", "webUrl": "https://…", "selectedAt": "…", "selectedBy": "…" }
  },
  "activeResumes": {
    "<SharePoint item id>": { "name": "…", "path": "Scrum Masters_Delivery Managers", "webUrl": "https://…", "selectedAt": "…", "selectedBy": "…" }
  }
}
```

`path` is the file's folder relative to `Clients` (or `Originals`).

## Setup

Requires Node.js 20+.

### 1. Register the app in Microsoft Entra ID (one-off)

1. Azure portal → **Microsoft Entra ID → App registrations → New registration**.
   - Name: `CTO Consulting Proposal Library`
   - Supported account types: *Accounts in this organizational directory only*
   - Redirect URI: platform **Single-page application (SPA)**, URI `http://localhost:5173/` (add your hosted URL later)
2. **API permissions → Add a permission → Microsoft Graph → Delegated**: `User.Read`, `Files.ReadWrite.All`. Optionally **Grant admin consent** so staff are not prompted.
3. Copy the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.

### 2. Configure

```bash
cd proposal-library
cp .env.example .env.local
# set VITE_AZURE_CLIENT_ID and VITE_AZURE_TENANT_ID
```

The other settings already point at the CTO Consulting library (`ctoconsul.sharepoint.com/sites/CTOConsulting`, library *Documents*) and its `Clients` and `Sales and Marketing/People/Resumes/Originals` folders; change them only if those move.

### 3. Run

```bash
npm install
npm run dev        # http://localhost:5173
```

To deploy, run `npm run build` and host `dist/` on any static host (Azure Static Web Apps, GitHub Pages, S3…). Add the hosted URL as an SPA redirect URI on the app registration.

### Demo mode

With no `VITE_AZURE_CLIENT_ID` set, the app runs in **demo mode** with placeholder sample folders and saves selections in the browser only. It is labelled *Demo mode* in the sidebar.

### Offline demo (single file)

`offline/CTO-Proposal-Library-Demo.html` is the whole app in one file, in demo mode. Copy it anywhere (laptop, USB stick, email attachment) and double-click it to open in Edge or Chrome: no install, sign-in, server or internet connection needed.

- It uses placeholder sample folders and resumes (no real client or staff data).
- Selections are saved in that browser, so they are still there when you reopen the file. **Reset demo selections** in the sidebar clears them before the next demo.
- Without internet the page uses system fonts instead of Montserrat/Inter; everything else looks the same.

Rebuild it after changing the app with `npm run build:offline`.

## Checks

```bash
npm run check      # selection merge / folder tree logic
npm run build
```

## Project structure

```
src/config.js            Settings (from .env) and the two managed lists
src/lib/auth.js          Microsoft sign-in (MSAL)
src/lib/graph.js         Microsoft Graph: library lookup, recursive folder scan, JSON file read/write
src/lib/backend.js       Scan cache, load/save selections (SharePoint or demo)
src/lib/selections.js    Saved-selections document and merge logic
src/lib/tree.js          Folder tree from file paths
src/pages/Library.jsx    File browser used by both screens
```
