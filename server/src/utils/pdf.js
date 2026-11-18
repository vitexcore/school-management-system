import PDFDocument from 'pdfkit';

function formatKobo(kobo) {
  return `₦${(Number(kobo) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

export function generateReceiptPdf({ payment, school }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { invoice } = payment;
    const student = invoice?.student;

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text(school?.name || 'School', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(school?.address || '', { align: 'center' });
    doc.fontSize(10).text(school?.email || '', { align: 'center' });
    doc.moveDown();

    doc.fontSize(16).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center' });
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Receipt details
    doc.fontSize(10).font('Helvetica');
    const leftCol = 50;
    const rightCol = 300;
    let y = doc.y;

    doc.text(`Receipt No:`, leftCol, y).font('Helvetica-Bold').text(payment.receiptNumber || '', leftCol + 80, y);
    doc.font('Helvetica').text(`Date:`, rightCol, y).font('Helvetica-Bold').text(
      new Date(payment.paidAt).toLocaleDateString('en-NG'), rightCol + 40, y
    );
    doc.font('Helvetica');
    y += 20;

    doc.text(`Student:`, leftCol, y).font('Helvetica-Bold').text(
      student ? `${student.firstName} ${student.lastName}` : '', leftCol + 60, y
    );
    doc.font('Helvetica').text(`Admission No:`, rightCol, y).font('Helvetica-Bold').text(
      student?.admissionNumber || '', rightCol + 90, y
    );
    doc.font('Helvetica');
    y += 20;

    doc.text(`Term:`, leftCol, y).font('Helvetica-Bold').text(invoice?.term?.name || '', leftCol + 45, y);
    doc.font('Helvetica').text(`Method:`, rightCol, y).font('Helvetica-Bold').text(payment.method, rightCol + 55, y);
    doc.font('Helvetica');
    y += 20;

    doc.text(`Reference:`, leftCol, y).font('Helvetica-Bold').text(payment.reference, leftCol + 65, y);
    doc.font('Helvetica');
    y += 30;

    // Invoice lines table header
    doc.font('Helvetica-Bold').text('Description', leftCol, y).text('Amount', 480, y, { align: 'right' });
    doc.moveTo(leftCol, y + 15).lineTo(545, y + 15).stroke();
    y += 20;

    doc.font('Helvetica');
    for (const line of invoice?.lines || []) {
      doc.text(line.description, leftCol, y).text(formatKobo(line.amount), 480, y, { align: 'right' });
      y += 18;
    }

    doc.moveTo(leftCol, y).lineTo(545, y).stroke();
    y += 10;

    doc.font('Helvetica-Bold').text('Amount Paid This Receipt:', leftCol, y);
    doc.text(formatKobo(payment.amount), 480, y, { align: 'right' });
    y += 20;

    const outstanding = Number(invoice?.totalAmount) - Number(invoice?.amountPaid);
    doc.font('Helvetica').text(`Total Invoice:`, leftCol, y).text(formatKobo(invoice?.totalAmount), 480, y, { align: 'right' });
    y += 18;
    doc.text(`Outstanding Balance:`, leftCol, y).font('Helvetica-Bold').text(formatKobo(outstanding), 480, y, { align: 'right' });

    doc.moveDown(2);
    doc.font('Helvetica').fontSize(9).fillColor('grey').text('This receipt was generated automatically.', { align: 'center' });

    doc.end();
  });
}

export function generateReportCardPdf({ reportCard, student, school, scores, gradeScale, attendance, termName, previousTerm }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // School header
    doc.fontSize(18).font('Helvetica-Bold').text(school?.name || 'School', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(school?.address || '', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(14).font('Helvetica-Bold').fillColor('black').text('STUDENT REPORT CARD', { align: 'center' });
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Student info
    const left = 50;
    let y = doc.y;
    doc.fontSize(10).font('Helvetica');
    doc.text(`Name: `, left, y).font('Helvetica-Bold').text(`${student.firstName} ${student.lastName}`, left + 42, y);
    doc.font('Helvetica').text(`Admission No:`, 350, y).font('Helvetica-Bold').text(student.admissionNumber, 440, y);
    y += 18;
    doc.font('Helvetica').text(`Term: `, left, y).font('Helvetica-Bold').text(termName || '', left + 35, y);
    if (reportCard.position) {
      doc.font('Helvetica').text(`Position in Class:`, 350, y).font('Helvetica-Bold').text(`${reportCard.position}`, 455, y);
    }
    y += 18;
    doc.font('Helvetica').text(`Average: `, left, y).font('Helvetica-Bold').text(
      `${Number(reportCard.average).toFixed(1)}%`, left + 50, y
    );
    if (previousTerm) {
      doc.font('Helvetica').text(`Previous term:`, 350, y).font('Helvetica-Bold').text(
        previousTerm.average == null ? `${previousTerm.name}: not published` : `${previousTerm.name}: ${previousTerm.average.toFixed(1)}%`,
        425, y, { width: 120 }
      );
    }
    if (attendance) {
      doc.font('Helvetica').text(`Attendance:`, 350, y).font('Helvetica-Bold').text(
        `${attendance.present}/${attendance.total} days`, 420, y
      );
    }
    y += 25;

    // Scores table
    const colWidths = [200, 70, 50, 70];
    const headers = ['Subject', 'Score', 'Grade', 'Remark'];
    doc.font('Helvetica-Bold').fillColor('white');
    doc.rect(left, y, 495, 18).fill('#334155');
    let xOff = left;
    headers.forEach((h, i) => {
      doc.text(h, xOff + 4, y + 4, { width: colWidths[i] });
      xOff += colWidths[i];
    });
    y += 18;
    doc.fillColor('black').font('Helvetica');

    let rowAlt = false;
    for (const sc of scores) {
      if (rowAlt) doc.rect(left, y, 495, 16).fill('#f8fafc').stroke('#e2e8f0');
      else doc.rect(left, y, 495, 16).fill('white').stroke('#e2e8f0');
      xOff = left;
      doc.fillColor('black');
      doc.text(sc.subjectName, xOff + 4, y + 3, { width: colWidths[0] });
      xOff += colWidths[0];
      doc.text(sc.totalScore?.toFixed(1) || '-', xOff + 4, y + 3, { width: colWidths[1] });
      xOff += colWidths[1];
      doc.text(sc.grade || '-', xOff + 4, y + 3, { width: colWidths[2] });
      xOff += colWidths[2];
      doc.text(sc.remark || '-', xOff + 4, y + 3, { width: colWidths[3] });
      y += 16;
      rowAlt = !rowAlt;
    }

    y += 15;

    // Comments
    doc.font('Helvetica-Bold').text("Class Teacher's Comment:", left, y);
    y += 14;
    doc.font('Helvetica').text(reportCard.classTeacherComment || '____________________', left, y);
    y += 20;
    doc.font('Helvetica-Bold').text("Principal's Comment:", left, y);
    y += 14;
    doc.font('Helvetica').text(reportCard.principalComment || '____________________', left, y);

    doc.moveDown(2);
    doc.fontSize(8).fillColor('grey').text(`Published: ${reportCard.publishedAt ? new Date(reportCard.publishedAt).toLocaleDateString('en-NG') : 'N/A'}`, { align: 'right' });

    doc.end();
  });
}
