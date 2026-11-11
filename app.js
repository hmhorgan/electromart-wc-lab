// app.js: loads the CSV files, runs the math in ccc.js and fills in the page.
(function () {
  'use strict';

  const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, minimumFractionDigits: 0 });
  const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const fmtDays = d => d.toFixed(2);
  const fmtMoney = v => { const r = Math.round(v); return (r < 0 ? '−' : '') + dollars.format(Math.abs(r)); };
  const fmtSignedDays = d => (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(2);

  async function loadText(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load ' + path + ' (' + res.status + ')');
    return res.text();
  }

  function cell(text, cls) {
    const td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  }

  function renderCycle(cb, ca) {
    const rows = [
      ['DIO', 'Days inventory outstanding', 'dio'],
      ['DSO', 'Days sales outstanding', 'dso'],
      ['DPO', 'Days payables outstanding', 'dpo'],
      ['CCC', 'Cash conversion cycle', 'ccc']
    ];
    const body = document.querySelector('#cycle-table tbody');
    body.innerHTML = '';
    rows.forEach(([abbr, full, key]) => {
      const tr = document.createElement('tr');
      if (key === 'ccc') tr.className = 'total';
      const name = document.createElement('td');
      name.textContent = abbr;
      const small = document.createElement('span');
      small.className = 'full';
      small.textContent = full;
      name.appendChild(small);
      tr.appendChild(name);
      tr.appendChild(cell(fmtDays(cb[key])));
      tr.appendChild(cell(fmtDays(ca[key])));
      tr.appendChild(cell(fmtSignedDays(ca[key] - cb[key])));
      body.appendChild(tr);
    });
  }

  function renderFreed(before, after, freed, check, diy) {
    const rows = [
      ['Inventory', before.inventory, after.inventory, freed.inventory],
      ['Receivables', before.accounts_receivable, after.accounts_receivable, freed.receivables],
      ['Payables', before.accounts_payable, after.accounts_payable, freed.payables]
    ];
    const body = document.querySelector('#freed-table tbody');
    body.innerHTML = '';
    rows.forEach(([name, b, a, f]) => {
      const tr = document.createElement('tr');
      tr.appendChild(cell(name));
      tr.appendChild(cell(fmtMoney(b)));
      tr.appendChild(cell(fmtMoney(a)));
      tr.appendChild(cell(fmtMoney(f), f > 0 ? 'pos' : f < 0 ? 'neg' : ''));
      body.appendChild(tr);
    });
    const foot = document.querySelector('#freed-table tfoot');
    foot.innerHTML = '';
    const tr = document.createElement('tr');
    tr.appendChild(cell('Total'));
    tr.appendChild(cell(''));
    tr.appendChild(cell(''));
    tr.appendChild(cell(fmtMoney(freed.total), freed.total > 0 ? 'pos' : freed.total < 0 ? 'neg' : ''));
    foot.appendChild(tr);

    document.querySelectorAll('.diy').forEach(el => { el.textContent = diy; });

    const list = document.getElementById('freed-check');
    list.innerHTML = '';
    [
      ['Inventory', check.inventory, freed.inventory],
      ['Receivables', check.receivables, freed.receivables],
      ['Payables', check.payables, freed.payables]
    ].forEach(([name, fromDays, fromBalances]) => {
      const li = document.createElement('li');
      const ok = Math.abs(fromDays - fromBalances) < 0.005;
      li.textContent = name + ' from days: ' + fmtMoney(fromDays) + (ok ? ' ✓ matches the balance change' : ' ✗ does not match ' + fmtMoney(fromBalances));
      list.appendChild(li);
    });
  }

  const fmtPct = r => (r * 100).toFixed(2) + '%';
  const moneyClass = v => (Math.round(v) > 0 ? 'pos' : Math.round(v) < 0 ? 'neg' : '');

  function fillRows(selector, rows) {
    const body = document.querySelector(selector);
    body.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      if (r.cls) tr.className = r.cls;
      r.cells.forEach(c => tr.appendChild(Array.isArray(c) ? cell(c[0], c[1]) : cell(c)));
      body.appendChild(tr);
    });
  }

  function setupLevers(stmts, a, cb, ca) {
    const before = stmts.before;
    const keys = ['dio', 'dso', 'dpo'];
    const inputs = {};
    keys.forEach(k => {
      const el = document.getElementById(k);
      // Range big enough for Before, After and well beyond.
      el.max = String(Math.max(60, Math.ceil(2 * Math.max(cb[k], ca[k]) / 10) * 10));
      inputs[k] = el;
      el.addEventListener('input', update);
    });

    // Results at Before days, for the comparison column.
    const base = CCC.leverResults({ dio: cb.dio, dso: cb.dso, dpo: cb.dpo }, before, a);
    const netDays = num.format(a.net_days);
    const discPct = num.format(a.supplier_discount * 100);
    const fmtDisc = c => (c === null ? 'Takes discount' : fmtPct(c));

    function setTo(c) {
      keys.forEach(k => { inputs[k].value = String(c[k]); });
      update();
    }

    function update() {
      const d = {};
      keys.forEach(k => {
        d[k] = Number(inputs[k].value);
        document.getElementById(k + '-out').textContent = fmtDays(d[k]) + ' days';
      });
      const r = CCC.leverResults(d, before, a);

      fillRows('#lever-ccc tbody', [{
        cls: 'total',
        cells: ['CCC (days)', fmtDays(base.ccc), fmtDays(r.ccc), fmtSignedDays(r.ccc - base.ccc)]
      }]);

      fillRows('#lever-bal tbody', [
        ['Inventory', before.inventory, r.balances.inventory, r.freed.inventory],
        ['Receivables', before.accounts_receivable, r.balances.accounts_receivable, r.freed.receivables],
        ['Payables', before.accounts_payable, r.balances.accounts_payable, r.freed.payables]
      ].map(([n, b, s, f]) => ({ cells: [n, fmtMoney(b), fmtMoney(s), [fmtMoney(f), moneyClass(f)]] })));
      const foot = document.querySelector('#lever-bal tfoot');
      foot.innerHTML = '';
      const tr = document.createElement('tr');
      ['Total', '', ''].forEach(t => tr.appendChild(cell(t)));
      tr.appendChild(cell(fmtMoney(r.freed.total), moneyClass(r.freed.total)));
      foot.appendChild(tr);

      fillRows('#lever-bank tbody', [
        { cells: ['Interest saved per year*', fmtMoney(base.interestSaved), [fmtMoney(r.interestSaved), moneyClass(r.interestSaved)]] },
        { cells: ['Days paid past net ' + netDays, fmtDays(base.daysPastDue), fmtDays(r.daysPastDue)] },
        { cells: ['Annual cost of skipping the ' + discPct + '% discount', fmtDisc(base.discountCost), fmtDisc(r.discountCost)] }
      ]);

      let note = '*Assumes every freed dollar pays down the bank line at ' + fmtPct(a.bank_rate) +
        ', up to its Before balance of ' + fmtMoney(before.notes_payable) +
        '. In the case, ElectroMart kept part of the cash, so its actual saving is smaller. ' +
        'A negative number means ElectroMart must borrow more and pays extra interest.';
      if (r.payDownCapped) note += ' Cash freed is more than the bank line, so the saving is capped.';
      note += ' Discount cost = d / (1 − d) × ' + num.format(a.days_in_year) +
        ' / (days paid − ' + num.format(a.discount_days) + '). If DPO is ' +
        num.format(a.discount_days) + ' days or less, ElectroMart takes the discount.';
      document.getElementById('lever-note').textContent = note;
    }

    document.getElementById('set-before').addEventListener('click', () => setTo(cb));
    document.getElementById('set-after').addEventListener('click', () => setTo(ca));
    setTo(cb);
  }

  async function main() {
    const status = document.getElementById('status');
    try {
      const [stmtText, assumText] = await Promise.all([
        loadText('data/electromart.csv'),
        loadText('data/assumptions.csv')
      ]);
      const stmts = CCC.parseStatements(stmtText);
      const a = CCC.parseAssumptions(assumText);
      const diy = a.days_in_year;

      const cb = CCC.cycle(stmts.before, diy);
      const ca = CCC.cycle(stmts.after, diy);
      const freed = CCC.cashFreed(stmts.before, stmts.after);
      const check = CCC.cashFreedFromDays(cb, ca, stmts.before, diy);

      renderCycle(cb, ca);
      renderFreed(stmts.before, stmts.after, freed, check, num.format(diy));
      document.getElementById('cycle-note').textContent =
        'Uses a ' + num.format(diy) + '-day year. CCC = DIO + DSO − DPO. A shorter cycle means each dollar is tied up for fewer days.';

      setupLevers(stmts, a, cb, ca);

      status.hidden = true;
      document.getElementById('cycle-section').hidden = false;
      document.getElementById('freed-section').hidden = false;
      document.getElementById('lever-section').hidden = false;
    } catch (err) {
      status.textContent = err.message + '. Open the app through a web server (such as GitHub Pages), not by double-clicking the file.';
      status.className = 'status error';
    }
  }

  main();
})();
