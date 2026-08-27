import { z } from "zod";
import type { BusyBlock, CalendarEvent, CalendarProvider, EventTime } from "@lifeos/core";
import { explain, ok } from "../format";
import { activeAccounts, resolveAccount } from "../session";
import { CREATES, DESTRUCTIVE, Kit, READ_ONLY, REVERSIBLE, handled } from "./shared";

/**
 * Same idea as the email `account` parameter, pointed at a different
 * capability: an account connected for mail only is not an answer here.
 */
const account = z
  .string()
  .optional()
  .describe(
    "Which connected account's calendar to act on, by email address. Optional when only one account has calendar; required otherwise. Use the `account` value that came back on the event you're acting on.",
  );

const calendarId = z
  .string()
  .describe("A calendar id from list_calendars. Ids are per-account — never reuse one across accounts.");

const eventId = z
  .string()
  .describe(
    "An event id from list_events, search_events or get_event. One occurrence of a repeating event has its own id; pass that id back to act on just that occurrence.",
  );

const scope = z
  .enum(["this", "all", "following"])
  .default("this")
  .describe(
    'Which occurrences of a repeating event to touch: "this" for the single occurrence, "all" for the whole series, "following" for this one and every later one. Ignored for events that do not repeat.',
  );

const windowShape = {
  from: z
    .string()
    .optional()
    .describe(
      "Start of the window: a bare YYYY-MM-DD, or a full ISO timestamp. A bare date starts at 00:00 UTC — give a timestamp with an offset when the user's own zone matters. Defaults to now. Always state the window you mean rather than relying on that default when the user named a date.",
    ),
  to: z
    .string()
    .optional()
    .describe(
      "End of the window, same format. A bare date covers the whole of that day, so one day is that same date in both `from` and `to`, and Monday to Friday is Monday here and Friday there — do not add a day. Defaults to seven days after `from`. Every result echoes back the `window` it actually used.",
    ),
  calendar_ids: z
    .array(z.string())
    .optional()
    .describe("Limit to particular calendars, by id from list_calendars. Omit to cover them all."),
};

const timeShape = z
  .object({
    date_time: z
      .string()
      .optional()
      .describe("Timed events: an ISO timestamp, e.g. 2026-09-01T14:00:00. Give the offset, or name time_zone."),
    date: z
      .string()
      .optional()
      .describe("All-day events: YYYY-MM-DD instead of date_time. The end date is exclusive."),
    time_zone: z
      .string()
      .optional()
      .describe(
        "IANA zone, e.g. Europe/London. Name it for anything that repeats — it is what keeps a 10am meeting at 10am across a daylight-saving change.",
      ),
  })
  .describe("A point in time: either date_time (timed) or date (all-day), never both.");

const attendee = z.object({
  email: z.string(),
  name: z.string().optional(),
  optional: z.boolean().optional(),
});

type TimeArg = { date_time?: string; date?: string; time_zone?: string };
type AttendeeArg = { email: string; name?: string; optional?: boolean };

function toEventTime(value: TimeArg, what: string): EventTime {
  if (value.date) return { date: value.date };
  if (!value.date_time) throw new Error(`${what} needs either date_time or date.`);
  return { dateTime: value.date_time, timeZone: value.time_zone };
}

/** A window the model didn't fully specify: from now, a week out. */
function resolveWindow(from?: string, to?: string): { from: string; to: string } {
  const start = from ? new Date(dateOrTimestamp(from)) : new Date();
  if (Number.isNaN(start.getTime())) throw new Error(`Couldn't read \`from\` as a date: ${from}`);
  const end = to ? new Date(dateOrTimestamp(to, true)) : new Date(start.getTime() + 7 * 86_400_000);
  if (Number.isNaN(end.getTime())) throw new Error(`Couldn't read \`to\` as a date: ${to}`);
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * A bare YYYY-MM-DD is a day, not an instant, so `to` runs to the end of it:
 * "to: 2026-08-27" means everything on the 27th. Inclusive rather than
 * exclusive because it is the reading that needs no arithmetic — a model that
 * has to add a day to ask about one day is a model that will sometimes forget,
 * and a window silently short by a day returns nothing rather than too much.
 */
function dateOrTimestamp(value: string, endOfDay = false): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : value;
}

