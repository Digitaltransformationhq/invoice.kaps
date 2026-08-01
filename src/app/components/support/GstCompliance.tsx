import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  ClipboardCheck,
  FileSpreadsheet,
  CalendarClock,
  FileText,
  Truck,
  FileEdit,
  MapPin,
  Layers,
  ExternalLink,
  TriangleAlert,
} from 'lucide-react';
import { GuideSection, GuideSectionCard } from './guideSection';

/**
 * Compliance reference.
 *
 * Deliberately avoids stating rates, turnover thresholds and due dates as fact:
 * all three are changed by notification, sometimes mid-year, and a stale figure
 * printed inside a billing app is worse than no figure — someone files late on
 * the strength of it. Structural rules (what a tax invoice must carry, what a
 * credit note is for) are stable and stated plainly; anything dated points at
 * the portal instead.
 */
const SECTIONS: GuideSection[] = [
  {
    id: 'before-filing',
    icon: ClipboardCheck,
    title: 'Before you file: check your data',
    summary: 'Almost every filing problem starts as a gap in the records, not in the return. These are the gaps worth catching first.',
    steps: [
      {
        where: 'Customers',
        title: 'GSTIN on every registered customer',
        body:
          'A sale to a registered business is B2B and is reported invoice by invoice. A sale to anyone else is B2C and is reported in summary. The app decides which from whether the customer has a GSTIN, so a business left without one is reported in the wrong place.',
      },
      {
        where: 'Items & Services',
        title: 'HSN or SAC code on every item',
        body:
          'The HSN summary in your return, and the HSN block printed at the foot of each invoice, are both built from this field. An item saved without a code leaves a hole in both.',
      },
      {
        where: 'Tax Invoices',
        title: 'No gaps in the invoice numbers',
        body:
          'Invoice numbering must be a continuous series for the financial year. Manually numbered invoices are flagged with an asterisk in the list — filter by "Manual Invoice Number" to review them, since those are where breaks in the series usually come from.',
      },
      {
        where: 'Credit / Debit Notes',
        title: 'Adjustments entered as notes, not edits',
        body:
          'If an issued invoice was wrong, the correction belongs in a credit or debit note that references it. Quietly editing the original leaves your books disagreeing with what the customer already holds and with what you have already reported.',
      },
    ],
  },
  {
    id: 'gstr1',
    icon: FileSpreadsheet,
    title: 'GSTR-1 — your outward supplies',
    summary: 'The return that reports what you sold. Everything in it comes from the invoices and notes you have entered.',
    steps: [
      {
        where: 'Reports & GSTR-1 → GSTR-1 Report',
        title: 'What the report gives you',
        body:
          'Pick a period and the report groups your sales the way the return expects: B2B invoice by invoice, B2C in summary, credit and debit notes separately, and an HSN-wise summary of the whole period.',
      },
      {
        title: 'How to use it',
        body:
          'Read it alongside the return on the GST portal and enter the figures table by table. Treat it as your working papers rather than a filing tool — this app prepares the numbers, it does not submit them.',
        note:
          'The report can only reflect what you entered. Review it early in the month rather than on the due date, so a missing GSTIN or HSN code is still fixable.',
      },
      {
        title: 'Why your buyers care',
        body:
          'What you report here is what your B2B customers see against their own GSTIN, and it governs the input tax credit they can claim. Filing late or wrong is felt by them, not only by you.',
      },
    ],
  },
  {
    id: 'other-returns',
    icon: CalendarClock,
    title: 'The other returns, and when things are due',
    summary: 'GSTR-1 is one of several. This app prepares the outward-supply side only.',
    steps: [
      {
        title: 'GSTR-3B',
        body:
          'A summary return where tax is actually paid — output tax on your sales, less input tax credit on your purchases. Because it depends on purchase records this app does not hold, prepare it from your books; the Tax Summary report gives you the output side.',
      },
      {
        title: 'GSTR-9 and GSTR-9C',
        body:
          'The annual return, and the reconciliation statement that accompanies it above a turnover limit. Both are consolidations of the year — your CA will normally prepare these.',
      },
      {
        title: 'Monthly or quarterly',
        body:
          'Small taxpayers may opt into quarterly returns with monthly tax payment (QRMP) instead of filing monthly. Which one you are on changes both your due dates and your filing rhythm.',
        note:
          'Due dates, turnover limits and the QRMP eligibility threshold are all set by notification and do change. Confirm the current ones on the GST portal or with your CA rather than relying on a figure remembered from last year.',
      },
    ],
  },
  {
    id: 'invoice-rules',
    icon: FileText,
    title: 'What a tax invoice must carry',
    summary: 'Rule 46 sets the particulars. The invoice this app produces covers them, provided your Settings are filled in.',
    steps: [
      {
        title: 'The required particulars',
        body:
          'Your name, address and GSTIN; a consecutive invoice number and the date; the buyer\'s name, address and GSTIN where registered; HSN or SAC codes; description, quantity and value; taxable value after discount; the rate and amount of each tax; the place of supply; and a signature or digital signature.',
        note:
          'Most of these come from Settings → Company and your customer and item records. An incomplete company profile produces an incomplete invoice, and neither you nor your customer will notice until it matters.',
      },
      {
        where: 'Settings → Company',
        title: 'Reverse charge and other flags',
        body:
          'Where a supply attracts reverse charge, the invoice has to say so — the field is on the invoice form. Export and SEZ supplies carry their own endorsement requirements; check with your CA if you make them.',
      },
      {
        title: 'Keep what you issue',
        body:
          'Records and the documents behind them must be preserved for a period set by the Act, counted from the annual return due date. Download the PDFs rather than relying on any single system.',
      },
    ],
  },
  {
    id: 'place-of-supply',
    icon: MapPin,
    title: 'Place of supply: CGST + SGST or IGST',
    summary: 'The single field that decides which taxes appear on the invoice.',
    steps: [
      {
        title: 'How the split works',
        body:
          'When the place of supply is in your own state, the tax splits into CGST and SGST. When it is in another state, one IGST charge applies instead. The app makes this decision from the place of supply on the invoice, defaulting from the customer\'s state.',
      },
      {
        title: 'Getting it wrong is awkward to undo',
        body:
          'Charging CGST and SGST where IGST was due — or the reverse — means the tax went to the wrong government. It is corrected through a note and a refund claim, not by editing the invoice. Check the state before issuing rather than after.',
        note:
          'For services the place of supply is not always the customer\'s address — immovable property, transport, events and several other categories have their own rules.',
      },
    ],
  },
  {
    id: 'notes',
    icon: FileEdit,
    title: 'Credit and debit notes',
    summary: 'Section 34 — the only clean way to change an invoice you have already issued.',
    steps: [
      {
        title: 'Which way round',
        body:
          'A credit note reduces the value already charged: goods returned, a deficiency, a discount agreed afterwards, or an overcharge. A debit note increases it, typically an undercharge.',
      },
      {
        title: 'Reference the original',
        body:
          'Link the note to the invoice it corrects. Both appear as their own tables in GSTR-1, and the link is what lets anyone reading your records — or your customer\'s — tie the two together.',
      },
      {
        title: 'There is a time limit',
        body:
          'A credit note reducing your tax liability can only be reported up to a cut-off tied to the following financial year. After that the note can still be issued commercially, but the tax adjustment is gone.',
        note: 'The exact cut-off is set by the Act and has been amended before — confirm it for the year in question.',
      },
    ],
  },
  {
    id: 'challans',
    icon: Truck,
    title: 'Delivery challans',
    summary: 'Rule 55 — moving goods when no invoice can be raised yet.',
    steps: [
      {
        title: 'When a challan replaces an invoice',
        body:
          'Goods sent for job work, supplied on approval, moved in knocked-down condition, or transported before the supply is known — all move on a delivery challan rather than a tax invoice.',
      },
      {
        title: 'State the purpose',
        body:
          'The challan must say why the goods are moving; the app asks for the purpose and prints it. Raise the tax invoice separately when the sale actually happens.',
      },
      {
        title: 'E-way bills',
        body:
          'Movement above a value threshold generally needs an e-way bill generated on the e-way bill portal, whether the goods travel on an invoice or a challan. This app does not generate them.',
        note: 'Thresholds vary by state for movement within a state. Check the rule that applies where you are shipping.',
      },
    ],
  },
  {
    id: 'composition',
    icon: Layers,
    title: 'Composition scheme and unregistered sellers',
    summary: 'A different document, and a different set of obligations.',
    steps: [
      {
        where: 'Settings → Invoice Settings',
        title: 'Set your taxpayer type',
        body:
          'Choosing "Composition Scheme / Unregistered User" changes what the app produces: documents become Bills of Supply rather than tax invoices, the menu label changes to match, and the HSN tax breakup is left off.',
      },
      {
        title: 'Why no tax on the document',
        body:
          'A composition dealer pays tax out of turnover instead of collecting it from customers, so no GST is charged on the document and the buyer gets no input tax credit from it. Issuing a tax invoice by mistake creates a credit your customer is not entitled to.',
      },
      {
        title: 'Different returns',
        body:
          'Composition taxpayers file their own quarterly statement and annual return rather than the regular monthly cycle. Rates, eligibility and turnover limits differ by the kind of business and are worth confirming with your CA.',
      },
    ],
  },
];

