/**
 * iCalendar (RFC 5545) — parse, patch, serialize, and expand recurrence.
 *
 * Hand-rolled rather than pulled from a library for the same reason
 * providers/icloud.ts owns its IMAP layer: we need exactly one component type
 * (VEVENT), we need unknown properties to survive a round trip untouched, and
 * we need the whole thing to stay out of a Gmail-only cold start.
 *
 * The rule that shapes everything here: LifeOS never rewrites what it doesn't
 * understand. An update reads the event's existing ICS, replaces only the
 * properties it owns, and writes the rest back byte for byte — so editing a
 * title can't silently destroy the user's alarms, attachments or X- properties.
 */

import type { EventInput, EventTime } from "./types";

const CRLF = "\r\n";
const PRODID = "-//LifeOS//EN";

// ---------------------------------------------------------------------------
// Component tree
// ---------------------------------------------------------------------------

export interface IcalProperty {
  /** Upper-cased. */
  name: string;
  /** Upper-cased keys; values keep their original case, unquoted. */
  params: Record<string, string[]>;
  /** Still escaped — run through unescapeText for TEXT-valued properties. */
  value: string;
}

export interface IcalComponent {
  name: string;
  properties: IcalProperty[];
  components: IcalComponent[];
}

/** Content lines are folded at 75 octets; a leading space or tab continues one. */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else if (line.length) {
      out.push(line);
    }
  }
  return out;
}

/**
 * Fold at 75 octets, never mid-character: a multi-byte character split across
 * the fold is the classic way to produce an ICS a server will reject.
 */