/**
 * A guest list is usually being nudged rather than rewritten, and `attendees`
 * alone rewrites it — everyone the model didn't think to repeat gets a
 * cancellation. add/remove read the current list first and hand back the whole
 * one, the way modify_labels does for a message's labels.
 */
async function nextAttendees(
  calendar: CalendarProvider,
  args: {
    calendar_id: string;
    event_id: string;
    attendees?: AttendeeArg[];
    add_attendees?: AttendeeArg[];
    remove_attendees?: string[];
  },
): Promise<AttendeeArg[] | undefined> {
  const add = args.add_attendees ?? [];
  const remove = args.remove_attendees ?? [];
  if (add.length === 0 && remove.length === 0) return args.attendees;
  if (args.attendees) {
    throw new Error(
      "Pass either `attendees` to replace the whole guest list, or add_attendees/remove_attendees to adjust it — not both.",
    );
  }
  // Anyone being re-added is dropped from the old list first, so their new
  // `optional` flag wins instead of colliding with the existing entry.
  const drop = new Set([...remove, ...add.map((a) => a.email)].map((e) => e.toLowerCase()));
  const current = (await calendar.getEvent(args.calendar_id, args.event_id)).attendees ?? [];
  const kept = current
    .filter((a) => !drop.has(a.email.toLowerCase()))
    .map(({ email, name, optional }) => ({
      email,
      ...(name !== undefined ? { name } : {}),
      ...(optional !== undefined ? { optional } : {}),
    }));
  return [...kept, ...add];
}

function startMs(event: CalendarEvent): number {
  return new Date(event.start.dateTime ?? `${event.start.date}T00:00:00Z`).getTime();
}

