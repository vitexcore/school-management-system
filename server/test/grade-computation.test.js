import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGradeScale } from '../src/services/gradeScale.js';

const scale = [
  { minScore: 0, maxScore: 39, grade: 'F', remark: 'Fail' },
  { minScore: 40, maxScore: 59, grade: 'C', remark: 'Pass' },
  { minScore: 60, maxScore: 100, grade: 'A', remark: 'Excellent' },
];

test('grade computation handles inclusive boundaries and out-of-range scores', () => {
  assert.deepEqual(applyGradeScale(39, scale), { grade: 'F', remark: 'Fail' });
  assert.deepEqual(applyGradeScale(40, scale), { grade: 'C', remark: 'Pass' });
  assert.deepEqual(applyGradeScale(100, scale), { grade: 'A', remark: 'Excellent' });
  assert.deepEqual(applyGradeScale(101, scale), { grade: 'N/A', remark: null });
});
