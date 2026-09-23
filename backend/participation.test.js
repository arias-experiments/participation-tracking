import test from 'node:test';
import assert from 'node:assert/strict';
import { pickWeightedStudent, buildParticipationCsv } from './participation.js';

function distribution(counts) {
  const students = counts.map((count, index) => ({ id: index + 1, participation_count: count }));
  const totalWeight = counts.reduce((sum, count) => sum + 0.5 ** (count - Math.min(...counts)), 0);
  return students.map((student, index) => {
    const before = counts.slice(0, index).reduce((sum, count) => sum + 0.5 ** (count - Math.min(...counts)), 0) / totalWeight;
    const after = before + 0.5 ** (counts[index] - Math.min(...counts)) / totalWeight;
    return pickWeightedStudent(students, undefined, () => (before + after) / 2).id;
  });
}

test('weighted selection covers uniform, uneven, and equal counts', () => {
  assert.deepEqual(distribution([0, 0, 0, 0, 0]), [1, 2, 3, 4, 5]);
  assert.deepEqual(distribution([0, 1, 0, 0, 0]), [1, 2, 3, 4, 5]);
  assert.deepEqual(distribution([0, 2, 1, 0, 0]), [1, 2, 3, 4, 5]);
  assert.deepEqual(distribution([3, 3, 3, 3, 3]), [1, 2, 3, 4, 5]);
  const oneScore = [0, 1, 0, 0, 0].map((count, index) => ({ id: index + 1, participation_count: count }));
  assert.equal(pickWeightedStudent(oneScore, undefined, () => 0.30).id, 2);
  assert.equal(pickWeightedStudent(oneScore, undefined, () => 0.34).id, 3);
  const students = [0, 2, 1, 0, 0].map((count, index) => ({ id: index + 1, participation_count: count }));
  assert.equal(pickWeightedStudent(students, undefined, () => 0.30).id, 2);
  assert.equal(pickWeightedStudent(students, undefined, () => 0.40).id, 3);
  assert.equal(pickWeightedStudent(students, 1, () => 0).id, 2);
  assert.equal(pickWeightedStudent([{ id: 1, participation_count: 0 }], 1, () => 0).id, 1);
});

test('CSV includes all students, event averages, repeated dates, and escaped names', () => {
  const students = [{ id: 1, name: 'Johnny' }, { id: 2, name: 'Mary' }, { id: 3, name: 'Jane, "J"\nSmith' }];
  const events = [
    { student_id: 1, score: 5, date: '2026-09-23' },
    { student_id: 2, score: 2, date: '2026-09-23' },
    { student_id: 1, score: 3, date: '2026-09-28' },
    { student_id: 1, score: 4, date: '2026-09-28' },
    { student_id: 1, score: 5, date: '2026-09-30' },
  ];
  assert.equal(buildParticipationCsv(students, events),
    'name,average,2026-09-23,2026-09-28,2026-09-30\r\nJohnny,4.25,5,3;4,5\r\nMary,2,2,,\r\n"Jane, ""J""\nSmith",,,,\r\n');
  assert.equal(buildParticipationCsv(students, []),
    'name,average\r\nJohnny,\r\nMary,\r\n"Jane, ""J""\nSmith",\r\n');
});
