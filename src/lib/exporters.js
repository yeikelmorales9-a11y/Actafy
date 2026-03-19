import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType,
} from 'docx'
import { fmtCOP, fmtNum } from './helpers'

// ── Paleta ─────────────────────────────────────────────────────────────────
const AZUL  = [27,  58,  92 ]   // Azul corporativo oscuro
const AZUL_L = [235, 242, 251]  // Fondo encabezado de grupo
const GRIS  = [248, 250, 252]   // Fila alterna
const VERDE = [26,  107, 53 ]   // Solo TOTAL FINAL

// ── Helpers ─────────────────────────────────────────────────────────────────
const filename = (d, ext) =>
  `Acta_No${d.numero}_${(d.contratista || 'acta').replace(/\s+/g, '_')}.${ext}`

const fmtFecha = (str) => {
  if (!str) return '—'
  const [y, m, dd] = str.split('-')
  const M = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
             'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  return `${parseInt(dd, 10)} de ${M[parseInt(m, 10) - 1] || ''} de ${y}`
}

// ─────────────────────────────────────────────────────────────────────────────
//  PDF  —  diseño corporativo de una sola página
// ─────────────────────────────────────────────────────────────────────────────
export async function exportPDF(d) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W  = doc.internal.pageSize.getWidth()
  const mg = 14                    // margen horizontal
  const uw = W - mg * 2            // ancho útil

  // ── 1. ENCABEZADO ─────────────────────────────────────────────────────────
  const hH = 20                    // altura del banner
  doc.setFillColor(...AZUL)
  doc.rect(0, 0, W, hH, 'F')

  // Logo (si existe, flotado a la izquierda dentro del banner)
  if (d.logo) {
    try {
      const ext = d.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(d.logo, ext, mg, 1.5, 17, 17)
    } catch {}
  }

  // Título centrado
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('ACTA DE OBRA', W / 2, 9, { align: 'center' })

  // Número y fecha en la misma línea (izq y der)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text(`No. ${d.numero}`, W / 2, 16, { align: 'center' })
  doc.text(fmtFecha(d.fecha), W - mg, 16, { align: 'right' })

  // ── 2. FILA DE META (Obra | Contrato | Periodo) ───────────────────────────
  const metaY = hH + 2
  const metaFields = [
    ['OBRA / PROYECTO', d.obra || '—'],
    ['No. CONTRATO',    d.contrato || '—'],
    ['PERIODO',         d.periodo  || '—'],
  ]
  const metaW = uw / metaFields.length
  const metaH = 10

  metaFields.forEach(([lbl, val], i) => {
    const x = mg + i * metaW
    doc.setFillColor(...GRIS)
    doc.rect(x, metaY, metaW - 0.5, metaH, 'F')
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(130, 130, 130)
    doc.text(lbl, x + 2, metaY + 3.8)
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20)
    doc.text(String(val), x + 2, metaY + 8.5)
  })

  // ── 3. PARTES  (CONTRATANTE | CONTRATISTA) ────────────────────────────────
  let y = metaY + metaH + 3
  const halfW = uw / 2

  // Encabezados de columna
  doc.setFillColor(...AZUL)
  doc.rect(mg,           y, halfW - 0.5, 6, 'F')
  doc.rect(mg + halfW,   y, halfW,       6, 'F')
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('CONTRATANTE',  mg + halfW / 2 - 0.5,    y + 4, { align: 'center' })
  doc.text('CONTRATISTA',  mg + halfW + halfW / 2,   y + 4, { align: 'center' })
  y += 6

  // Datos de cada parte
  const left  = [d.cliente      || '—', `NIT: ${d.nit_cl || '—'}`,      `Dir. Obra: ${d.director    || '—'}`]
  const right = [d.contratista  || '—', `NIT: ${d.nit_c  || '—'}`,      `Rep.: ${d.representante    || '—'}`]
  const bold  = [true, false, false]
  const rh    = 5.5

  left.forEach((txt, i) => {
    const ry   = y + i * rh
    const fill = i % 2 === 0 ? [255,255,255] : [251,252,254]
    doc.setFillColor(...fill)
    doc.rect(mg,         ry, halfW - 0.5, rh, 'F')
    doc.rect(mg + halfW, ry, halfW,       rh, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', bold[i] ? 'bold' : 'normal')
    doc.setTextColor(25, 25, 25)
    doc.text(txt,      mg + 2,         ry + 3.8)
    doc.text(right[i], mg + halfW + 2, ry + 3.8)
  })
  y += left.length * rh + 4

  // ── 4. TABLA DE ACTIVIDADES ───────────────────────────────────────────────
  const rows = []
  d.grupos.forEach((g) => {
    rows.push([{
      content: g.nombre || 'Sin nombre',
      colSpan: 6,
      styles: {
        fontStyle: 'bold', fontSize: 7.5,
        fillColor: AZUL_L, textColor: AZUL,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      },
    }])
    g.acts.filter(a => a.desc).forEach((a) => {
      const vt = Math.round((parseFloat(a.cant) || 0) * (parseFloat(a.vunit) || 0))
      rows.push([a.item, a.desc, a.und, fmtNum(a.cant), fmtCOP(a.vunit), fmtCOP(vt)])
    })
  })

  autoTable(doc, {
    startY: y,
    head: [['Ítem', 'Descripción', 'Und', 'Cantidad', 'V. Unitario', 'V. Total']],
    body: rows,
    margin: { left: mg, right: mg },
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      lineColor: [218, 226, 236],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: AZUL, textColor: [255, 255, 255],
      fontStyle: 'bold', fontSize: 7.5,
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
    },
    alternateRowStyles: { fillColor: [251, 252, 254] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
  })

  y = doc.lastAutoTable.finalY + 4

  // ── 5. RESUMEN FINANCIERO (bloque compacto derecho) ───────────────────────
  const T      = d.totals
  const aiu    = d.aiu
  const blkW   = 76          // ancho del bloque de totales
  const tx     = W - mg - blkW
  const lbW    = blkW * 0.57 // ancho columna etiqueta
  const vW     = blkW * 0.43 // ancho columna valor
  const rowH   = 6.5

  const totLines = [
    [`Subtotal`,                           T.bruto],
    [`Administración ${aiu.admin       || 10}%`, T.admV],
    [`Imprevistos ${aiu.imprevistos    || 3}%`,  T.impV],
    [`Utilidad ${aiu.utilidad          || 10}%`, T.utiV],
    [`IVA ${d.iva                      || 19}%`, T.ivaV],
  ]

  doc.setFontSize(7); doc.setFont('helvetica', 'normal')
  totLines.forEach(([lbl, val], i) => {
    const ry = y + i * rowH
    doc.setFillColor(i % 2 === 0 ? 248 : 243, i % 2 === 0 ? 250 : 246, i % 2 === 0 ? 253 : 252)
    doc.rect(tx, ry, blkW, rowH, 'F')
    doc.setTextColor(100, 100, 100)
    doc.text(lbl,         tx + lbW - 2,  ry + 4.4, { align: 'right' })
    doc.setTextColor(25, 25, 25)
    doc.text(fmtCOP(val), tx + blkW - 2, ry + 4.4, { align: 'right' })
  })

  // TOTAL FINAL
  const totalY = y + totLines.length * rowH
  const totalH = 9
  doc.setFillColor(...VERDE)
  doc.rect(tx, totalY, blkW, totalH, 'F')
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('TOTAL FINAL',    tx + 3,        totalY + 6.2)
  doc.text(fmtCOP(T.total),  tx + blkW - 2, totalY + 6.2, { align: 'right' })

  // Observaciones (a la izquierda del bloque de totales)
  if (d.observaciones) {
    const obsW = tx - mg - 4
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100)
    doc.text('Observaciones:', mg, y + 4)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
    const lines = doc.splitTextToSize(d.observaciones, obsW)
    doc.text(lines, mg, y + 9)
  }

  // ── 6. FIRMAS ─────────────────────────────────────────────────────────────
  let fy = totalY + totalH + 14
  if (fy > 264) { doc.addPage(); fy = 18 }

  const lineW = 72
  const lx    = mg + 8
  const rx    = W - mg - 8 - lineW

  doc.setDrawColor(...AZUL); doc.setLineWidth(0.4)
  doc.line(lx,  fy, lx + lineW,  fy)
  doc.line(rx,  fy, rx + lineW,  fy)

  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL)
  doc.text('CONTRATISTA',     lx + lineW / 2, fy + 4.5, { align: 'center' })
  doc.text('DIRECTOR DE OBRA', rx + lineW / 2, fy + 4.5, { align: 'center' })

  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(70, 70, 70)
  doc.text(d.contratista || '—', lx + lineW / 2, fy + 9,  { align: 'center' })
  doc.text(d.director    || '—', rx + lineW / 2, fy + 9,  { align: 'center' })

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const pages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    const pH = doc.internal.pageSize.getHeight()
    doc.setDrawColor(200, 212, 228); doc.setLineWidth(0.2)
    doc.line(mg, pH - 10, W - mg, pH - 10)
    doc.setFontSize(6.5); doc.setTextColor(160, 160, 160); doc.setFont('helvetica', 'normal')
    doc.text(`Acta No. ${d.numero}  ·  ${d.contratista || ''}  ·  ${d.cliente || ''}`, mg, pH - 6)
    doc.text(`${p} / ${pages}`, W - mg, pH - 6, { align: 'right' })
  }

  doc.save(filename(d, 'pdf'))
}

