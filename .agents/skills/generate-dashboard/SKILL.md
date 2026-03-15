---
name: generate-dashboard
description: Generate a new dashboard product from an idea folder. Reads brand guidelines and idea brief, then outputs a complete dashboard config, DB seed entry, and Google Sheet template.
license: MIT
metadata:
  version: "1.0"
---

# Generate Dashboard Skill

Generate a complete, on-brand dashboard product from a `_dashboards/<name>/` idea folder.

## Prerequisites

- An idea folder exists at `dashboard-hub/_dashboards/<name>/brief.md`
- Brand guidelines exist at `dashboard-hub/_design/brand/guidelines.md`
- The service account has Google Sheets API access

## Steps

### 1. Read Brand Guidelines

Read the file `dashboard-hub/_design/brand/guidelines.md` and internalize:
- **Color palette**: Use the approved Tremor color tokens (emerald, teal, cyan, etc.)
- **Chart patterns**: Follow the color array conventions for each chart type
- **Config conventions**: sheetRange format, setupInstructions 3-step pattern, stats-first ordering
- **Card/layout patterns**: Use the documented CSS classes

**Do NOT deviate from the brand guidelines.** Every generated config MUST use colors and patterns from this file.

### 2. Read the Idea Brief

Read `dashboard-hub/_dashboards/<name>/brief.md` and extract:
- **Title and description** for the store listing
- **Column definitions** — these become `expectedHeaders`
- **Sample data** — use for the Google Sheet template
- **Chart specifications** — types, columns, and aggregations
- **Price** — for the DB seed entry
- **Notes** — any special requirements

### 3. Generate the DashboardConfig TypeScript File

Create a new file at `dashboard-hub/src/app/lib/dashboard-configs/<slug>.ts`.

**MUST follow this exact interface** (from `types.ts`):

```typescript
import type { DashboardConfig } from "./types";

export const <camelCaseName>Config: DashboardConfig = {
  slug: "<kebab-case-slug>",
  title: "<Title from brief>",
  sheetRange: "Master Data!A1:<lastCol><200>",
  expectedHeaders: ["Col1", "Col2", ...],
  setupInstructions: [
    "Step 1: Clone the master template — <TEMPLATE_SHEET_URL>",
    "Step 2: Share the cloned sheet with the service account email (Editor access).",
    "Step 3: Paste your cloned sheet URL in 'My Dashboards' to connect.",
  ],
  charts: [
    // Stats overview FIRST (always)
    {
      id: "<slug>-stats",
      title: "Overview",
      type: "stats",
      stats: [
        { label: "...", column: "...", aggregate: "count" },
        // ... more stats
      ],
    },
    // Then 2-3 more charts (bar, donut, area)
  ],
};
```

**Rules:**
- `sheetRange` MUST start with `"Master Data!"` — this is the standard tab name
- Column letter range: calculate from the number of columns (e.g., 5 columns = A-E)
- Stats chart MUST be first
- Use at least 3 chart types for visual variety
- Colors MUST come from the brand guidelines palette
- Export name MUST be `<camelCase>Config`

### 4. Register the Config in the Index

Edit `dashboard-hub/src/app/lib/dashboard-configs/index.ts`:
1. Add the import: `import { <camelCase>Config } from "./<slug>";`
2. Add to the `configs` record: `"<slug>": <camelCase>Config,`

### 5. Create the Google Sheet Template

Use the Google Sheets API to create a new spreadsheet owned by the service account:

```javascript
// Use googleapis to create a spreadsheet
const sheets = google.sheets({ version: "v4", auth });
const spreadsheet = await sheets.spreadsheets.create({
  requestBody: {
    properties: { title: "<Dashboard Title> - Template" },
    sheets: [{
      properties: { title: "Master Data" },
      data: [{
        startRow: 0,
        startColumn: 0,
        rowData: [
          // Row 1: Headers
          { values: expectedHeaders.map(h => ({ userEnteredValue: { stringValue: h } })) },
          // Rows 2-4: Sample data from brief
          ...sampleRows
        ]
      }]
    }]
  }
});
const templateUrl = `https://docs.google.com/spreadsheets/d/${spreadsheet.data.spreadsheetId}`;
```

**Important:** After creating the sheet, make it publicly viewable (so users can clone it):
```javascript
const drive = google.drive({ version: "v3", auth });
await drive.permissions.create({
  fileId: spreadsheet.data.spreadsheetId,
  requestBody: { role: "reader", type: "anyone" },
});
```

Then update the `setupInstructions` in the generated config with the actual template URL.

### 6. Update the Seed Script

Add an entry to `dashboard-hub/scripts/seed-dashboard.mjs` for the new dashboard:

```javascript
{
  title: "<Title>",
  slug: "<slug>",
  description: "<Description from brief>",
  price_cents: <price in cents>,
  master_sheet_url: "<template URL from step 5>",
  is_active: true,
}
```

The seed script should upsert entries (insert on conflict do update) into the Supabase `dashboards` table.

### 7. Update the Store Product Page

The `setupInstructions` from the config are displayed on the product page automatically. Verify the 3-step instructions are clear:
1. "Clone the master template: <clickable URL>"
2. "Share with service account email (Editor access)"
3. "Paste your cloned sheet URL in 'My Dashboards'"

### 8. Verify

1. Run `npm run build` to verify TypeScript compilation
2. Run `node scripts/seed-dashboard.mjs` to insert the DB entry
3. Check the store page shows the new dashboard
4. Check the product detail page shows correct setup instructions

## Output Checklist

After running this skill, the following files should exist/be modified:
- [ ] `src/app/lib/dashboard-configs/<slug>.ts` — new config file
- [ ] `src/app/lib/dashboard-configs/index.ts` — updated with new import
- [ ] `scripts/seed-dashboard.mjs` — updated with new entry
- [ ] Google Sheet template created and publicly readable
- [ ] Config `setupInstructions` contain the template URL
