import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const script = readFileSync(new URL('../booking-service/Code.gs', import.meta.url), 'utf8');
function environment() {
  const rows = [Array(12).fill('Header')];
  const slotRows = [[], ['ableton-01', 'Ableton Live', (Date.UTC(2099, 11, 1, 20) - Date.UTC(1899, 11, 30)) / 86400000, 'Ottawa studio', 1, true]];
  const messages = [];
  const fake = {
    Date, console,
    Utilities: { parseDate: s => new Date(s.replace(' ', 'T') + '-05:00'), formatDate: (d, zone, pattern) => pattern === 'yyyy-MM-dd' ? new Intl.DateTimeFormat('sv-SE', {timeZone:zone}).format(d) : d.toISOString() },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => k === 'HMM_TEAM_EMAIL' ? 'bookings@example.org' : 'private-id' }) },
    Sheets: { Spreadsheets: { Values: {
      get: (_id, range) => {
        if (range === 'Sessions!A2:F') return { values: slotRows.slice(1) };
        if (range === 'Bookings!K2:L') return { values: rows.slice(1).map(r => r.slice(10)) };
        if (range === 'Bookings!A2:L' || range === 'Bookings!A2:D') return { values: rows.slice(1) };
        const n = Number(range.match(/!A(\d+):/)[1]);
        return { values: [rows[n - 1]] };
      },
      append: (body, _id, _range, options) => {
        assert.equal(options.valueInputOption, 'RAW');
        rows.push(body.values[0]);
        return { updates: { updatedRange: 'Bookings!A' + rows.length + ':L' + rows.length } };
      },
      update: (body, _id, range) => {
        const [, col, n] = range.match(/!([KL])(\d+)/);
        rows[n - 1][col === 'K' ? 10 : 11] = body.values[0][0];
      }
    } } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    MailApp: { getRemainingDailyQuota: () => 50, sendEmail: m => messages.push(m) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: raw => ({ setMimeType: () => JSON.parse(raw) }) }
  };
  vm.createContext(fake);
  vm.runInContext(script, fake);
  const post = p => fake.doPost({postData: {contents: JSON.stringify(p)}});
  return { fake, rows, slotRows, messages, post };
}
const seat = () => ({ requestId: randomUUID(), kind: 'workshop', slot: 'ableton-01', name: 'Test Musician', email:'test@example.org' });

test('A reservation consumes the last seat once and sends the participant and team confirmations', () => {
  const {fake, post, rows, messages} = environment();
  const p = seat();
  assert.equal(fake.doGet().sessions[0].day, '2099-12-01');
  assert.equal(post(p).ok, true);
  assert.equal(post(p).ok, true);
  assert.equal(post({...p,requestId:randomUUID()}).ok, true);
  assert.equal(rows.length, 2);
  assert.equal(messages.length, 2);
  assert.match(messages[0].body,/Ableton Live[\s\S]*Ottawa studio/);
  assert.equal(fake.doGet().sessions[0].left, 0);
  assert.equal(post({...p,requestId:randomUUID(),email:'other@example.org'}).code, 'full');
  assert.equal(JSON.stringify(fake.doGet()).includes(p.email), false);
});
test('Retries deliver only outstanding mail and keep the reservation', () => {
  const {fake, post, rows, messages} = environment();
  const send = fake.MailApp.sendEmail;
  fake.MailApp.sendEmail = m => { if (m.to === 'test@example.org') throw Error('quota'); send(m); };
  assert.equal(post(seat()).ok, true);
  assert.equal(rows[1][10], 'pending');
  assert.equal(rows[1][11], 'sent');
  fake.MailApp.sendEmail = send;
  fake.retryMail(); fake.retryMail();
  assert.equal(messages.length, 2);
  assert.equal(rows[1][10], 'sent');
});
test('Live requests and validation are independent of workshop inventory', () => {
  const {fake, post, rows, messages, slotRows} = environment();
  slotRows[1][5] = false;
  assert.equal(post(seat()).code, 'closed');
  const p = {...seat(),kind:'live',venue:'Test venue',city:'Ottawa',date:'2099-12-01',details:'Hybrid set'};
  assert.equal(post({...p,date:'2099-02-31'}).code,'invalid');
  assert.equal(post({...p,email:'one@example.org,two@example.org'}).code,'invalid');
  assert.equal(post(p).ok, true);
  assert.equal(post(p).ok, true);
  assert.equal(rows.length, 2);
  assert.equal(messages.length, 1);
  assert.match(messages[0].body, /date pending/);
  assert.equal(messages[0].replyTo,p.email);
  assert.equal(fake.doGet().sessions.length, 0);
});
