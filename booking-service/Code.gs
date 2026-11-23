// Install in a standalone Apps Script project owned by HMM. The spreadsheet is private.
const ZONE = 'America/Toronto';
const SLOTS = ['ID', 'Workshop', 'Starts (Ottawa)', 'Location', 'Capacity', 'Published'];
const RECORDS = ['Request ID', 'Received', 'Type', 'Workshop ID', 'Name', 'Email', 'Workshop or venue', 'Location or city', 'Event date', 'Details', 'Participant email', 'Team email'];
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

function setup() {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!props.getProperty('SPREADSHEET_ID')) {
      const columns = values => ({ values: values.map(s => ({ userEnteredValue: { stringValue: s } })) });
      const tab = (title, headers) => ({
        properties: { title, gridProperties: { frozenRowCount: 1 } },
        data: [{ rowData: [columns(headers)] }]
      });
      const book = Sheets.Spreadsheets.create({
        properties: { title: 'HMM · Workshop and live bookings', timeZone: ZONE },
        sheets: [tab('Sessions', SLOTS), tab('Bookings', RECORDS)]
      });
      props.setProperty('SPREADSHEET_ID', book.spreadsheetId);
    }
    const id = databaseId_();
    const book = Sheets.Spreadsheets.get(id, { fields: 'spreadsheetUrl,sheets(properties(sheetId,title))' });
    const sheetId = book.sheets.find(s => s.properties.title === 'Sessions').properties.sheetId;
    const range = column => ({ sheetId, startRowIndex: 1, startColumnIndex: column, endColumnIndex: column + 1 });
    Sheets.Spreadsheets.batchUpdate({ requests: [
      { repeatCell: { range: range(2), cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm' } } }, fields: 'userEnteredFormat.numberFormat' } },
      { setDataValidation: { range: range(5), rule: { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true } } }
    ] }, id);
    if (!props.getProperty('HMM_TEAM_EMAIL')) {
      const owner = Session.getEffectiveUser().getEmail();
      if (!email_(owner)) throw new Error('Set HMM_TEAM_EMAIL in Script Properties.');
      props.setProperty('HMM_TEAM_EMAIL', owner);
    }
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'retryMail')) {
      ScriptApp.newTrigger('retryMail').timeBased().everyMinutes(10).create();
    }
    console.log('Booking administration: ' + book.spreadsheetUrl);
  } finally {
    lock.releaseLock();
  }
}

function databaseId_() {
  return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
}
function readRows_(range) {
  return Sheets.Spreadsheets.Values.get(databaseId_(), range, { valueRenderOption: 'UNFORMATTED_VALUE' }).values || [];
}
function appendBooking_(row) {
  const output = Sheets.Spreadsheets.Values.append({ values: [row] }, databaseId_(), 'Bookings!A:L',
    { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
  return Number(output.updates.updatedRange.match(/![A-Z]+(\d+)/)[1]);
}
function markSent_(column, number) {
  Sheets.Spreadsheets.Values.update({ values: [['sent']] }, databaseId_(), 'Bookings!' + column + number, { valueInputOption: 'RAW' });
}
// Sheets serial dates are wall-clock dates in the spreadsheet timezone.
function ottawaStart_(serial) {
  if (typeof serial !== 'number' || serial <= 0 || serial > 2958465) return null;
  const wallTime = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
  const local = wallTime.toISOString().slice(0, 19).replace('T', ' ');
  return Utilities.parseDate(local, ZONE, 'yyyy-MM-dd HH:mm:ss');
}
function json_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function day_(date) { return Utilities.formatDate(date, ZONE, 'yyyy-MM-dd'); }
function email_(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(value);
}
function text_(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function date_(value, today) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < today) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function slots_(reservations, now) {
  const occupied = new Map();
  reservations.forEach(row => {
    if (row[2] === 'workshop') occupied.set(String(row[3]), (occupied.get(String(row[3])) || 0) + 1);
  });
  const rows = readRows_('Sessions!A2:F');
  const ids = new Set();
  const duplicates = new Set();
  rows.forEach(row => {
    const id = String(row[0]).trim();
    if (ids.has(id)) duplicates.add(id);
    ids.add(id);
  });
  const slots = [];
  rows.forEach(([key, title, serial, location, capacity, published]) => {
    const start = ottawaStart_(serial);
    const id = String(key).trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || duplicates.has(id) || published !== true || !(start instanceof Date) || !(start > now)) return;
    if (!text_(title, 160) || !text_(location, 240) || !Number.isSafeInteger(capacity) || capacity < 1) return;
    slots.push({ id, title, start: start.toISOString(), day: day_(start), location, left: Math.max(0, capacity - (occupied.get(id) || 0)) });
  });
  return slots.sort((a, b) => a.start.localeCompare(b.start));
}

function doGet() {
  try {
    const rows = readRows_('Bookings!A2:D');
    return json_({ ok: true, sessions: slots_(rows, new Date()) });
  } catch (_) {
    return json_({ ok: false, code: 'unavailable' });
  }
}

function valid_(p, now) {
  if (!p || typeof p.requestId !== 'string' || !UUID.test(p.requestId) || !text_(p.name, 90) || !email_(p.email)) return false;
  if (p.kind === 'workshop') return typeof p.slot === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(p.slot);
  return p.kind === 'live' && text_(p.venue, 150) && text_(p.city, 100) && date_(p.date, day_(now)) &&
    (p.details === undefined || (typeof p.details === 'string' && p.details.length <= 1200 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(p.details)));
}

function reserve_(p) {
  const now = new Date();
  if (!valid_(p, now)) return { ok: false, code: 'invalid' };
  const email = p.email.trim().toLowerCase();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, code: 'busy' };
  try {
    const rows = readRows_('Bookings!A2:L');
    // A retried HTTP request and a second submission for the same seat consume only one place.
    const sameId = rows.find(r => r[0] === p.requestId);
    if (sameId) return { ok: sameId[5] === email && sameId[2] === p.kind && (p.kind !== 'workshop' || String(sameId[3]) === p.slot), code: 'duplicate' };
    if (p.kind === 'workshop' && rows.some(r => r[2] === 'workshop' && String(r[3]) === p.slot && r[5] === email)) return { ok: true };
    const recent = rows.filter(r => r[5] === email && now - Date.parse(r[1]) < 3600000);
    if (recent.length >= 5) return { ok: false, code: 'limit' };
    let subject = p.venue, location = p.city, date = p.date;
    if (p.kind === 'workshop') {
      const slot = slots_(rows, now).find(s => s.id === p.slot);
      if (!slot) return { ok: false, code: 'closed' };
      if (!slot.left) return { ok: false, code: 'full' };
      subject = slot.title; location = slot.location;
      date = Utilities.formatDate(new Date(slot.start), ZONE, 'EEE, MMM d, yyyy · h:mm a z');
    }
    // One durable row records both the reservation and the work still to be mailed.
    const row = appendBooking_([p.requestId, now.toISOString(), p.kind, p.kind === 'workshop' ? p.slot : '', p.name.trim(), email,
      subject.trim(), location.trim(), date, p.kind === 'live' ? (p.details || '').trim() : '', p.kind === 'workshop' ? 'pending' : 'skip', 'pending']);
    return { ok: true, row };
  } finally {
    lock.releaseLock();
  }
}

