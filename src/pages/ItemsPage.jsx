import { useState, useEffect, useRef, useCallback } from 'react'
import JsBarcode from 'jsbarcode'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

const SHOP_NAME = 'Mayur Masala Center and Pooja Bhandar'

function generateBarcodeCode(name, price) {
  const clean = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(4, '0')
  const priceCode = String(Math.round(price * 100)).padStart(6, '0').slice(0, 6)
  return `${clean}${priceCode}`
}

// ── Render a barcode SVG → PNG data URL via canvas ────────────────
function barcodeToDataURL(code) {
  return new Promise((resolve, reject) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, code, {
      format: 'CODE128', width: 2, height: 60,
      displayValue: false, margin: 4,
      background: '#ffffff', lineColor: '#000000',
    })
    const xml  = new XMLSerializer().serializeToString(svg)
    const img  = new Image()
    img.onload = () => {
      const c   = document.createElement('canvas')
      c.width   = img.width  || 300
      c.height  = img.height || 80
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
  })
}

// ── Generate PDF with barcode labels ─────────────────────────────
async function generateLabelPDF(items, copies) {
  const { jsPDF } = await import('jspdf')

  // Label: 50×25mm, 4 cols on A4
  const LW = 50, LH = 25
  const MX = 8,  MY = 8
  const GX = 4,  GY = 3
  const PW = 210, PH = 297
  const cols    = Math.floor((PW - MX * 2 + GX) / (LW + GX))  // 3
  const rows    = Math.floor((PH - MY * 2 + GY) / (LH + GY))  // 9
  const perPage = cols * rows

  const labels = []
  for (const item of items) for (let i = 0; i < copies; i++) labels.push(item)

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  for (let i = 0; i < labels.length; i++) {
    const item    = labels[i]
    const pagePos = i % perPage
    if (i > 0 && pagePos === 0) doc.addPage()

    const col = pagePos % cols
    const row = Math.floor(pagePos / cols)
    const x   = MX + col * (LW + GX)
    const y   = MY + row * (LH + GY)

    // Border
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, LW, LH, 1, 1)

    // Shop name
    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(80, 80, 80)
    doc.text(SHOP_NAME.toUpperCase(), x + LW / 2, y + 3.5, { align: 'center' })

    // Item name
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    const maxChars = 22
    const name = item.name.length > maxChars ? item.name.slice(0, maxChars - 1) + '…' : item.name
    doc.text(name, x + LW / 2, y + 7, { align: 'center' })

    // Barcode image
    try {
      const bc = await barcodeToDataURL(item.barcode)
      doc.addImage(bc, 'PNG', x + 3, y + 8.5, LW - 6, 10)
    } catch (e) {
      doc.setFontSize(6)
      doc.setTextColor(150)
      doc.text(item.barcode, x + LW / 2, y + 13, { align: 'center' })
    }

    // Price (left) + Code (right)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 120, 90)
    doc.text(`Rs.${Number(item.price).toFixed(2)}`, x + 3, y + 22)

    doc.setFontSize(5.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    doc.text(item.barcode, x + LW - 3, y + 22, { align: 'right' })
  }

  return doc
}

