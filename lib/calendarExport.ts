import * as Calendar from "expo-calendar";
import { Platform } from "react-native";
import { ClubEvent } from "@/types/db";

async function getWritableCalendarId(): Promise<string> {
  if (Platform.OS === "ios") {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return defaultCalendar.id;
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((cal) => cal.allowsModifications) ?? calendars[0];
  if (!writable) throw new Error("No calendar found on this device.");
  return writable.id;
}

export async function addEventToDeviceCalendar(event: ClubEvent): Promise<void> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Calendar access was denied. Enable it for ClubHQ in your device Settings to add events.");
  }

  const calendarId = await getWritableCalendarId();
  const startDate = new Date(event.starts_at);
  const endDate = event.ends_at ? new Date(event.ends_at) : new Date(startDate.getTime() + 60 * 60 * 1000);

  await Calendar.createEventAsync(calendarId, {
    title: event.title,
    startDate,
    endDate,
    location: event.location ?? undefined,
    notes: event.notes ?? undefined,
  });
}
