# CTO Consulting — Proposal Library

A CTO Consulting–branded web app that reads the CTO Consulting SharePoint / OneDrive document library and lets you:

1. **New proposal** — record the details of a new proposal and choose its supporting documents and proposed team from the two lists below, and its case studies from **`Sales and Marketing/Case Studies`**. **Saved proposals** lists every proposal recorded.
2. **Proposal library** — browse every file in the **`Clients`** folder (all client sub-folders) and choose which files to reuse in future proposals.
3. **Active resumes** — browse every resume in **`Sales and Marketing/People/Resumes/Originals`** (including its sub-folders) and mark which ones are active.

Everything is saved and reloaded every time the app opens.

The Case Studies folder location can be changed with `VITE_CASE_STUDIES_PATH`.

## New proposal

The proposal form is split into eight sections, shown as numbered steps down the left. Each step shows its progress (for example "5 of 8 filled", or a tick when complete) and flags any required field that is still empty. Move between them with **Next** / **Back** or by clicking a step.

| Step | What it records |
|---|---|
| 1. Overview | Title\*, client\* (suggested from the Clients folder names), status, opportunity type, procurement channel, client reference, bid lead, estimated value |
| 2. Client & contacts | Sector, relationship, division, contact name / role / email / phone, background notes |
| 3. Key dates | Released, questions close, submission due\* (and time), expected decision, expected start, contract term |
| 4. Scope & requirements | Requirement summary, services, work locations, security clearance, pricing model, evaluation criteria, win themes |
| 5. Supporting documents | Files picked from those selected in the **Proposal library**, grouped by client (the proposal's own client is listed first), each with an optional "how it will be used" note |
| 6. Case studies | Case studies picked straight from the **`Sales and Marketing/Case Studies`** folder (Word, PowerPoint and Web case studies, plus its other sub-folders), each with an optional "why it is relevant" note. Likely matches are listed first under **Suggested for this proposal** (see below) |
| 7. Proposed team | People picked from the **Active resumes**, grouped by resume folder, each with their role on this proposal |
| 8. Review | A readiness checklist, every section on one page with **Edit** links, and **Print / save as PDF** |

\* required before submission; only the title is needed to save a draft.

**Case study suggestions.** The app compares the words in the proposal with each case study's file and folder name. Client and title words count most, then the selected services, then sector, locations and the scope text. A case study is suggested when it shares the client, or a title word plus a service, and the best matches are listed first, with the matching words shown. Fill in the title, client, services and scope before opening the step to get the best suggestions. The Case Studies folder is read the first time the step is opened and cached after that; **Rescan** re-reads it.

**Saved proposals** shows open / due-soon / awaiting-decision / won counts and lists the proposals soonest deadline first, with search, Open / Closed / All views and a status filter. Each one can be opened, duplicated (to start a similar bid) or deleted. The app asks before you leave a proposal with unsaved changes.

A proposal keeps its own copy of each chosen document and resume (name, folder, link). If one is later removed from the Proposal library or Active resumes, the proposal still lists it and marks it "not in library".

## How it works

- **Sign-in:** Microsoft 365 sign-in (MSAL, delegated permissions). The app reads SharePoint *as you*, so it only ever sees files you already have access to. Nothing is copied out of SharePoint.
- **Reading folders:** Microsoft Graph lists each folder and all its sub-folders. The results are cached in the browser so the app opens instantly; **Rescan folder** re-reads it from SharePoint.
- **Browsing:** folder tree (client → engagement → sub-folder) with file and selection counts, search, file-type filters (Word, PDF, PowerPoint, Excel), *All / Selected / Not selected* views, sort, bulk select for the files shown, and a link to open each file in SharePoint.
- **Saving:** ticks are held as *unsaved changes* until you press **Save selections** (the app warns if you close the tab with unsaved changes). Selections are written to a JSON file in the same library — by default `Sales and Marketing/Proposal Library/proposal-library-selections.json` (the folder is created on first save). Because it lives in SharePoint, the selections are shared by everyone who uses the app, are backed up and versioned by SharePoint, and can be read by other tools.
- **Safe concurrent edits:** a save re-reads the latest file and applies only your changes on top of it, using the file's eTag so two people saving at once never overwrite each other.
- **Proposals** are stored in the same file under `proposals`, saved one proposal at a time with the same merge-and-retry logic, so two people working on different proposals never overwrite each other.
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
  },
  "proposals": {
    "<proposal id>": {
      "details": { "title": "…", "client": "…", "status": "Draft", "dueDate": "2026-10-20", "…": "…" },
      "files": [{ "id": "<SharePoint item id>", "name": "…", "path": "…", "webUrl": "…", "note": "Case study" }],
      "caseStudies": [{ "id": "<SharePoint item id>", "name": "…", "path": "Word Case Studies", "webUrl": "…", "note": "Similar services" }],
      "team":  [{ "id": "<SharePoint item id>", "name": "…", "path": "…", "webUrl": "…", "role": "Business Analyst" }],
      "createdAt": "…", "createdBy": "…", "updatedAt": "…", "updatedBy": "…"
    }
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

- It uses placeholder sample folders and resumes (no real client or staff data), with some files and resumes already selected and one example proposal, so every screen has something to show.
- Changes are saved in that browser, so they are still there when you reopen the file. **Reset demo** in the sidebar restores the starting sample data before the next demo.
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
src/lib/proposal.js      Proposal sections, fields, progress, readiness and case study suggestion rules
src/pages/Library.jsx    File browser used by the Proposal library and Active resumes
src/pages/SavedProposals.jsx  Saved proposals list
src/pages/ProposalEditor.jsx  New proposal / edit proposal form
src/components/Picker.jsx     Document, case study and team chooser
```