function doPost(event) {
  let p;
  try {
    if (!event.postData || event.postData.contents.length > 5000) return json_({ ok: false, code: 'invalid' });
    p = JSON.parse(event.postData.contents);
  } catch (_) { return json_({ ok: false, code: 'invalid' }); }
  try {
    const result = reserve_(p);
    if (result.row) {
      // A temporary mail failure leaves the record available to the retry trigger.
      try { deliver_(result.row); } catch (_) { /* retryMail will pick it up */ }
    }
    return json_(result.ok ? { ok: true } : { ok: false, code: result.code });
  } catch (_) { return json_({ ok: false, code: 'unavailable' }); }
}

function deliver_(rowNumber) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const row = readRows_('Bookings!A' + rowNumber + ':L' + rowNumber)[0];
    if (!row) return;
    const [id, , kind, , name, email, title, location, date, details] = row;
    const team = PropertiesService.getScriptProperties().getProperty('HMM_TEAM_EMAIL');
    if (!email_(team)) return;
    const workshop = kind === 'workshop';
    const summary = [title, String(date), location].join('\n');
    const teamBody = [workshop ? 'New workshop reservation' : 'Live performance request — date pending', '', summary, '', name, email, details || '', '', 'Reference ' + id].join('\n');
    const confirmation = ['Hi ' + name + ',', '', 'Your place at the HMM workshop is confirmed.', '', summary, '', 'Reply to this email if you need to change your booking.', '', 'Brain Waves × Majorquad', 'Humans Making Music'].join('\n');
    const emails = [
      [11, { to: email, replyTo: team, subject: 'HMM workshop confirmation · ' + title, body: confirmation }],
      [12, { to: team, replyTo: email, subject: workshop ? 'HMM · Workshop reservation' : 'HMM · Live performance request', body: teamBody }]
    ];
    for (const [column, message] of emails) {
      if (row[column - 1] !== 'pending' || MailApp.getRemainingDailyQuota() === 0) continue;
      try {
        MailApp.sendEmail({ ...message, name: 'Humans Making Music' });
        markSent_(column === 11 ? 'K' : 'L', rowNumber);
      } catch (_) { /* keep this recipient pending */ }
    }
  } finally { lock.releaseLock(); }
}

function retryMail() {
  readRows_('Bookings!K2:L').map((r, i) => ({ index: i + 2, pending: r[0] === 'pending' || r[1] === 'pending' }))
    .filter(r => r.pending).slice(0, 30).forEach(r => deliver_(r.index));
}
