import { useState, useEffect, useRef, useCallback } from 'react'
import JsBarcode from 'jsbarcode'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

function generateBarcode(name, price) {
  // Create a short unique barcode from name + price
  const clean = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(4, '0')
  const priceCode = String(Math.round(price * 100)).padStart(6, '0').slice(0, 6)
  return `${clean}${priceCode}`
}

function BarcodeImage({ code, name, price }) {
  const svgRef = useRef()

  useEffect(() => {
    if (svgRef.current && code) {
      try {
        JsBarcode(svgRef.current, code, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 11,
          margin: 6,
          background: '#ffffff',
          lineColor: '#0f1923',
        })
      } catch (e) {
        // fallback silent
      }
    }
  }, [code])

  return (
    <div className="barcode-card">
      <svg ref={svgRef} />
      <div className="barcode-name">{name}</div>
      <div className="barcode-price">₹{Number(price).toFixed(2)}</div>
    </div>
  )
}

export default function ItemsPage() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', price: '' })
  const [saving, setSaving] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const printRef = useRef()

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
    const barcode = generateBarcode(form.name, price)

    const { error } = await supabase.from('items').insert({
      name: form.name.trim(),
      price,
      barcode,
    })

    if (error) {
      if (error.code === '23505') toast('Item with similar code exists, try a different name', 'error')
      else toast('Failed to save item', 'error')
    } else {
      toast(`Item "${form.name}" added!`)
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

  const handlePrint = () => {
    window.print()
  }

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(searchQ.toLowerCase()) ||
    i.barcode.includes(searchQ)
  )

  return (
    <div className="page-wide">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Items & Barcodes</h1>
          <p className="page-subtitle">Manage products and print barcode labels</p>
        </div>
        <div className="flex gap-3 no-print">
          <button className="btn btn-secondary" onClick={handlePrint}>
            🖨️ Print Labels
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Add Item
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 no-print" style={{ maxWidth: 320 }}>
        <input
          className="form-input"
          placeholder="Search items or barcodes…"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <div className="empty-state-title">Loading items…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">{searchQ ? 'No items match your search' : 'No items yet'}</div>
          <div className="empty-state-text mt-2">{!searchQ && 'Add your first item to generate a barcode label'}</div>
          {!searchQ && (
            <button className="btn btn-primary mt-3" onClick={() => setShowForm(true)}>+ Add First Item</button>
          )}
        </div>
      ) : (
        <div className="barcode-grid" ref={printRef}>
          {filtered.map(item => (
            <div key={item.id} style={{ position: 'relative' }}>
              <BarcodeImage code={item.barcode} name={item.name} price={item.price} />
              <button
                className="btn btn-danger btn-sm no-print"
                style={{ position: 'absolute', top: 8, right: 8 }}
                onClick={() => handleDelete(item.id, item.name)}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Add Item Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-title">Add New Item</div>
            <div className="modal-subtitle">A unique barcode will be generated automatically</div>

            <div className="form-group">
              <label className="form-label">Item Name</label>
              <input
                className="form-input"
                placeholder="e.g. Basmati Rice 5kg"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Price (₹)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 299.00"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>

            {form.name && form.price && (
              <div style={{ background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Preview barcode code</div>
                <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.08em' }}>
                  {generateBarcode(form.name, parseFloat(form.price) || 0)}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button className="btn btn-secondary btn-full" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary btn-full" onClick={handleAdd} disabled={saving}>
                {saving ? 'Saving…' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
