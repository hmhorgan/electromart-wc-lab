// ccc.js: the finance math for the ElectroMart CCC app.
// These are plain functions that never touch the page, so they can be
// checked with Node (node -e "const C = require('./ccc.js'); ...").
// Nothing here is rounded; rounding happens only when numbers are displayed.

(function (root) {
  'use strict';

  // Split CSV text into rows of fields. Handles quoted fields with commas.
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(f => f.trim() !== '')) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    row.push(field);
    if (row.some(f => f.trim() !== '')) rows.push(row);
    return rows;
  }

  // Turn rows into objects keyed by the header row.
  function rowsToObjects(rows) {
    const header = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => {
      const obj = {};
      header.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
      return obj;
    });
  }

  // Read a statements CSV (section,item,before,after) into
  // { before: {item: value}, after: {item: value}, sections: {item: section} }.
  function parseStatements(text) {
    const out = { before: {}, after: {}, sections: {} };
    rowsToObjects(parseCSV(text)).forEach(r => {
      out.before[r.item] = Number(r.before);
      out.after[r.item] = Number(r.after);
      out.sections[r.item] = r.section;
    });
    return out;
  }

  // Read assumptions.csv (assumption,value,note) into { name: number }.
  function parseAssumptions(text) {
    const out = {};
    rowsToObjects(parseCSV(text)).forEach(r => { out[r.assumption] = Number(r.value); });
    return out;
  }

  // Days a balance represents: balance / annual flow × days in the year.
  function days(balance, annualFlow, daysInYear) {
    return balance / annualFlow * daysInYear;
  }

  // DIO, DSO, DPO and the cash conversion cycle for one period.
  function cycle(s, daysInYear) {
    const dio = days(s.inventory, s.cogs, daysInYear);           // Inventory / COGS × 365
    const dso = days(s.accounts_receivable, s.revenue, daysInYear); // AR / Revenue × 365
    const dpo = days(s.accounts_payable, s.cogs, daysInYear);    // AP / COGS × 365
    return { dio, dso, dpo, ccc: dio + dso - dpo };
  }

  // Cash freed by each lever, from the balance sheet change.
  // A drop in an asset frees cash; a rise in accounts payable frees cash.
  function cashFreed(before, after) {
    const inventory = before.inventory - after.inventory;
    const receivables = before.accounts_receivable - after.accounts_receivable;
    const payables = after.accounts_payable - before.accounts_payable;
    return { inventory, receivables, payables, total: inventory + receivables + payables };
  }

  // The same cash freed, worked out from the days instead:
  // days changed × annual flow / days in the year. Uses Before revenue and COGS.
  function cashFreedFromDays(cBefore, cAfter, before, daysInYear) {
    const inventory = (cBefore.dio - cAfter.dio) * before.cogs / daysInYear;
    const receivables = (cBefore.dso - cAfter.dso) * before.revenue / daysInYear;
    const payables = (cAfter.dpo - cBefore.dpo) * before.cogs / daysInYear;
    return { inventory, receivables, payables, total: inventory + receivables + payables };
  }

  const api = {
    parseCSV, parseStatements, parseAssumptions,
    days, cycle, cashFreed, cashFreedFromDays
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CCC = api;
})(typeof self !== 'undefined' ? self : this);
