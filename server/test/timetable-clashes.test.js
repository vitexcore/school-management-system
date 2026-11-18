import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSlotClashes, overlaps, timeToMinutes } from '../src/routes/school/timetable.js';

test('timetable clash intervals use half-open ranges', () => {
  assert.equal(overlaps(timeToMinutes('09:00'), timeToMinutes('10:00'), timeToMinutes('09:30'), timeToMinutes('10:30')), true);
  assert.equal(overlaps(timeToMinutes('09:00'), timeToMinutes('10:00'), timeToMinutes('10:00'), timeToMinutes('11:00')), false);
});

test('clash detection blocks class, teacher, and room double bookings', () => {
  const slot = { classId: 'class-2', startTime: '09:30', endTime: '10:30', room: 'R1' };
  const existing = [
    { classId: 'class-1', startTime: '09:00', endTime: '10:00', room: 'R1', classSubject: { teacherId: 'teacher-1' } },
    { classId: 'class-2', startTime: '10:00', endTime: '11:00', room: 'R2', classSubject: { teacherId: 'teacher-2' } },
  ];
  const conflicts = findSlotClashes(slot, existing, 'teacher-1');
  assert.equal(conflicts.length, 3);
  assert.deepEqual(findSlotClashes({ ...slot, startTime: '10:30', endTime: '09:30' }, [], null), ['Start time must be before end time']);
});
