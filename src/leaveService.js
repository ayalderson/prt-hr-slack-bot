/**
 * Leave Data Service — Google Sheets Edition
 * Fetches live data from PRt Leave Log 2026 (published as CSV)
 *
 * Sheet ID: 13_I82Hw8e4aRxDBel4X3C-TOo3Z0AKP6kQEs3eg0g8Q
 * Tabs: May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, Summary
 */

const https = require('https');

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '13_I82Hw8e4aRxDBel4X3C-TOo3Z0AKP6kQEs3eg0g8Q';
const MONTH_TABS = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ANNUAL_DEDUCTIBLE = ['Holiday', 'Absent'];
const ANNUAL_DAYS_ALLOTTED = 21;

// 5-minute in-memory cache
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function buildCsvUrl(tabName) {
  const encoded = encodeURIComponent(tabName);
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encoded}`;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = '';
    } else current += char;
  }
  result.push(current);
  return result;
}

function parseCsv(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || '').trim().replace(/^"|"$/g, ''); });
    return row;
  });
}

async function fetchMonthData(tabName) {
  const cacheKey = `tab_${tabName}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;

  const csv = await fetchUrl(buildCsvUrl(tabName));
  const rows = parseCsv(csv);
  const records = rows.filter(row => {
    const name = (row['Name'] || '').trim();
    const type = (row['Leave Type'] || '').trim();
    return name && type && name !== 'Name';
  });

  cache.set(cacheKey, { data: records, timestamp: Date.now() });
  return records;
}

async function loadAllData() {
  const result = {};
  await Promise.all(MONTH_TABS.map(async (tab) => {
    try { result[tab] = await fetchMonthData(tab); }
    catch (e) { console.warn(`⚠️  Could not load tab "${tab}": ${e.message}`); result[tab] = []; }
  }));
  return result;
}

// Helper: normalise column names (sheet has some with newlines)
function getField(row, ...keys) {
  for (const key of keys) {
    const val = row[key] || row[key.replace('\n', ' ')] || row[key.replace(' ', '\n')] || '';
    if (val) return val;
  }
  return '';
}

async function getEmployeeLeave(employeeName) {
  const allData = await loadAllData();
  const results = [];
  const search = employeeName.toLowerCase().trim();

  for (const [month, rows] of Object.entries(allData)) {
    for (const row of rows) {
      const name = (row['Name'] || '').toLowerCase().trim();
      if (name.includes(search) || search.includes(name)) {
        results.push({
          month,
          name: row['Name'],
          startDate: getField(row, 'Date of Action (Start)', 'Date of Action\n(Start)'),
          endDate: getField(row, 'Date of Action (End)', 'Date of Action\n(End)'),
          days: parseFloat(getField(row, 'No. of Days', '# No. of Days') || '1') || 1,
          type: row['Leave Type'] || 'Unknown',
          approval: row['Approval'] || '',
          notes: row['Notes'] || ''
        });
      }
    }
  }
  return results;
}

async function getEmployeeSummary(employeeName) {
  const records = await getEmployeeLeave(employeeName);
  if (records.length === 0) return null;

  const summary = {
    name: records[0].name,
    totalDaysUsed: 0,
    annualDeductibleUsed: 0,
    wfhUsed: 0,
    sickUsed: 0,
    otherUsed: 0,
    records,
    remaining: ANNUAL_DAYS_ALLOTTED
  };

  for (const r of records) {
    const days = Number(r.days) || 1;
    summary.totalDaysUsed += days;
    const type = String(r.type).trim();
    if (ANNUAL_DEDUCTIBLE.includes(type)) summary.annualDeductibleUsed += days;
    else if (type === 'WFH') summary.wfhUsed += days;
    else if (type === 'Sick') summary.sickUsed += days;
    else summary.otherUsed += days;
  }

  summary.remaining = ANNUAL_DAYS_ALLOTTED - summary.annualDeductibleUsed;
  return summary;
}

async function getMonthOverview(monthName) {
  const shortMap = {
    'january':'Jan','february':'Feb','march':'Mar','april':'Apr',
    'may':'May','june':'Jun','july':'Jul','august':'Aug',
    'september':'Sep','october':'Oct','november':'Nov','december':'Dec',
    'jan':'Jan','feb':'Feb','mar':'Mar','apr':'Apr',
    'jun':'Jun','jul':'Jul','aug':'Aug','sep':'Sep','oct':'Oct','nov':'Nov','dec':'Dec'
  };
  const normalised = shortMap[monthName.toLowerCase()] || monthName;
  if (!MONTH_TABS.includes(normalised)) {
    return { error: `Month "${monthName}" not found. Available: ${MONTH_TABS.join(', ')}` };
  }
  try {
    const records = await fetchMonthData(normalised);
    return {
      month: normalised,
      totalRecords: records.length,
      records: records.map(row => ({
        name: row['Name'],
        startDate: getField(row, 'Date of Action (Start)', 'Date of Action\n(Start)'),
        endDate: getField(row, 'Date of Action (End)', 'Date of Action\n(End)'),
        days: parseFloat(getField(row, 'No. of Days', '# No. of Days') || '1') || 1,
        type: row['Leave Type'] || 'Unknown',
        approval: row['Approval'] || '',
        notes: row['Notes'] || ''
      }))
    };
  } catch (e) {
    return { error: `Failed to load ${normalised}: ${e.message}` };
  }
}

async function getAllEmployeeNames() {
  const allData = await loadAllData();
  const names = new Set();
  for (const rows of Object.values(allData)) {
    for (const row of rows) {
      const name = (row['Name'] || '').trim();
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

async function getWFHViolations() {
  const allData = await loadAllData();
  const violations = [];
  for (const [month, rows] of Object.entries(allData)) {
    const wfhByEmployee = {};
    for (const row of rows) {
      const name = (row['Name'] || '').trim();
      const type = (row['Leave Type'] || '').trim();
      if (!name || type !== 'WFH') continue;
      wfhByEmployee[name] = (wfhByEmployee[name] || 0) + (parseFloat(row['No. of Days']) || 1);
    }
    for (const [name, count] of Object.entries(wfhByEmployee)) {
      if (count > 2) violations.push({ month, name, wfhDays: count });
    }
  }
  return violations;
}

function clearCache() {
  cache.clear();
  console.log('✅ Leave data cache cleared');
}

function getAvailableMonths() {
  return MONTH_TABS;
}

function formatSummaryForSlack(summary) {
  if (!summary) return '❌ No leave records found for this employee.';
  const emoji = summary.remaining >= 15 ? '🟢' : summary.remaining >= 7 ? '🟡' : '🔴';
  const lines = [
    `*📋 Leave Summary: ${summary.name}*`, '',
    `${emoji} *Annual leave remaining:* ${summary.remaining} / ${ANNUAL_DAYS_ALLOTTED} days`,
    `📅 *Annual days used:* ${summary.annualDeductibleUsed} days`,
    `🏠 *WFH days used:* ${summary.wfhUsed} days`,
    `🤒 *Sick days used:* ${summary.sickUsed} days`, '',
    `*Recent records:*`
  ];
  summary.records.slice(-5).reverse().forEach(r => {
    lines.push(`• ${r.startDate} — *${r.type}* (${r.days}d)${r.notes ? ` — _${r.notes}_` : ''}`);
  });
  return lines.join('\n');
}

module.exports = {
  loadAllData, getEmployeeLeave, getEmployeeSummary,
  getMonthOverview, getAllEmployeeNames, getAvailableMonths,
  getWFHViolations, formatSummaryForSlack, clearCache,
  ANNUAL_DAYS_ALLOTTED
};
