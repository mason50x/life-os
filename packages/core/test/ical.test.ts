import { describe, expect, it } from "vitest";
import {
  applyEventInput,
  buildVTimezone,
  expandRecurrence,
  icsTimeToEventTime,
  newVEvent,
  parseVEvents,
  serializeIcal,
  toInstant,
  wrapCalendar,
} from "../src/ical";

/** Build a VCALENDAR document out of raw lines, CRLF-joined the way a server sends one. */
function ics(...lines: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join("\r\n");
}

const utc = (iso: string) => new Date(iso);

describe("parsing", () => {
  it("unfolds continuation lines and unescapes text", () => {
    const [event] = parseVEvents(
      ics(
        "BEGIN:VEVENT",
        "UID:a",
        "DTSTART:20260826T140000Z",
        "DTEND:20260826T150000Z",
        "SUMMARY:Lunch with Ada\\, Grace",
        "DESCRIPTION:First line\\nSecond line; with a semicolon and a very long tail that has",
        "  to be folded because it runs past seventy-five octets on the wire",
        "END:VEVENT",
      ),
    );
    expect(event.summary).toBe("Lunch with Ada, Grace");
    expect(event.description).toContain("First line\nSecond line; with a semicolon");
    expect(event.description).toContain("folded because it runs past");
  });

  it("reads an all-day event as a date, not an instant", () => {
    const [event] = parseVEvents(
      ics("BEGIN:VEVENT", "UID:b", "DTSTART;VALUE=DATE:20260826", "DTEND;VALUE=DATE:20260827", "END:VEVENT"),
    );
    expect(event.allDay).toBe(true);
    expect(icsTimeToEventTime(event.start)).toEqual({ date: "2026-08-26" });
  });

  it("resolves a TZID time to the right instant across a DST boundary", () => {
    const summer = parseVEvents(
      ics("BEGIN:VEVENT", "UID:c", "DTSTART;TZID=America/New_York:20260701T100000", "END:VEVENT"),
    )[0];
    const winter = parseVEvents(
      ics("BEGIN:VEVENT", "UID:d", "DTSTART;TZID=America/New_York:20261201T100000", "END:VEVENT"),
    )[0];
    // 10am in New York is 14:00Z in July (EDT) and 15:00Z in December (EST).
    expect(toInstant(summer.start).toISOString()).toBe("2026-07-01T14:00:00.000Z");
    expect(toInstant(winter.start).toISOString()).toBe("2026-12-01T15:00:00.000Z");
  });

  it("falls back to a one-day span when an all-day event has no DTEND", () => {
    const [event] = parseVEvents(
      ics("BEGIN:VEVENT", "UID:e", "DTSTART;VALUE=DATE:20260826", "END:VEVENT"),
    );
    expect(icsTimeToEventTime(event.end)).toEqual({ date: "2026-08-27" });
  });

  it("reads reminders off VALARM triggers", () => {
    const [event] = parseVEvents(
      ics(
        "BEGIN:VEVENT",
        "UID:f",
        "DTSTART:20260826T140000Z",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-PT15M",
        "END:VALARM",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-PT1H",
        "END:VALARM",
        "END:VEVENT",
      ),
    );
    expect(event.reminders).toEqual([15, 60]);
  });
});

