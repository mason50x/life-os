/**
 * iCloud Calendar over CalDAV (RFC 4791), hand-rolled the same way
 * providers/icloud.ts is hand-rolled over IMAP — and authenticating with the
 * very same app-specific password, so connecting Apple Calendar asks the user
 * for nothing they haven't already given.
 *
 * Apple has no calendar REST API. Everything here is PROPFIND/REPORT/PUT with
 * XML bodies, and the recurrence expansion CalDAV leaves to the client lives in
 * ../ical.ts.
 */

import {
  Attendee,
  AttendeeResponse,
  BusyBlock,
  Calendar,
  CalendarEvent,
  CalendarProvider,
  EventInput,
  ListEventsOptions,
  ProviderApiError,
  RecurrenceScope,
} from "../types";
import {
  IcalComponent,
  ParsedVEvent,
  applyEventInput,
  buildVTimezone,
  expandRecurrence,
  icsTimeToEventTime,
  newUid,
  newVEvent,
  parseIcsTime,
  parseVEvent,
  parseVEvents,
  referencedZones,
  serializeIcal,
  toInstant,
  wrapCalendar,
} from "../ical";

const ROOT = "https://caldav.icloud.com";

/** Separates a series resource from the one occurrence an id points at. */
const OCCURRENCE_SEPARATOR = "::";

const PARTSTAT_IN: Record<string, AttendeeResponse> = {
  ACCEPTED: "accepted",
  DECLINED: "declined",
  TENTATIVE: "tentative",
  "NEEDS-ACTION": "needsAction",
};

const PARTSTAT_OUT: Record<Exclude<AttendeeResponse, "needsAction">, string> = {
  accepted: "ACCEPTED",
  declined: "DECLINED",
  tentative: "TENTATIVE",
};

// ---------------------------------------------------------------------------
// A very small XML reader
// ---------------------------------------------------------------------------

