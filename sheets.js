// ── Google Sheets API helper ──────────────────────────────────────────────────
// Depends on SHEETS_CONFIG from config.js

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sheetsGet(sheetName) {
  const { apiKey, spreadsheetId } = SHEETS_CONFIG;
  if (!apiKey || apiKey === 'ВАШ_API_КЛЮЧ_ЗДЕСЬ') {
    throw new Error('API ключ не настроен. Заполни config.js');
  }
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:Z?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return rowsToObjects(data.values || []);
}

// Convert [[header,...], [val,...], ...] → [{header: val, ...}, ...]
function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1)
    .filter(r => r.some(c => c?.trim()))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
      return obj;
    });
}
