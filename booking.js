(() => {
  const byId = id => document.getElementById(id);
  const format = (value, options) => new Intl.DateTimeFormat('en-CA', options).format(value);
  const zone = 'America/Toronto';
  function localDay(value) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
    const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return [fields.year, fields.month, fields.day].join('-');
  }
  const today = localDay(new Date());
  const firstMonth = today.slice(0, 7);
  const api = window.HMM_CONFIG?.bookingApiUrl;
  const workshop = byId('workshop-form');
  const live = byId('live-form');
  const title = byId('selected-session');
  const status = byId('calendar-status');
  let month = firstMonth;
  let day = '';
  let selected = null;
  let sessions = [];
  let calendarState = 'loading';
  let busy = false;
  let interacted = false;

  const el = (tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };
  const sessionTime = slot => format(new Date(slot.start), { timeZone: zone, hour: 'numeric', minute: '2-digit' });
  const sessionDate = slot => format(new Date(slot.start), { timeZone: zone, month: 'short', day: 'numeric', year: 'numeric' });
  const monthDate = offset => {
    const [year, number] = month.split('-').map(Number);
    return new Date(Date.UTC(year, number - 1 + offset, 1));
  };

  function closeWorkshop() {
    selected = null;
    workshop.hidden = true;
  }

  function choose(slot) {
    selected = slot;
    byId('workshop-result').textContent = '';
    title.textContent = slot.title + ' · ' + sessionDate(slot) + ', ' + sessionTime(slot);
    workshop.hidden = false;
    workshop.elements.name.focus();
  }

  function draw() {
    const start = monthDate(0);
    const next = monthDate(1);
    byId('month').textContent = format(start, { timeZone: 'UTC', year: 'numeric', month: 'long' });
    byId('previous').disabled = month <= firstMonth || busy;
    byId('next').disabled = busy || month >= '9999-12';
    const days = byId('days');
    days.replaceChildren();
    const offset = (start.getUTCDay() + 6) % 7;
    const count = Math.round((next - start) / 86400000);
    const monthSlots = sessions.filter(s => s.day.startsWith(month));
    let row;
    for (let cell = 0; cell < Math.ceil((offset + count) / 7) * 7; cell++) {
      if (cell % 7 === 0) row = days.insertRow();
      const td = row.insertCell();
      const n = cell - offset + 1;
      if (n < 1 || n > count) continue;
      const key = month + '-' + String(n).padStart(2, '0');
      if (key === today) td.setAttribute('aria-current', 'date');
      if (!monthSlots.some(s => s.day === key)) { td.textContent = n; continue; }
      const button = el('button', n);
      button.type = 'button';
      button.disabled = busy;
      button.setAttribute('aria-label', key + ', workshops');
      button.setAttribute('aria-pressed', String(key === day));
      button.addEventListener('click', () => {
        interacted = true;
        day = key === day ? '' : key;
        closeWorkshop();
        draw();
        byId('days').querySelector('[aria-label="' + key + ', workshops"]')?.focus();
      });
      td.append(button);
    }
    const list = byId('sessions-list');
    list.replaceChildren();
    byId('retry').hidden = calendarState !== 'error';
    if (calendarState === 'closed') { status.textContent = 'Workshop bookings will open when HMM publishes its first dates.'; return; }
    if (calendarState === 'error') { status.textContent = 'The calendar could not be loaded. Please reload the dates.'; return; }
    if (calendarState === 'loading') { status.textContent = 'Loading workshop dates…'; return; }
    status.textContent = monthSlots.length ? (day ? 'Sessions on the selected date' : 'Sessions this month') : 'No workshop dates announced for this month.';
    for (const slot of monthSlots.filter(s => !day || s.day === day)) {
      const item = el('div', '');
      item.className = 'slot';
      item.append(el('h4', slot.title), el('p', [sessionDate(slot) + ' · ' + sessionTime(slot), slot.location, slot.left ? slot.left + (slot.left === 1 ? ' place left' : ' places left') : 'Fully booked'].join(' · ')));
      if (slot.left) {
        const button = el('button', 'Reserve a place');
        button.type = 'button';
        button.className = 'booking-link';
        button.disabled = busy;
        button.addEventListener('click', () => choose(slot));
        item.append(button);
      }
      list.append(item);
    }
  }

  async function apiCall(data) {
    const options = { credentials: 'omit', cache: 'no-store' };
    if (data) Object.assign(options, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const response = await fetch(api, options);
    if (!response.ok) throw new Error('unavailable');
    return response.json();
  }

  async function load() {
    try {
      const result = await apiCall();
      if (!result.ok || !Array.isArray(result.sessions)) throw new Error('unavailable');
      sessions = result.sessions;
      calendarState = 'ready';
      if (!interacted && sessions.length) month = sessions[0].day.slice(0, 7);
      if (day && !sessions.some(s => s.day === day)) day = '';
    } catch {
      sessions = [];
      calendarState = 'error';
      closeWorkshop();
    }
    draw();
  }

  function move(offset) {
    interacted = true;
    month = monthDate(offset).toISOString().slice(0, 7);
    day = '';
    closeWorkshop();
    draw();
  }
  byId('previous').onclick = () => move(-1);
  byId('next').onclick = () => move(1);
  byId('retry').onclick = load;
  byId('cancel').onclick = () => { closeWorkshop(); byId('sessions-list').querySelector('button')?.focus(); };
  live.elements.date.min = today;

  function wire(form, kind) {
    const result = byId(kind + '-result');
    const fieldset = form.querySelector('fieldset');
    let lastPayload = '';
    let requestId = '';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!api || fieldset.disabled || (kind === 'workshop' && !selected)) return;
      const data = { kind, ...Object.fromEntries(new FormData(form)) };
      if (selected && kind === 'workshop') data.slot = selected.id;
      const signature = JSON.stringify(data);
      if (lastPayload !== signature) {
        requestId = crypto.randomUUID();
        lastPayload = signature;
      }
      fieldset.disabled = true;
      if (kind === 'workshop') { busy = true; draw(); }
      result.textContent = 'Submitting…';
      try {
        const reply = await apiCall({ ...data, requestId });
        if (reply.ok) {
          result.textContent = kind === 'workshop'
            ? 'Your place is reserved for ' + title.textContent + '. Your confirmation will arrive by email.'
            : 'Your request has been received. HMM will reply about availability before confirming the performance.';
          form.reset();
          if (kind === 'workshop') closeWorkshop();
          lastPayload = '';
        } else if (reply.code === 'full' || reply.code === 'closed') {
          closeWorkshop();
          result.textContent = 'This session is no longer available. Please choose another date.';
        } else if (reply.code === 'invalid') {
          result.textContent = 'Please check your details, including your email and date.';
        } else if (reply.code === 'limit') {
          result.textContent = 'Too many requests. Please try again later.';
        } else {
          throw new Error('unavailable');
        }
      } catch {
        result.textContent = 'The booking service could not confirm receipt. Retry with the same details.';
      } finally {
        fieldset.disabled = false;
        if (kind === 'workshop') { busy = false; interacted = true; await load(); }
      }
    });
  }
  wire(workshop, 'workshop');
  wire(live, 'live');
  draw();
  if (api) {
    live.querySelector('fieldset').disabled = false;
    load();
  } else {
    calendarState = 'closed';
    byId('live-result').textContent = 'Live performance enquiries will open here soon.';
    draw();
  }
})();
