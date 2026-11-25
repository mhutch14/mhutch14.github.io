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

  return { DAY_H, WEEK_H, pad, ymd, parse, addDays, sundayOf, r1, toMin, fromMin, fmt12, calcHrs, calcCIOHrs, calcMinTime,
    PTO_TABLE, annualAccrual, maxAccrual, serviceYears, accAmt, calcAccDate, HOLS, defaultHolidayDates, holidaysFor, holidayOn,
    blankDay, dayPaid, weekDays, weekTotal, floatCheck };
})();
if (typeof module !== 'undefined') module.exports = TimeCore;
else window.TimeCore = TimeCore;
