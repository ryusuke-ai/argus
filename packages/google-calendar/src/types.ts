export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  htmlLink?: string;
}

export interface CalendarService {
  createEvent(params: CreateEventParams): Promise<CalendarEvent>;
  listEvents(params: ListEventsParams): Promise<CalendarEvent[]>;
  updateEvent(params: UpdateEventParams): Promise<CalendarEvent>;
  deleteEvent(eventId: string): Promise<void>;
}

export interface CreateEventParams {
  title: string;
  start: string;
  end?: string;
  description?: string;
  attendees?: string[];
  location?: string;
}

export interface ListEventsParams {
  timeMin: string;
  timeMax: string;
  maxResults?: number;
}

export interface UpdateEventParams {
  eventId: string;
  title?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
}
