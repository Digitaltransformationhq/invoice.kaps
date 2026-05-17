import { Link } from 'react-router';
import { Plus, Search, Filter, Download, Eye, Edit, MoreVertical, Send, Trash2, FileText, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { CreditNotePreview } from './CreditNotePreview';

const initialCreditNotes = [
  { id: 'CN-2026-001', type: 'credit', customer: 'TechCorp Solutions', originalInvoice: 'INV-2026-145', date: '10 May 2026', amount: 15000, reason: 'Product return - damaged goods', status: 'issued' },
  { id: 'DN-2026-001', type: 'debit', customer: 'Retail Innovations', originalInvoice: 'INV-2026-142', date: '09 May 2026', amount: 5000, reason: 'Additional shipping charges', status: 'issued' },
  { id: 'CN-2026-002', type: 'credit', customer: 'Manufacturing Ltd', originalInvoice: 'INV-2026-138', date: '08 May 2026', amount: 8500, reason: 'Post-sale discount approved', status: 'issued' },
  { id: 'DN-2026-002', type: 'debit', customer: 'Services Group', originalInvoice: 'INV-2026-135', date: '07 May 2026', amount: 3200, reason: 'Price difference adjustment', status: 'draft' },
  { id: 'CN-2026-003', type: 'credit', customer: 'Digital Agency', originalInvoice: 'INV-2026-130', date: '05 May 2026', amount: 12000, reason: 'Service quality issue - partial refund', status: 'issued' },
];

export function CreditNotesList() {
  const [creditNotes, setCreditNotes] = useState(initialCreditNotes);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [viewingNote, setViewingNote] = useState<any>(null);
  const [sendingNote, setSendingNote] = useState<any>(null);
  const [deletingNote, setDeletingNote] = useState<any>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState<string | null>(null);

  const filteredNotes = creditNotes.filter(note => {
    const matchesSearch = note.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.originalInvoice.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || note.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const stats = {
    all: creditNotes.length,
    credit: creditNotes.filter(n => n.type === 'credit').length,
    debit: creditNotes.filter(n => n.type === 'debit').length,
    totalAmount: creditNotes.reduce((sum, n) => sum + (n.type === 'credit' ? -n.amount : n.amount), 0),
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Credit / Debit Notes</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage credit and debit notes for adjustments</p>
        </div>
        <Link
          to="/app/credit-notes/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Note
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="All Notes"
          value={stats.all}
          active={typeFilter === 'all'}
          onClick={() => setTypeFilter('all')}
        />
        <StatCard
          label="Credit Notes"
          value={stats.credit}
          color="success"
          active={typeFilter === 'credit'}
          onClick={() => setTypeFilter('credit')}
        />
        <StatCard
          label="Debit Notes"
          value={stats.debit}
          color="warning"
          active={typeFilter === 'debit'}
          onClick={() => setTypeFilter('debit')}
        />
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="text-xs text-muted-foreground mb-1">Net Adjustment</div>
          <div className={`text-4xl font-bold ${stats.totalAmount < 0 ? 'text-success' : 'text-warning'}`}>
            ₹{Math.abs(stats.totalAmount).toLocaleString()}
            <span className="text-xs ml-1">({stats.totalAmount < 0 ? 'Credit' : 'Debit'})</span>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white border border-border rounded-lg">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by note number, customer, or original invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
              <Filter className="w-4 h-4" />
              <span className="text-sm">Filter</span>
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
              <Download className="w-4 h-4" />
              <span className="text-sm">Export</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Note Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Original Invoice</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredNotes.map((note) => (
                <tr key={note.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-3">
                    <div className="text-sm font-medium text-foreground">{note.id}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-xs">{note.reason}</div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                      note.type === 'credit'
                        ? 'bg-success/10 text-success'
                        : 'bg-warning/10 text-warning'
                    }`}>
                      {note.type === 'credit' ? 'Credit Note' : 'Debit Note'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-foreground">{note.customer}</td>
                  <td className="px-6 py-3 text-sm font-mono text-muted-foreground">{note.originalInvoice}</td>
                  <td className="px-6 py-3 text-sm text-muted-foreground">{note.date}</td>
                  <td className="px-6 py-3 text-sm font-medium text-right">
                    <span className={note.type === 'credit' ? 'text-success' : 'text-warning'}>
                      {note.type === 'credit' ? '-' : '+'}₹{note.amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={note.status} />
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setViewingNote(note)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <Link
                        to="/app/credit-notes/new"
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </Link>
                      <div className="relative">
                        <button
                          onClick={() => setMoreMenuOpen(moreMenuOpen === note.id ? null : note.id)}
                          className="p-1.5 hover:bg-muted rounded transition-colors"
                          title="More"
                        >
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {moreMenuOpen === note.id && (
                          <MoreMenu
                            note={note}
                            onClose={() => setMoreMenuOpen(null)}
                            onDownload={() => {
                              alert('Download functionality would generate PDF');
                              setMoreMenuOpen(null);
                            }}
                            onSend={() => {
                              setSendingNote(note);
                              setMoreMenuOpen(null);
                            }}
                            onDelete={() => {
                              setDeletingNote(note);
                              setMoreMenuOpen(null);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {filteredNotes.length} of {creditNotes.length} notes
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors">
              Previous
            </button>
            <button className="px-3 py-1.5 bg-primary text-white rounded text-sm">1</button>
            <button className="px-3 py-1.5 border border-border rounded text-sm hover:bg-muted transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* View Note Preview Modal */}
      {viewingNote && (
        <CreditNotePreview
          isOpen={true}
          onClose={() => setViewingNote(null)}
          lineItems={[]}
          noteNumber={viewingNote.id}
          noteDate={viewingNote.date}
          noteType={viewingNote.type}
          reason={viewingNote.reason}
          originalInvoice={viewingNote.originalInvoice}
        />
      )}

      {/* Send Note Modal */}
      {sendingNote && (
        <SendNoteModal
          note={sendingNote}
          onClose={() => setSendingNote(null)}
          onSend={(email, message) => {
            alert(`Note ${sendingNote.id} sent to ${email}`);
            setSendingNote(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingNote && (
        <DeleteConfirmationModal
          note={deletingNote}
          onClose={() => setDeletingNote(null)}
          onConfirm={() => {
            setCreditNotes(creditNotes.filter(n => n.id !== deletingNote.id));
            setDeletingNote(null);
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  active,
  onClick
}: {
  label: string;
  value: number;
  color?: 'success' | 'warning';
  active?: boolean;
  onClick?: () => void;
}) {
  const colorClasses = {
    success: 'text-success',
    warning: 'text-warning',
  };

  return (
    <button
      onClick={onClick}
      className={`bg-white border-2 rounded-lg p-6 text-left transition-all hover:shadow-md ${
        active ? 'border-accent' : 'border-border'
      }`}
    >
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-4xl font-bold ${color ? colorClasses[color] : 'text-foreground'}`}>
        {value}
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    issued: 'bg-success/10 text-success',
    draft: 'bg-muted text-muted-foreground',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${styles[status as keyof typeof styles]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function MoreMenu({
  note,
  onClose,
  onDownload,
  onSend,
  onDelete
}: {
  note: any;
  onClose: () => void;
  onDownload: () => void;
  onSend: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-8 w-48 bg-white border border-border rounded-lg shadow-lg py-1 z-10"
    >
      <button
        onClick={onDownload}
        className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        Download PDF
      </button>
      <button
        onClick={onSend}
        className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
      >
        <Send className="w-4 h-4" />
        Send via Email
      </button>
      <div className="border-t border-border my-1"></div>
      <button
        onClick={onDelete}
        className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2 text-destructive"
      >
        <Trash2 className="w-4 h-4" />
        Delete Note
      </button>
    </div>
  );
}

function SendNoteModal({
  note,
  onClose,
  onSend
}: {
  note: any;
  onClose: () => void;
  onSend: (email: string, message: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(`Please find attached ${note.type === 'credit' ? 'Credit' : 'Debit'} Note ${note.id} for your reference.`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(email, message);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Send {note.type === 'credit' ? 'Credit' : 'Debit'} Note</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Note Number
            </label>
            <input
              type="text"
              value={note.id}
              disabled
              className="w-full px-3 py-2 border border-input bg-muted rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Customer
            </label>
            <input
              type="text"
              value={note.customer}
              disabled
              className="w-full px-3 py-2 border border-input bg-muted rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Email Address <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter customer email"
              className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Message
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              <Send className="w-4 h-4" />
              Send Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmationModal({
  note,
  onClose,
  onConfirm
}: {
  note: any;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Delete {note.type === 'credit' ? 'Credit' : 'Debit'} Note</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground mb-2">
                Are you sure you want to delete <span className="font-semibold">{note.id}</span>?
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Customer: {note.customer}</p>
                <p>Amount: ₹{note.amount.toLocaleString()}</p>
                <p className="text-destructive font-medium mt-2">
                  This action cannot be undone. All data associated with this note will be permanently removed.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-destructive text-white rounded hover:bg-destructive/90 transition-colors"
          >
            Delete Note
          </button>
        </div>
      </div>
    </div>
  );
}