interface XmlNode {
  /** Local name, lower-cased — namespace prefixes are stripped. */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

/**
 * Enough XML to read a WebDAV multistatus: elements, attributes, text and
 * CDATA. Namespaces are handled by ignoring prefixes, which is safe because no
 * two elements CalDAV replies use share a local name across namespaces.
 */
function parseXml(source: string): XmlNode | null {
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  const tag = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const appendText = (value: string) => {
    if (stack.length && value) stack[stack.length - 1].text += value;
  };

  while ((match = tag.exec(source))) {
    appendText(decodeEntities(source.slice(lastIndex, match.index)));
    lastIndex = tag.lastIndex;

    if (match[1] !== undefined) {
      appendText(match[1]);
      continue;
    }
    const raw = match[0];
    if (raw.startsWith("<!--") || raw.startsWith("<?")) continue;

    const name = (match[2] ?? "").split(":").pop()!.toLowerCase();
    if (raw.startsWith("</")) {
      stack.pop();
      continue;
    }

    const attrs: Record<string, string> = {};
    for (const attr of (match[3] ?? "").matchAll(/([^\s=]+)\s*=\s*"([^"]*)"|([^\s=]+)\s*=\s*'([^']*)'/g)) {
      const key = (attr[1] ?? attr[3]).split(":").pop()!.toLowerCase();
      attrs[key] = decodeEntities(attr[2] ?? attr[4] ?? "");
    }
    const node: XmlNode = { name, attrs, children: [], text: "" };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else root ??= node;
    if (!match[4]) stack.push(node);
  }
  return root;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findAll(node: XmlNode | null, name: string): XmlNode[] {
  if (!node) return [];
  const out: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    if (n.name === name) out.push(n);
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function find(node: XmlNode | null, name: string): XmlNode | undefined {
  return findAll(node, name)[0];
}

/** A propstat block only counts when its own status was 2xx. */
function okProps(response: XmlNode): XmlNode[] {
  return response.children
    .filter((c) => c.name === "propstat")
    .filter((p) => /\s2\d\d\s/.test(find(p, "status")?.text ?? " 200 "))
    .flatMap((p) => p.children.filter((c) => c.name === "prop"));
}

function propOf(response: XmlNode, name: string): XmlNode | undefined {
  for (const prop of okProps(response)) {
    const found = prop.children.find((c) => c.name === name);
    if (found) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface Discovered {
  home: string;
  /** Every address the principal answers to, for spotting our own RSVP line. */
  selfAddresses: Set<string>;
}

interface Resource {
  url: string;
  etag?: string;
  ics: string;
}

const PROPFIND_PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;

const PROPFIND_HOME = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>
<c:calendar-home-set/><c:calendar-user-address-set/></d:prop></d:propfind>`;

const PROPFIND_CALENDARS = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:i="http://apple.com/ns/ical/">
<d:prop><d:displayname/><d:resourcetype/><d:current-user-privilege-set/>
<c:supported-calendar-component-set/><c:calendar-description/><c:calendar-timezone/>
<i:calendar-color/></d:prop></d:propfind>`;

export class IcloudCalendarProvider implements CalendarProvider {
  readonly provider = "icloud" as const;

  private discovery?: Promise<Discovered>;
  /** calendarId (collection segment) → collection URL, filled by listCalendars. */
  private collections = new Map<string, string>();

  constructor(
    readonly email: string,
    private readonly getPassword: () => Promise<string>,
    /**
     * The primary iCloud address that signs in, when `email` is a
     * custom-domain alias — the same split providers/icloud.ts makes.
     */
    private readonly loginEmail: string = email,
  ) {}

  /** Prove a credential reaches iCloud Calendar, without storing anything. */
  static async verify(loginEmail: string, password: string): Promise<void> {
    const provider = new IcloudCalendarProvider(loginEmail, async () => password, loginEmail);
    await provider.discover();
  }

  private async request(
    url: string,
    init: RequestInit & { depth?: string } = {},
  ): Promise<{ status: number; body: string; etag?: string }> {
    const password = await this.getPassword();
    const auth = Buffer.from(`${this.loginEmail}:${password}`, "utf8").toString("base64");
    const { depth, ...rest } = init;
    const res = await fetch(url, {
      ...rest,
      headers: {
        Authorization: `Basic ${auth}`,
        ...(depth ? { Depth: depth } : {}),
        ...(rest.body ? { "Content-Type": "application/xml; charset=utf-8" } : {}),
        ...rest.headers,
      },
      redirect: "follow",
    });
    const body = res.status === 204 ? "" : await res.text();
    if (!res.ok) {
      throw new ProviderApiError(
        "icloud",
        res.status,
        res.status === 401
          ? "iCloud rejected the app-specific password for calendar access."
          : body.slice(0, 500) || res.statusText,
      );
    }
    return { status: res.status, body, etag: res.headers.get("etag") ?? undefined };
  }

  private discover(): Promise<Discovered> {
    // One discovery per provider instance: three round trips before any read
    // would otherwise be three round trips before *every* read.
    this.discovery ??= (async () => {
      const principalRes = await this.request(`${ROOT}/`, {
        method: "PROPFIND",
        depth: "0",
        body: PROPFIND_PRINCIPAL,
      });
      const principalHref = find(
        find(parseXml(principalRes.body), "current-user-principal") ?? null,
        "href",
      )?.text;
      if (!principalHref) {
        throw new ProviderApiError("icloud", 502, "iCloud didn't return a CalDAV principal.");
      }
      const principal = new URL(principalHref, ROOT).toString();

      const homeRes = await this.request(principal, {
        method: "PROPFIND",
        depth: "0",
        body: PROPFIND_HOME,
      });
      const homeDoc = parseXml(homeRes.body);
      const homeHref = find(find(homeDoc, "calendar-home-set") ?? null, "href")?.text;
      if (!homeHref) {
        throw new ProviderApiError("icloud", 502, "iCloud didn't return a calendar home.");
      }
      const selfAddresses = new Set(
        findAll(find(homeDoc, "calendar-user-address-set") ?? null, "href")
          .map((h) => h.text.replace(/^mailto:/i, "").toLowerCase())
          .filter((a) => a.includes("@")),
      );
      selfAddresses.add(this.email.toLowerCase());
      selfAddresses.add(this.loginEmail.toLowerCase());

      return { home: new URL(homeHref, principal).toString(), selfAddresses };
    })();
    return this.discovery;
  }

  private async collectionUrl(calendarId: string): Promise<string> {
    const known = this.collections.get(calendarId);
    if (known) return known;
    await this.listCalendars();
    const found = this.collections.get(calendarId);
    if (!found) {
      throw new ProviderApiError(
        "icloud",
        404,
        `No calendar "${calendarId}" on ${this.email}. Call list_calendars for the ids that exist.`,
      );
    }
    return found;
  }

  async listCalendars(): Promise<Calendar[]> {
    const { home } = await this.discover();
    const res = await this.request(home, {
      method: "PROPFIND",
      depth: "1",
      body: PROPFIND_CALENDARS,
    });

    const calendars: Calendar[] = [];
    for (const response of findAll(parseXml(res.body), "response")) {
      const href = find(response, "href")?.text;
      if (!href) continue;
      const url = new URL(href, home).toString();
      // The home collection itself comes back in a Depth 1 listing.
      if (url.replace(/\/$/, "") === home.replace(/\/$/, "")) continue;
      // Only collections that hold events — iCloud also exposes task lists.
      const components = findAll(propOf(response, "supported-calendar-component-set") ?? null, "comp");
      if (!components.some((c) => (c.attrs.name ?? "").toUpperCase() === "VEVENT")) continue;
      if (!find(propOf(response, "resourcetype") ?? null, "calendar")) continue;

      const id = decodeURIComponent(url.replace(/\/$/, "").split("/").pop() ?? "");
      if (!id) continue;
      this.collections.set(id, url.endsWith("/") ? url : `${url}/`);

      const privileges = findAll(propOf(response, "current-user-privilege-set") ?? null, "privilege");
      const canWrite = privileges.some((p) =>
        p.children.some((c) => c.name === "write" || c.name === "write-content" || c.name === "all"),
      );
      const timezone = propOf(response, "calendar-timezone")?.text;
      calendars.push({
        id,
        account: this.email,
        provider: "icloud",
        name: propOf(response, "displayname")?.text || id,
        description: propOf(response, "calendar-description")?.text || undefined,
        // The calendar's default zone is stated as a whole VTIMEZONE.
        timeZone: timezone?.match(/^TZID:(.+)$/m)?.[1]?.trim(),
        color: propOf(response, "calendar-color")?.text || undefined,
        readOnly: privileges.length > 0 ? !canWrite : undefined,
      });
    }
    return calendars;
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  private async resourcesIn(calendarId: string, from: Date, to: Date): Promise<Resource[]> {
    const url = await this.collectionUrl(calendarId);
    const stamp = (d: Date) => `${d.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
    const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
<d:prop><d:getetag/><c:calendar-data/></d:prop>
<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
<c:time-range start="${stamp(from)}" end="${stamp(to)}"/>
</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;

    const res = await this.request(url, { method: "REPORT", depth: "1", body });
    return findAll(parseXml(res.body), "response").flatMap((response) => {
      const href = find(response, "href")?.text;
      const ics = propOf(response, "calendar-data")?.text;
      if (!href || !ics?.includes("BEGIN:VEVENT")) return [];
      return [
        {
          url: new URL(href, url).toString(),
          etag: propOf(response, "getetag")?.text,
          ics,
        },
      ];
    });
  }

  /** The id half of an event id: the resource filename without its extension. */
  private static stemOf(url: string): string {
    return decodeURIComponent(url.split("/").pop() ?? "").replace(/\.ics$/i, "");
  }

  private toAttendees(event: ParsedVEvent, selfAddresses: Set<string>): Attendee[] {
    return event.attendees.map((a) => ({
      email: a.email,
      name: a.name,
      response: PARTSTAT_IN[a.partstat] ?? "needsAction",
      optional: a.optional || undefined,
      organizer: event.organizer?.email.toLowerCase() === a.email.toLowerCase() || undefined,
      self: selfAddresses.has(a.email.toLowerCase()) || undefined,
    }));
  }

  private toEvent(
    calendarId: string,
    resource: Resource,
    event: ParsedVEvent,
    selfAddresses: Set<string>,
    occurrence?: { start: Date; end: Date },
  ): CalendarEvent {
    const stem = IcloudCalendarProvider.stemOf(resource.url);
    const attendees = this.toAttendees(event, selfAddresses);
    const start = occurrence ? { ...event.start, floating: occurrence.start } : event.start;
    const end = occurrence ? { ...event.end, floating: occurrence.end } : event.end;
    const status = (event.status ?? "CONFIRMED").toUpperCase();
    return {
      id: occurrence
        ? `${stem}${OCCURRENCE_SEPARATOR}${occurrence.start.toISOString()}`
        : stem,
      calendarId,
      account: this.email,
      provider: "icloud",
      summary: event.summary ?? "(no title)",
      description: event.description,
      location: event.location,
      start: icsTimeToEventTime(start),
      end: icsTimeToEventTime(end),
      allDay: event.allDay,
      status: status === "CANCELLED" ? "cancelled" : status === "TENTATIVE" ? "tentative" : "confirmed",
      organizer: event.organizer,
      attendees: attendees.length ? attendees : undefined,
      recurrence: event.recurrence.length ? event.recurrence : undefined,
      recurringEventId: occurrence ? stem : undefined,
      url: event.url,
      reminders: event.reminders.length ? event.reminders : undefined,
      myResponse: attendees.find((a) => a.self)?.response,
      created: event.created,
      updated: event.updated,
      etag: resource.etag,
    };
  }

  /**
   * One CalDAV resource can hold a whole series: a master VEVENT plus a
   * RECURRENCE-ID override per edited occurrence. iCloud returns it as-is and
   * expects the client to expand it, so this is where a week of a repeating
   * meeting turns into a week's worth of events.
   */
  private expand(
    calendarId: string,
    resource: Resource,
    selfAddresses: Set<string>,
    from: Date,
    to: Date,
  ): CalendarEvent[] {
    const events = parseVEvents(resource.ics);
    const master = events.find((e) => !e.recurrenceId);
    const overrides = events.filter((e) => e.recurrenceId);
    if (!master) {
      return overrides.map((o) => this.toEvent(calendarId, resource, o, selfAddresses));
    }
    if (!master.rrule && !master.rdates.length) {
      const start = toInstant(master.start);
      return start >= from && start <= to
        ? [this.toEvent(calendarId, resource, master, selfAddresses)]
        : [];
    }

    // Expansion happens in wall-clock space so a 10am meeting stays at 10am
    // across a DST boundary; the window is converted into that space first.
    const zone = master.start.tzid;
    const shift = (d: Date) =>
      zone ? new Date(d.getTime() + zoneShiftMinutes(d, zone) * 60_000) : d;
    const duration = master.end.floating.getTime() - master.start.floating.getTime();
    const overrideBy = new Map(
      overrides.map((o) => [toInstant(o.recurrenceId!).getTime(), o]),
    );

    return expandRecurrence({
      start: master.start.floating,
      rrule: master.rrule,
      rdates: master.rdates.map((r) => r.floating),
      exdates: master.exdates.map((r) => r.floating),
      from: shift(from),
      to: shift(to),
    }).map((floatingStart) => {
      const instant = toInstant({ ...master.start, floating: floatingStart });
      const override = overrideBy.get(instant.getTime());
      if (override) return this.toEvent(calendarId, resource, override, selfAddresses);
      return this.toEvent(calendarId, resource, master, selfAddresses, {
        start: floatingStart,
        end: new Date(floatingStart.getTime() + duration),
      });
    });
  }

  private async eachCalendar(
    calendarIds: string[] | undefined,
    fn: (id: string) => Promise<CalendarEvent[]>,
  ): Promise<CalendarEvent[]> {
    const ids = calendarIds?.length ? calendarIds : (await this.listCalendars()).map((c) => c.id);
    const results = await Promise.allSettled(ids.map(fn));
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  }

  async listEvents(opts: ListEventsOptions): Promise<CalendarEvent[]> {
    const { selfAddresses } = await this.discover();
    const from = new Date(opts.from);
    const to = new Date(opts.to);
    const events = await this.eachCalendar(opts.calendarIds, async (id) => {
      const resources = await this.resourcesIn(id, from, to);
      return resources.flatMap((r) => this.expand(id, r, selfAddresses, from, to));
    });
    events.sort((a, b) => startMs(a) - startMs(b));
    return opts.maxResults ? events.slice(0, opts.maxResults) : events;
  }

  /**
   * iCloud's CalDAV text-match is unreliable across property types, so the
   * window is fetched and matched here — the same work the server would do,
   * with results we can trust.
   */
  async searchEvents(query: string, opts: ListEventsOptions): Promise<CalendarEvent[]> {
    const needle = query.trim().toLowerCase();
    const events = await this.listEvents({ ...opts, maxResults: undefined });
    const matched = needle
      ? events.filter((e) =>
          [e.summary, e.description, e.location, ...(e.attendees ?? []).map((a) => a.email)]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(needle)),
        )
      : events;
    return opts.maxResults ? matched.slice(0, opts.maxResults) : matched;
  }

  /** Fetch one resource whole, by the stem half of an event id. */
  private async resourceFor(calendarId: string, eventId: string): Promise<Resource> {
    const [stem] = eventId.split(OCCURRENCE_SEPARATOR);
    const url = `${await this.collectionUrl(calendarId)}${encodeURIComponent(stem)}.ics`;
    const res = await this.request(url, { method: "GET" });
    if (!res.body.includes("BEGIN:VEVENT")) {
      throw new ProviderApiError("icloud", 404, `No event "${eventId}" on calendar ${calendarId}.`);
    }
    return { url, etag: res.etag, ics: res.body };
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    const { selfAddresses } = await this.discover();
    const resource = await this.resourceFor(calendarId, eventId);
    const [, occurrenceIso] = eventId.split(OCCURRENCE_SEPARATOR);
    const events = parseVEvents(resource.ics);

    if (occurrenceIso) {
      const at = new Date(occurrenceIso);
      const override = events.find(
        (e) => e.recurrenceId && toInstant(e.recurrenceId).getTime() === at.getTime(),
      );
      if (override) return this.toEvent(calendarId, resource, override, selfAddresses);
      const master = events.find((e) => !e.recurrenceId);
      if (master) {
        const duration = master.end.floating.getTime() - master.start.floating.getTime();
        const floating = floatingFor(at, master.start.tzid);
        return this.toEvent(calendarId, resource, master, selfAddresses, {
          start: floating,
          end: new Date(floating.getTime() + duration),
        });
      }
    }
    const master = events.find((e) => !e.recurrenceId) ?? events[0];
    return this.toEvent(calendarId, resource, master, selfAddresses);
  }

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  /** Serialize a set of VEVENTs with the VTIMEZONEs their TZIDs depend on. */
  private document(events: IcalComponent[]): string {
    const zones = [...new Set(events.flatMap(referencedZones))];
    return wrapCalendar([...zones.map((z) => buildVTimezone(z)), ...events]);
  }

  private async put(
    url: string,
    events: IcalComponent[],
    guard: { etag?: string; mustBeNew?: boolean },
  ): Promise<string | undefined> {
    const res = await this.request(url, {
      method: "PUT",
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        // Lost-update protection: refuse to overwrite a version we didn't read.
        ...(guard.mustBeNew ? { "If-None-Match": "*" } : {}),
        ...(guard.etag ? { "If-Match": guard.etag } : {}),
      },
      body: this.document(events),
    });
    return res.etag;
  }

  async createEvent(calendarId: string, input: EventInput): Promise<CalendarEvent> {
    const uid = newUid();
    const stem = uid.split("@")[0];
    const url = `${await this.collectionUrl(calendarId)}${encodeURIComponent(stem)}.ics`;
    const component = newVEvent(input, {
      organizer: input.attendees?.length ? { email: this.email } : undefined,
    });
    setValue(component, "UID", uid);
    await this.put(url, [component], { mustBeNew: true });
    // Read back rather than trusting the local copy: iCloud normalises times
    // and may add scheduling properties of its own.
    return this.getEvent(calendarId, stem);
  }

  /**
   * Rewrite one resource under an If-Match guard. Every write below funnels
   * through here so no two of them can drift on concurrency handling.
   */
  private async rewrite(
    calendarId: string,
    eventId: string,
    edit: (events: ParsedVEvent[], resource: Resource) => IcalComponent[] | null,
  ): Promise<void> {
    const resource = await this.resourceFor(calendarId, eventId);
    const events = parseVEvents(resource.ics);
    const next = edit(events, resource);
    if (next === null) {
      await this.request(resource.url, {
        method: "DELETE",
        headers: resource.etag ? { "If-Match": resource.etag } : {},
      });
      return;
    }
    await this.put(resource.url, next, { etag: resource.etag });
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    patch: Partial<EventInput>,
    scope: RecurrenceScope = "this",
  ): Promise<CalendarEvent> {
    const [stem, occurrenceIso] = eventId.split(OCCURRENCE_SEPARATOR);
    let followingId: string | undefined;

    await this.rewrite(calendarId, eventId, (events) => {
      const master = events.find((e) => !e.recurrenceId);
      const components = events.map((e) => e.component);

      // A plain event, or an edit meant for the whole series: patch in place.
      if (!occurrenceIso || scope === "all" || !master?.rrule) {
        const target = occurrenceIso
          ? (events.find(
              (e) =>
                e.recurrenceId &&
                toInstant(e.recurrenceId).getTime() === new Date(occurrenceIso).getTime(),
            ) ?? master)
          : master;
        if (!target) return components;
        applyEventInput(target.component, patch);
        return components;
      }

      const at = new Date(occurrenceIso);
      if (scope === "following") {
        // Close the old series the moment before this occurrence, then let the
        // caller start a fresh one — CalDAV has no "and following" of its own.
        const rule = master.rrule.replace(/;?UNTIL=[^;]*/i, "");
        setValue(
          master.component,
          "RRULE",
          `${rule};UNTIL=${at.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
        );
        followingId = stem;
        return components;
      }

      // "this": patch the existing override, or mint one for this occurrence.
      const existing = events.find(
        (e) => e.recurrenceId && toInstant(e.recurrenceId).getTime() === at.getTime(),
      );
      if (existing) {
        applyEventInput(existing.component, patch);
        return components;
      }
      const override = cloneComponent(master.component);
      stripRecurrence(override);
      const floating = floatingFor(at, master.start.tzid);
      const duration = master.end.floating.getTime() - master.start.floating.getTime();
      setValue(override, "RECURRENCE-ID", valueOfDtstart(master, floating), dtstartParams(master));
      applyEventInput(override, {
        start: icsTimeToEventTime({ ...master.start, floating }),
        end: icsTimeToEventTime({
          ...master.end,
          floating: new Date(floating.getTime() + duration),
        }),
        ...patch,
      });
      return [...components, override];
    });

    if (followingId) {
      const master = parseVEvents((await this.resourceFor(calendarId, followingId)).ics).find(
        (e) => !e.recurrenceId,
      );
      const duration = master
        ? master.end.floating.getTime() - master.start.floating.getTime()
        : 3_600_000;
      const at = new Date(occurrenceIso);
      const created = await this.createEvent(calendarId, {
        summary: patch.summary ?? master?.summary ?? "(no title)",
        description: patch.description ?? master?.description,
        location: patch.location ?? master?.location,
        start: patch.start ?? icsTimeToEventTime({ ...master!.start, floating: floatingFor(at, master!.start.tzid) }),
        end:
          patch.end ??
          icsTimeToEventTime({
            ...master!.end,
            floating: new Date(floatingFor(at, master!.start.tzid).getTime() + duration),
          }),
        recurrence: patch.recurrence ?? (master?.rrule ? [`RRULE:${master.rrule.replace(/;?UNTIL=[^;]*/i, "")}`] : undefined),
        reminders: patch.reminders ?? master?.reminders,
      });
      return created;
    }

    return this.getEvent(calendarId, eventId);
  }

  async deleteEvent(
    calendarId: string,
    eventId: string,
    scope: RecurrenceScope = "this",
  ): Promise<void> {
    const [, occurrenceIso] = eventId.split(OCCURRENCE_SEPARATOR);
    await this.rewrite(calendarId, eventId, (events) => {
      const master = events.find((e) => !e.recurrenceId);
      if (!occurrenceIso || scope === "all" || !master?.rrule) return null;

      const at = new Date(occurrenceIso);
      const stamp = (floating: Date) => valueOfDtstart(master, floating);
      const floating = floatingFor(at, master.start.tzid);

      if (scope === "following") {
        const rule = master.rrule.replace(/;?UNTIL=[^;]*/i, "");
        setValue(
          master.component,
          "RRULE",
          `${rule};UNTIL=${at.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
        );
      } else {
        // Cancelling one occurrence is an EXDATE, plus dropping any override
        // that was standing in for it.
        master.component.properties.push({
          name: "EXDATE",
          params: dtstartParams(master),
          value: stamp(floating),
        });
      }
      const keep = events.filter(
        (e) => !(e.recurrenceId && toInstant(e.recurrenceId).getTime() === at.getTime()),
      );
      return keep.map((e) => e.component);
    });
  }

  async respondToEvent(
    calendarId: string,
    eventId: string,
    response: Exclude<AttendeeResponse, "needsAction">,
    comment?: string,
  ): Promise<void> {
    const { selfAddresses } = await this.discover();
    let found = false;
    await this.rewrite(calendarId, eventId, (events) => {
      for (const event of events) {
        for (const prop of event.component.properties) {
          if (prop.name !== "ATTENDEE") continue;
          const address = prop.value.replace(/^mailto:/i, "").toLowerCase();
          if (!selfAddresses.has(address)) continue;
          found = true;
          prop.params.PARTSTAT = [PARTSTAT_OUT[response]];
          delete prop.params.RSVP;
          if (comment) prop.params["X-RESPONSE-COMMENT"] = [comment];
        }
      }
      return events.map((e) => e.component);
    });
    if (!found) {
      throw new ProviderApiError(
        "icloud",
        400,
        `${this.email} isn't on the guest list for this event, so there is nothing to RSVP to.`,
      );
    }
  }

  /** CalDAV has no move: copy the resource across, then drop the original. */
  async moveEvent(
    calendarId: string,
    eventId: string,
    toCalendarId: string,
  ): Promise<CalendarEvent> {
    const resource = await this.resourceFor(calendarId, eventId);
    const stem = IcloudCalendarProvider.stemOf(resource.url);
    const destination = `${await this.collectionUrl(toCalendarId)}${encodeURIComponent(stem)}.ics`;
    await this.request(resource.url, {
      method: "MOVE",
      headers: { Destination: destination, Overwrite: "F" },
    });
    return this.getEvent(toCalendarId, stem);
  }

  /**
   * Computed from the events themselves rather than a free-busy-query: iCloud
   * answers that report inconsistently across shared calendars, and this way
   * declined and transparent events are correctly not busy.
   */
  async freeBusy(opts: { calendarIds?: string[]; from: string; to: string }): Promise<BusyBlock[]> {
    const events = await this.listEvents({ ...opts, from: opts.from, to: opts.to });
    return events
      .filter((e) => e.status !== "cancelled" && e.myResponse !== "declined")
      .map((e) => ({
        start: e.start.dateTime ?? `${e.start.date}T00:00:00.000Z`,
        end: e.end.dateTime ?? `${e.end.date}T00:00:00.000Z`,
        calendarId: e.calendarId,
        account: this.email,
      }));
  }

  async createCalendar(
    name: string,
    opts?: { description?: string; timeZone?: string },
  ): Promise<Calendar> {
    const { home } = await this.discover();
    const id = `lifeos-${Date.now().toString(36)}`;
    const body = `<?xml version="1.0" encoding="utf-8"?>
<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop>
<d:displayname>${escapeXml(name)}</d:displayname>
${opts?.description ? `<c:calendar-description>${escapeXml(opts.description)}</c:calendar-description>` : ""}
<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
</d:prop></d:set></c:mkcalendar>`;
    await this.request(`${home}${id}/`, { method: "MKCALENDAR", body });
    this.collections.clear();
    const created = (await this.listCalendars()).find((c) => c.id === id);
    if (!created) {
      throw new ProviderApiError("icloud", 502, `iCloud accepted the new calendar "${name}" but didn't list it back.`);
    }
    return created;
  }

  async updateCalendar(
    calendarId: string,
    patch: { name?: string; description?: string; color?: string },
  ): Promise<Calendar> {
    const url = await this.collectionUrl(calendarId);
    const sets = [
      patch.name !== undefined ? `<d:displayname>${escapeXml(patch.name)}</d:displayname>` : "",
      patch.description !== undefined
        ? `<c:calendar-description>${escapeXml(patch.description)}</c:calendar-description>`
        : "",
      patch.color !== undefined ? `<i:calendar-color>${escapeXml(patch.color)}</i:calendar-color>` : "",
    ].filter(Boolean);
    if (sets.length) {
      await this.request(url, {
        method: "PROPPATCH",
        body: `<?xml version="1.0" encoding="utf-8"?>
<d:propertyupdate xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:i="http://apple.com/ns/ical/">
<d:set><d:prop>${sets.join("")}</d:prop></d:set></d:propertyupdate>`,
      });
    }
    const updated = (await this.listCalendars()).find((c) => c.id === calendarId);
    if (!updated) throw new ProviderApiError("icloud", 404, `No calendar "${calendarId}".`);
    return updated;
  }

  async deleteCalendar(calendarId: string): Promise<void> {
    const url = await this.collectionUrl(calendarId);
    await this.request(url, { method: "DELETE" });
    this.collections.delete(calendarId);
  }
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function startMs(event: CalendarEvent): number {
  return new Date(event.start.dateTime ?? `${event.start.date}T00:00:00Z`).getTime();
}

/** Minutes to add to an instant to reach the wall clock recurrence expands in. */
function zoneShiftMinutes(instant: Date, timeZone: string): number {
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
  return (
    (Date.UTC(f.year, f.month - 1, f.day, f.hour % 24, f.minute, f.second) - instant.getTime()) /
    60_000
  );
}

/** An instant back into the wall-clock space a zoned event recurs in. */
function floatingFor(instant: Date, timeZone?: string): Date {
  return timeZone
    ? new Date(instant.getTime() + zoneShiftMinutes(instant, timeZone) * 60_000)
    : instant;
}

function setValue(
  component: IcalComponent,
  name: string,
  value: string,
  params: Record<string, string[]> = {},
): void {
  const index = component.properties.findIndex((p) => p.name === name);
  const prop = { name, params, value };
  if (index === -1) component.properties.push(prop);
  else component.properties[index] = prop;
}

function cloneComponent(component: IcalComponent): IcalComponent {
  return parseVEvent(
    parseVEvents(wrapCalendar([component]))[0]?.component ?? component,
  ).component;
}

function stripRecurrence(component: IcalComponent): void {
  component.properties = component.properties.filter(
    (p) => p.name !== "RRULE" && p.name !== "RDATE" && p.name !== "EXDATE",
  );
}

/** RECURRENCE-ID and EXDATE must be stated the same way DTSTART is. */
function dtstartParams(master: ParsedVEvent): Record<string, string[]> {
  if (master.start.dateOnly) return { VALUE: ["DATE"] };
  return master.start.tzid ? { TZID: [master.start.tzid] } : {};
}

function valueOfDtstart(master: ParsedVEvent, floating: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${floating.getUTCFullYear()}${pad(floating.getUTCMonth() + 1)}${pad(floating.getUTCDate())}`;
  if (master.start.dateOnly) return date;
  const time = `T${pad(floating.getUTCHours())}${pad(floating.getUTCMinutes())}${pad(floating.getUTCSeconds())}`;
  return master.start.tzid ? `${date}${time}` : `${date}${time}Z`;
}

// `serializeIcal` and `parseIcsTime` are re-exported through the module graph
// for the tests that drive this provider's ICS handling directly.
export { parseIcsTime, serializeIcal };
