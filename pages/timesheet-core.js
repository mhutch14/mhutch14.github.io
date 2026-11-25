/*
 * TimeSheet logic with no DOM access: hour rounding (6-minute units), lunch deduction,
 * clock-out targets, PTO accrual, holidays and holiday floating. Ported from the original
 * Excel/VBA workbook. Loaded by pages/timesheet.html (as window.TimeCore) and required by
 * tests/unit/timesheet-core.test.js. Times are minutes after midnight; dates are "YYYY-MM-DD".
 */
const TimeCore = (() => {
  const DAY_H = 8, WEEK_H = 40;
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const sundayOf = s => addDays(s, -parse(s).getDay());
  const r1 = x => Math.round(x * 10) / 10;
  const toMin = s => { if (!s) return null; const m = /^(\d{1,2}):(\d{2})/.exec(s); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const fromMin = m => (m == null ? '' : pad(Math.floor(m / 60)) + ':' + pad(m % 60));
  const fmt12 = m => {
    if (m == null) return '';
    const h = Math.floor(m / 60) % 24, mi = m % 60, ap = h >= 12 ? 'PM' : 'AM';
    return ((h % 12) || 12) + ':' + pad(mi) + ' ' + ap;
  };

  /* ---- hours: 6-minute (tenth-hour) units, exactly as calcHrs in the workbook ---- */
  const unit = m => Math.floor((m - 3) / 6);
  function calcHrs(inM, outM, wtl, lunchM) {
    const inI = unit(inM), outI0 = unit(outM);
    let outI = outI0;
    if ((((inM - 3) % 6) + 6) % 6 === 0) outI += 1;       // clock-in exactly on a unit boundary
    const t = outI - inI;                                   // tenths of an hour
    if (lunchM == null || wtl) return t / 10;
    const lunchEnd = lunchM + 30;
    if (inM > lunchEnd || outM < lunchM) return t / 10;     // lunch window not touched
    if (outM > lunchM && outM < lunchEnd) return (t - (outI0 - unit(lunchM))) / 10; // left during lunch
    return (t - 5) / 10;                                    // full 30-minute lunch
  }
  // hours lost while clocked out (calcCIOHrs): no lunch logic
  const calcCIOHrs = (outM, inM) => (unit(inM) - unit(outM)) / 10;
  // earliest minute at which `hrs` hours have been reached (calcMinTime)
  function calcMinTime(inM, hrs, wtl, lunchM) {
    let max = 0, i = 0, out = null;
    while (max <= hrs - 0.001) {
      i++; out = inM + i;
      if (out > 1439) return null;
      max = calcHrs(inM, out, wtl, lunchM);
    }
    return out;
  }

  /* ---- PTO accrual ---- */
  const PTO_TABLE = [[10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], [11, 11, 12, 11, 11, 12, 11, 11, 12, 11, 11, 12], [11, 11, 12, 11, 11, 12, 11, 11, 12, 11, 11, 12], [13, 13, 12, 13, 13, 12, 13, 13, 12, 13, 13, 12], [13, 13, 12, 13, 13, 12, 13, 13, 12, 13, 13, 12], [13, 13, 14, 13, 13, 14, 13, 13, 14, 13, 13, 14], [13, 13, 14, 13, 13, 14, 13, 13, 14, 13, 13, 14], [13, 13, 14, 13, 13, 14, 13, 13, 14, 13, 13, 14], [13, 13, 14, 13, 13, 14, 13, 13, 14, 13, 13, 14], [13, 13, 14, 13, 13, 14, 13, 13, 14, 13, 13, 14], [15, 15, 14, 15, 15, 14, 15, 15, 14, 15, 15, 14], [15, 15, 14, 15, 15, 14, 15, 15, 14, 15, 15, 14], [15, 15, 14, 15, 15, 14, 15, 15, 14, 15, 15, 14], [15, 15, 14, 15, 15, 14, 15, 15, 14, 15, 15, 14], [15, 15, 14, 15, 15, 14, 15, 15, 14, 15, 15, 14], [15, 15, 16, 15, 15, 16, 15, 15, 16, 15, 15, 16], [15, 15, 16, 15, 15, 16, 15, 15, 16, 15, 15, 16], [15, 15, 16, 15, 15, 16, 15, 15, 16, 15, 15, 16], [15, 15, 16, 15, 15, 16, 15, 15, 16, 15, 15, 16], [15, 15, 16, 15, 15, 16, 15, 15, 16, 15, 15, 16]];
  const PTO_EXTRA = [17, 17, 18, 17, 17, 18, 17, 17, 18, 17, 17, 18];       // 20+ years (208 h / yr)
  const annualAccrual = y => y <= 0 ? 120 : y <= 2 ? 136 : y <= 4 ? 152 : y <= 9 ? 160 : y <= 14 ? 176 : y <= 19 ? 184 : 208;
  const maxAccrual = a => a * 1.5;
  const serviceYears = (hireStr, todayStr) => parse(todayStr).getFullYear() - parse(hireStr).getFullYear();
  const accAmt = (month1, years) => { const row = PTO_TABLE[Math.max(0, years)] || PTO_EXTRA; return row[month1 - 1]; };
  // PTO accrues on the Friday ending the first full (Sun–Sat) week of the month
  function calcAccDate(todayStr) {
    const t = parse(todayStr);
    let m = t.getMonth(), y = t.getFullYear();
    for (;;) {
      const wd = new Date(y, m, 1).getDay();
      const fm = new Date(y, m, 1 + (wd === 0 ? 0 : 7 - wd) + 5);
      if (t > fm) { m++; if (m > 11) { m = 0; y++; } } else return ymd(fm);
    }
  }

  /* ---- holidays ---- */
  const HOLS = [
    ['newyear', "New Year's Day", false], ['goodfriday', 'Good Friday', true], ['memorial', 'Memorial Day', true],
    ['july4', 'Independence Day', true], ['labor', 'Labor Day', true], ['columbus', 'Columbus Day', true],
    ['veterans', 'Veterans Day', true], ['thanksgiving', 'Thanksgiving', false], ['christmas', 'Christmas', false]];
  const nth = (y, mo, wd, n) => { const f = new Date(y, mo, 1).getDay(); return new Date(y, mo, 1 + ((wd - f + 7) % 7) + 7 * (n - 1)); };
  const lastMon = (y, mo) => { const l = new Date(y, mo + 1, 0); return new Date(y, mo, l.getDate() - ((l.getDay() - 1 + 7) % 7)); };
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da);
  }
  function defaultHolidayDates(y) {
    const ge = easter(y); ge.setDate(ge.getDate() - 2);
    let vet = new Date(y, 10, 11); if (vet.getDay() === 6) vet.setDate(10); else if (vet.getDay() === 0) vet.setDate(12);
    const tg = nth(y, 10, 4, 4), tg2 = new Date(tg); tg2.setDate(tg.getDate() + 1);
    const m = {
      newyear: [new Date(y, 0, 1)], goodfriday: [ge], memorial: [lastMon(y, 4)], july4: [new Date(y, 6, 4)],
      labor: [nth(y, 8, 1, 1)], columbus: [nth(y, 9, 1, 2)], veterans: [vet], thanksgiving: [tg, tg2], christmas: [new Date(y, 11, 25)]
    };
    const out = {};
    for (const k in m) out[k] = [ymd(m[k][0]), ymd(m[k][m[k].length - 1])];
    return out;
  }
  // edits: { [year]: { key: [start,end] } }
  function holidaysFor(y, edits) {
    const base = defaultHolidayDates(y), ed = (edits && edits[y]) || {};
    return HOLS.map(([key, name, floatable]) => {
      const r = ed[key] || base[key];
      return { key, name, floatable, start: r[0], end: r[1], edited: !!ed[key] };
    });
  }
  function holidayOn(dateStr, edits) {
    const y = +dateStr.slice(0, 4);
    return holidaysFor(y, edits).find(h => dateStr >= h.start && dateStr <= h.end) || null;
  }

  /* ---- week maths ---- */
  const blankDay = () => ({ in: null, out: null, wtl: false, lost: 0, breaks: [], hw: false });
  function dayPaid(day, hol, lunch) {
    if (hol && !day.hw) return { paid: DAY_H, kind: 'holiday' };
    if (day.in == null || day.out == null) return { paid: null, kind: 'empty' };
    if (day.out < day.in) return { paid: null, kind: 'invalid' };
    const h = r1(calcHrs(day.in, day.out, day.wtl, lunch) - (day.lost || 0));
    return { paid: h > 0 ? h : null, kind: 'work' };
  }
  function weekDays(week, lunch, edits) {
    return week.days.map((d, i) => {
      const date = addDays(week.sunday, i), hol = holidayOn(date, edits);
      return Object.assign({ i, date, d, hol }, dayPaid(d, hol, lunch));
    });
  }
  const weekTotal = days => r1(days.reduce((s, x) => s + (x.paid || 0), 0));

  // Holiday "floating": a floatable holiday week with >=44 paid hours banks the holiday and costs max(0, 48 - hours) PTO
  function floatCheck(days, banked) {
    const total = weekTotal(days), out = [];
    if (total < 44) return out;
    const seen = new Set();
    for (const x of days) {
      if (!x.hol || x.d.hw || !x.hol.floatable || seen.has(x.hol.key)) continue;
      seen.add(x.hol.key);
      const y = +x.hol.start.slice(0, 4);
      if (banked && banked[y] && banked[y][x.hol.key]) continue;
      out.push({ key: x.hol.key, name: x.hol.name, year: y, lostPto: Math.max(0, r1(48 - total)) });
    }
    return out;
  }

  const shortDate = s => { const d = parse(s); return (d.getMonth() + 1) + '/' + d.getDate(); };

  /* ---- saved state ---- */
  function defaultState() {
    return {
      v: 1,
      user: { hire: null, lunch: 660, ptoBank: null, planWTL: true, planDept: 960, autoStart: false, wtlDefault: false },
      week: { sunday: null, days: Array.from({ length: 7 }, () => blankDay()) },
      acc: { date: null, amt: 0, check: true, pending: null },
      hol: { edits: {}, banked: {} },
      archive: [], pto: [],
      planner: { sched: [8, 8, 8, 8], coming: [420, 420, 420, 420, 420], target: 40.1, wtl: false },
      lastYear: null, lastBackup: null
    };
  }
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  // fill in anything missing from a saved/backup state with defaults, keeping unknown keys
  function mergeState(def, src) {
    if (!isObj(def) || !isObj(src)) return src === undefined ? def : src;
    const out = {}; for (const k in def) out[k] = k in src ? mergeState(def[k], src[k]) : def[k];
    for (const k in src) if (!(k in out)) out[k] = src[k];
    return out;
  }

  /* ---- WTL for the whole week ---- */
  const newWeek = (sunday, wtl) => ({ sunday, days: Array.from({ length: 7 }, () => Object.assign(blankDay(), { wtl: !!wtl })) });
  function setWeekWtl(week, on) { week.days.forEach(d => { d.wtl = !!on; }); return week; }
  const allWtl = week => week.days.every(d => !!d.wtl);

  /* ---- archive ---- */
  // one archive row per worked day; holidays you didn't work are not archived (as in the workbook)
  function archiveEntries(week, lunch, edits, pto) {
    return weekDays(week, lunch, edits).filter(x => x.d.in != null && !(x.hol && !x.d.hw))
      .map(x => ({ date: x.date, in: x.d.in, out: x.d.out, hrs: x.paid, pto }));
  }
  // insert or replace by date, keeping the list sorted (mutates and returns `a`)
  function upsertArchive(a, e) {
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].date < e.date) lo = m + 1; else hi = m; }
    if (a[lo] && a[lo].date === e.date) {
      const o = a[lo]; if (o.in !== e.in || o.out !== e.out || o.hrs !== e.hrs || o.pto !== e.pto) a[lo] = e;
    } else a.splice(lo, 0, e);
    return a;
  }

  /* ---- closing out a week ---- */
  function closeout(week, lunch, edits, banked) {
    const days = weekDays(week, lunch, edits), total = weekTotal(days);
    return { days, total, short: total < WEEK_H ? r1(WEEK_H - total) : 0, floats: floatCheck(days, banked) };
  }
  // what closing out does to the PTO bank: floated holidays first, then (if chosen) PTO for a short week
  function applyCloseout(c, bank, usePto, sunday) {
    const log = [], bankKeys = c.floats.map(f => ({ year: f.year, key: f.key }));
    for (const f of c.floats) {
      if (bank != null && f.lostPto > 0) { bank = r1(bank - f.lostPto); log.push({ type: 'float', hrs: -f.lostPto, bank, note: 'Floated ' + f.name }); }
      else log.push({ type: 'float', hrs: 0, bank, note: 'Floated ' + f.name });
    }
    if (usePto && bank != null && c.short > 0) { bank = r1(bank - c.short); log.push({ type: 'use', hrs: -c.short, bank, note: 'Covered ' + c.short.toFixed(1) + ' h short week of ' + shortDate(sunday) }); }
    return { bank, log, bankKeys };
  }

  /* ---- PTO accrual ---- */
  // run on every check: when an accrual date passes (and PTO is tracked) it becomes `pending` until you add or dismiss it
  function accrualCheck(acc, hire, bank, today) {
    if (!hire) return acc;
    const a = Object.assign({}, acc);
    if (bank != null) {
      if (a.date && today >= a.date) { if (a.check && !a.pending) a.pending = { date: a.date, amt: a.amt }; }
      else a.check = true;
    }
    a.date = calcAccDate(today); a.amt = accAmt(parse(a.date).getMonth() + 1, serviceYears(hire, today));
    return a;
  }
  function applyAccrual(bank, amt, hire, today) {
    const max = maxAccrual(annualAccrual(serviceYears(hire, today)));
    let nb = r1(bank + amt), capped = false;
    if (nb > max) { nb = max; capped = true; }
    return { bank: nb, added: r1(nb - bank), capped, max };
  }

  /* ---- clock-out targets for today ---- */
  // td: today's entry from weekDays; ahead: week hours vs. 8 h/day so far; nm: now (minutes)
  function targets(td, ahead, nm, planDept, planWTL, lunch) {
    if (!td || td.d.in == null) return null;
    const inM = td.d.in, w = td.d.wtl, T = {};
    T.full = calcMinTime(inM, DAY_H, w, lunch); T.fullH = T.full != null ? r1(calcHrs(inM, T.full, w, lunch)) : null;
    T.need = r1((td.paid || 0) - ahead);
    const raw = calcMinTime(inM, T.need, w, lunch);
    T.evenState = raw == null ? (T.need > 0.001 ? 'unreachable' : 'ahead') : (nm > raw ? 'ahead' : 'time');
    T.even = T.evenState === 'time' ? raw : null; T.evenH = T.even != null ? r1(calcHrs(inM, T.even, w, lunch)) : null;
    T.planH = planDept != null ? r1(calcHrs(inM, planDept, planWTL, lunch)) : null;
    T.prog = planDept > inM ? Math.min(1, Math.max(0, (nm - inM) / (planDept - inM))) : 0;
    return T;
  }

  /* ---- week planner ---- */
  // Mon-Thu scheduled hours; Friday is whatever is left of the target. Returns leave times per day.
  function plan(planner, lunch) {
    const sum4 = r1(planner.sched.slice(0, 4).reduce((s, v) => s + v, 0)), fri = r1(planner.target - sum4);
    const sched = [0, 1, 2, 3, 4].map(i => i < 4 ? planner.sched[i] : fri);
    const leave = sched.map((h, i) => planner.coming[i] != null && h > 0 ? calcMinTime(planner.coming[i], h, planner.wtl, lunch) : null);
    return { sum4, fri, sched, leave };
  }

  /* ---- importing pasted rows (Excel or CSV) ---- */
  function parseTimeLoose(s) {
    s = String(s == null ? '' : s).trim(); if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?\.?[Mm]?\.?$/.exec(s);
    if (m) { let h = +m[1]; if (m[3]) { h %= 12; if (/p/i.test(m[3])) h += 12; } return h * 60 + +m[2]; }
    const f = parseFloat(s); if (!isNaN(f) && f > 0 && f < 1) return Math.round(f * 1440);   // Excel time fraction
    return null;
  }
  function parseDateLoose(s) {
    s = String(s || '').trim(); let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return ymd(new Date(+m[1], m[2] - 1, +m[3]));
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s); if (m) { let y = +m[3]; if (y < 100) y += 2000; return ymd(new Date(y, m[1] - 1, +m[2])); }
    const n = parseFloat(s); if (n > 20000 && n < 80000) return ymd(new Date(1899, 11, 30 + Math.floor(n)));   // Excel serial date
    return null;
  }
  function parseImport(text) {
    const out = [];
    String(text).split(/\r?\n/).forEach(line => {
      if (!line.trim()) return; const c = line.includes('\t') ? line.split('\t') : line.split(',');
      const d = parseDateLoose(c[0]); if (!d) return;
      const num = x => { const f = parseFloat(x); return isNaN(f) ? null : f; };
      out.push({ date: d, in: parseTimeLoose(c[1]), out: parseTimeLoose(c[2]), hrs: num(c[3]), pto: num(c[4]) });
    });
    return out;
  }

  return { DAY_H, WEEK_H, pad, ymd, parse, addDays, sundayOf, r1, toMin, fromMin, fmt12, calcHrs, calcCIOHrs, calcMinTime,
    PTO_TABLE, annualAccrual, maxAccrual, serviceYears, accAmt, calcAccDate, HOLS, defaultHolidayDates, holidaysFor, holidayOn,
    blankDay, dayPaid, weekDays, weekTotal, floatCheck, shortDate, defaultState, mergeState, newWeek, setWeekWtl, allWtl,
    archiveEntries, upsertArchive, closeout, applyCloseout, accrualCheck, applyAccrual, targets, plan,
    parseTimeLoose, parseDateLoose, parseImport };
})();
if (typeof module !== 'undefined') module.exports = TimeCore;
else window.TimeCore = TimeCore;
