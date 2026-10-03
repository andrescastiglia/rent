#!/usr/bin/env node
// Expo Calendar 56 writes Boolean ContentValues to Android INTEGER columns.
// Android CalendarProvider requires integer flags and minutes BEFORE an event.
// Expo relativeOffset uses the opposite sign (negative means before).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const packageFile = fileURLToPath(
  import.meta.resolve('expo-calendar/package.json'),
);
const version = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
assert.equal(
  version,
  '56.0.10',
  'Review/remove the Android calendar patch when upgrading expo-calendar',
);
const base = path.join(
  path.dirname(packageFile),
  'android/src/main/java/expo/modules/calendar/next/domain/repositories',
);
for (const [file, replacements] of [
  [
    '../../mappers/ReminderMapper.kt',
    [
      [
        'minutes = record.relativeOffset\n',
        'minutes = record.relativeOffset?.let { -it }\n',
      ],
      ['relativeOffset = entity.minutes,', 'relativeOffset = -entity.minutes,'],
    ],
  ],
  [
    'event/EventRepository.kt',
    [
      [
        'put(CalendarContract.Events.ALL_DAY, it)',
        'put(CalendarContract.Events.ALL_DAY, if (it) 1 else 0)',
      ],
      [
        'put(CalendarContract.Events.ALL_DAY, allDay.optional)',
        'put(CalendarContract.Events.ALL_DAY, allDay.optional?.let { if (it) 1 else 0 })',
      ],
    ],
  ],
  [
    'calendar/CalendarRepository.kt',
    [
      [
        'put(CalendarContract.Calendars.VISIBLE, visible)',
        'put(CalendarContract.Calendars.VISIBLE, if (visible) 1 else 0)',
      ],
      [
        'put(CalendarContract.Calendars.SYNC_EVENTS, syncEvents)',
        'put(CalendarContract.Calendars.SYNC_EVENTS, if (syncEvents) 1 else 0)',
      ],
      [
        'put(CalendarContract.Calendars.VISIBLE, visible.optional)',
        'put(CalendarContract.Calendars.VISIBLE, visible.optional?.let { if (it) 1 else 0 })',
      ],
      [
        'put(CalendarContract.Calendars.SYNC_EVENTS, syncEvents.optional)',
        'put(CalendarContract.Calendars.SYNC_EVENTS, syncEvents.optional?.let { if (it) 1 else 0 })',
      ],
    ],
  ],
]) {
  const source = path.join(base, file);
  let content = fs.readFileSync(source, 'utf8');
  for (const [previous, corrected] of replacements) {
    if (content.includes(corrected) && !content.includes(previous)) continue;
    assert.equal(
      content.split(previous).length,
      2,
      `Unexpected expo-calendar source: ${file}`,
    );
    content = content.replace(previous, corrected);
  }
  fs.writeFileSync(source, content);
}
console.log('expo-calendar: Android integer calendar flags applied');