// ── Generate DOCX with barcode labels (HTML-based) ───────────────
// Uses docx-style HTML that Word/LibreOffice opens natively
async function generateLabelDOCX(items, copies) {
  const labels = []
  for (const item of items) for (let i = 0; i < copies; i++) labels.push(item)

  // Build each label as a table cell with barcode as base64 img
  const labelCells = await Promise.all(labels.map(async (item) => {
    let bcImg = ''
    try {
      const dataUrl = await barcodeToDataURL(item.barcode)
      bcImg = `<img src="${dataUrl}" width="160" height="50" style="display:block;margin:0 auto;"/>`
    } catch (e) {
      bcImg = `<p style="font-family:Courier;font-size:7pt;text-align:center;">${item.barcode}</p>`
    }

    return `
      <td style="width:5cm;height:2.5cm;border:0.5pt solid #ccc;padding:2pt;vertical-align:top;text-align:center;">
        <p style="font-size:6pt;font-weight:bold;color:#555;margin:0;">${SHOP_NAME.toUpperCase()}</p>
        <p style="font-size:8pt;font-weight:bold;margin:1pt 0;">${item.name.length > 22 ? item.name.slice(0, 21) + '…' : item.name}</p>
        ${bcImg}
        <p style="font-size:8pt;font-weight:bold;color:#007a60;margin:1pt 0;">Rs.${Number(item.price).toFixed(2)}</p>
      </td>`
  }))

  // Pack into rows of 3
  const cols = 3
  const rowsHtml = []
  for (let i = 0; i < labelCells.length; i += cols) {
    const chunk = labelCells.slice(i, i + cols)
    while (chunk.length < cols) chunk.push('<td style="width:5cm;height:2.5cm;"></td>')
    rowsHtml.push(`<tr>${chunk.join('')}</tr>`)
  }

  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  @page { margin: 1cm; size: A4; }
  body  { font-family: Arial, sans-serif; }
  table { border-collapse: collapse; width: 100%; }
</style>
</head>
<body>
<table>${rowsHtml.join('')}</table>
</body></html>`

  const blob = new Blob([html], { type: 'application/msword' })
  return blob
}

// ── Print modal (per-item OR all items) ──────────────────────────
function PrintModal({ items, title, onClose }) {
  const toast = useToast()
  const [copies, setCopies]       = useState(1)
  const [genPDF, setGenPDF]       = useState(false)
  const [genDOCX, setGenDOCX]     = useState(false)

  const total = items.length * copies

  const handlePDF = async () => {
    if (copies < 1) return toast('Enter at least 1 copy', 'error')
    setGenPDF(true)
    try {
      const doc = await generateLabelPDF(items, copies)
      const fname = items.length === 1
        ? `label-${items[0].name.replace(/\s+/g, '-').toLowerCase()}-x${copies}.pdf`
        : `mayur-masala-labels-x${copies}.pdf`
      doc.save(fname)
      toast(`PDF downloaded — ${total} label${total > 1 ? 's' : ''}`)
      onClose()
    } catch (e) { toast('PDF generation failed', 'error') }
    setGenPDF(false)
  }

  const handleDOCX = async () => {
    if (copies < 1) return toast('Enter at least 1 copy', 'error')
    setGenDOCX(true)
    try {
      const blob  = await generateLabelDOCX(items, copies)
      const fname = items.length === 1
        ? `label-${items[0].name.replace(/\s+/g, '-').toLowerCase()}-x${copies}.doc`
        : `mayur-masala-labels-x${copies}.doc`
      const a = document.createElement('a')
      a.href  = URL.createObjectURL(blob)
      a.download = fname
      a.click()
      URL.revokeObjectURL(a.href)
      toast(`Word document downloaded — ${total} label${total > 1 ? 's' : ''}`)
      onClose()
    } catch (e) { toast('DOCX generation failed', 'error') }
    setGenDOCX(false)
  }

  const busy = genPDF || genDOCX

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">🖨️ {title}</div>
        <div className="modal-subtitle">
          {items.length === 1 ? items[0].name : `${items.length} items`} — 50×25mm labels
        </div>

        {/* Item chips */}
        {items.length > 1 && items.length <= 8 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
            {items.map(i => (
              <span key={i.id} style={{ background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 99, padding: '2px 9px', fontSize: '0.72rem', fontWeight: 600 }}>
                {i.name}
              </span>
            ))}
          </div>
        )}
        {items.length > 8 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
            {items.slice(0, 5).map(i => i.name).join(', ')} +{items.length - 5} more
          </div>
        )}

        {/* Copies input */}
        <div className="form-group">
          <label className="form-label">Copies per item</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary" style={{ width: 44, padding: 0, flexShrink: 0 }}
              onClick={() => setCopies(c => Math.max(1, c - 1))}>−</button>
            <input className="form-input" type="number" min="1" max="500" value={copies}
              onChange={e => setCopies(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
              style={{ textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '1.1rem' }} />
            <button className="btn btn-secondary" style={{ width: 44, padding: 0, flexShrink: 0 }}
              onClick={() => setCopies(c => Math.min(500, c + 1))}>+</button>
          </div>
        </div>

        {/* Summary */}
        <div style={{ background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total labels</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '1.05rem' }}>{total}</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-primary btn-full btn-lg" onClick={handlePDF} disabled={busy}>
            {genPDF ? '⏳ Generating PDF…' : '⬇️ Download PDF'}
          </button>
          <button className="btn btn-dark btn-full" onClick={handleDOCX} disabled={busy}>
            {genDOCX ? '⏳ Generating Doc…' : '📄 Download as Word (.doc)'}
          </button>
          <button className="btn btn-ghost btn-full" onClick={onClose} disabled={busy}>Cancel</button>
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 10 }}>
          A4 · 3 cols · 50×25mm per label · CODE128
        </div>
      </div>
    </div>
  )
}

// ── Barcode preview card ──────────────────────────────────────────
function BarcodeImage({ code, name, price }) {
  const svgRef = useRef()
  useEffect(() => {
    if (svgRef.current && code) {
      try {
        JsBarcode(svgRef.current, code, {
          format: 'CODE128', width: 2, height: 55,
          displayValue: true, fontSize: 10, margin: 5,
          background: '#ffffff', lineColor: '#0f1923',
        })
      } catch (e) {}
    }
  }, [code])
  return (
    <div className="barcode-card">
      <svg ref={svgRef} style={{ maxWidth: '100%' }} />
      <div className="barcode-name">{name}</div>
      <div className="barcode-price">₹{Number(price).toFixed(2)}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function ItemsPage() {
  const toast = useToast()
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ name: '', price: '' })
  const [saving, setSaving]     = useState(false)
  const [searchQ, setSearchQ]   = useState('')
  // printTarget: null | 'all' | single item object
  const [printTarget, setPrintTarget] = useState(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false })
    if (error) toast('Failed to load items', 'error')
    else setItems(data || [])
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleAdd = async () => {
    if (!form.name.trim() || !form.price) return toast('Please fill all fields', 'error')
    const price = parseFloat(form.price)
    if (isNaN(price) || price <= 0) return toast('Enter a valid price', 'error')
    setSaving(true)
    const barcode = generateBarcodeCode(form.name, price)
    const { error } = await supabase.from('items').insert({ name: form.name.trim(), price, barcode })
    if (error) {
      if (error.code === '23505') toast('Item with similar code exists, try a different name', 'error')
      else toast('Failed to save item', 'error')
    } else {
      toast(`"${form.name}" added!`)
      setForm({ name: '', price: '' })
      setShowForm(false)
      fetchItems()
    }
    setSaving(false)
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) toast('Failed to delete', 'error')
    else { toast(`"${name}" deleted`); fetchItems() }
  }

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(searchQ.toLowerCase()) || i.barcode.includes(searchQ)
  )

  const printItems = printTarget === 'all' ? filtered : printTarget ? [printTarget] : null

  return (
    <div className="page-wide">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Items & Barcodes</h1>
          <p className="page-subtitle">PDF & Word label download · 50×25mm</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-secondary"
            onClick={() => filtered.length > 0 ? setPrintTarget('all') : toast('No items to print', 'error')}
            disabled={items.length === 0}>
            🖨️ Print All
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add</button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input className="form-input" placeholder="Search items or barcodes…"
          value={searchQ} onChange={e => setSearchQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="empty-state"><div className="empty-state-icon">⏳</div><div className="empty-state-title">Loading items…</div></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">{searchQ ? 'No items match' : 'No items yet'}</div>
          {!searchQ && <button className="btn btn-primary mt-3" onClick={() => setShowForm(true)}>+ Add First Item</button>}
        </div>
      ) : (
        <div className="barcode-grid">
          {filtered.map(item => (
            <div key={item.id} style={{ position: 'relative' }}>
              <BarcodeImage code={item.barcode} name={item.name} price={item.price} />
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button className="btn btn-dark btn-sm" style={{ padding: '4px 8px', minHeight: 30, fontSize: '0.72rem' }}
                  title="Print label" onClick={() => setPrintTarget(item)}>🖨️</button>
                <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px', minHeight: 30, fontSize: '0.72rem' }}
                  title="Delete" onClick={() => handleDelete(item.id, item.name)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add item modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-title">Add New Item</div>
            <div className="modal-subtitle">A unique barcode will be generated automatically</div>
            <div className="form-group">
              <label className="form-label">Item Name</label>
              <input className="form-input" placeholder="e.g. Basmati Rice 5kg"
                value={form.name} autoFocus
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            </div>
            <div className="form-group">
              <label className="form-label">Price (₹)</label>
              <input className="form-input" type="number" min="0" step="0.01" placeholder="e.g. 299.00"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            </div>
            {form.name && form.price && (
              <div style={{ background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3 }}>Barcode preview</div>
                <div className="mono" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.08em' }}>
                  {generateBarcodeCode(form.name, parseFloat(form.price) || 0)}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-full" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary btn-full" onClick={handleAdd} disabled={saving}>
                {saving ? 'Saving…' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print modal */}
      {printItems && (
        <PrintModal
          items={printItems}
          title={printTarget === 'all' ? 'Print All Labels' : 'Print Label'}
          onClose={() => setPrintTarget(null)}
        />
      )}
    </div>
  )
}