function fold(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      // Continuation lines spend one octet on their leading space.
      limit = 74;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** Split on `sep`, ignoring separators inside a quoted parameter value. */
function splitUnquoted(text: string, sep: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (ch === sep && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function parseProperty(line: string): IcalProperty {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return { name: line.toUpperCase(), params: {}, value: "" };
  const segments = splitUnquoted(line.slice(0, colon), ";");
  const params: Record<string, string[]> = {};
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    params[segment.slice(0, eq).toUpperCase()] = splitUnquoted(segment.slice(eq + 1), ",").map(
      (v) => v.replace(/^"|"$/g, ""),
    );
  }
  return { name: segments[0].toUpperCase(), params, value: line.slice(colon + 1) };
}

function serializeProperty(prop: IcalProperty): string {
  const params = Object.entries(prop.params)
    .map(
      ([key, values]) =>
        `;${key}=${values
          .map((v) => (/[;:,\s]/.test(v) ? `"${v.replace(/"/g, "")}"` : v))
          .join(",")}`,
    )
    .join("");
  return fold(`${prop.name}${params}:${prop.value}`);
}

/** Top-level components, in document order. Usually a single VCALENDAR. */
export function parseIcal(text: string): IcalComponent[] {
  const roots: IcalComponent[] = [];
  const stack: IcalComponent[] = [];
  for (const line of unfold(text)) {
    const prop = parseProperty(line);
    if (prop.name === "BEGIN") {
      const component: IcalComponent = {
        name: prop.value.toUpperCase(),
        properties: [],
        components: [],
      };
      if (stack.length) stack[stack.length - 1].components.push(component);
      else roots.push(component);
      stack.push(component);
    } else if (prop.name === "END") {
      stack.pop();
    } else if (stack.length) {
      stack[stack.length - 1].properties.push(prop);
    }
  }
  return roots;
}

export function serializeIcal(component: IcalComponent): string {
  return [
    `BEGIN:${component.name}`,
    ...component.properties.map(serializeProperty),
    ...component.components.map(serializeIcal),
    `END:${component.name}`,
  ].join(CRLF);
}

/** Wrap one or more VEVENTs (plus any VTIMEZONEs) in a VCALENDAR document. */
export function wrapCalendar(components: IcalComponent[]): string {
  return `${serializeIcal({
    name: "VCALENDAR",
    properties: [
      { name: "VERSION", params: {}, value: "2.0" },
      { name: "PRODID", params: {}, value: PRODID },
      { name: "CALSCALE", params: {}, value: "GREGORIAN" },
    ],
    components,
  })}${CRLF}`;
}

// ---------------------------------------------------------------------------
// TEXT escaping
// ---------------------------------------------------------------------------

export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) =>
    c === "n" || c === "N" ? "\n" : c,
  );
}

export function escapeText(value: string): string {
  return value.replace(/([\\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

/**
 * An iCalendar date-time. `floating` packs the *wall clock* fields into a UTC
 * Date — it is not an instant on its own, and must not be treated as one. That
 * separation is what lets a weekly 10am meeting stay at 10am across a DST
 * boundary: recurrence expands in wall-clock space, and only the final
 * occurrences are resolved against a zone.
 */
export interface IcsTime {
  floating: Date;
  tzid?: string;
  utc: boolean;
  dateOnly: boolean;
}

function pad(n: number, width = 2): string {
  return String(Math.abs(n)).padStart(width, "0");
}

export function parseIcsTime(prop: IcalProperty): IcsTime {
  const value = prop.value.trim();
  const dateOnly = prop.params.VALUE?.[0] === "DATE" || /^\d{8}$/.test(value);
  return {
    floating: new Date(
      Date.UTC(
        Number(value.slice(0, 4)),
        Number(value.slice(4, 6)) - 1,
        Number(value.slice(6, 8)),
        dateOnly ? 0 : Number(value.slice(9, 11)),
        dateOnly ? 0 : Number(value.slice(11, 13)),
        dateOnly ? 0 : Number(value.slice(13, 15) || 0),
      ),
    ),
    tzid: prop.params.TZID?.[0],
    utc: value.endsWith("Z"),
    dateOnly,
  };
}

function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function icsDateTime(d: Date): string {
  return `${icsDate(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

/**
 * The offset, in minutes, that `timeZone` was running at a given instant.
 * Intl is the only timezone database available without a dependency, so every
 * zone question in this file goes through it.
 */
function zoneOffset(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const f: Record<string, number> = {};
  for (const part of parts) if (part.type !== "literal") f[part.type] = Number(part.value);
  // Some ICU builds render midnight as hour 24.
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour % 24, f.minute, f.second);
  return (asUtc - instant.getTime()) / 60_000;
}

/** Wall clock in a zone → the instant it names. */
export function zonedToInstant(floating: Date, timeZone: string): Date {
  const guess = new Date(floating.getTime() - zoneOffset(floating, timeZone) * 60_000);
  // A second pass settles DST boundaries, where the first guess reads the
  // offset from the wrong side of the transition.
  return new Date(floating.getTime() - zoneOffset(guess, timeZone) * 60_000);
}

/** The instant an IcsTime denotes. Floating times are read as UTC, as RFC 5545 allows. */
export function toInstant(time: IcsTime): Date {
  if (time.utc || time.dateOnly || !time.tzid) return time.floating;
  return zonedToInstant(time.floating, time.tzid);
}

function offsetSuffix(minutes: number): string {
  return `${minutes < 0 ? "-" : "+"}${pad(Math.trunc(minutes / 60))}:${pad(minutes % 60)}`;
}

/** RFC 3339 with the zone's real offset, matching what Google Calendar returns. */
function formatInZone(instant: Date, timeZone: string): string {
  const offset = zoneOffset(instant, timeZone);
  const local = new Date(instant.getTime() + offset * 60_000);
  return `${local.toISOString().slice(0, 19)}${offsetSuffix(offset)}`;
}

export function icsTimeToEventTime(time: IcsTime): EventTime {
  if (time.dateOnly) return { date: icsDate(time.floating).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") };
  const instant = toInstant(time);
  if (!time.tzid) return { dateTime: instant.toISOString() };
  return { dateTime: formatInZone(instant, time.tzid), timeZone: time.tzid };
}

/**
 * The reverse. A caller that names a zone gets a TZID-qualified local time —
 * which is what keeps a recurring event anchored to the clock rather than to
 * an absolute instant. Everything else is written in UTC, which needs no
 * VTIMEZONE and can't be misread.
 */
export function eventTimeToProperty(name: string, time: EventTime): IcalProperty {
  if (time.date) {
    return {
      name,
      params: { VALUE: ["DATE"] },
      value: time.date.replace(/-/g, ""),
    };
  }
  const instant = new Date(time.dateTime ?? "");
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Not a usable date-time: ${time.dateTime}`);
  }
  if (!time.timeZone || time.timeZone === "UTC") {
    return { name, params: {}, value: `${icsDateTime(instant)}Z` };
  }
  const local = new Date(instant.getTime() + zoneOffset(instant, time.timeZone) * 60_000);
  return { name, params: { TZID: [time.timeZone] }, value: icsDateTime(local) };
}

// ---------------------------------------------------------------------------
// VTIMEZONE
// ---------------------------------------------------------------------------

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** The exact instant, to the minute, at which the offset changes between two probes. */
function findTransition(zone: string, after: Date, before: Date): Date {
  let lo = after.getTime();
  let hi = before.getTime();
  const target = zoneOffset(new Date(hi), zone);
  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (zoneOffset(new Date(mid), zone) === target) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

function observance(
  kind: "STANDARD" | "DAYLIGHT",
  local: Date,
  from: number,
  to: number,
  yearly: boolean,
): IcalComponent {
  const weekday = WEEKDAYS[local.getUTCDay()];
  const ordinal = Math.ceil(local.getUTCDate() / 7);
  return {
    name: kind,
    properties: [
      { name: "DTSTART", params: {}, value: icsDateTime(local) },
      { name: "TZOFFSETFROM", params: {}, value: `${from < 0 ? "-" : "+"}${pad(Math.trunc(from / 60))}${pad(from % 60)}` },
      { name: "TZOFFSETTO", params: {}, value: `${to < 0 ? "-" : "+"}${pad(Math.trunc(to / 60))}${pad(to % 60)}` },
      ...(yearly
        ? [
            {
              name: "RRULE",
              params: {},
              value: `FREQ=YEARLY;BYMONTH=${local.getUTCMonth() + 1};BYDAY=${ordinal}${weekday}`,
            },
          ]
        : []),
    ],
    components: [],
  };
}

/**
 * A VTIMEZONE for the zone, derived by probing Intl month by month across a
 * reference year and binary-searching each offset change. CalDAV servers
 * expect a TZID to be defined in the same VCALENDAR, and there is no timezone
 * database here to copy one out of.
 *
 * Zones whose rules change from year to year are described by the reference
 * year's rules, which is what every calendar client does in practice too.
 */
export function buildVTimezone(timeZone: string, reference = new Date()): IcalComponent {
  const year = reference.getUTCFullYear();
  const probes: { at: Date; offset: number }[] = [];
  for (let month = 0; month <= 12; month++) {
    const at = new Date(Date.UTC(year, month, 1));
    probes.push({ at, offset: zoneOffset(at, timeZone) });
  }

  const observances: IcalComponent[] = [];
  for (let i = 1; i < probes.length; i++) {
    if (probes[i].offset === probes[i - 1].offset) continue;
    const from = probes[i - 1].offset;
    const to = probes[i].offset;
    const at = findTransition(timeZone, probes[i - 1].at, probes[i].at);
    // DTSTART inside an observance is the wall clock in the *outgoing* offset.
    const local = new Date(at.getTime() + from * 60_000);
    observances.push(observance(to > from ? "DAYLIGHT" : "STANDARD", local, from, to, true));
  }

  if (observances.length === 0) {
    const offset = probes[0].offset;
    observances.push(
      observance("STANDARD", new Date(Date.UTC(year, 0, 1)), offset, offset, false),
    );
  }

  return {
    name: "VTIMEZONE",
    properties: [{ name: "TZID", params: {}, value: timeZone }],
    components: observances,
  };
}

/** Every TZID referenced by a component tree, so writes can carry their definitions. */
export function referencedZones(component: IcalComponent): string[] {
  const zones = new Set<string>();
  const walk = (c: IcalComponent) => {
    for (const p of c.properties) for (const z of p.params.TZID ?? []) zones.add(z);
    c.components.forEach(walk);
  };
  walk(component);
  return [...zones];
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

interface Rule {
  freq: string;
  interval: number;
  count?: number;
  until?: Date;
  byday: { ordinal: number; weekday: number }[];
  bymonthday: number[];
  bymonth: number[];
  bysetpos: number[];
}

function parseRule(rrule: string): Rule {
  const parts: Record<string, string> = {};
  for (const chunk of rrule.replace(/^RRULE:/i, "").split(";")) {
    const eq = chunk.indexOf("=");
    if (eq > 0) parts[chunk.slice(0, eq).toUpperCase()] = chunk.slice(eq + 1);
  }
  const numbers = (key: string) =>
    (parts[key]?.split(",") ?? []).map(Number).filter((n) => !Number.isNaN(n));
  return {
    freq: (parts.FREQ ?? "DAILY").toUpperCase(),
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : undefined,
    until: parts.UNTIL
      ? parseIcsTime({ name: "UNTIL", params: {}, value: parts.UNTIL }).floating
      : undefined,
    byday: (parts.BYDAY?.split(",") ?? []).flatMap((token) => {
      const m = token.trim().toUpperCase().match(/^([+-]?\d+)?([A-Z]{2})$/);
      const weekday = m ? WEEKDAYS.indexOf(m[2]) : -1;
      return m && weekday >= 0 ? [{ ordinal: Number(m[1] ?? 0), weekday }] : [];
    }),
    bymonthday: numbers("BYMONTHDAY"),
    bymonth: numbers("BYMONTH"),
    bysetpos: numbers("BYSETPOS"),
  };
}

/**
 * How many whole periods can be skipped before the window can possibly be
 * reached. One period of slack is left on purpose, so nothing straddling the
 * edge is lost; a COUNT rule can't skip at all, since the count is cumulative.
 */
function periodsBefore(rule: Rule, start: Date, from: Date): number {
  if (rule.count !== undefined || from <= start) return 0;
  const elapsed = from.getTime() - start.getTime();
  const day = 86_400_000;
  const periods = {
    DAILY: () => Math.floor(elapsed / day),
    WEEKLY: () => Math.floor(elapsed / (7 * day)),
    MONTHLY: () =>
      (from.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (from.getUTCMonth() - start.getUTCMonth()),
    YEARLY: () => from.getUTCFullYear() - start.getUTCFullYear(),
    HOURLY: () => Math.floor(elapsed / 3_600_000),
    MINUTELY: () => Math.floor(elapsed / 60_000),
    SECONDLY: () => Math.floor(elapsed / 1000),
  }[rule.freq];
  return periods ? Math.max(0, Math.floor(periods() / rule.interval) - 1) : 0;
}

function withTimeOf(day: Date, source: Date): Date {
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      source.getUTCHours(),
      source.getUTCMinutes(),
      source.getUTCSeconds(),
    ),
  );
}

/** Every date in a month matching a BYDAY token, honouring its ordinal (2TU, -1FR). */
function monthlyByDay(year: number, month: number, byday: Rule["byday"]): Date[] {
  const days: Date[] = [];
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (const { ordinal, weekday } of byday) {
    const matches: Date[] = [];
    for (let day = 1; day <= last; day++) {
      const d = new Date(Date.UTC(year, month, day));
      if (d.getUTCDay() === weekday) matches.push(d);
    }
    if (ordinal === 0) days.push(...matches);
    else {
      const picked = ordinal > 0 ? matches[ordinal - 1] : matches[matches.length + ordinal];
      if (picked) days.push(picked);
    }
  }
  return days;
}

export interface RecurrenceOptions {
  /** The master event's own start, in wall-clock space. */
  start: Date;
  rrule?: string;
  rdates?: Date[];
  exdates?: Date[];
  /** Window, also wall-clock. */
  from: Date;
  to: Date;
  /** Hard stop, so a malformed rule can't spin. */
  limit?: number;
}

/**
 * Expand a recurrence rule into occurrence starts inside a window.
 *
 * Google expands series server-side (`singleEvents=true`); CalDAV servers hand
 * back the master plus its overrides and leave this to the client, so it is
 * ours to do. Covers FREQ, INTERVAL, COUNT, UNTIL, BYDAY (with ordinals),
 * BYMONTHDAY, BYMONTH, BYSETPOS, RDATE and EXDATE — the rules real calendars
 * actually emit. BYWEEKNO, BYYEARDAY and BYHOUR/BYMINUTE fall back to the
 * master's own time, which is what every occurrence would use anyway.
 */
export function expandRecurrence(opts: RecurrenceOptions): Date[] {
  const { start, from, to } = opts;
  const limit = opts.limit ?? 1000;
  const exdates = new Set((opts.exdates ?? []).map((d) => d.getTime()));
  const keep = (d: Date) => d >= from && d <= to && !exdates.has(d.getTime());

  if (!opts.rrule) {
    const singles = [start, ...(opts.rdates ?? [])];
    return singles.filter(keep).sort((a, b) => a.getTime() - b.getTime());
  }

  const rule = parseRule(opts.rrule);
  const occurrences: Date[] = [];
  let emitted = 0;
  // A rule with COUNT has to be walked from the beginning for the count to
  // mean anything. Without one, jump straight to the window — a standing
  // weekly meeting from six years ago is otherwise three hundred wasted steps.
  const firstPeriod = periodsBefore(rule, start, from);
  let period = firstPeriod;

  // Bound the walk by the window as well as by the rule: a COUNT-less,
  // UNTIL-less daily rule is infinite by definition.
  const maxPeriods = firstPeriod + 5000;
  while (period < maxPeriods && occurrences.length < limit) {
    const step = period * rule.interval;
    let candidates: Date[] = [];

    if (rule.freq === "DAILY") {
      candidates = [
        new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + step)),
      ];
    } else if (rule.freq === "WEEKLY") {
      const weekStart = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate() - start.getUTCDay() + step * 7,
        ),
      );
      const weekdays = rule.byday.length
        ? rule.byday.map((b) => b.weekday)
        : [start.getUTCDay()];
      candidates = weekdays.map(
        (wd) =>
          new Date(
            Date.UTC(
              weekStart.getUTCFullYear(),
              weekStart.getUTCMonth(),
              weekStart.getUTCDate() + wd,
            ),
          ),
      );
    } else if (rule.freq === "MONTHLY") {
      const year = start.getUTCFullYear();
      const month = start.getUTCMonth() + step;
      if (rule.byday.length) {
        candidates = monthlyByDay(year, month, rule.byday);
      } else {
        const days = rule.bymonthday.length ? rule.bymonthday : [start.getUTCDate()];
        candidates = days.map((day) =>
          day > 0
            ? new Date(Date.UTC(year, month, day))
            : new Date(Date.UTC(year, month + 1, day + 1)),
        );
      }
    } else if (rule.freq === "YEARLY") {
      const year = start.getUTCFullYear() + step;
      const months = rule.bymonth.length
        ? rule.bymonth.map((m) => m - 1)
        : [start.getUTCMonth()];
      candidates = months.flatMap((month) => {
        if (rule.byday.length) return monthlyByDay(year, month, rule.byday);
        const days = rule.bymonthday.length ? rule.bymonthday : [start.getUTCDate()];
        return days.map((day) => new Date(Date.UTC(year, month, day)));
      });
    } else {
      // HOURLY/MINUTELY/SECONDLY: rare enough that treating them as their
      // period in milliseconds is both simple and right.
      const ms = { HOURLY: 3_600_000, MINUTELY: 60_000, SECONDLY: 1000 }[rule.freq];
      if (!ms) break;
      candidates = [new Date(start.getTime() + step * ms)];
    }

    candidates = candidates
      .map((day) => withTimeOf(day, start))
      .filter((d) => !Number.isNaN(d.getTime()))
      .filter((d) => rule.freq === "YEARLY" || !rule.bymonth.length || rule.bymonth.includes(d.getUTCMonth() + 1))
      .sort((a, b) => a.getTime() - b.getTime());

    if (rule.bysetpos.length) {
      candidates = rule.bysetpos
        .map((pos) => (pos > 0 ? candidates[pos - 1] : candidates[candidates.length + pos]))
        .filter(Boolean);
    }

    let exhausted = false;
    for (const candidate of candidates) {
      if (candidate < start) continue;
      if (rule.until && candidate > rule.until) {
        exhausted = true;
        break;
      }
      if (rule.count !== undefined && emitted >= rule.count) {
        exhausted = true;
        break;
      }
      emitted++;
      if (keep(candidate)) occurrences.push(candidate);
    }

    // Nothing further can land inside the window once the period clears it.
    if (exhausted || (candidates.length > 0 && candidates[0] > to)) break;
    period++;
  }

  for (const rdate of opts.rdates ?? []) if (keep(rdate)) occurrences.push(rdate);

  const seen = new Set<number>();
  return occurrences
    .filter((d) => !seen.has(d.getTime()) && seen.add(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
}

// ---------------------------------------------------------------------------
// VEVENT
// ---------------------------------------------------------------------------

export interface ParsedAttendee {
  email: string;
  name?: string;
  partstat: string;
  role?: string;
  optional: boolean;
}

export interface ParsedVEvent {
  uid: string;
  summary?: string;
  description?: string;
  location?: string;
  start: IcsTime;
  end: IcsTime;
  allDay: boolean;
  status?: string;
  organizer?: { email: string; name?: string };
  attendees: ParsedAttendee[];
  /** Raw RRULE/RDATE/EXDATE lines, as the server stated them. */
  recurrence: string[];
  rrule?: string;
  rdates: IcsTime[];
  exdates: IcsTime[];
  /** Present on an override that replaces one occurrence of a series. */
  recurrenceId?: IcsTime;
  sequence: number;
  created?: string;
  updated?: string;
  url?: string;
  reminders: number[];
  /** The original component, kept so a patch can leave the rest untouched. */
  component: IcalComponent;
}

function first(component: IcalComponent, name: string): IcalProperty | undefined {
  return component.properties.find((p) => p.name === name);
}

function all(component: IcalComponent, name: string): IcalProperty[] {
  return component.properties.filter((p) => p.name === name);
}

function text(component: IcalComponent, name: string): string | undefined {
  const prop = first(component, name);
  return prop ? unescapeText(prop.value) : undefined;
}

function mailto(value: string): string {
  return value.replace(/^mailto:/i, "").trim();
}

/** "-PT15M" → 15 minutes before. Absolute triggers have no minutes-before to give. */
function triggerMinutes(value: string): number | undefined {
  const m = value.trim().match(/^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m || !value.trim().startsWith("-")) return undefined;
  const [, w, d, h, min] = m;
  return Number(w ?? 0) * 10080 + Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0);
}

export function parseVEvent(component: IcalComponent): ParsedVEvent {
  const startProp = first(component, "DTSTART");
  const start = startProp
    ? parseIcsTime(startProp)
    : { floating: new Date(0), utc: true, dateOnly: false };
  const endProp = first(component, "DTEND");
  const durationProp = first(component, "DURATION");

  // No DTEND means either a DURATION or, for an all-day event, one day.
  let end: IcsTime;
  if (endProp) {
    end = parseIcsTime(endProp);
  } else if (durationProp) {
    const minutes = triggerMinutes(`-${durationProp.value}`) ?? 0;
    end = { ...start, floating: new Date(start.floating.getTime() + minutes * 60_000) };
  } else {
    const bump = start.dateOnly ? 86_400_000 : 0;
    end = { ...start, floating: new Date(start.floating.getTime() + bump) };
  }

  const organizer = first(component, "ORGANIZER");
  return {
    uid: text(component, "UID") ?? "",
    summary: text(component, "SUMMARY"),
    description: text(component, "DESCRIPTION"),
    location: text(component, "LOCATION"),
    start,
    end,
    allDay: start.dateOnly,
    status: text(component, "STATUS"),
    organizer: organizer
      ? { email: mailto(organizer.value), name: organizer.params.CN?.[0] }
      : undefined,
    attendees: all(component, "ATTENDEE").map((a) => ({
      email: mailto(a.value),
      name: a.params.CN?.[0],
      partstat: (a.params.PARTSTAT?.[0] ?? "NEEDS-ACTION").toUpperCase(),
      role: a.params.ROLE?.[0],
      optional: (a.params.ROLE?.[0] ?? "").toUpperCase() === "OPT-PARTICIPANT",
    })),
    recurrence: component.properties
      .filter((p) => p.name === "RRULE" || p.name === "RDATE" || p.name === "EXDATE")
      .map((p) => `${p.name}:${p.value}`),
    rrule: first(component, "RRULE")?.value,
    rdates: all(component, "RDATE").flatMap((p) =>
      splitUnquoted(p.value, ",").map((v) => parseIcsTime({ ...p, value: v })),
    ),
    exdates: all(component, "EXDATE").flatMap((p) =>
      splitUnquoted(p.value, ",").map((v) => parseIcsTime({ ...p, value: v })),
    ),
    recurrenceId: first(component, "RECURRENCE-ID")
      ? parseIcsTime(first(component, "RECURRENCE-ID")!)
      : undefined,
    sequence: Number(text(component, "SEQUENCE") ?? 0) || 0,
    created: text(component, "CREATED"),
    updated: text(component, "LAST-MODIFIED") ?? text(component, "DTSTAMP"),
    url: text(component, "URL"),
    reminders: component.components
      .filter((c) => c.name === "VALARM")
      .flatMap((c) => {
        const minutes = triggerMinutes(first(c, "TRIGGER")?.value ?? "");
        return minutes === undefined ? [] : [minutes];
      }),
    component,
  };
}

/** Every VEVENT in an ICS document, including the overrides of a series. */
export function parseVEvents(ics: string): ParsedVEvent[] {
  return parseIcal(ics)
    .flatMap((root) => (root.name === "VCALENDAR" ? root.components : [root]))
    .filter((c) => c.name === "VEVENT")
    .map(parseVEvent);
}

export function newUid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}@lifeos`;
}

function setProperty(component: IcalComponent, prop: IcalProperty): void {
  const index = component.properties.findIndex((p) => p.name === prop.name);
  if (index === -1) component.properties.push(prop);
  else component.properties[index] = prop;
}

function removeProperties(component: IcalComponent, name: string): void {
  component.properties = component.properties.filter((p) => p.name !== name);
}

function alarm(minutes: number): IcalComponent {
  return {
    name: "VALARM",
    properties: [
      { name: "ACTION", params: {}, value: "DISPLAY" },
      { name: "DESCRIPTION", params: {}, value: "Reminder" },
      { name: "TRIGGER", params: {}, value: `-PT${minutes}M` },
    ],
    components: [],
  };
}

/**
 * Apply the fields LifeOS models onto a VEVENT, leaving every other property
 * exactly as it was. Passing a fresh component builds a new event; passing a
 * parsed one patches it, which is what makes "rename this meeting" safe.
 */
export function applyEventInput(
  component: IcalComponent,
  input: Partial<EventInput>,
  opts: { organizer?: { email: string; name?: string }; now?: Date } = {},
): IcalComponent {
  const now = opts.now ?? new Date();
  const stamp = `${icsDateTime(now)}Z`;

  if (!first(component, "UID")) {
    setProperty(component, { name: "UID", params: {}, value: newUid() });
    setProperty(component, { name: "CREATED", params: {}, value: stamp });
  }
  setProperty(component, { name: "DTSTAMP", params: {}, value: stamp });
  setProperty(component, { name: "LAST-MODIFIED", params: {}, value: stamp });
  setProperty(component, {
    name: "SEQUENCE",
    params: {},
    value: String((Number(text(component, "SEQUENCE") ?? 0) || 0) + 1),
  });

  if (input.summary !== undefined) {
    setProperty(component, { name: "SUMMARY", params: {}, value: escapeText(input.summary) });
  }
  if (input.description !== undefined) {
    setProperty(component, {
      name: "DESCRIPTION",
      params: {},
      value: escapeText(input.description),
    });
  }
  if (input.location !== undefined) {
    setProperty(component, { name: "LOCATION", params: {}, value: escapeText(input.location) });
  }
  if (input.start) {
    setProperty(component, eventTimeToProperty("DTSTART", input.start));
    // DTEND and DURATION are mutually exclusive; moving the start invalidates
    // a stale DURATION left over from whatever wrote the event before us.
    if (input.end) removeProperties(component, "DURATION");
  }
  if (input.end) setProperty(component, eventTimeToProperty("DTEND", input.end));

  if (input.attendees) {
    removeProperties(component, "ATTENDEE");
    if (opts.organizer) {
      setProperty(component, {
        name: "ORGANIZER",
        params: opts.organizer.name ? { CN: [opts.organizer.name] } : {},
        value: `mailto:${opts.organizer.email}`,
      });
    }
    for (const attendee of input.attendees) {
      component.properties.push({
        name: "ATTENDEE",
        params: {
          ...(attendee.name ? { CN: [attendee.name] } : {}),
          ROLE: [attendee.optional ? "OPT-PARTICIPANT" : "REQ-PARTICIPANT"],
          PARTSTAT: ["NEEDS-ACTION"],
          RSVP: ["TRUE"],
        },
        value: `mailto:${attendee.email}`,
      });
    }
  }

  if (input.recurrence) {
    removeProperties(component, "RRULE");
    removeProperties(component, "RDATE");
    for (const line of input.recurrence) {
      const prop = parseProperty(line.includes(":") ? line : `RRULE:${line}`);
      component.properties.push(prop);
    }
  }

  if (input.reminders) {
    component.components = component.components.filter((c) => c.name !== "VALARM");
    component.components.push(...input.reminders.map(alarm));
  }

  if (!first(component, "STATUS")) {
    setProperty(component, { name: "STATUS", params: {}, value: "CONFIRMED" });
  }
  return component;
}

export function newVEvent(
  input: EventInput,
  opts: { organizer?: { email: string; name?: string }; now?: Date } = {},
): IcalComponent {
  return applyEventInput(
    { name: "VEVENT", properties: [], components: [] },
    input,
    opts,
  );
}
