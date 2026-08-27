import {
  Attendee,
  AttendeeResponse,
  BusyBlock,
  Calendar,
  CalendarEvent,
  CalendarProvider,
  EventInput,
  EventTime,
  ListEventsOptions,
  ProviderApiError,
  RecurrenceScope,
} from "../types";

const BASE = "https://www.googleapis.com/calendar/v3";

type GoogleTime = { date?: string; dateTime?: string; timeZone?: string };

type GoogleAttendee = {
  email?: string;
  displayName?: string;
  responseStatus?: string;
  optional?: boolean;
  organizer?: boolean;
  self?: boolean;
};

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleTime;
  end?: GoogleTime;
  organizer?: { email?: string; displayName?: string };
  attendees?: GoogleAttendee[];
  recurrence?: string[];
  recurringEventId?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  reminders?: { useDefault?: boolean; overrides?: { minutes?: number }[] };
  created?: string;
  updated?: string;
  etag?: string;
};

type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  description?: string;
  timeZone?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: string;
};

/** Google's responseStatus vocabulary, which is nearly but not quite ours. */
const RESPONSE_IN: Record<string, AttendeeResponse> = {
  accepted: "accepted",
  declined: "declined",
  tentative: "tentative",
  needsAction: "needsAction",
};

function toEventTime(t: GoogleTime | undefined): EventTime {
  if (!t) return {};
  if (t.date) return { date: t.date };
  return { dateTime: t.dateTime, timeZone: t.timeZone };
}

function fromEventTime(t: EventTime): GoogleTime {
  if (t.date) return { date: t.date };
  return { dateTime: t.dateTime, ...(t.timeZone ? { timeZone: t.timeZone } : {}) };
}

function toAttendee(a: GoogleAttendee): Attendee | null {
  if (!a.email) return null;
  return {
    email: a.email,
    name: a.displayName,
    response: RESPONSE_IN[a.responseStatus ?? "needsAction"] ?? "needsAction",
    optional: a.optional,
    organizer: a.organizer,
    self: a.self,
  };
}

/**
 * Google exposes the meeting link in three places depending on how the event
 * was made; the first one present is the one to hand back.
 */
