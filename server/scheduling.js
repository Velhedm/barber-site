'use strict';

// All times are local to Asia/Baku. Half-open intervals permit back-to-back visits.
const STEPS = Object.freeze([10, 15, 20, 30, 60]);
const failure = (status, message) => Object.assign(new Error(message), {status});
function minute(value) {
  if (value === '24:00') return 1440;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
function dateValid(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function windowOf(value) {
  const start = minute(value?.start), end = minute(value?.end);
  if (start === null || end === null || start >= end) throw failure(400, 'Invalid schedule');
  return {start, end};
}
function normalizeDay(day) {
  if (!day || typeof day.closed !== 'boolean') throw failure(400, 'Invalid schedule');
  if (day.closed) return {closed: true};
  const range = windowOf(day);
  if (!Array.isArray(day.breaks) || day.breaks.length > 12) throw failure(400, 'Invalid schedule');
  const breaks = day.breaks.map(windowOf).sort((a, b) => a.start - b.start);
  if (breaks.some((item, i) => item.start < range.start || item.end > range.end || (i && overlaps(item, breaks[i - 1])))) throw failure(400, 'Invalid schedule');
  return {closed: false, start: clock(range.start), end: clock(range.end), breaks: breaks.map(item => ({start: clock(item.start), end: clock(item.end)}))};
}
function normalizeWeek(week) {
  if (!Array.isArray(week) || week.length !== 7) throw failure(400, 'Invalid schedule');
  return week.map(normalizeDay); // Monday first; no invented business hours.
}
function dayFor(date, week, exception) {
  if (exception) return normalizeDay(exception);
  if (!week) return {closed: true};
  return normalizeDay(week[(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7]);
}
function roomHasSpace(request, reservations, capacity) {
  // Count occupancy at every boundary, not all appointments intersecting the window.
  const events = [];
  for (const row of reservations) if (overlaps(request, row)) {
    events.push([Math.max(request.start, row.start), 1], [Math.min(request.end, row.end), -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let used = 0;
  return events.every(([, change]) => (used += change) < capacity);
}
function availableSlots({date, day, step, duration, now, occupied = [], blocked = [], roomReservations = [], capacity = null, allowPastTime = null}) {
  if (day.closed) return [];
  const range = windowOf(day), breaks = day.breaks.map(windowOf), slots = [];
  for (let start = range.start; start < range.end; start += step) {
    const request = {start, end: start + duration}, time = clock(start);
    let status = 'available';
    if (time !== allowPastTime && Date.parse(`${date}T${time}:00+04:00`) <= now) status = 'past';
    else if (!Number.isInteger(duration) || duration < 1 || request.end > range.end || [...breaks, ...blocked].some(item => overlaps(request, item))) status = 'blocked';
    else if (occupied.some(item => overlaps(request, item)) || (capacity !== null && !roomHasSpace(request, roomReservations, capacity))) status = 'booked';
    slots.push({time, status});
  }
  return slots;
}
module.exports = {STEPS, failure, minute, clock, overlaps, dateValid, windowOf, normalizeDay, normalizeWeek, dayFor, roomHasSpace, availableSlots};
