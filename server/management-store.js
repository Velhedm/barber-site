'use strict';
const {randomUUID} = require('node:crypto');
const {STEPS, failure, minute, clock, overlaps, dateValid, normalizeDay, normalizeWeek, dayFor, availableSlots} = require('./scheduling');
const parse = value => value ? JSON.parse(value) : null;
const text = (value, max = 100, optional = false) => {
  if (optional && (value === null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f]/.test(value)) throw failure(400, 'Invalid details');
  return value.trim();
};
const flag = value => {if (typeof value !== 'boolean') throw failure(400, 'Invalid details'); return Number(value);};
const integer = (value, min, max) => {if (!Number.isInteger(value) || value < min || value > max) throw failure(400, 'Invalid details'); return value;};
const closedWeek = () => Array.from({length: 7}, () => ({closed: true}));
const activeStates = ['active', 'arrived'];

async function createManagementStore(db, legacy, {now = () => Date.now(), onBooked = async () => {}} = {}) {
  // Fail closed when the explicit migration has not been run. Never silently fall back.
  await db.prepare('SELECT version FROM ilker_management_versions WHERE version=1').get().then(row => {if (!row) throw new Error('Management migration required');});
  const iso = () => new Date(now()).toISOString();
  function date(value) {
    const today = new Date(now() + 4 * 3600000).toISOString().slice(0, 10);
    const end = new Date(now() + 4 * 3600000 + 365 * 86400000).toISOString().slice(0, 10);
    if (!dateValid(value) || value < today || value > end) throw failure(400, 'Invalid date');
    return value;
  }
  async function audit(actor, action, entityType, entityId, details = {}) {
    // Exclude contacts, secrets and free-form customer notes from audit entries.
    await db.prepare('INSERT INTO ilker_audit(id,actor,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(randomUUID(), actor || 'owner', action, entityType, entityId, JSON.stringify(details), iso());
  }
  async function changed(result) {if (!result.changes) throw failure(409, 'Changed elsewhere; reload');}
  function masterView(row) {
    return {...row, name: row.name || '', online: Boolean(row.online), archived: Boolean(row.archived),
      schedule: parse(row.schedule_json) || closedWeek(), schedule_json: undefined};
  }
  async function masters(includeArchived = false) {
    const rows = await db.prepare(`SELECT * FROM ilker_masters ${includeArchived ? '' : 'WHERE archived=0'} ORDER BY position,id`).all();
    const assignments = await db.prepare('SELECT master_id,service_id FROM ilker_master_services').all();
    return rows.map(row => ({...masterView(row), serviceIds: assignments.filter(x => x.master_id === row.id).map(x => x.service_id)}));
  }
  const masterLabel = master => master.name || `Мастер ${master.position}`;
  async function rooms() {return db.prepare('SELECT * FROM ilker_rooms ORDER BY name,id').all();}
  async function saveRoom(input, actor) {
    const name = text(input.name), capacity = integer(input.capacity, 1, 99), archived = flag(input.archived);
    return db.transaction(async () => {
      const id = input.id || randomUUID();
      if (input.id) {
        const previous = await db.prepare('SELECT * FROM ilker_rooms WHERE id=?').get(id);
        if (!previous) throw failure(404, 'Room not found');
        if (capacity < previous.capacity) {
          // Reject reducing capacity while future commitments exist; explicit rescheduling is needed.
          const future = await db.prepare("SELECT 1 FROM ilker_booking_assignment a JOIN ilker_appointments b ON b.id=a.booking_id WHERE a.room_id=? AND b.status IN ('active','arrived') AND b.date>=? LIMIT 1").get(id, new Date(now() + 14400000).toISOString().slice(0, 10));
          if (future) throw failure(409, 'Room has future bookings');
        }
        await changed(await db.prepare('UPDATE ilker_rooms SET name=?,capacity=?,archived=?,revision=revision+1 WHERE id=? AND revision=?').run(name, capacity, archived, id, input.revision));
      } else await db.prepare('INSERT INTO ilker_rooms(id,name,capacity,archived) VALUES(?,?,?,?)').run(id, name, capacity, archived);
      await audit(actor, archived ? 'archive' : 'save', 'room', id, {capacity, archived});
      return db.prepare('SELECT * FROM ilker_rooms WHERE id=?').get(id);
    });
  }
  async function saveMaster(input, actor) {
    const name = text(input.name, 80, true), online = flag(input.online), archived = flag(input.archived);
    const week = normalizeWeek(input.schedule), step = input.stepMinutes;
    if (!STEPS.includes(step) || !Array.isArray(input.serviceIds) || input.serviceIds.length > 200 || new Set(input.serviceIds).size !== input.serviceIds.length || input.serviceIds.some(id => typeof id !== 'string')) throw failure(400, 'Invalid details');
    if (online && (!input.serviceIds.length || week.every(day => day.closed) || archived)) throw failure(400, 'Configure master first');
    return db.transaction(async () => {
      for (const id of input.serviceIds) if (!await db.prepare('SELECT id FROM ilker_catalog WHERE id=? AND archived=0').get(id)) throw failure(400, 'Unknown service or room');
      if (input.roomId && !await db.prepare('SELECT id FROM ilker_rooms WHERE id=? AND archived=0').get(input.roomId)) throw failure(400, 'Unknown service or room');
      const id = input.id || randomUUID(), room = input.roomId || null;
      if (input.id) await changed(await db.prepare('UPDATE ilker_masters SET name=?,online=?,archived=?,step_minutes=?,schedule_json=?,room_id=?,revision=revision+1 WHERE id=? AND revision=?').run(name, online, archived, step, JSON.stringify(week), room, id, input.revision));
      else {
        const position = (await db.prepare('SELECT COALESCE(MAX(position),0)+1 AS n FROM ilker_masters').get()).n;
        await db.prepare('INSERT INTO ilker_masters(id,name,position,online,archived,step_minutes,schedule_json,room_id) VALUES(?,?,?,?,?,?,?,?)').run(id, name, position, online, archived, step, JSON.stringify(week), room);
      }
      await db.prepare('DELETE FROM ilker_master_services WHERE master_id=?').run(id);
      for (const serviceId of input.serviceIds) await db.prepare('INSERT INTO ilker_master_services(master_id,service_id) VALUES(?,?)').run(id, serviceId);
      await audit(actor, archived ? 'archive' : 'save', 'master', id, {online, archived, step, serviceIds: input.serviceIds, roomId: room, schedule: week});
      return (await masters(true)).find(row => row.id === id);
    });
  }
  async function services(includeInactive = false) {
    const list = await db.prepare(`SELECT * FROM ilker_catalog ${includeInactive ? '' : 'WHERE active=1 AND archived=0'} ORDER BY position,id`).all();
    const options = await db.prepare('SELECT * FROM ilker_catalog_options').all();
    return list.map(item => {
      const group = parse(item.group_json), prices = {}, durations = {};
      for (const option of options.filter(x => x.service_id === item.id)) {
        prices[option.category] = option.price_min === option.price_max ? option.price_min / 100 : {min: option.price_min / 100, max: option.price_max / 100};
        durations[option.category] = option.duration_minutes;
      }
      return {id: item.id, name: item.name, translations: parse(item.translations_json), group: item.group_id, groupName: group.name,
        groupTranslations: group.translations, prices, durations, position: item.position, active: Boolean(item.active), archived: Boolean(item.archived), revision: item.revision, sessions: item.sessions_count};
    });
  }
  function money(value) {return integer(value, 0, 999999999);}
  async function saveService(input, actor) {
    const name = text(input.name), translations = {};
    for (const language of ['ru', 'en']) translations[language] = text(input.translations?.[language], 100);
    const active = flag(input.active), archived = flag(input.archived), position = integer(input.position, 0, 10000);
    const prices = {};
    for (const category of ['zal', 'vip']) {
      const option = input.options?.[category];
      prices[category] = {min: money(option?.priceMin), max: money(option?.priceMax), duration: option?.durationMinutes === null ? null : integer(option?.durationMinutes, 1, 720)};
      if (prices[category].min > prices[category].max) throw failure(400, 'Invalid actual price');
    }
    return db.transaction(async () => {
      const id = input.id || 'service-' + randomUUID();
      if (input.id) await changed(await db.prepare('UPDATE ilker_catalog SET name=?,translations_json=?,active=?,archived=?,position=?,revision=revision+1 WHERE id=? AND revision=?').run(name, JSON.stringify(translations), active, archived, position, id, input.revision));
      else await db.prepare('INSERT INTO ilker_catalog(id,name,translations_json,group_id,group_json,position,active,archived) VALUES(?,?,?,?,?,?,?,?)').run(id, name, JSON.stringify(translations), 'custom', JSON.stringify({name: 'Xidmətlər', translations: {ru: 'Услуги', en: 'Services'}}), position, active, archived);
      for (const category of ['zal', 'vip']) {
        const p = prices[category];
        await db.prepare('INSERT INTO ilker_catalog_options(service_id,category,price_min,price_max,duration_minutes) VALUES(?,?,?,?,?) ON CONFLICT(service_id,category) DO UPDATE SET price_min=excluded.price_min,price_max=excluded.price_max,duration_minutes=excluded.duration_minutes').run(id, category, p.min, p.max, p.duration);
        await db.prepare('INSERT INTO ilker_service_settings(id,duration_minutes) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET duration_minutes=excluded.duration_minutes').run(id + ':' + category, p.duration);
      }
      await audit(actor, archived ? 'archive' : 'save', 'service', id, {prices, position, active, archived, name, translations});
      return (await services(true)).find(item => item.id === id);
    });
  }
  async function setDuration(serviceId, room, minutes, actor) {
    if (!['zal', 'vip'].includes(room) || (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 720))) throw failure(400, 'Invalid duration');
    return db.transaction(async () => {
      await changed(await db.prepare('UPDATE ilker_catalog_options SET duration_minutes=? WHERE service_id=? AND category=?').run(minutes, serviceId, room));
      await db.prepare('UPDATE ilker_service_settings SET duration_minutes=? WHERE id=?').run(minutes, serviceId + ':' + room);
      await db.prepare('UPDATE ilker_catalog SET revision=revision+1 WHERE id=?').run(serviceId);
      await audit(actor, 'duration', 'service', serviceId, {room, minutes}); return {serviceId, room, durationMinutes: minutes};
    });
  }
  function selection(input) {
    const ids = input.serviceIds === undefined ? [input.serviceId] : input.serviceIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || id.length > 80) || !['zal', 'vip'].includes(input.room)) throw failure(400, 'Unknown service or room');
    return ids;
  }
  async function quote(input) {
    const ids = selection(input);
    const rows = await db.prepare(`SELECT c.id,c.name,c.sessions_count,o.price_min,o.price_max,o.duration_minutes
      FROM ilker_catalog c JOIN ilker_catalog_options o ON o.service_id=c.id
      WHERE c.active=1 AND c.archived=0 AND o.category=? AND c.id IN (${ids.map(()=>'?').join(',')})`).all(input.room,...ids);
    const items = ids.map(id=>rows.find(row=>row.id===id));
    if(items.some(item=>!item))throw failure(409,'Service unavailable');
    if(items.some(item=>!item.duration_minutes))throw failure(409,'Service duration must be configured');
    return items.map(item=>({serviceId:item.id,name:item.name,priceMin:item.price_min,priceMax:item.price_max,durationMinutes:item.duration_minutes,sessions:item.sessions_count}));
  }
  async function eligible(input) {
    const ids = selection(input); await quote(input);
    return (await masters()).filter(master => master.online && ids.every(id => master.serviceIds.includes(id)))
      .map(master => ({id: master.id, name: master.name, position: master.position}));
  }
  async function checkMaster(input, internal) {
    if(typeof input.masterId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(input.masterId))throw failure(400,'Select a master');
    const rows=await db.prepare(`SELECT m.*,s.service_id,r.name AS room_name,r.capacity AS room_capacity,r.archived AS room_archived
      FROM ilker_masters m LEFT JOIN ilker_master_services s ON s.master_id=m.id LEFT JOIN ilker_rooms r ON r.id=m.room_id
      WHERE m.id=? AND m.archived=0`).all(input.masterId);
    const row=rows[0];
    if(!row||(!internal&&!row.online))throw failure(409,'Master unavailable');
    if(!selection(input).every(id=>rows.some(item=>item.service_id===id)))throw failure(409,'Master cannot perform selected services');
    return row;
  }
  async function evaluate(input, {internal = false, ignoreId = null, chosenOverride = null, allowPastTime = null} = {}) {
    date(input.date);
    const master = await checkMaster(input, internal), chosen = chosenOverride || await quote(input);
    const duration = chosen.reduce((sum, item) => sum + item.durationMinutes, 0);
    const daySettings=await db.prepare('SELECT (SELECT date FROM ilker_closed_days WHERE date=?) AS closed, (SELECT day_json FROM ilker_master_days WHERE master_id=? AND date=?) AS exception').get(input.date,master.id,input.date);
    const day=daySettings.closed?{closed:true}:dayFor(input.date,parse(master.schedule_json),parse(daySettings.exception));
    const rows = await db.prepare("SELECT b.id,b.time,b.duration_minutes,b.kind,a.master_id,a.room_id FROM ilker_appointments b LEFT JOIN ilker_booking_assignment a ON a.booking_id=b.id WHERE b.date=? AND b.status IN ('active','arrived')").all(input.date);
    const occupied = [], blocked = [], roomReservations = [];
    let invalid = false;
    for (const row of rows) {
      if (row.id === ignoreId) continue;
      const start = minute(row.time), end = start + row.duration_minutes;
      if (start === null || !Number.isInteger(row.duration_minutes) || row.duration_minutes < 1 || end > 1440) {invalid = true; continue;}
      const range = {start, end};
      // Unassigned legacy bookings are conservatively global until explicitly assigned.
      if (!row.master_id || row.master_id === master.id) (row.kind === 'block' ? blocked : occupied).push(range);
      if (master.room_id && row.room_id === master.room_id) roomReservations.push(range);
    }
    const blocks = await db.prepare('SELECT start_minute,end_minute FROM ilker_time_blocks WHERE master_id=? AND date=?').all(master.id, input.date);
    blocked.push(...blocks.map(row => ({start: row.start_minute, end: row.end_minute})));
    const room=master.room_id?{capacity:master.room_capacity,archived:master.room_archived}:null;
    if (invalid || (master.room_id && (!room || !room.capacity || room.archived))) blocked.push({start: 0, end: 1440});
    return {master,chosen,data:{date: input.date, masterId: master.id, serverTime: now(), dayClosed: day.closed, durationMinutes: duration,
      slots: availableSlots({date: input.date, day, step: master.step_minutes, duration, now: now(), occupied, blocked, roomReservations, capacity: room?.capacity ?? null, allowPastTime})}};
  }
  const availabilityInput=async(input,options)=>(await evaluate(input,options)).data;
  const availability = (value, serviceId, room, serviceIds, masterId) => availabilityInput({date: value, serviceId, serviceIds, room, masterId});
  async function publicResult(row) {
    const assignment = await db.prepare('SELECT master_id,master_name,room_id,room_name,revision FROM ilker_booking_assignment WHERE booking_id=?').get(row.id);
    return {...row, ...assignment, archived:Boolean(await db.prepare('SELECT booking_id FROM ilker_booking_archive WHERE booking_id=?').get(row.id)), items: await legacy.items(row.id)};
  }
  async function writeItems(id, chosen) {
    for (let i = 0; i < chosen.length; i++) {
      const item = chosen[i];
      await db.prepare('INSERT INTO ilker_booking_items(booking_id,position,service_id,service_name,price_min,price_max,duration_minutes,sessions_count) VALUES(?,?,?,?,?,?,?,?)')
        .run(id, i, item.serviceId, item.name, item.priceMin, item.priceMax, item.durationMinutes, item.sessions);
    }
  }
  async function book(input, {internal = false, actor = 'public'} = {}) {
    date(input.date); const name = text(input.name, 80), phone = text(input.phone, 30), ids = selection(input);
    if (name.length < 2 || !/^\+?[0-9() .-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15 || minute(input.time) === null || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(input.requestKey || '')) throw failure(400, 'Invalid booking details');
    return db.transaction(async () => {
      const previous = await db.prepare('SELECT * FROM ilker_appointments WHERE request_key=?').get(input.requestKey);
      if (previous) {
        const result = await publicResult(previous);
        const previousIds = result.items.map(item => item.service_id);
        if(input.reminder?.consent){const existing=await db.prepare('SELECT email,language FROM ilker_reminder_consent WHERE booking_id=?').get(previous.id);if(!existing||existing.email!==String(input.reminder.email||'').trim().toLowerCase()||existing.language!==input.reminder.language)throw failure(409,'Booking retry differs');}
        if (!activeStates.includes(previous.status) || previous.date !== input.date || previous.time !== input.time || previous.room !== input.room || result.master_id !== input.masterId || previous.name !== name || previous.phone !== phone || JSON.stringify(ids) !== JSON.stringify(previousIds)) throw failure(409, 'Booking retry differs');
        return result;
      }
      if(!internal&&!(await db.prepare('SELECT online FROM ilker_business_settings WHERE id=1').get())?.online)throw failure(409,'Online booking unavailable');
      const policy=await db.prepare('SELECT cancel_minutes FROM ilker_business_settings WHERE id=1').get();
      if(!internal&&input.expectedCancellationMinutes!==undefined&&input.expectedCancellationMinutes!==policy.cancel_minutes)throw failure(409,'Cancellation policy changed');
      const {data,master,chosen}=await evaluate(input,{internal});
      if (!data.slots.some(slot => slot.time === input.time && slot.status === 'available')) throw failure(409, 'Time unavailable');

      const id = randomUUID(), min = chosen.reduce((sum, item) => sum + item.priceMin, 0), max = chosen.reduce((sum, item) => sum + item.priceMax, 0);
      if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||max>999999999)throw failure(400,'Invalid actual price');
      if(input.expectedQuote&&(input.expectedQuote.min!==min||input.expectedQuote.max!==max||input.expectedQuote.duration!==data.durationMinutes))throw failure(409,'Quote changed');
      await db.prepare("INSERT INTO ilker_appointments(id,date,time,kind,name,phone,service_id,room,service_name,price_min,price_max,actual_price,duration_minutes,sessions_count,request_key,created_at) VALUES(?,?,?,'booking',?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, input.date, input.time, name, phone, ids[0], input.room, chosen.map(item => item.name).join(', '), min, max, min === max ? min : null, data.durationMinutes, chosen.length === 1 ? chosen[0].sessions : 1, input.requestKey, iso());
      await db.prepare('INSERT INTO ilker_booking_assignment(booking_id,master_id,master_name,room_id,room_name) VALUES(?,?,?,?,?)').run(id, master.id, masterLabel(master), master.room_id, master.room_name || null);
      await db.prepare('INSERT INTO ilker_booking_policy(booking_id,cancel_minutes) VALUES(?,?)').run(id,policy.cancel_minutes);
      await writeItems(id, chosen);
      await onBooked(id,{internal,actor,reminder:input.reminder});
      await audit(actor, 'book', 'booking', id, {masterId: master.id, serviceIds: ids, date: input.date, time: input.time, min, max, duration: data.durationMinutes});
      return publicResult(await db.prepare('SELECT * FROM ilker_appointments WHERE id=?').get(id));
    });
  }
  async function setDay(value, closed, masterId, actor) {
    date(value); flag(closed);
    if (!masterId) return db.transaction(async () => {
      if (closed) await db.prepare('INSERT INTO ilker_closed_days(date) VALUES(?) ON CONFLICT DO NOTHING').run(value);
      else await db.prepare('DELETE FROM ilker_closed_days WHERE date=?').run(value);
      await audit(actor, 'day', 'salon', value, {closed}); return {date: value, closed};
    });
    return setException({masterId, date: value, day: closed ? {closed: true} : null}, actor);
  }
  async function setException(input, actor) {
    date(input.date); const day = input.day === null ? null : normalizeDay(input.day);
    return db.transaction(async () => {
      if (!await db.prepare('SELECT id FROM ilker_masters WHERE id=? AND archived=0').get(input.masterId)) throw failure(404, 'Master unavailable');
      if (day === null) await db.prepare('DELETE FROM ilker_master_days WHERE master_id=? AND date=?').run(input.masterId, input.date);
      else await db.prepare('INSERT INTO ilker_master_days(master_id,date,day_json) VALUES(?,?,?) ON CONFLICT(master_id,date) DO UPDATE SET day_json=excluded.day_json').run(input.masterId, input.date, JSON.stringify(day));
      await audit(actor, 'exception', 'master', input.masterId, {date: input.date, day}); return {ok: true};
    });
  }
  async function setBlock(input, actor) {
    date(input.date); const start = minute(input.start), end = minute(input.end); flag(input.blocked);
    if (start === null || end === null || start >= end) throw failure(400, 'Invalid slot');
    return db.transaction(async () => {
      if (!await db.prepare('SELECT id FROM ilker_masters WHERE id=? AND archived=0').get(input.masterId)) throw failure(404, 'Master unavailable');
      if (input.blocked) {
        const rows = await db.prepare("SELECT b.time,b.duration_minutes FROM ilker_appointments b LEFT JOIN ilker_booking_assignment a ON a.booking_id=b.id WHERE b.date=? AND b.status IN ('active','arrived') AND b.kind='booking' AND (a.master_id IS NULL OR a.master_id=?)").all(input.date, input.masterId);
        if (rows.some(row => overlaps({start, end}, {start: minute(row.time), end: minute(row.time) + row.duration_minutes}))) throw failure(409, 'Existing booking overlaps this hour');
        if (!await db.prepare('SELECT id FROM ilker_time_blocks WHERE master_id=? AND date=? AND start_minute=? AND end_minute=?').get(input.masterId, input.date, start, end)) await db.prepare('INSERT INTO ilker_time_blocks(id,master_id,date,start_minute,end_minute) VALUES(?,?,?,?,?)').run(randomUUID(), input.masterId, input.date, start, end);
      } else await db.prepare('DELETE FROM ilker_time_blocks WHERE master_id=? AND date=? AND start_minute=? AND end_minute=?').run(input.masterId, input.date, start, end);
      await audit(actor, 'block', 'master', input.masterId, {date: input.date, start, end, blocked: input.blocked}); return {ok: true};
    });
  }
  async function dayDetails(masterId, value) {
    date(value);
    return {exception: parse((await db.prepare('SELECT day_json FROM ilker_master_days WHERE master_id=? AND date=?').get(masterId, value))?.day_json),
      blocks: await db.prepare('SELECT id,start_minute,end_minute FROM ilker_time_blocks WHERE master_id=? AND date=? ORDER BY start_minute').all(masterId, value)};
  }
  async function setSlot(value, time, blocked, masterId, actor) {
    if (!masterId) throw failure(400, 'Select a master');
    return setBlock({masterId, date: value, start: time, end: clock(minute(time) + 60), blocked}, actor);
  }
  async function cancel(id, actor) {
    return db.transaction(async () => {
      const row = await db.prepare("SELECT * FROM ilker_appointments WHERE id=? AND kind='booking'").get(id);
      if (!row) throw failure(404, 'Booking not found');
      if (row.status === 'cancelled') return {ok: true};
      if (!activeStates.includes(row.status)) throw failure(409, 'Booking cannot be cancelled');
      await db.prepare("UPDATE ilker_appointments SET status='cancelled' WHERE id=?").run(id);
      await db.prepare('UPDATE ilker_booking_assignment SET revision=revision+1 WHERE booking_id=?').run(id);
      await audit(actor, 'cancel', 'booking', id); return {ok: true};
    });
  }
  async function remove(id, actor) {
    return db.transaction(async () => {
      const row = await db.prepare("SELECT id FROM ilker_appointments WHERE id=? AND status='cancelled' AND kind='booking'").get(id);
      if (!row) throw failure(409, 'Cancel the booking first');
      // No financial/history deletion. Legacy unassigned rows are retained too.
      await db.prepare('INSERT INTO ilker_booking_archive(booking_id,created_at) VALUES(?,?) ON CONFLICT DO NOTHING').run(id,iso());
      await db.prepare('UPDATE ilker_booking_assignment SET archived=1,revision=revision+1 WHERE booking_id=?').run(id);
      await audit(actor, 'archive', 'booking', id); return {ok: true};
    });
  }
  async function history(masterId, offset = 0) {
    const rows = await db.prepare("SELECT b.*,a.master_name,a.master_id FROM ilker_appointments b JOIN ilker_booking_assignment a ON a.booking_id=b.id WHERE a.master_id=? AND b.kind='booking' ORDER BY b.date DESC,b.time DESC,b.id DESC LIMIT 50 OFFSET ?").all(masterId, integer(offset, 0, 100000));
    const revenue = await db.prepare("SELECT COALESCE(SUM(b.actual_price),0) AS total,COUNT(*) AS completed FROM ilker_appointments b JOIN ilker_booking_assignment a ON a.booking_id=b.id WHERE a.master_id=? AND b.kind='booking' AND b.status='completed'").get(masterId);
    return {rows: rows.map(({request_key, ...safe}) => safe), revenue};
  }
  return {...legacy, planVisit:evaluate, writeItems, masters, rooms, saveRoom, saveMaster, services, saveService, setDuration, eligible, availabilityInput, availability, book, setDay, setException, setBlock, setSlot, dayDetails, cancel, remove, history, publicResult, audit};
}
module.exports = {createManagementStore};
