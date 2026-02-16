import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { getAuthenticatedClient } from "@argus/gmail";
import type { AuthResult } from "@argus/gmail";
import type {
  CalendarEvent,
  CreateEventParams,
  ListEventsParams,
  UpdateEventParams,
} from "./types.js";

function isDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addOneHour(isoString: string): string {
  const d = new Date(isoString);
  const result = new Date(d.getTime() + 3600000);

  // Preserve the original timezone offset from the input string
  const offsetMatch = isoString.match(/([+-]\d{2}:\d{2})$/);
  if (offsetMatch) {
    // Rebuild the ISO string with the same offset
    const offset = offsetMatch[1];
    const sign = offset[0] === "+" ? 1 : -1;
    const [oh, om] = offset.slice(1).split(":").map(Number);
    const offsetMs = sign * (oh * 60 + om) * 60000;

    // Get the local time in the target timezone
    const utcMs = result.getTime();
    const localMs = utcMs + offsetMs;
    const local = new Date(localMs);

    const year = local.getUTCFullYear();
    const month = String(local.getUTCMonth() + 1).padStart(2, "0");
    const day = String(local.getUTCDate()).padStart(2, "0");
    const hours = String(local.getUTCHours()).padStart(2, "0");
    const minutes = String(local.getUTCMinutes()).padStart(2, "0");
    const seconds = String(local.getUTCSeconds()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
  }

  // If the string ends with Z, keep Z
  if (isoString.endsWith("Z")) {
    return result.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  // Fallback
  return result.toISOString();
}

function toCalendarEvent(item: calendar_v3.Schema$Event): CalendarEvent {
  return {
    id: item.id ?? "",
    title: item.summary ?? "",
    start: item.start?.dateTime ?? item.start?.date ?? "",
    end: item.end?.dateTime ?? item.end?.date ?? "",
    description: item.description ?? undefined,
    location: item.location ?? undefined,
    attendees: item.attendees
      ? item.attendees.map((a) => a.email ?? "")
      : undefined,
    htmlLink: item.htmlLink ?? undefined,
  };
}

export async function createEvent(
  params: CreateEventParams,
): Promise<AuthResult<CalendarEvent>> {
  const authResult = await getAuthenticatedClient();
  if (!authResult.success) return authResult;

  try {
    const calendar = google.calendar({ version: "v3", auth: authResult.data });

    const dateOnly = isDateOnly(params.start);

    let startField: { date?: string; dateTime?: string };
    let endField: { date?: string; dateTime?: string };

    if (dateOnly) {
      startField = { date: params.start };
      endField = { date: params.end ?? params.start };
    } else {
      startField = { dateTime: params.start };
      endField = { dateTime: params.end ?? addOneHour(params.start) };
    }

    const requestBody: Partial<calendar_v3.Schema$Event> = {
      summary: params.title,
      start: startField,
      end: endField,
    };

    if (params.description) {
      requestBody.description = params.description;
    }
    if (params.location) {
      requestBody.location = params.location;
    }
    if (params.attendees && params.attendees.length > 0) {
      requestBody.attendees = params.attendees.map((email) => ({ email }));
    }

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody,
    });

    return { success: true, data: toCalendarEvent(res.data) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Calendar] createEvent error:", message);
    return { success: false, error: message };
  }
}

export async function listEvents(
  params: ListEventsParams,
): Promise<AuthResult<CalendarEvent[]>> {
  const authResult = await getAuthenticatedClient();
  if (!authResult.success) return authResult;

  try {
    const calendar = google.calendar({ version: "v3", auth: authResult.data });

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      maxResults: params.maxResults ?? 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    const items = res.data.items;
    if (!items || items.length === 0) {
      return { success: true, data: [] };
    }

    return { success: true, data: items.map(toCalendarEvent) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Calendar] listEvents error:", message);
    return { success: false, error: message };
  }
}

export async function updateEvent(
  params: UpdateEventParams,
): Promise<AuthResult<CalendarEvent>> {
  const authResult = await getAuthenticatedClient();
  if (!authResult.success) return authResult;

  try {
    const calendar = google.calendar({ version: "v3", auth: authResult.data });

    const requestBody: Partial<calendar_v3.Schema$Event> = {};

    if (params.title !== undefined) {
      requestBody.summary = params.title;
    }
    if (params.start !== undefined) {
      if (isDateOnly(params.start)) {
        requestBody.start = { date: params.start };
      } else {
        requestBody.start = { dateTime: params.start };
      }
    }
    if (params.end !== undefined) {
      if (isDateOnly(params.end)) {
        requestBody.end = { date: params.end };
      } else {
        requestBody.end = { dateTime: params.end };
      }
    }
    if (params.description !== undefined) {
      requestBody.description = params.description;
    }
    if (params.location !== undefined) {
      requestBody.location = params.location;
    }

    const res = await calendar.events.patch({
      calendarId: "primary",
      eventId: params.eventId,
      requestBody,
    });

    return { success: true, data: toCalendarEvent(res.data) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Calendar] updateEvent error:", message);
    return { success: false, error: message };
  }
}

export async function deleteEvent(eventId: string): Promise<AuthResult<void>> {
  const authResult = await getAuthenticatedClient();
  if (!authResult.success) return authResult;

  try {
    const calendar = google.calendar({ version: "v3", auth: authResult.data });

    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });

    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Calendar] deleteEvent error:", message);
    return { success: false, error: message };
  }
}
