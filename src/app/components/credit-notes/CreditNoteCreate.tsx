import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Plus, Trash2, Save, Send, Eye, Calculator } from 'lucide-react';
import { CreditNotePreview } from './CreditNotePreview';

interface LineItem {
  id: string;
  item: string;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  discount: number;
  gst: number;
  amount: number;
}

export function CreditNoteCreate() {
  const [showPreview, setShowPreview] = useState(false);
  const [noteType, setNoteType] = useState<'credit' | 'debit'>('credit');
  const [noteNumber, setNoteNumber] = useState('CN-2026-004');
  const [noteDate, setNoteDate] = useState('2026-05-12');
  const [originalInvoice, setOriginalInvoice] = useState('');
  const [reason, setReason] = useState('');

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: '1',
      item: '',
      description: '',
      hsn: '',
      qty: 1,
      unit: 'Nos',
      rate: 0,
      discount: 0,
      gst: 18,
      amount: 0
    }
  ]);

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: Date.now().toString(),
        item: '',
        description: '',
        hsn: '',
        qty: 1,
        unit: 'Nos',
        rate: 0,
        discount: 0,
        gst: 18,
        amount: 0
      }
    ]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(lineItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        const baseAmount = updated.qty * updated.rate;
        const afterDiscount = baseAmount - (baseAmount * updated.discount / 100);
        const gstAmount = afterDiscount * updated.gst / 100;
        updated.amount = afterDiscount + gstAmount;
        return updated;
      }
      return item;
    }));
  };

  const subtotal = lineItems.reduce((sum, item) => {
    return sum + (item.qty * item.rate) - ((item.qty * item.rate) * item.discount / 100);
  }, 0);

  const totalGST = lineItems.reduce((sum, item) => {
    const baseAmount = item.qty * item.rate;
    const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
    return sum + (afterDiscount * item.gst / 100);
  }, 0);

  const totalAmount = subtotal + totalGST;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/app/credit-notes"
            className="p-2 hover:bg-muted rounded transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Create {noteType === 'credit' ? 'Credit' : 'Debit'} Note</h1>
            <p className="text-sm text-muted-foreground mt-1">Add note details and line items</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
            <Save className="w-4 h-4" />
            Save Draft
          </button>
          <button
            onClick={() => setShowPreview(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
          >
            <Send className="w-4 h-4" />
            Create & Send
          </button>
        </div>
      </div>

      <div className="space-y-6">
          {/* Note Type Selection */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Note Type</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setNoteType('credit');
                  setNoteNumber('CN-2026-004');
                }}
                className={`px-6 py-4 border-2 rounded-lg transition-colors ${
                  noteType === 'credit'
                    ? 'border-success bg-success/5 text-success'
                    : 'border-border hover:border-success/50'
                }`}
              >
                <div className="font-semibold mb-1">Credit Note</div>
                <div className="text-xs opacity-80">For returns, refunds, discounts</div>
              </button>
              <button
                onClick={() => {
                  setNoteType('debit');
                  setNoteNumber('DN-2026-003');
                }}
                className={`px-6 py-4 border-2 rounded-lg transition-colors ${
                  noteType === 'debit'
                    ? 'border-warning bg-warning/5 text-warning'
                    : 'border-border hover:border-warning/50'
                }`}
              >
                <div className="font-semibold mb-1">Debit Note</div>
                <div className="text-xs opacity-80">For additional charges, adjustments</div>
              </button>
            </div>
          </div>

          {/* Note Details Card */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Note Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Note Number
                </label>
                <input
                  type="text"
                  value={noteNumber}
                  onChange={(e) => setNoteNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Note Date
                </label>
                <input
                  type="date"
                  value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Original Invoice Number
                </label>
                <select
                  value={originalInvoice}
                  onChange={(e) => setOriginalInvoice(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select original invoice...</option>
                  <option value="INV-2026-156">INV-2026-156 - TechCorp Solutions</option>
                  <option value="INV-2026-155">INV-2026-155 - Retail Innovations</option>
                  <option value="INV-2026-154">INV-2026-154 - Manufacturing Ltd</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Reason for {noteType === 'credit' ? 'Credit' : 'Debit'} Note
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={noteType === 'credit'
                    ? 'e.g., Product return, Service quality issue, Post-sale discount'
                    : 'e.g., Additional charges, Price adjustment, Short delivery'}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>
          </div>

          {/* Customer Details Card */}
          <div className="bg-white border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-4">Customer Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Select Customer
                </label>
                <select className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring">
                  <option>Select a customer...</option>
                  <option>TechCorp Solutions - 27AAAAA0000A1Z5</option>
                  <option>Retail Innovations - 29BBBBB1111B2Y4</option>
                  <option>Manufacturing Ltd - 24CCCCC2222C3X3</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Billing Address
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter billing address"
                    className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Shipping Address
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" id="same-address" className="w-4 h-4" />
                    <label htmlFor="same-address" className="text-sm text-muted-foreground">
                      Same as billing
                    </label>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Enter shipping address"
                    className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

      {/* Line Items Table - Full Width */}
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <div className="px-8 py-5 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Line Items</h3>
          <button
            onClick={addLineItem}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/20">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground w-12">#</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground min-w-[200px]">Item</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground min-w-[250px]">Description</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground w-40">HSN/SAC</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground w-32">Qty</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground w-36">Unit</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground w-36">Rate</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground w-28">Disc%</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-foreground w-28">GST%</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-foreground w-36">Amount</th>
                <th className="px-6 py-4 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => (
                <tr key={item.id} className="group border-b border-border last:border-b-0">
                  <td className="px-6 py-5 text-sm text-muted-foreground text-center align-top">{index + 1}</td>
                  <td className="px-6 py-5 align-top">
                    <input
                      type="text"
                      value={item.item}
                      onChange={(e) => updateLineItem(item.id, 'item', e.target.value)}
                      placeholder="Product/Service"
                      className="w-full min-w-[180px] px-4 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                  </td>
                  <td className="px-6 py-5 align-top">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                      placeholder="Brief description"
                      className="w-full min-w-[220px] px-4 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                  </td>
                  <td className="px-6 py-5 align-top">
                    <input
                      type="text"
                      value={item.hsn}
                      onChange={(e) => updateLineItem(item.id, 'hsn', e.target.value)}
                      placeholder="998314"
                      className="w-full min-w-[120px] px-4 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                  </td>
                  <td className="px-6 py-5 align-top">
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) => updateLineItem(item.id, 'qty', parseFloat(e.target.value) || 0)}
                      className="w-full min-w-[80px] px-4 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                  </td>
                  <td className="px-6 py-5 align-top">
                    <select
                      value={item.unit}
                      onChange={(e) => updateLineItem(item.id, 'unit', e.target.value)}
                      className="w-full min-w-[100px] px-4 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    >
                      <option>Nos</option>
                      <option>Hrs</option>
                      <option>Days</option>
                      <option>Kgs</option>
                      <option>Pcs</option>
                    </select>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateLineItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full min-w-[100px] px-4 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                  </td>
                  <td className="px-6 py-5 align-top">
                    <input
                      type="number"
                      value={item.discount}
                      onChange={(e) => updateLineItem(item.id, 'discount', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full min-w-[80px] px-4 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    />
                  </td>
                  <td className="px-6 py-5 align-top">
                    <select
                      value={item.gst}
                      onChange={(e) => updateLineItem(item.id, 'gst', parseFloat(e.target.value))}
                      className="w-full min-w-[80px] px-4 py-2.5 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </td>
                  <td className="px-6 py-5 text-sm font-medium text-foreground text-right align-top">
                    ₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-5 align-top">
                    {lineItems.length > 1 && (
                      <button
                        onClick={() => removeLineItem(item.id)}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Section - Full Width */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-border rounded-lg p-6">
          <label className="block text-sm font-medium text-foreground mb-3">
            Additional Notes
          </label>
          <textarea
            rows={4}
            placeholder="Add any additional notes or remarks..."
            className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        <div className="bg-white border border-border rounded-lg p-6">
          <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium text-foreground">
                  ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total GST</span>
                <span className="font-medium text-foreground">
                  ₹{totalGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-foreground">Total Amount</span>
                  <span className={`text-2xl font-semibold ${noteType === 'credit' ? 'text-success' : 'text-warning'}`}>
                    {noteType === 'credit' ? '-' : '+'}₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {noteType === 'credit' ? 'Customer Credit' : 'Additional Charge'}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <div className={`px-4 py-3 rounded ${noteType === 'credit' ? 'bg-success/10' : 'bg-warning/10'}`}>
                <div className={`text-sm font-medium ${noteType === 'credit' ? 'text-success' : 'text-warning'} mb-1`}>
                  {noteType === 'credit' ? 'Credit Note Impact' : 'Debit Note Impact'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {noteType === 'credit'
                    ? 'This amount will be credited to customer account'
                    : 'This amount will be added to customer outstanding'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <CreditNotePreview
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        lineItems={lineItems}
        noteNumber={noteNumber}
        noteDate={noteDate}
        noteType={noteType}
        reason={reason}
        originalInvoice={originalInvoice}
      />
    </div>
  );
}
