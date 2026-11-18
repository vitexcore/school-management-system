export function applyGradeScale(score, gradeScale) {
  for (const grade of gradeScale) {
    if (score >= Number(grade.minScore) && score <= Number(grade.maxScore)) {
      return { grade: grade.grade, remark: grade.remark };
    }
  }
  return { grade: 'N/A', remark: null };
}
