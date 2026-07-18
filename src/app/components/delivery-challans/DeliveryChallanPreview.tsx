import { X, Download, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { getGstinStateName, normalizeIndianState } from '../../../lib/gstin';
import { usePdfActions } from '../../../lib/usePdfActions';
import { CHALLAN_COPIES, challanPurposeMeta } from '../../../lib/deliveryChallans';

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
  isProvisional?: boolean;
}

interface Consignee {
  name: string;
  gstin: string;
  address: string;
  state: string;
}

interface Transport {
  mode: string;
  vehicleNumber: string;
  transporterName: string;
  lrNumber: string;
  ewayBillNumber: string;
}

interface DeliveryChallanPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  purpose: string;
  challanNumber: string;
  challanDate: string;
  lineItems: LineItem[];
  consignee: Consignee;
  invoiceNumber: string;
  placeOfSupply: string;
  isFinalConsignment: boolean;
  expectedReturnDate: string;
  reason: string;
  notes: string;
  transport: Transport;
}

export function DeliveryChallanPreview({
  isOpen,
  onClose,
  purpose,
  challanNumber,
  challanDate,
  lineItems,
  consignee,
  invoiceNumber,
  placeOfSupply,
  isFinalConsignment,
  expectedReturnDate,
  reason,
  notes,
  transport,
}: DeliveryChallanPreviewProps) {
  const { user } = useAuth();

  const [companyDetails, setCompanyDetails] = useState({
    name: user?.company_name || 'Your Company',
    gstin: user?.company_gstin || '-',
    state: getGstinStateName(user?.company_gstin) || '',
    email: user?.email || '',
    phone: '',
    address: '',
    city: '',
    pinCode: '',
    pan: '',
    logo: user?.company_logo || '',
    esignImage: '',
    stampImage: '',
  });

  const { printAreaRef, isExporting, handlePrint, handleDownloadPdf } = usePdfActions(
    () => `${challanNumber || 'challan'}.pdf`
  );

  useEffect(() => {
    if (!isOpen || !user?.company_id) return;

    const loadCompanyDetails = async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('company_name, gstin, pan, phone, email, address, city, state, pin_code, company_logo, esign_image, stamp_image')
        .eq('id', user.company_id)
        .single();

      if (!error) {
        setCompanyDetails({
          name: data?.company_name || user.company_name || 'Your Company',
          gstin: data?.gstin || user.company_gstin || '-',
          state: data?.state || getGstinStateName(data?.gstin) || getGstinStateName(user.company_gstin) || '',
          email: data?.email || user.email || '',
          phone: data?.phone || '',
          address: data?.address || '',
          city: data?.city || '',
          pinCode: data?.pin_code || '',
          pan: data?.pan || '',
          logo: data?.company_logo || user.company_logo || '',
          esignImage: data?.esign_image || '',
          stampImage: data?.stamp_image || '',
        });
      }
    };

    loadCompanyDetails();
  }, [isOpen, user?.company_id, user?.company_name, user?.company_gstin, user?.company_logo, user?.email]);

  if (!isOpen) return null;

  const meta = challanPurposeMeta(purpose);
  const showTax = meta.isSupplyToConsignee;

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Company-side
  const companyName = companyDetails.name || 'Your Company';
  const companyGstin = companyDetails.gstin || '-';
  const companyState = companyDetails.state || getGstinStateName(companyGstin) || '';
  const companyPan = companyDetails.pan || (companyGstin.length >= 12 ? companyGstin.slice(2, 12) : '');
  const companyAddressLines = [
    companyDetails.address,
    [companyDetails.city, companyState, companyDetails.pinCode].filter(Boolean).join(', '),
    companyDetails.phone ? `Phone: ${companyDetails.phone}` : '',
    companyDetails.email ? `Email: ${companyDetails.email}` : '',
  ].filter(Boolean);

  // Consignee-side
  const consigneeName = consignee?.name || 'Consignee not specified';
  const consigneeAddress = consignee?.address || '';
  const consigneeState = consignee?.state || getGstinStateName(consignee?.gstin) || '';
  const consigneeGstin = consignee?.gstin || '';

  const isInterStateSupply = Boolean(
    companyState &&
    consigneeState &&
    normalizeIndianState(companyState) !== normalizeIndianState(consigneeState),
  );

  const placeOfSupplyLabel = placeOfSupply || consigneeState || '-';

  // Totals
  const subtotal = lineItems.reduce((sum, item) => {
    const baseAmount = item.qty * item.rate;
    return sum + baseAmount - (baseAmount * item.discount / 100);
  }, 0);

  const totalTax = showTax
    ? lineItems.reduce((sum, item) => {
        const baseAmount = item.qty * item.rate;
        const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
        return sum + (afterDiscount * item.gst / 100);
      }, 0)
    : 0;

  const cgstTotal = isInterStateSupply ? 0 : totalTax / 2;
  const sgstTotal = isInterStateSupply ? 0 : totalTax / 2;
  const igstTotal = isInterStateSupply ? totalTax : 0;
  const grandTotal = subtotal + totalTax;

  const displayChallanNumber = challanNumber || 'Auto-generated on save';

  // Number to words
  const numberToWords = (num: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    if (num === 0) return 'Zero';

    const convert = (n: number): string => {
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
      if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
      if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
      return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
    };

    return 'Rupees ' + convert(Math.floor(num)) + ' Only';
  };

  const transportLines = [
    transport?.mode ? `Mode: ${transport.mode}` : '',
    transport?.vehicleNumber ? `Vehicle No.: ${transport.vehicleNumber}` : '',
    transport?.transporterName ? `Transporter: ${transport.transporterName}` : '',
    transport?.lrNumber ? `LR No.: ${transport.lrNumber}` : '',
    transport?.ewayBillNumber ? `E-Way Bill: ${transport.ewayBillNumber}` : '',
  ].filter(Boolean);

  return (
    <div className="invoice-preview-modal fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="invoice-preview-shell bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[96vh] sm:max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="invoice-preview-actions flex items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-border">
          <h2 className="hidden sm:block text-lg font-semibold text-foreground shrink-0">Delivery Challan Preview</h2>
          <h2 className="sm:hidden text-sm font-semibold text-foreground shrink-0">Preview</h2>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            <button
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 border border-border rounded hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Download PDF</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 border border-border rounded hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Print"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Print</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded transition-colors" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Challan Content — one .invoice-print-page per copy (Rule 55(3) triplicate) */}
        <div ref={printAreaRef} className="invoice-print-area flex-1 overflow-y-auto p-2 sm:p-4 md:p-6 space-y-6">
          {CHALLAN_COPIES.map((copyLabel) => (
            <div
              key={copyLabel}
              className="invoice-print-page bg-white border-2 border-foreground mx-auto max-w-[210mm]"
              style={{ fontFamily: 'Arial, sans-serif' }}
            >
              {/* Header */}
              <div className="text-right px-4 pt-2 text-xs">
                <div className="font-semibold">{copyLabel}</div>
              </div>

              <div className="text-center py-2 border-b-2 border-foreground bg-primary/5">
                <h1 className="text-xl font-bold text-primary">DELIVERY CHALLAN</h1>
                <div className="text-[11px] font-semibold uppercase tracking-wide mt-0.5">
                  {meta.label} · {meta.rule}
                </div>
              </div>

              {/* Company & Challan Details */}
              <div className="grid grid-cols-2 border-b-2 border-foreground">
                <div className="p-4 border-r-2 border-foreground">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 bg-primary/10 border border-border rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {companyDetails.logo ? (
                        <img src={companyDetails.logo} alt="Company logo" className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">LOGO</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase opacity-70">Consigner</div>
                      <h2 className="font-bold text-sm mb-1 uppercase">{companyName}</h2>
                      <div className="text-xs leading-relaxed">
                        {companyAddressLines.map((line, idx) => (
                          <div key={idx}>{line}</div>
                        ))}
                        {companyGstin && companyGstin !== '-' && (
                          <div className="font-semibold mt-1">GSTIN: {companyGstin}</div>
                        )}
                        {companyPan && <div>PAN: {companyPan}</div>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <table className="w-full text-xs">
                    <tbody>
                      <tr>
                        <td className="py-1 font-semibold w-1/2">CHALLAN NO.</td>
                        <td className="py-1">{displayChallanNumber}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-semibold">DATED</td>
                        <td className="py-1">{formatDate(challanDate)}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-semibold">PURPOSE</td>
                        <td className="py-1">{meta.label}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-semibold">PLACE OF SUPPLY</td>
                        <td className="py-1">{placeOfSupplyLabel}</td>
                      </tr>
                      {showTax && (
                        <tr>
                          <td className="py-1 font-semibold">SUPPLY TYPE</td>
                          <td className="py-1">{isInterStateSupply ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}</td>
                        </tr>
                      )}
                      {meta.tracksReturn && expectedReturnDate && (
                        <tr>
                          <td className="py-1 font-semibold">{(meta.returnLabel || 'RETURN BY').toUpperCase()}</td>
                          <td className="py-1">{formatDate(expectedReturnDate)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Reference invoice — prominent for lot_supply */}
              {purpose === 'lot_supply' && (
                <div className="p-3 border-b-2 border-foreground bg-primary/5 text-xs flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <span className="font-semibold">AGAINST INVOICE:</span>{' '}
                    <span className="font-bold">{invoiceNumber || 'N/A'}</span>
                  </div>
                  {isFinalConsignment && (
                    <div className="font-semibold text-[11px]">
                      FINAL CONSIGNMENT — original invoice enclosed (Rule 55(5)).
                    </div>
                  )}
                </div>
              )}

              {/* Reason — other_than_supply */}
              {purpose === 'other_than_supply' && reason && (
                <div className="p-4 border-b-2 border-foreground bg-muted/20">
                  <div className="text-xs font-semibold mb-1">REASON FOR MOVEMENT:</div>
                  <div className="text-xs whitespace-pre-line">{reason}</div>
                </div>
              )}

              {/* Consignee & Transport */}
              <div className="grid grid-cols-2 border-b-2 border-foreground">
                <div className="p-4 border-r-2 border-foreground">
                  <div className="text-xs font-semibold mb-2">CONSIGNEE (SHIP TO)</div>
                  <div className="text-xs leading-relaxed">
                    <div className="font-bold uppercase">{consigneeName}</div>
                    {consigneeAddress && <div>{consigneeAddress}</div>}
                    {consigneeState && <div className="mt-1">State: {consigneeState}</div>}
                    {/* Rule 55(2)(iii): GSTIN/UIN "if registered". Print
                      * "Unregistered" rather than a blank so an inspecting
                      * officer sees the status was recorded, not omitted. */}
                    <div className="font-semibold">
                      GSTIN/UIN: {consigneeGstin || 'Unregistered'}
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xs font-semibold mb-2">TRANSPORT</div>
                  <div className="text-xs leading-relaxed">
                    {transportLines.length > 0 ? (
                      transportLines.map((line, idx) => <div key={idx}>{line}</div>)
                    ) : (
                      <div className="italic text-muted-foreground">Transport details not provided.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <table className="print-grid w-full text-xs border-b-2 border-foreground">
                <thead>
                  <tr className="border-b-2 border-foreground bg-muted/30">
                    <th className="p-2 text-left border-r border-foreground w-8">Sr.</th>
                    <th className="p-2 text-left border-r border-foreground">Description of Goods</th>
                    <th className="p-2 text-left border-r border-foreground w-20">HSN/SAC</th>
                    <th className="p-2 text-right border-r border-foreground w-16">Qty</th>
                    <th className="p-2 text-left border-r border-foreground w-12">Unit</th>
                    <th className="p-2 text-right border-r border-foreground w-20">Rate</th>
                    <th className={`p-2 text-right w-24 ${showTax ? 'border-r border-foreground' : ''}`}>Taxable</th>
                    {showTax && (
                      <>
                        {isInterStateSupply ? (
                          <th className="p-2 text-right border-r border-foreground w-24">IGST</th>
                        ) : (
                          <>
                            <th className="p-2 text-right border-r border-foreground w-20">CGST</th>
                            <th className="p-2 text-right border-r border-foreground w-20">SGST</th>
                          </>
                        )}
                        <th className="p-2 text-right w-24">Amount</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length === 0 ? (
                    <tr>
                      <td colSpan={showTax ? (isInterStateSupply ? 9 : 10) : 7} className="p-4 text-center text-muted-foreground">
                        No line items.
                      </td>
                    </tr>
                  ) : lineItems.map((item, index) => {
                    const baseAmount = item.qty * item.rate;
                    const afterDiscount = baseAmount - (baseAmount * item.discount / 100);
                    const taxOnLine = showTax ? afterDiscount * item.gst / 100 : 0;
                    const cgst = isInterStateSupply ? 0 : taxOnLine / 2;
                    const sgst = isInterStateSupply ? 0 : taxOnLine / 2;
                    const igst = isInterStateSupply ? taxOnLine : 0;

                    return (
                      <tr key={item.id} className="border-b border-foreground">
                        <td className="p-2 border-r border-foreground">{index + 1}</td>
                        <td className="p-2 border-r border-foreground">
                          <div className="font-semibold">{item.item}</div>
                          {item.description && <div className="text-[10px] opacity-80">{item.description}</div>}
                        </td>
                        <td className="p-2 border-r border-foreground">{item.hsn}</td>
                        <td className="p-2 text-right border-r border-foreground tabular-nums">
                          {item.qty.toFixed(2)}
                          {item.isProvisional && <div className="text-[9px] opacity-70">(provisional)</div>}
                        </td>
                        <td className="p-2 border-r border-foreground">{item.unit}</td>
                        <td className="p-2 text-right border-r border-foreground tabular-nums">{formatCurrency(item.rate)}</td>
                        <td className={`p-2 text-right tabular-nums ${showTax ? 'border-r border-foreground' : ''}`}>{formatCurrency(afterDiscount)}</td>
                        {showTax && (
                          <>
                            {isInterStateSupply ? (
                              <td className="p-2 text-right border-r border-foreground tabular-nums">
                                <div>{formatCurrency(igst)}</div>
                                <div className="text-[10px] opacity-70">{item.gst}%</div>
                              </td>
                            ) : (
                              <>
                                <td className="p-2 text-right border-r border-foreground tabular-nums">
                                  <div>{formatCurrency(cgst)}</div>
                                  <div className="text-[10px] opacity-70">{(item.gst / 2).toFixed(1)}%</div>
                                </td>
                                <td className="p-2 text-right border-r border-foreground tabular-nums">
                                  <div>{formatCurrency(sgst)}</div>
                                  <div className="text-[10px] opacity-70">{(item.gst / 2).toFixed(1)}%</div>
                                </td>
                              </>
                            )}
                            <td className="p-2 text-right tabular-nums">{formatCurrency(afterDiscount + taxOnLine)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totals */}
              <div className="border-b-2 border-foreground">
                <table className="print-rows w-full text-xs">
                  <tbody>
                    <tr className="border-b border-foreground">
                      <td className="p-2 font-semibold">Total Taxable Value</td>
                      <td className="p-2 text-right font-semibold tabular-nums">₹{formatCurrency(subtotal)}</td>
                    </tr>
                    {showTax ? (isInterStateSupply ? (
                      <tr className="border-b-2 border-foreground">
                        <td className="p-2">Add: IGST</td>
                        <td className="p-2 text-right tabular-nums">₹{formatCurrency(igstTotal)}</td>
                      </tr>
                    ) : (
                      <>
                        <tr className="border-b border-foreground">
                          <td className="p-2">Add: CGST</td>
                          <td className="p-2 text-right tabular-nums">₹{formatCurrency(cgstTotal)}</td>
                        </tr>
                        <tr className="border-b-2 border-foreground">
                          <td className="p-2">Add: SGST</td>
                          <td className="p-2 text-right tabular-nums">₹{formatCurrency(sgstTotal)}</td>
                        </tr>
                      </>
                    )) : (
                      <tr className="border-b-2 border-foreground">
                        <td className="p-2 font-semibold text-[11px]" colSpan={2}>
                          Not a supply — no tax charged ({meta.rule}).
                        </td>
                      </tr>
                    )}
                    <tr className="border-b-2 border-foreground bg-primary/10">
                      <td className="p-2 font-bold">{showTax ? 'TOTAL VALUE' : 'TOTAL TAXABLE VALUE'}</td>
                      <td className="p-2 text-right font-bold tabular-nums text-primary">₹{formatCurrency(grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Amount in Words — only when the movement carries tax */}
              {showTax && (
                <div className="border-b-2 border-foreground p-3 text-xs">
                  <span className="font-semibold">Amount in Words:</span> {numberToWords(grandTotal)}
                  <div className="text-right mt-2">E. &amp; O.E.</div>
                </div>
              )}

              {/* Notes & Declaration */}
              <div className="grid grid-cols-2">
                <div className="p-4 border-r-2 border-foreground text-xs">
                  <div className="font-semibold mb-2">NOTES</div>
                  <div className="leading-relaxed">
                    {notes ? (
                      <div className="whitespace-pre-line">{notes}</div>
                    ) : (
                      <div className="italic text-muted-foreground">—</div>
                    )}
                    <div className="mt-3 italic text-[10px]">Consigner GSTIN: {companyGstin}</div>
                    {consigneeGstin && <div className="italic text-[10px]">Consignee GSTIN: {consigneeGstin}</div>}
                  </div>
                </div>
                <div className="p-4 text-xs">
                  <div className="font-semibold mb-2">DECLARATION</div>
                  <p className="leading-relaxed mb-6">
                    We declare that the particulars given above are true and correct, and that the goods
                    described are being moved under this delivery challan (Rule 55, CGST Rules 2017).
                  </p>
                  <div className="mt-6 text-right">
                    <div className="mb-2 uppercase">For {companyName}</div>
                    <div className="h-12 flex items-end justify-end gap-2">
                      {companyDetails.esignImage && (
                        <img src={companyDetails.esignImage} alt="Signature" className="h-12 object-contain" />
                      )}
                      {companyDetails.stampImage && (
                        <img src={companyDetails.stampImage} alt="Stamp" className="h-12 object-contain" />
                      )}
                    </div>
                    {/* Rule 55(2)(ix): signature of the consignor or their
                      * authorised representative. */}
                    <div className="border-t border-foreground inline-block px-6 pt-1">Consignor / Authorised Signatory</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