const LINKS = [
  { label: 'GST Portal — returns and payments', href: 'https://www.gst.gov.in/' },
  { label: 'E-Way Bill Portal', href: 'https://ewaybillgst.gov.in/' },
  { label: 'E-Invoice Portal', href: 'https://einvoice.gst.gov.in/' },
  { label: 'CBIC — notifications and circulars', href: 'https://www.cbic.gov.in/' },
];

export function GstCompliance() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <div>
        <button
          onClick={() => navigate('/app/help')}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-violet-600 dark:text-violet-300 hover:text-violet-700 dark:hover:text-violet-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Help &amp; Support
        </button>

        <div className="mt-4">
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight">GST Compliance</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            What the rules expect of your invoices and returns, and where this app fits.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-400/25 bg-amber-50 dark:bg-amber-500/[0.07] p-5 flex gap-3.5">
        <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-300" />
        <div>
          <h2 className="text-[13.5px] font-semibold text-amber-900 dark:text-amber-200">
            General guidance, not tax advice
          </h2>
          <p className="text-[12.5px] text-amber-800 dark:text-amber-200/85 leading-relaxed mt-1.5">
            Rates, turnover thresholds and due dates are changed by notification, sometimes
            mid-year. This page deliberately does not quote them — a stale figure inside a
            billing app is worse than none, because someone files on the strength of it.
            Confirm anything dated on the GST portal or with your CA. Your filings remain
            your responsibility.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <GuideSectionCard key={section.id} section={section} noteLabel="Check this" />
        ))}
      </div>

      <div>
        <h2 className="text-[14px] font-semibold text-foreground mb-3">Official sources</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-card border border-violet-200 dark:border-violet-400/25 hover:border-violet-400 dark:hover:border-violet-400/55 transition-colors"
            >
              <span className="text-[13px] font-medium text-foreground">{link.label}</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      </div>

      <p className="text-[12.5px] text-muted-foreground text-center">
        Looking for how the app itself works?{' '}
        <button
          onClick={() => navigate('/app/help/user-guide')}
          className="font-semibold text-violet-600 dark:text-violet-300 hover:text-violet-700 dark:hover:text-violet-200"
        >
          Read the User Guide
        </button>
      </p>
    </div>
  );
}
