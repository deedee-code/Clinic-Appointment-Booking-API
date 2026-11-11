const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
const longZoneFormatter = new Intl.DateTimeFormat(undefined, { timeZoneName: "long" });

/** @param {string} value */
export function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** @param {string} value */
export function formatDay(value) {
  return dateFormatter.format(new Date(value));
}

/** @param {string} value */
export function formatTime(value) {
  return timeFormatter.format(new Date(value));
}

/** @param {string} start @param {string} end */
export function formatTimeRange(start, end) {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/** @param {string} value */
export function formatDateTime(value) {
  return dateTimeFormatter.format(new Date(value));
}

/** @returns {string} */
export function getTimeZoneName() {
  const parts = longZoneFormatter.formatToParts(new Date());
  return parts.find((part) => part.type === "timeZoneName")?.value
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** @param {string} value */
function icsDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** @param {string} value */
function escapeIcs(value) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** @param {{ id: string, name: string, email: string }} booking @param {{ start: string, end: string, provider: string }} slot */
export function buildCalendarFile(booking, slot) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Morrowfield Medical//Appointments//EN",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(booking.id)}@morrowfield-medical`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(slot.start)}`,
    `DTEND:${icsDate(slot.end)}`,
    `SUMMARY:${escapeIcs(`Appointment with ${slot.provider}`)}`,
    `DESCRIPTION:${escapeIcs(`Booking ID: ${booking.id}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];
  return new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
}