/** Drop the keys that are always empty, the way shapeSummary does for mail. */
function shapeEvent(event: CalendarEvent): Record<string, unknown> {
  const out: Record<string, unknown> = { ...event };
  for (const key of ["description", "location", "organizer", "attendees", "recurrence",
    "recurringEventId", "url", "conferencing", "reminders", "myResponse", "created",
    "updated", "etag"] as const) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/**
 * Fan a read out across every calendar-capable account, exactly as
 * search_emails does across inboxes — "what's on this week" means all of it.
 */
async function acrossAccounts<T>(
  s: Parameters<typeof activeAccounts>[0],
  requested: string | undefined,
  fn: (email: string) => Promise<T[]>,
): Promise<{ results: T[]; searched: string[]; errors: string[] }> {
  const searched = requested
    ? [await resolveAccount(s, requested, "calendar")]
    : await activeAccounts(s, "calendar");
  const settled = await Promise.allSettled(searched.map(fn));
  return {
    results: settled.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    searched,
    errors: settled
      .map((r, i) => (r.status === "rejected" ? `${searched[i]}: ${explain(r.reason)}` : ""))
      .filter(Boolean),
  };
}

export function registerCalendarTools({ register, session }: Kit) {
  register(
    "list_calendars",
    {
      title: "List calendars",
      description:
        "Start here for anything calendar. Lists every calendar on one account or all of them, with its id, name, time zone and whether it can be written to. Events are always created on a particular calendar, and calendar ids are only valid on the account that produced them.",
      inputSchema: { account },
      annotations: READ_ONLY,
      surface: "calendar",
      tier: "core",
    },
    handled(session, async ({ account: acct }: { account?: string }, s) => {
      const { results, searched, errors } = await acrossAccounts(s, acct, async (email) =>
        (await s.calendarFor(email)).listCalendars(),
      );
      return ok({
        calendars: results,
        searched,
        ...(errors.length ? { errors } : {}),
        ...(results.length === 0 && errors.length === 0
          ? {
              next_step:
                "No calendars are connected. Google and Apple accounts bring calendar along with mail — if an inbox was connected before calendar support existed, reconnecting it in the LifeOS dashboard is all it takes.",
            }
          : {}),
      });
    }),
  );

  register(
    "list_events",
    {
      title: "List events in a date range",
      description:
        "What's on, between two dates, across one account or every connected calendar at once. Repeating events come back expanded into their individual occurrences, each with its own id. This is the tool for \"what does my week look like\" and \"am I free on Thursday\". Use find_free_time when you need gaps rather than events.",
      inputSchema: { account, ...windowShape,
        max_results: z.number().int().min(1).max(250).default(50).describe("Per account, not in total."),
      },
      annotations: READ_ONLY,
      surface: "calendar",
      tier: "core",
    },
    handled(
      session,
      async (
        args: { account?: string; from?: string; to?: string; calendar_ids?: string[]; max_results: number },
        s,
      ) => {
        const window = resolveWindow(args.from, args.to);
        const { results, searched, errors } = await acrossAccounts(s, args.account, async (email) =>
          (await s.calendarFor(email)).listEvents({
            ...window,
            calendarIds: args.calendar_ids,
            maxResults: args.max_results,
          }),
        );
        return ok({
          events: results.sort((a, b) => startMs(a) - startMs(b)).map(shapeEvent),
          window,
          searched,
          ...(errors.length ? { errors } : {}),
        });
      },
    ),
  );

  register(
    "get_event",
    {
      title: "Get one event",
      description:
        "Fetches a single event in full — description, attendees and their RSVPs, recurrence rule, reminders, meeting link. Reach for it before editing an event or answering a question about who's coming.",
      inputSchema: { account, calendar_id: calendarId, event_id: eventId },
      annotations: READ_ONLY,
      surface: "calendar",
      tier: "core",
    },
    handled(
      session,
      async (
        { account: acct, calendar_id, event_id }: { account?: string; calendar_id: string; event_id: string },
        s,
      ) => {
        const email = await resolveAccount(s, acct, "calendar");
        const event = await (await s.calendarFor(email)).getEvent(calendar_id, event_id);
        return ok({ event: shapeEvent(event) });
      },
    ),
  );

  register(
    "create_event",
    {
      title: "Create an event",
      description:
        "Puts a new event on one of the user's calendars, optionally inviting people. Invitations are sent as soon as this runs and cannot be unsent — show the user the title, time, calendar and guest list and get their agreement first, unless they've already said to go ahead. Check list_calendars for the id, and list_events or find_free_time for whether the slot is actually free.",
      inputSchema: {
        account,
        calendar_id: calendarId,
        summary: z.string().min(1).describe("The event title, as it will appear in the calendar."),
        start: timeShape,
        end: timeShape,
        description: z.string().optional(),
        location: z.string().optional().describe("A place, or a meeting link."),
        attendees: z
          .array(attendee)
          .optional()
          .describe("People to invite. Each one is emailed an invitation immediately."),
        recurrence: z
          .array(z.string())
          .optional()
          .describe(
            'iCalendar recurrence lines, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=TU"]. Name a time_zone on `start` whenever an event repeats.',
          ),
        reminders: z
          .array(z.number().int().min(0))
          .optional()
          .describe("Minutes before the start to be reminded, e.g. [10, 60]."),
        add_conferencing: z
          .boolean()
          .default(false)
          .describe("Attach a Google Meet link. Google accounts only; ignored on Apple."),
      },
      annotations: CREATES,
      surface: "calendar",
      tier: "core",
    },
    handled(
      session,
      async (
        args: {
          account?: string;
          calendar_id: string;
          summary: string;
          start: TimeArg;
          end: TimeArg;
          description?: string;
          location?: string;
          attendees?: AttendeeArg[];
          recurrence?: string[];
          reminders?: number[];
          add_conferencing: boolean;
        },
        s,
      ) => {
        const email = await resolveAccount(s, args.account, "calendar");
        const event = await (await s.calendarFor(email)).createEvent(args.calendar_id, {
          summary: args.summary,
          description: args.description,
          location: args.location,
          start: toEventTime(args.start, "start"),
          end: toEventTime(args.end, "end"),
          attendees: args.attendees,
          recurrence: args.recurrence,
          reminders: args.reminders,
          addConferencing: args.add_conferencing,
        });
        return ok({ created: shapeEvent(event), account: email });
      },
    ),
  );

  register(
    "update_event",
    {
      title: "Change an event",
      description:
        "Edits an existing event. Only the fields you pass change; everything else — including reminders and details LifeOS doesn't model — is left exactly as it was. For a repeating event, `scope` decides whether you're moving one occurrence or the whole series. Guests are notified of the change, so confirm with the user before rescheduling anything with other people on it.",
      inputSchema: {
        account,
        calendar_id: calendarId,
        event_id: eventId,
        scope,
        summary: z.string().optional(),
        start: timeShape.optional(),
        end: timeShape.optional().describe("Pass `end` whenever you pass `start`, or the event keeps its old end."),
        description: z.string().optional(),
        location: z.string().optional(),
        attendees: z
          .array(attendee)
          .optional()
          .describe(
            "Replaces the whole guest list: anyone you leave out is uninvited and told the event is cancelled. To change who is coming without restating everyone, use add_attendees and remove_attendees instead.",
          ),
        add_attendees: z
          .array(attendee)
          .optional()
          .describe("Invite these people as well, leaving the existing guests alone."),
        remove_attendees: z
          .array(z.string())
          .optional()
          .describe("Uninvite these email addresses, leaving the rest of the guest list alone."),
        recurrence: z.array(z.string()).optional(),
        reminders: z.array(z.number().int().min(0)).optional(),
      },
      annotations: REVERSIBLE,
      surface: "calendar",
      tier: "core",
    },
    handled(
      session,
      async (
        args: {
          account?: string;
          calendar_id: string;
          event_id: string;
          scope: "this" | "all" | "following";
          summary?: string;
          start?: TimeArg;
          end?: TimeArg;
          description?: string;
          location?: string;
          attendees?: AttendeeArg[];
          add_attendees?: AttendeeArg[];
          remove_attendees?: string[];
          recurrence?: string[];
          reminders?: number[];
        },
        s,
      ) => {
        const email = await resolveAccount(s, args.account, "calendar");
        const calendar = await s.calendarFor(email);
        const attendees = await nextAttendees(calendar, args);
        const event = await calendar.updateEvent(
          args.calendar_id,
          args.event_id,
          {
            ...(args.summary !== undefined ? { summary: args.summary } : {}),
            ...(args.description !== undefined ? { description: args.description } : {}),
            ...(args.location !== undefined ? { location: args.location } : {}),
            ...(args.start ? { start: toEventTime(args.start, "start") } : {}),
            ...(args.end ? { end: toEventTime(args.end, "end") } : {}),
            ...(attendees ? { attendees } : {}),
            ...(args.recurrence ? { recurrence: args.recurrence } : {}),
            ...(args.reminders ? { reminders: args.reminders } : {}),
          },
          args.scope,
        );
        return ok({ updated: shapeEvent(event), account: email, scope: args.scope });
      },
    ),
  );

  register(
    "search_events",
    {
      title: "Search events by text",
      description:
        "Finds events matching free text — a title, a place, a guest's address — inside a date range, across one account or all of them. A date range is still required: calendars are unbounded, so \"find my dentist appointment\" means searching a window. Widen it if nothing comes back.",
      inputSchema: {
        account,
        query: z.string().min(1).describe("Text to match in the title, description, location or guest list."),
        ...windowShape,
        max_results: z.number().int().min(1).max(250).default(50),
      },
      annotations: READ_ONLY,
      surface: "calendar",
      tier: "extended",
      keywords: ["find event", "search calendar", "appointment", "meeting", "lookup"],
    },
    handled(
      session,
      async (
        args: {
          account?: string;
          query: string;
          from?: string;
          to?: string;
          calendar_ids?: string[];
          max_results: number;
        },
        s,
      ) => {
        const window = resolveWindow(args.from, args.to);
        const { results, searched, errors } = await acrossAccounts(s, args.account, async (email) =>
          (await s.calendarFor(email)).searchEvents(args.query, {
            ...window,
            calendarIds: args.calendar_ids,
            maxResults: args.max_results,
          }),
        );
        return ok({
          events: results.sort((a, b) => startMs(a) - startMs(b)).map(shapeEvent),
          window,
          searched,
          ...(errors.length ? { errors } : {}),
        });
      },
    ),
  );

  register(
    "delete_event",
    {
      title: "Delete an event",
      description:
        "Removes an event from the calendar. Guests are told it's cancelled, and there is no undo — always confirm with the user first. For a repeating event, `scope` decides whether one occurrence is cancelled or the whole series.",
      inputSchema: { account, calendar_id: calendarId, event_id: eventId, scope },
      annotations: DESTRUCTIVE,
      surface: "calendar",
      tier: "extended",
      keywords: ["cancel", "delete event", "remove meeting", "clear"],
    },
    handled(
      session,
      async (
        args: {
          account?: string;
          calendar_id: string;
          event_id: string;
          scope: "this" | "all" | "following";
        },
        s,
      ) => {
        const email = await resolveAccount(s, args.account, "calendar");
        await (await s.calendarFor(email)).deleteEvent(args.calendar_id, args.event_id, args.scope);
        return ok({ deleted: args.event_id, account: email, scope: args.scope });
      },
    ),
  );

  register(
    "respond_to_event",
    {
      title: "RSVP to an invitation",
      description:
        "Answers an invitation on the user's behalf — accept, decline, or tentative. The organiser is notified straight away, so ask the user before answering anything they haven't already decided. get_event shows the current RSVP as `myResponse`.",
      inputSchema: {
        account,
        calendar_id: calendarId,
        event_id: eventId,
        response: z
          .enum(["accepted", "declined", "tentative"])
          .describe("The answer to send the organiser."),
        comment: z.string().optional().describe("A short note to go with the reply."),
      },
      annotations: DESTRUCTIVE,
      surface: "calendar",
      tier: "extended",
      keywords: ["rsvp", "accept", "decline", "tentative", "invitation", "invite", "reply to meeting"],
    },
    handled(
      session,
      async (
        args: {
          account?: string;
          calendar_id: string;
          event_id: string;
          response: "accepted" | "declined" | "tentative";
          comment?: string;
        },
        s,
      ) => {
        const email = await resolveAccount(s, args.account, "calendar");
        await (await s.calendarFor(email)).respondToEvent(
          args.calendar_id,
          args.event_id,
          args.response,
          args.comment,
        );
        return ok({ rsvp: args.response, event_id: args.event_id, account: email });
      },
    ),
  );

  register(
    "move_event",
    {
      title: "Move an event to another calendar",
      description:
        "Moves an event from one of the account's calendars to another — e.g. off a shared team calendar and onto a personal one. Both calendars must be on the same account; LifeOS does not move events between accounts.",
      inputSchema: {
        account,
        calendar_id: calendarId,
        event_id: eventId,
        to_calendar_id: z.string().describe("The destination calendar id, from list_calendars."),
      },
      annotations: REVERSIBLE,
      surface: "calendar",
      tier: "extended",
      keywords: ["move event", "another calendar", "transfer", "recategorise"],
    },
    handled(
      session,
      async (
        args: { account?: string; calendar_id: string; event_id: string; to_calendar_id: string },
        s,
      ) => {
        const email = await resolveAccount(s, args.account, "calendar");
        const event = await (await s.calendarFor(email)).moveEvent(
          args.calendar_id,
          args.event_id,
          args.to_calendar_id,
        );
        return ok({ moved: shapeEvent(event), account: email });
      },
    ),
  );

  register(
    "find_free_time",
    {
      title: "Find free slots",
      description:
        "Works out when the user is actually free, across every connected calendar at once, and hands back slots long enough for what you're scheduling. Use this before create_event rather than guessing from list_events — it accounts for every account's calendars together, and ignores events the user declined.",
      inputSchema: {
        account: account.describe("Limit to one account's calendars. Omit to consider all of them, which is usually what you want."),
        ...windowShape,
        duration_minutes: z
          .number()
          .int()
          .min(5)
          .default(30)
          .describe("How long the meeting needs to be."),
        earliest_hour: z
          .number()
          .int()
          .min(0)
          .max(23)
          .default(9)
          .describe("Earliest hour of the day to suggest, in the time zone given below."),
        latest_hour: z
          .number()
          .int()
          .min(1)
          .max(24)
          .default(17)
          .describe("Latest hour a slot may end at."),
        time_zone: z
          .string()
          .default("UTC")
          .describe("IANA zone the working hours are stated in, e.g. America/New_York."),
        max_results: z.number().int().min(1).max(50).default(10),
      },
      annotations: READ_ONLY,
      surface: "calendar",
      tier: "extended",
      keywords: ["free", "busy", "availability", "when am i free", "schedule", "open slot", "gap"],
    },
    handled(
      session,
      async (
        args: {
          account?: string;
          from?: string;
          to?: string;
          calendar_ids?: string[];
          duration_minutes: number;
          earliest_hour: number;
          latest_hour: number;
          time_zone: string;
          max_results: number;
        },
        s,
      ) => {
        const window = resolveWindow(args.from, args.to);
        const { results, searched, errors } = await acrossAccounts(s, args.account, async (email) =>
          (await s.calendarFor(email)).freeBusy({ ...window, calendarIds: args.calendar_ids }),
        );
        const slots = freeSlots(results, {
          from: new Date(window.from),
          to: new Date(window.to),
          durationMs: args.duration_minutes * 60_000,
          earliestHour: args.earliest_hour,
          latestHour: args.latest_hour,
          timeZone: args.time_zone,
          limit: args.max_results,
        });
        return ok({
          free: slots,
          window,
          searched,
          busy_blocks: results.length,
          ...(errors.length ? { errors } : {}),
          ...(slots.length === 0
            ? { next_step: "Nothing fits. Try a longer window, a shorter duration, or wider hours." }
            : {}),
        });
      },
    ),
  );

  register(
    "create_calendar",
    {
      title: "Create a calendar",
      description:
        "Makes a new calendar on the account — for a project, a shared schedule, anything the user wants kept apart from their main one. Most scheduling needs an existing calendar, not a new one; check list_calendars first.",
      inputSchema: {
        account,
        name: z.string().min(1).describe("What the calendar is called."),
        description: z.string().optional(),
        time_zone: z.string().optional().describe("IANA zone, e.g. Europe/London."),
      },
      annotations: CREATES,
      surface: "calendar",
      tier: "extended",
      keywords: ["new calendar", "create calendar", "separate calendar", "project calendar"],
    },
    handled(
      session,
      async (
        args: { account?: string; name: string; description?: string; time_zone?: string },
        s,
      ) => {
        const email = await resolveAccount(s, args.account, "calendar");
        const calendar = await (await s.calendarFor(email)).createCalendar(args.name, {
          description: args.description,
          timeZone: args.time_zone,
        });
        return ok({ created: calendar, account: email });
      },
    ),
  );

  register(
    "update_calendar",
    {
      title: "Rename or recolour a calendar",
      description:
        "Changes a calendar's name, description or colour. Doesn't touch the events on it.",
      inputSchema: {
        account,
        calendar_id: calendarId,
        name: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional().describe('Hex colour, e.g. "#6366f1".'),
      },
      annotations: REVERSIBLE,
      surface: "calendar",
      tier: "extended",
      keywords: ["rename calendar", "calendar colour", "calendar color", "edit calendar"],
    },
    handled(
      session,
      async (
        args: { account?: string; calendar_id: string; name?: string; description?: string; color?: string },
        s,
      ) => {
        const email = await resolveAccount(s, args.account, "calendar");
        const calendar = await (await s.calendarFor(email)).updateCalendar(args.calendar_id, {
          name: args.name,
          description: args.description,
          color: args.color,
        });
        return ok({ updated: calendar, account: email });
      },
    ),
  );

  register(
    "delete_calendar",
    {
      title: "Delete a calendar",
      description:
        "Deletes a whole calendar and every event on it. This cannot be undone and is almost never what someone means — confirm explicitly with the user, and reach for delete_event if they meant a single entry.",
      inputSchema: { account, calendar_id: calendarId },
      annotations: DESTRUCTIVE,
      surface: "calendar",
      tier: "extended",
      keywords: ["delete calendar", "remove calendar"],
    },
    handled(
      session,
      async ({ account: acct, calendar_id }: { account?: string; calendar_id: string }, s) => {
        const email = await resolveAccount(s, acct, "calendar");
        await (await s.calendarFor(email)).deleteCalendar(calendar_id);
        return ok({ deleted: calendar_id, account: email });
      },
    ),
  );
}

// ---------------------------------------------------------------------------
// Free/busy arithmetic
// ---------------------------------------------------------------------------

/** The hour of the day a given instant falls on, in a named zone. */
function hourIn(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour + minute / 60;
}

interface SlotOptions {
  from: Date;
  to: Date;
  durationMs: number;
  earliestHour: number;
  latestHour: number;
  timeZone: string;
  limit: number;
}

/**
 * Merge every account's busy blocks into one timeline, then hand back the gaps
 * that are long enough and fall inside working hours. Merging first is what
 * makes overlapping meetings across two accounts count once.
 */
function freeSlots(busy: BusyBlock[], opts: SlotOptions): { start: string; end: string }[] {
  const blocks = busy
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last && block.start <= last.end) last.end = Math.max(last.end, block.end);
    else merged.push({ ...block });
  }

  const slots: { start: string; end: string }[] = [];
  let cursor = opts.from.getTime();
  const windowEnd = opts.to.getTime();

  const consider = (start: number, end: number) => {
    // Walk the gap in duration-sized steps, keeping only whole steps that sit
    // inside the working day the user asked for.
    let at = start;
    while (at + opts.durationMs <= end && slots.length < opts.limit) {
      const slotEnd = at + opts.durationMs;
      const startHour = hourIn(new Date(at), opts.timeZone);
      const endHour = hourIn(new Date(slotEnd), opts.timeZone);
      const withinDay = startHour >= opts.earliestHour && (endHour <= opts.latestHour || endHour === 0);
      if (withinDay) {
        slots.push({ start: new Date(at).toISOString(), end: new Date(slotEnd).toISOString() });
        at = slotEnd;
      } else {
        // Jump to the next quarter hour rather than crawling minute by minute.
        at += 15 * 60_000;
      }
    }
  };

  for (const block of merged) {
    if (block.start > cursor) consider(cursor, Math.min(block.start, windowEnd));
    cursor = Math.max(cursor, block.end);
    if (cursor >= windowEnd || slots.length >= opts.limit) break;
  }
  if (cursor < windowEnd && slots.length < opts.limit) consider(cursor, windowEnd);
  return slots;
}
