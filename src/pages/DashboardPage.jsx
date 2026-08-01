import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useNavigate } from 'react-router-dom'

function BillDetailModal({ bill, onClose, onPaid }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const toast = useToast()

  useEffect(() => {
    supabase.from('bill_items').select('*').eq('bill_id', bill.id).then(({ data }) => {
      setItems(data || [])
      setLoading(false)
    })
  }, [bill.id])

  const handleMarkPaid = async () => {
    setMarking(true)
    const { error } = await supabase
      .from('bills')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', bill.id)

    if (error) toast('Failed to update', 'error')
    else {
      toast(`₹${bill.total_amount.toFixed(2)} received from ${bill.customer_name}!`)
      onPaid()
      onClose()
    }
    setMarking(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        {/* Bill header */}
        <div style={{ background: 'var(--ink)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Customer</div>
          <div style={{ color: 'var(--white)', fontSize: '1.4rem', fontWeight: 700, marginTop: '4px' }}>{bill.customer_name}</div>
          <div style={{ color: 'var(--teal)', fontSize: '2rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', marginTop: '8px' }}>
            ₹{Number(bill.total_amount).toFixed(2)}
          </div>
          <div style={{ marginTop: '8px' }}>
            <span className={`badge badge-${bill.status}`}>{bill.status === 'paid' ? '✓ Paid' : '⏳ Pending'}</span>
          </div>
        </div>

        {/* Items */}
        <div style={{ marginBottom: '20px' }}>
          <div className="section-title mb-4">Items</div>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>Loading…</div>
          ) : (
            items.map(item => (
              <div key={item.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.item_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                    ₹{Number(item.item_price).toFixed(2)} × {item.quantity}
                  </div>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                  ₹{(item.item_price * item.quantity).toFixed(2)}
                </div>
              </div>
            ))
          )}

          {/* Total row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 0', fontWeight: 700, fontSize: '1.05rem' }}>
            <span>Total</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--teal-dark)' }}>₹{Number(bill.total_amount).toFixed(2)}</span>
          </div>
        </div>

        {/* Info */}
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
          <div>Bill created: {new Date(bill.created_at).toLocaleString()}</div>
          {bill.paid_at && <div>Paid at: {new Date(bill.paid_at).toLocaleString()}</div>}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary btn-full" onClick={onClose}>Close</button>
          {bill.status === 'pending' && (
            <button
              className="btn btn-primary btn-full"
              style={{ background: 'var(--success)', color: 'var(--white)' }}
              onClick={handleMarkPaid}
              disabled={marking}
            >
              {marking ? '⏳ Processing…' : '💰 Mark as Paid'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all' | 'pending' | 'paid'
  const [selectedBill, setSelectedBill] = useState(null)

  const fetchBills = useCallback(async () => {
    const query = supabase.from('bills').select('*').order('created_at', { ascending: false })
    const { data, error } = await query
    if (error) toast('Failed to load bills', 'error')
    else setBills(data || [])
    setLoading(false)
  }, [toast])

  useEffect(() => {
    fetchBills()

    // Realtime subscription
    const channel = supabase
      .channel('bills-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => fetchBills())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchBills])

  const filtered = bills.filter(b => filter === 'all' ? true : b.status === filter)
  const totalPending = bills.filter(b => b.status === 'pending').reduce((s, b) => s + Number(b.total_amount), 0)
  const totalPaid = bills.filter(b => b.status === 'paid').reduce((s, b) => s + Number(b.total_amount), 0)
  const pendingCount = bills.filter(b => b.status === 'pending').length

  return (
    <div className="page-wide">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Billing Dashboard</h1>
          <p className="page-subtitle">Manage customer bills and collect payments</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/scan')}>
          + New Bill
        </button>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Bills</div>
          <div className="stat-value">{bills.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{pendingCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Amount</div>
          <div className="stat-value" style={{ color: 'var(--warning)', fontSize: '1.3rem' }}>₹{totalPending.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Collected Today</div>
          <div className="stat-value teal" style={{ fontSize: '1.3rem' }}>₹{totalPaid.toFixed(2)}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {['all', 'pending', 'paid'].map(f => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-dark' : 'btn-secondary'}`}
            style={filter === f ? {} : {}}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All Bills' : f === 'pending' ? '⏳ Pending' : '✓ Paid'}
          </button>
        ))}
      </div>

      {/* Bills table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <div className="empty-state-title">Loading bills…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <div className="empty-state-title">
              {filter === 'all' ? 'No bills yet' : `No ${filter} bills`}
            </div>
            <div className="empty-state-text mt-1">
              {filter === 'all' && 'Scan a customer\'s items to create a bill'}
            </div>
            {filter === 'all' && (
              <button className="btn btn-primary mt-3" onClick={() => navigate('/scan')}>+ Create First Bill</button>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Time</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(bill => (
                  <tr key={bill.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedBill(bill)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{bill.customer_name}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {new Date(bill.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(bill.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '1rem' }}>
                        ₹{Number(bill.total_amount).toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${bill.status}`}>
                        {bill.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setSelectedBill(bill) }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bill detail modal */}
      {selectedBill && (
        <BillDetailModal
          bill={selectedBill}
          onClose={() => setSelectedBill(null)}
          onPaid={fetchBills}
        />
      )}
    </div>
  )
}
