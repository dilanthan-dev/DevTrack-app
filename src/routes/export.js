// Data export to CSV and PDF:
//   GET /api/export/view/:key.csv|pdf        export one of the 10 views
//   GET /api/export/data/:entity.csv|pdf     export a table, honouring the same search/filters as the list (?q=&status=...)
const express = require('express');
const PDFDocument = require('pdfkit');
const { query } = require('../db');
const { AppError, wrap } = require('../errors');
const { requireLogin } = require('../auth');
const { runView } = require('./views');
const { buildList, getEntity } = require('./crud');

const router = express.Router();
router.use(requireLogin);

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}

// Draws a simple paginated table with a repeated header row.
function toPdf(res, title, subtitle, rows) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1F3A5F').text(title);
  doc.font('Helvetica').fontSize(9).fillColor('#555555').text(subtitle);
  doc.moveDown(0.8);

  if (!rows.length) { doc.fontSize(11).fillColor('#000').text('No rows.'); doc.end(); return; }

  const cols = Object.keys(rows[0]);
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  // Width of each column is proportional to its longest value (capped).
  const weights = cols.map((c) => Math.min(30, Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length))) + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / total) * usable);
  const left = doc.page.margins.left;
  const fs = 8;

  const drawRow = (values, header, shade) => {
    const heights = values.map((v, i) => doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs).heightOfString(String(v ?? ''), { width: widths[i] - 6 }));
    const h = Math.max(...heights) + 6;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      if (!header) drawRow(cols, true);
    }
    const y = doc.y;
    if (header) doc.rect(left, y, usable, h).fill('#1F3A5F');
    else if (shade) doc.rect(left, y, usable, h).fill('#EEF2F7');
    let x = left;
    values.forEach((v, i) => {
      doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs).fillColor(header ? '#FFFFFF' : '#111111')
        .text(v === null || v === undefined ? 'NULL' : String(v), x + 3, y + 3, { width: widths[i] - 6 });
      x += widths[i];
    });
    doc.x = left;
    doc.y = y + h;
  };

  drawRow(cols, true);
  rows.forEach((r, i) => drawRow(cols.map((c) => r[c]), false, i % 2 === 1));
  doc.moveDown(0.5).font('Helvetica').fontSize(8).fillColor('#555555').text(`${rows.length} row(s)`, left);
  doc.end();
}

function send(res, fmt, filename, title, rows) {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  if (fmt === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send('﻿' + toCsv(rows)); // BOM so Excel reads UTF-8 correctly
  }
  if (fmt === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    return toPdf(res, title, `DevTrack export, ${stamp}`, rows);
  }
  throw new AppError(400, 'Format must be csv or pdf.');
}

router.get('/view/:key.:fmt', wrap(async (req, res) => {
  const { view, rows } = await runView(req.params.key, req.session.user.role);
  send(res, req.params.fmt, view.key, `${view.title} (${view.type})`, rows);
}));

router.get('/data/:entity.:fmt', wrap(async (req, res) => {
  const e = getEntity(req, 'read');
  const { sql, params } = buildList(e, req.query);
  const rows = (await query(sql, params)).map((r) => {
    const out = {};
    e.columns.forEach((c) => { out[c] = r[c]; });
    return out;
  });
  send(res, req.params.fmt, req.params.entity, e.label, rows);
}));

module.exports = router;
