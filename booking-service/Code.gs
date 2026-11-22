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
    let id = props.getProperty('SPREADSHEET_ID');
    if (!id) {
      const sheet = SpreadsheetApp.create('HMM · Workshop and live bookings');
      id = sheet.getId();
      props.setProperty('SPREADSHEET_ID', id);
    }
    const book = SpreadsheetApp.openById(id);
    book.setSpreadsheetTimeZone(ZONE);
    let slots = book.getSheetByName('Sessions');
    if (!slots) {
      slots = book.getSheets()[0];
      slots.setName('Sessions');
    }
    if (!slots.getLastRow()) {
      slots.appendRow(SLOTS).setFrozenRows(1);
      slots.getRange('C2:C').setNumberFormat('yyyy-mm-dd hh:mm');
      slots.getRange('F2:F').setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    }
    let requests = book.getSheetByName('Bookings');
    if (!requests) requests = book.insertSheet('Bookings');
    if (!requests.getLastRow()) {
      requests.appendRow(RECORDS).setFrozenRows(1);
      requests.getRange('I2:I').setNumberFormat('@');
    }
    if (!props.getProperty('HMM_TEAM_EMAIL')) {
      const owner = Session.getEffectiveUser().getEmail();
      if (!email_(owner)) throw new Error('Set HMM_TEAM_EMAIL in Script Properties.');
      props.setProperty('HMM_TEAM_EMAIL', owner);
    }
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'retryMail')) {
      ScriptApp.newTrigger('retryMail').timeBased().everyMinutes(10).create();
    }
    console.log('Booking administration: ' + book.getUrl());
  } finally {
    lock.releaseLock();
  }
}

function book_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));
}
function rows_(sheet, width) {
  const count = sheet.getLastRow() - 1;
  return count > 0 ? sheet.getRange(2, 1, count, width).getValues() : [];
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
function cleanCell_(value) {
  const clean = String(value || '').trim();
  return /^[=+@'-]/.test(clean) ? "'" + clean : clean;
}
function slots_(sheet, reservations, now) {
  const occupied = new Map();
  reservations.forEach(row => {
    if (row[2] === 'workshop') occupied.set(String(row[3]), (occupied.get(String(row[3])) || 0) + 1);
  });
  const rows = rows_(sheet, SLOTS.length);
  const ids = new Set();
  const duplicates = new Set();
  rows.forEach(row => {
    const id = String(row[0]).trim();
    if (ids.has(id)) duplicates.add(id);
    ids.add(id);
  });
  const slots = [];
  rows.forEach(([key, title, start, location, capacity, published]) => {
    const id = String(key).trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || duplicates.has(id) || published !== true || !(start instanceof Date) || !(start > now)) return;
    if (!text_(title, 160) || !text_(location, 240) || !Number.isSafeInteger(capacity) || capacity < 1) return;
    slots.push({ id, title, start: start.toISOString(), day: day_(start), location, left: Math.max(0, capacity - (occupied.get(id) || 0)) });
  });
  return slots.sort((a, b) => a.start.localeCompare(b.start));
}

function doGet() {
  try {
    const book = book_();
    const rows = rows_(book.getSheetByName('Bookings'), RECORDS.length);
    return json_({ ok: true, sessions: slots_(book.getSheetByName('Sessions'), rows, new Date()) });
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
    const book = book_();
    const sheet = book.getSheetByName('Bookings');
    const rows = rows_(sheet, RECORDS.length);
    // A retried HTTP request and a second submission for the same seat consume only one place.
    const sameId = rows.find(r => r[0] === p.requestId);
    if (sameId) return { ok: sameId[5] === email && sameId[2] === p.kind && (p.kind !== 'workshop' || String(sameId[3]) === p.slot), code: 'duplicate' };
    if (p.kind === 'workshop' && rows.some(r => r[2] === 'workshop' && String(r[3]) === p.slot && r[5] === email)) return { ok: true };
    const recent = rows.filter(r => r[5] === email && r[1] instanceof Date && now - r[1] < 3600000);
    if (recent.length >= 5) return { ok: false, code: 'limit' };
    let subject = p.venue, location = p.city, date = p.date;
    if (p.kind === 'workshop') {
      const slot = slots_(book.getSheetByName('Sessions'), rows, now).find(s => s.id === p.slot);
      if (!slot) return { ok: false, code: 'closed' };
      if (!slot.left) return { ok: false, code: 'full' };
      subject = slot.title; location = slot.location;
      date = Utilities.formatDate(new Date(slot.start), ZONE, 'EEE, MMM d, yyyy · h:mm a z');
    }
    // One durable row records both the reservation and the work still to be mailed.
    sheet.appendRow([p.requestId, now, p.kind, cleanCell_(p.kind === 'workshop' ? p.slot : ''), cleanCell_(p.name), cleanCell_(email),
      cleanCell_(subject), cleanCell_(location), cleanCell_(date), cleanCell_(p.kind === 'live' ? p.details : ''), p.kind === 'workshop' ? 'pending' : 'skip', 'pending']);
    SpreadsheetApp.flush();
    return { ok: true, row: sheet.getLastRow() };
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
    const sheet = book_().getSheetByName('Bookings');
    const row = sheet.getRange(rowNumber, 1, 1, RECORDS.length).getValues()[0];
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
        sheet.getRange(rowNumber, column).setValue('sent');
        SpreadsheetApp.flush();
      } catch (_) { /* keep this recipient pending */ }
    }
  } finally { lock.releaseLock(); }
}

function retryMail() {
  const sheet = book_().getSheetByName('Bookings');
  rows_(sheet, RECORDS.length).map((r, i) => ({ index: i + 2, pending: r[10] === 'pending' || r[11] === 'pending' }))
    .filter(r => r.pending).slice(0, 30).forEach(r => deliver_(r.index));
}