function conferencingOf(e: GoogleEvent): string | undefined {
  if (e.hangoutLink) return e.hangoutLink;
  return e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly provider = "gmail" as const;

  constructor(
    readonly email: string,
    private readonly getAccessToken: () => Promise<string>,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      throw new ProviderApiError("gmail", res.status, await res.text());
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private toCalendar(c: GoogleCalendarListEntry): Calendar {
    return {
      id: c.id,
      account: this.email,
      provider: "gmail",
      name: c.summaryOverride ?? c.summary ?? c.id,
      description: c.description,
      timeZone: c.timeZone,
      color: c.backgroundColor,
      isPrimary: c.primary,
      readOnly: c.accessRole === "reader" || c.accessRole === "freeBusyReader",
    };
  }

  private toEvent(calendarId: string, e: GoogleEvent): CalendarEvent {
    const attendees = (e.attendees ?? []).flatMap((a) => {
      const mapped = toAttendee(a);
      return mapped ? [mapped] : [];
    });
    const allDay = Boolean(e.start?.date);
    return {
      id: e.id,
      calendarId,
      account: this.email,
      provider: "gmail",
      summary: e.summary ?? "(no title)",
      description: e.description,
      location: e.location,
      start: toEventTime(e.start),
      end: toEventTime(e.end),
      allDay,
      status: e.status === "cancelled" || e.status === "tentative" ? e.status : "confirmed",
      organizer: e.organizer?.email
        ? { email: e.organizer.email, name: e.organizer.displayName }
        : undefined,
      attendees: attendees.length ? attendees : undefined,
      recurrence: e.recurrence,
      recurringEventId: e.recurringEventId,
      url: e.htmlLink,
      conferencing: conferencingOf(e),
      reminders: e.reminders?.overrides?.flatMap((r) =>
        typeof r.minutes === "number" ? [r.minutes] : [],
      ),
      myResponse: attendees.find((a) => a.self)?.response,
      created: e.created,
      updated: e.updated,
      etag: e.etag,
    };
  }

  async listCalendars(): Promise<Calendar[]> {
    const list = await this.request<{ items?: GoogleCalendarListEntry[] }>(
      "/users/me/calendarList?maxResults=250",
    );
    return (list.items ?? []).map((c) => this.toCalendar(c));
  }

  /**
   * Every read fans out across the requested calendars the way search_emails
   * fans out across accounts: one slow or broken calendar reports itself
   * rather than sinking the rest.
   */
  private async eachCalendar(
    calendarIds: string[] | undefined,
    fn: (id: string) => Promise<CalendarEvent[]>,
  ): Promise<CalendarEvent[]> {
    const ids = calendarIds?.length
      ? calendarIds
      : (await this.listCalendars()).map((c) => c.id);
    const results = await Promise.allSettled(ids.map(fn));
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  }

  private eventsQuery(opts: ListEventsOptions, query?: string): string {
    const params = new URLSearchParams({
      timeMin: new Date(opts.from).toISOString(),
      timeMax: new Date(opts.to).toISOString(),
      // Expand recurring series into instances so a week view means a week.
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(Math.min(opts.maxResults ?? 100, 250)),
    });
    if (query) params.set("q", query);
    return params.toString();
  }

  private async eventsIn(
    calendarId: string,
    opts: ListEventsOptions,
    query?: string,
  ): Promise<CalendarEvent[]> {
    const res = await this.request<{ items?: GoogleEvent[] }>(
      `/calendars/${encodeURIComponent(calendarId)}/events?${this.eventsQuery(opts, query)}`,
    );
    return (res.items ?? []).map((e) => this.toEvent(calendarId, e));
  }

  listEvents(opts: ListEventsOptions): Promise<CalendarEvent[]> {
    return this.eachCalendar(opts.calendarIds, (id) => this.eventsIn(id, opts));
  }

  searchEvents(query: string, opts: ListEventsOptions): Promise<CalendarEvent[]> {
    return this.eachCalendar(opts.calendarIds, (id) => this.eventsIn(id, opts, query));
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    const e = await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
    return this.toEvent(calendarId, e);
  }

  private eventBody(input: Partial<EventInput>): Record<string, unknown> {
    return {
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.start ? { start: fromEventTime(input.start) } : {}),
      ...(input.end ? { end: fromEventTime(input.end) } : {}),
      ...(input.attendees
        ? {
            attendees: input.attendees.map((a) => ({
              email: a.email,
              displayName: a.name,
              optional: a.optional,
            })),
          }
        : {}),
      ...(input.recurrence ? { recurrence: input.recurrence } : {}),
      ...(input.reminders
        ? {
            reminders: {
              useDefault: false,
              overrides: input.reminders.map((minutes) => ({ method: "popup", minutes })),
            },
          }
        : {}),
    };
  }

  async createEvent(calendarId: string, input: EventInput): Promise<CalendarEvent> {
    // sendUpdates=all: an invitation nobody is told about isn't an invitation.
    const conference = input.addConferencing
      ? "&conferenceDataVersion=1"
      : "";
    const body = {
      ...this.eventBody(input),
      ...(input.addConferencing
        ? {
            conferenceData: {
              createRequest: {
                requestId: `lifeos-${input.summary}-${input.start.dateTime ?? input.start.date}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }
        : {}),
    };
    const e = await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all${conference}`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return this.toEvent(calendarId, e);
  }

  /**
   * Google addresses a whole series by the series id and a single occurrence by
   * the instance id, so "this" and "all" are a choice of id rather than a flag.
   * "following" has no API equivalent — it is the series' UNTIL plus a new
   * series, which is more surgery than a patch should do silently.
   */
  private async targetId(
    calendarId: string,
    eventId: string,
    scope: RecurrenceScope,
  ): Promise<string> {
    if (scope === "this") return eventId;
    const current = await this.getEvent(calendarId, eventId);
    if (scope === "following" && current.recurringEventId) {
      throw new ProviderApiError(
        "gmail",
        400,
        'Google Calendar can\'t edit "this and following" in one step. Edit the single occurrence, or the whole series.',
      );
    }
    return current.recurringEventId ?? eventId;
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    patch: Partial<EventInput>,
    scope: RecurrenceScope = "this",
  ): Promise<CalendarEvent> {
    const id = await this.targetId(calendarId, eventId, scope);
    const e = await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}?sendUpdates=all`,
      { method: "PATCH", body: JSON.stringify(this.eventBody(patch)) },
    );
    return this.toEvent(calendarId, e);
  }

  async deleteEvent(
    calendarId: string,
    eventId: string,
    scope: RecurrenceScope = "this",
  ): Promise<void> {
    const id = await this.targetId(calendarId, eventId, scope);
    await this.request<void>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}?sendUpdates=all`,
      { method: "DELETE" },
    );
  }

  async respondToEvent(
    calendarId: string,
    eventId: string,
    response: Exclude<AttendeeResponse, "needsAction">,
    comment?: string,
  ): Promise<void> {
    // Google replaces the whole attendee array on patch, so the other guests
    // have to be sent back alongside the one line that changed.
    const current = await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
    const attendees = (current.attendees ?? []).map((a) =>
      a.self
        ? { ...a, responseStatus: response, ...(comment ? { comment } : {}) }
        : a,
    );
    if (!attendees.some((a) => a.self)) {
      throw new ProviderApiError(
        "gmail",
        400,
        `${this.email} isn't on the guest list for this event, so there is nothing to RSVP to.`,
      );
    }
    await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: "PATCH", body: JSON.stringify({ attendees }) },
    );
  }

  async moveEvent(
    calendarId: string,
    eventId: string,
    toCalendarId: string,
  ): Promise<CalendarEvent> {
    const e = await this.request<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/move` +
        `?destination=${encodeURIComponent(toCalendarId)}&sendUpdates=all`,
      { method: "POST" },
    );
    return this.toEvent(toCalendarId, e);
  }

  async freeBusy(opts: { calendarIds?: string[]; from: string; to: string }): Promise<BusyBlock[]> {
    const ids = opts.calendarIds?.length
      ? opts.calendarIds
      : (await this.listCalendars()).map((c) => c.id);
    const res = await this.request<{
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
    }>("/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin: new Date(opts.from).toISOString(),
        timeMax: new Date(opts.to).toISOString(),
        // Google caps a freeBusy request at 50 calendars.
        items: ids.slice(0, 50).map((id) => ({ id })),
      }),
    });
    return Object.entries(res.calendars ?? {}).flatMap(([calendarId, c]) =>
      (c.busy ?? []).map((b) => ({ ...b, calendarId, account: this.email })),
    );
  }

  async createCalendar(
    name: string,
    opts?: { description?: string; timeZone?: string },
  ): Promise<Calendar> {
    const created = await this.request<{ id: string }>("/calendars", {
      method: "POST",
      body: JSON.stringify({ summary: name, ...opts }),
    });
    const entry = await this.request<GoogleCalendarListEntry>(
      `/users/me/calendarList/${encodeURIComponent(created.id)}`,
    );
    return this.toCalendar(entry);
  }

  /**
   * Name and description live on the calendar itself; colour is a per-user
   * preference on the list entry, so a rename and a recolour are two calls.
   */
  async updateCalendar(
    calendarId: string,
    patch: { name?: string; description?: string; color?: string },
  ): Promise<Calendar> {
    const id = encodeURIComponent(calendarId);
    if (patch.name !== undefined || patch.description !== undefined) {
      await this.request<unknown>(`/calendars/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(patch.name !== undefined ? { summary: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
        }),
      });
    }
    if (patch.color !== undefined) {
      await this.request<unknown>(`/users/me/calendarList/${id}?colorRgbFormat=true`, {
        method: "PATCH",
        body: JSON.stringify({ backgroundColor: patch.color, foregroundColor: "#000000" }),
      });
    }
    return this.toCalendar(await this.request<GoogleCalendarListEntry>(`/users/me/calendarList/${id}`));
  }

  async deleteCalendar(calendarId: string): Promise<void> {
    await this.request<void>(`/calendars/${encodeURIComponent(calendarId)}`, { method: "DELETE" });
  }
}