// ─────────────────────────────────────────────────────────────────────────────
//  WORD  —  mismo diseño corporativo
// ─────────────────────────────────────────────────────────────────────────────
export async function exportWord(d) {
  const pgW     = 11906
  const margins = { top: 900, right: 900, bottom: 900, left: 900 }
  const cW      = pgW - margins.left - margins.right

  const bdr  = { style: BorderStyle.SINGLE, size: 1, color: 'D0D8E4' }
  const noBdr = { style: BorderStyle.NONE }
  const borders     = { top: bdr, bottom: bdr, left: bdr, right: bdr }
  const noBorders   = { top: noBdr, bottom: noBdr, left: noBdr, right: noBdr }
  const bottomOnly  = { top: noBdr, left: noBdr, right: noBdr, bottom: { style: BorderStyle.SINGLE, size: 6, color: '1B3A5C' } }

  const sp = (before = 0, after = 80) =>
    new Paragraph({ spacing: { before, after } })

  // Celdas genéricas
  function cell(txt, { align = AlignmentType.LEFT, w = 700, fill = 'FFFFFF', bold = false, size = 16, color = '111111', pad = {} } = {}) {
    return new TableCell({
      width: { size: w, type: WidthType.DXA }, borders,
      shading: { type: ShadingType.CLEAR, fill },
      margins: { top: 60, bottom: 60, left: 100, right: 80, ...pad },
      children: [new Paragraph({
        alignment: align,
        children: [new TextRun({ text: String(txt ?? '—'), bold, size, color, font: 'Arial' })],
      })],
    })
  }

  function hdrCell(txt, w) {
    return new TableCell({
      width: { size: w, type: WidthType.DXA }, borders,
      shading: { type: ShadingType.CLEAR, fill: '1B3A5C' },
      margins: { top: 80, bottom: 80, left: 100, right: 80 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: txt, bold: true, color: 'FFFFFF', size: 16, font: 'Arial' })],
      })],
    })
  }

  // ── Encabezado principal ──────────────────────────────────────────────────
  const headerTable = new Table({
    width: { size: cW, type: WidthType.DXA },
    columnWidths: [cW],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: cW, type: WidthType.DXA }, borders: noBorders,
      shading: { type: ShadingType.CLEAR, fill: '1B3A5C' },
      margins: { top: 200, bottom: 200, left: 200, right: 200 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'ACTA DE OBRA', bold: true, color: 'FFFFFF', size: 28, font: 'Arial' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `No. ${d.numero}  ·  ${fmtFecha(d.fecha)}`, color: 'B8CCDF', size: 18, font: 'Arial' })],
        }),
      ],
    })] })],
  })

  // ── Fila de meta (Obra | Contrato | Periodo) ──────────────────────────────
  const metaW = Math.floor(cW / 3)
  function metaCell(lbl, val) {
    return new TableCell({
      width: { size: metaW, type: WidthType.DXA }, borders,
      shading: { type: ShadingType.CLEAR, fill: 'F8FAFB' },
      margins: { top: 60, bottom: 80, left: 120, right: 80 },
      children: [
        new Paragraph({ children: [new TextRun({ text: lbl, bold: true, size: 13, color: '888888', font: 'Arial' })] }),
        new Paragraph({ children: [new TextRun({ text: String(val || '—'), size: 17, font: 'Arial' })] }),
      ],
    })
  }
  const metaTable = new Table({
    width: { size: cW, type: WidthType.DXA }, columnWidths: [metaW, metaW, metaW],
    rows: [new TableRow({ children: [
      metaCell('OBRA / PROYECTO', d.obra),
      metaCell('No. CONTRATO',    d.contrato),
      metaCell('PERIODO',         d.periodo),
    ] })],
  })

  // ── Partes (CONTRATANTE | CONTRATISTA) ───────────────────────────────────
  const partW = Math.floor(cW / 2)

  function parteHdr(txt) {
    return new TableCell({
      width: { size: partW, type: WidthType.DXA }, borders,
      shading: { type: ShadingType.CLEAR, fill: '1B3A5C' },
      margins: { top: 80, bottom: 80, left: 120, right: 80 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: txt, bold: true, color: 'FFFFFF', size: 17, font: 'Arial' })] })],
    })
  }
  function parteCell(txt, bold = false, fill = 'FFFFFF') {
    return new TableCell({
      width: { size: partW, type: WidthType.DXA }, borders,
      shading: { type: ShadingType.CLEAR, fill },
      margins: { top: 60, bottom: 60, left: 120, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: String(txt || '—'), bold, size: bold ? 18 : 16, font: 'Arial' })] })],
    })
  }
  const partesTable = new Table({
    width: { size: cW, type: WidthType.DXA }, columnWidths: [partW, partW],
    rows: [
      new TableRow({ children: [parteHdr('CONTRATANTE'), parteHdr('CONTRATISTA')] }),
      new TableRow({ children: [parteCell(d.cliente, true), parteCell(d.contratista, true)] }),
      new TableRow({ children: [parteCell(`NIT: ${d.nit_cl || '—'}`, false, 'F8FAFB'), parteCell(`NIT: ${d.nit_c || '—'}`, false, 'F8FAFB')] }),
      new TableRow({ children: [parteCell(`Dir. Obra: ${d.director || '—'}`), parteCell(`Rep.: ${d.representante || '—'}`)] }),
    ],
  })

  // ── Tabla de actividades ──────────────────────────────────────────────────
  const actCols = [700, 4300, 680, 920, 1200, 1200]
  const actRows = [new TableRow({ children: [
    hdrCell('Ítem',        actCols[0]),
    hdrCell('Descripción', actCols[1]),
    hdrCell('Und',         actCols[2]),
    hdrCell('Cant.',       actCols[3]),
    hdrCell('V. Unitario', actCols[4]),
    hdrCell('V. Total',    actCols[5]),
  ], tableHeader: true })]

  d.grupos.forEach((g, gi) => {
    actRows.push(new TableRow({ children: [new TableCell({
      columnSpan: 6, borders,
      shading: { type: ShadingType.CLEAR, fill: 'EBF2FB' },
      margins: { top: 60, bottom: 60, left: 120, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: g.nombre || `Grupo ${gi + 1}`, bold: true, size: 17, color: '1B3A5C', font: 'Arial' })] })],
    })] }))
    g.acts.filter(a => a.desc).forEach((a, ai) => {
      const vt   = Math.round((parseFloat(a.cant) || 0) * (parseFloat(a.vunit) || 0))
      const fill = ai % 2 === 0 ? 'FFFFFF' : 'F8FAFB'
      actRows.push(new TableRow({ children: [
        cell(a.item,          { align: AlignmentType.CENTER, w: actCols[0], fill }),
        cell(a.desc,          { align: AlignmentType.LEFT,   w: actCols[1], fill }),
        cell(a.und,           { align: AlignmentType.CENTER, w: actCols[2], fill }),
        cell(fmtNum(a.cant),  { align: AlignmentType.RIGHT,  w: actCols[3], fill }),
        cell(fmtCOP(a.vunit), { align: AlignmentType.RIGHT,  w: actCols[4], fill }),
        cell(fmtCOP(vt),      { align: AlignmentType.RIGHT,  w: actCols[5], fill }),
      ] }))
    })
  })
  const actTable = new Table({ width: { size: cW, type: WidthType.DXA }, columnWidths: actCols, rows: actRows })

  // ── Resumen financiero ────────────────────────────────────────────────────
  const T   = d.totals; const aiu = d.aiu
  const tW  = Math.floor(cW * 0.46)
  const lW  = Math.floor(tW * 0.55)
  const vW2 = tW - lW

  const totLines = [
    [`Subtotal`,                                fmtCOP(T.bruto), false],
    [`Administración ${aiu.admin       || 10}%`, fmtCOP(T.admV), false],
    [`Imprevistos ${aiu.imprevistos    || 3}%`,  fmtCOP(T.impV), false],
    [`Utilidad ${aiu.utilidad          || 10}%`, fmtCOP(T.utiV), false],
    [`IVA ${d.iva                      || 19}%`, fmtCOP(T.ivaV), false],
    ['TOTAL FINAL',                              fmtCOP(T.total), true],
  ]

  const totRows2 = totLines.map(([lbl, val, isTot]) =>
    new TableRow({ children: [
      new TableCell({
        width: { size: lW, type: WidthType.DXA }, borders,
        shading: { type: ShadingType.CLEAR, fill: isTot ? '1A6B35' : 'F4F7FB' },
        margins: { top: 80, bottom: 80, left: 120, right: 60 },
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: lbl, bold: isTot, size: isTot ? 19 : 16, color: isTot ? 'FFFFFF' : '666666', font: 'Arial' })] })],
      }),
      new TableCell({
        width: { size: vW2, type: WidthType.DXA }, borders,
        shading: { type: ShadingType.CLEAR, fill: isTot ? '1A6B35' : 'FFFFFF' },
        margins: { top: 80, bottom: 80, left: 60, right: 120 },
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: val, bold: isTot, size: isTot ? 20 : 16, color: isTot ? 'FFFFFF' : '111111', font: 'Arial' })] })],
      }),
    ] })
  )
  const totTable = new Table({ width: { size: tW, type: WidthType.DXA }, columnWidths: [lW, vW2], rows: totRows2 })

  // ── Firmas ────────────────────────────────────────────────────────────────
  const sigW = Math.floor((cW - 600) / 2)
  function sigCell(name, role) {
    return new TableCell({
      width: { size: sigW, type: WidthType.DXA }, borders: bottomOnly,
      margins: { top: 800, bottom: 100, left: 80, right: 80 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: name || '—', size: 16, font: 'Arial' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: role, bold: true, size: 16, color: '1B3A5C', font: 'Arial' })] }),
      ],
    })
  }
  function spacerCell() {
    return new TableCell({
      width: { size: 600, type: WidthType.DXA }, borders: noBorders,
      children: [new Paragraph({})],
    })
  }
  const sigTable = new Table({
    width: { size: cW, type: WidthType.DXA }, columnWidths: [sigW, 600, sigW],
    rows: [new TableRow({ children: [
      sigCell(d.contratista, 'CONTRATISTA'),
      spacerCell(),
      sigCell(d.director,    'DIRECTOR DE OBRA'),
    ] })],
  })

  // ── Armado del documento ──────────────────────────────────────────────────
  const obsChildren = d.observaciones ? [
    sp(120, 60),
    new Paragraph({ children: [new TextRun({ text: 'Observaciones:', bold: true, size: 16, color: '888888', font: 'Arial' })] }),
    new Paragraph({ children: [new TextRun({ text: d.observaciones, size: 16, font: 'Arial' })], spacing: { before: 40, after: 60 } }),
  ] : []

  const docx = new Document({
    sections: [{
      properties: { page: { size: { width: pgW, height: 16838 }, margin: margins } },
      children: [
        headerTable, sp(0, 80),
        metaTable,   sp(0, 80),
        partesTable, sp(0, 100),
        actTable,    sp(0, 80),
        totTable,
        ...obsChildren,
        sp(120, 0),
        sigTable,
      ],
    }],
  })

  const blob = await Packer.toBlob(docx)
  saveAs(blob, filename(d, 'docx'))
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXCEL  —  mismo formato original
// ─────────────────────────────────────────────────────────────────────────────
export function exportExcel(d) {
  const rows = []
  rows.push([d.contratista, '', '', '', '', ''])
  rows.push([`NIT: ${d.nit_c}`, '', '', '', '', ''])
  rows.push([`Fecha: ${fmtFecha(d.fecha)}`, '', '', '', '', ''])
  rows.push([`Acta No. ${d.numero}`, '', '', '', '', ''])
  rows.push([`Cliente: ${d.cliente}`, '', `Actividad: ${d.tipo || 'Obra Civil'}`, '', '', ''])
  rows.push([`NIT: ${d.nit_cl}`, '', '', '', '', ''])
  rows.push([''])
  rows.push(['Ítem', 'Descripción', 'UND', 'Cantidad', 'Precio Unitario', 'Total'])

  d.grupos.forEach((g) => {
    rows.push([g.nombre, '', '', '', '', ''])
    g.acts.filter(a => a.desc).forEach((a) => {
      rows.push([
        a.item, a.desc, a.und,
        parseFloat(a.cant) || 0,
        parseFloat(a.vunit) || 0,
        Math.round((parseFloat(a.cant) || 0) * (parseFloat(a.vunit) || 0)),
      ])
    })
    rows.push([''])
  })

  const T = d.totals; const aiu = d.aiu
  rows.push(['', '', '', '', 'Subtotal',                          T.bruto])
  rows.push(['', '', '', '', `Administración ${aiu.admin || 10}%`, T.admV])
  rows.push(['', '', '', '', `Imprevistos ${aiu.imprevistos || 3}%`, T.impV])
  rows.push(['', '', '', '', `Utilidad ${aiu.utilidad || 10}%`,   T.utiV])
  rows.push(['', '', '', '', `IVA ${d.iva || 19}%`,               T.ivaV])
  rows.push(['', '', '', '', 'TOTAL FINAL',                       T.total])
  rows.push([''])
  rows.push([`Contratista: ${d.contratista}`, '', '', `Director de obra: ${d.director}`, '', ''])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 8 }, { wch: 52 }, { wch: 8 }, { wch: 10 }, { wch: 22 }, { wch: 18 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `ACTA #${d.numero}`)
  XLSX.writeFile(wb, filename(d, 'xlsx'))
}