describe("patching", () => {
  const original = ics(
    "BEGIN:VEVENT",
    "UID:keep-me",
    "DTSTART;TZID=Europe/London:20260826T100000",
    "DTEND;TZID=Europe/London:20260826T110000",
    "SUMMARY:Standup",
    "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
    "X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC",
    "CATEGORIES:Work",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT10M",
    "END:VALARM",
    "END:VEVENT",
  );

  it("leaves every property it doesn't own exactly as it was", () => {
    const [event] = parseVEvents(original);
    const patched = serializeIcal(applyEventInput(event.component, { summary: "Standup (new name)" }));

    expect(patched).toContain("SUMMARY:Standup (new name)");
    // The whole point: a rename must not cost the user their alarm, their
    // recurrence, their categories or Apple's own bookkeeping.
    expect(patched).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(patched).toContain("X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC");
    expect(patched).toContain("CATEGORIES:Work");
    expect(patched).toContain("TRIGGER:-PT10M");
    expect(patched).toContain("UID:keep-me");
    expect(patched).toContain("DTSTART;TZID=Europe/London:20260826T100000");
  });

  it("bumps SEQUENCE so the change propagates to guests", () => {
    const [event] = parseVEvents(original);
    expect(serializeIcal(applyEventInput(event.component, { location: "Room 2" }))).toContain(
      "SEQUENCE:1",
    );
  });

  it("writes a TZID time when a zone is named, and UTC when it isn't", () => {
    const zoned = serializeIcal(
      newVEvent({
        summary: "Weekly",
        start: { dateTime: "2026-08-26T10:00:00-04:00", timeZone: "America/New_York" },
        end: { dateTime: "2026-08-26T11:00:00-04:00", timeZone: "America/New_York" },
      }),
    );
    expect(zoned).toContain("DTSTART;TZID=America/New_York:20260826T100000");

    const plain = serializeIcal(
      newVEvent({
        summary: "One-off",
        start: { dateTime: "2026-08-26T14:00:00Z" },
        end: { dateTime: "2026-08-26T15:00:00Z" },
      }),
    );
    expect(plain).toContain("DTSTART:20260826T140000Z");
  });

  it("folds long lines at 75 octets", () => {
    const document = wrapCalendar([
      newVEvent({
        summary: "x".repeat(200),
        start: { dateTime: "2026-08-26T14:00:00Z" },
        end: { dateTime: "2026-08-26T15:00:00Z" },
      }),
    ]);
    for (const line of document.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // …and it still reads back as the same string.
    expect(parseVEvents(document)[0].summary).toBe("x".repeat(200));
  });
});

describe("expandRecurrence", () => {
  const window = { from: utc("2026-08-01T00:00:00Z"), to: utc("2026-09-30T23:59:59Z") };

  it("expands a weekly BYDAY rule", () => {
    const dates = expandRecurrence({
      start: utc("2026-08-03T09:00:00Z"), // a Monday
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
      from: utc("2026-08-01T00:00:00Z"),
      to: utc("2026-08-15T00:00:00Z"),
    });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-08-03",
      "2026-08-05",
      "2026-08-10",
      "2026-08-12",
    ]);
    // The time of day comes from the master, every time.
    expect(dates.every((d) => d.toISOString().slice(11, 19) === "09:00:00")).toBe(true);
  });

  it("honours COUNT", () => {
    expect(
      expandRecurrence({ start: utc("2026-08-03T09:00:00Z"), rrule: "FREQ=DAILY;COUNT=3", ...window }),
    ).toHaveLength(3);
  });

  it("honours UNTIL", () => {
    const dates = expandRecurrence({
      start: utc("2026-08-03T09:00:00Z"),
      rrule: "FREQ=DAILY;UNTIL=20260806T090000Z",
      ...window,
    });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
    ]);
  });

  it("handles an ordinal BYDAY — the second Tuesday of each month", () => {
    const dates = expandRecurrence({
      start: utc("2026-08-11T09:00:00Z"),
      rrule: "FREQ=MONTHLY;BYDAY=2TU",
      ...window,
    });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-08-11", "2026-09-08"]);
  });

  it("handles a negative ordinal — the last Friday of each month", () => {
    const dates = expandRecurrence({
      start: utc("2026-08-28T09:00:00Z"),
      rrule: "FREQ=MONTHLY;BYDAY=-1FR",
      ...window,
    });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-08-28", "2026-09-25"]);
  });

  it("skips EXDATEs", () => {
    const dates = expandRecurrence({
      start: utc("2026-08-03T09:00:00Z"),
      rrule: "FREQ=DAILY;COUNT=4",
      exdates: [utc("2026-08-05T09:00:00Z")],
      ...window,
    });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-06",
    ]);
  });

  it("clips to the window without dropping occurrences inside it", () => {
    const dates = expandRecurrence({
      start: utc("2026-01-05T09:00:00Z"),
      rrule: "FREQ=WEEKLY",
      from: utc("2026-08-01T00:00:00Z"),
      to: utc("2026-08-31T00:00:00Z"),
    });
    expect(dates).toHaveLength(4);
    expect(dates[0].toISOString().slice(0, 10)).toBe("2026-08-03");
  });

  it("returns just the event itself when there is no rule", () => {
    expect(expandRecurrence({ start: utc("2026-08-10T09:00:00Z"), ...window })).toHaveLength(1);
  });

  it("terminates on an unbounded rule rather than running away", () => {
    const dates = expandRecurrence({
      start: utc("2020-01-01T09:00:00Z"),
      rrule: "FREQ=DAILY",
      from: utc("2026-08-01T00:00:00Z"),
      to: utc("2026-08-07T00:00:00Z"),
    });
    expect(dates).toHaveLength(6);
  });
});

describe("buildVTimezone", () => {
  it("describes a DST zone with both observances and yearly rules", () => {
    const serialized = serializeIcal(buildVTimezone("America/New_York", new Date("2026-06-01T00:00:00Z")));
    expect(serialized).toContain("TZID:America/New_York");
    expect(serialized).toContain("BEGIN:DAYLIGHT");
    expect(serialized).toContain("BEGIN:STANDARD");
    expect(serialized).toContain("TZOFFSETTO:-0400");
    expect(serialized).toContain("TZOFFSETTO:-0500");
    expect(serialized).toMatch(/RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU/);
  });

  it("describes a fixed-offset zone with a single observance", () => {
    const serialized = serializeIcal(buildVTimezone("Asia/Tokyo", new Date("2026-06-01T00:00:00Z")));
    expect(serialized).toContain("TZOFFSETTO:+0900");
    expect(serialized).not.toContain("BEGIN:DAYLIGHT");
  });
});
