import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  Building2,
  Users,
  Package,
  FileText,
  Truck,
  FileEdit,
  Receipt,
  TrendingUp,
  BarChart3,
  UserCog,
  Lock,
} from 'lucide-react';
import { GuideSection, GuideSectionCard } from './guideSection';

const SECTIONS: GuideSection[] = [
  {
    id: 'setup',
    icon: Building2,
    title: 'Set up your company first',
    summary:
      'Everything printed on an invoice comes from Settings. Filling this in once saves correcting every document later.',
    steps: [
      {
        where: 'Settings → Company',
        title: 'Company details, logo and bank account',
        body:
          'Your legal name, GSTIN, PAN, full address and contact details appear in the header of every invoice, challan and note. The bank name, account number, IFSC and branch print in the payment block, so customers can pay without asking. Upload a logo here too — it appears on documents and on the sign-in screen your auditors see.',
      },
      {
        where: 'Settings → Invoice Settings',
        title: 'Taxpayer type',
        body:
          'Choose "Regular taxpayer" if you are registered under GST normally. Choose "Composition Scheme / Unregistered User" if you are on the composition scheme or not registered at all.',
        note:
          'This changes the documents themselves. On composition, invoices become "Bills of Supply", the menu label changes to match, and the HSN-wise tax breakup is left off — a composition dealer cannot charge GST on the invoice.',
      },
      {
        where: 'Settings → Invoice Settings',
        title: 'Invoice numbering',
        body:
          'The "Invoice Defaults" switch controls the format. On, numbers carry your prefix — INV-501. Off, they are the bare number — 501. Either way they continue from "Next Invoice Number".',
        note:
          'Moving from other billing software? Set "Next Invoice Number" to the number after your last bill there — 501 if it ended at 500 — and numbering carries on from it without a gap.',
      },
      {
        where: 'Settings → Tax Settings',
        title: 'GST and supply defaults',
        body:
          'Set your default place of supply and due days. Place of supply decides whether a sale is intra-state (CGST + SGST) or inter-state (IGST), so getting the default right means most invoices need no adjustment.',
      },
    ],
  },
  {
    id: 'customers',
    icon: Users,
    title: 'Customers',
    summary: 'Add a customer once and their GSTIN, address and place of supply fill themselves in on every future document.',
    steps: [
      {
        where: 'Customers → Add Customer',
        title: 'Record who you sell to',
        body:
          'Capture the business name, GSTIN, billing address, state and contact details. The state you enter drives the CGST/SGST versus IGST decision when you invoice them, so it is worth getting right.',
      },
      {
        title: 'Registered vs unregistered',
        body:
          'Customers without a GSTIN are unregistered — B2C. The distinction carries through to your GSTR-1, where B2B and B2C supplies are reported separately, so mark them accurately rather than leaving a GSTIN blank on a business that has one.',
      },
    ],
  },
  {
    id: 'items',
    icon: Package,
    title: 'Items & Services',
    summary: 'A catalogue of what you sell, with the HSN/SAC code and GST rate attached.',
    steps: [
      {
        where: 'Items & Services → Add Item',
        title: 'Name, HSN/SAC, rate and price',
        body:
          'Each item carries its HSN code (goods) or SAC code (services), GST rate and default price. When you add the item to an invoice, all of it comes across automatically — you only change the quantity.',
      },
      {
        title: 'Why the HSN code matters',
        body:
          'The HSN-wise tax summary printed at the foot of each invoice, and the HSN section of your GSTR-1, are both built from this field. An item with no HSN code will leave gaps in your return.',
      },
    ],
  },
  {
    id: 'invoices',
    icon: FileText,
    title: 'Tax Invoices',
    summary: 'The core of the app — create, send, track payment and file.',
    steps: [
      {
        where: 'Tax Invoices → New Invoice',
        title: 'Create an invoice',
        body:
          'Pick the customer, then add line items from your catalogue. Tax is calculated as you go: CGST + SGST when the place of supply matches your state, IGST when it does not. Add PO number, vehicle number, transport mode and remarks if the customer needs them on the document.',
      },
      {
        title: 'Invoice numbers',
        body:
          'The next number is filled in for you from Settings. You can overwrite it — a manually numbered invoice is marked with an asterisk (*) in the list and is excluded from the automatic sequence, so it never disturbs your running numbering.',
        note: 'Filter the list by "Manual Invoice Number" to see every invoice that was numbered by hand.',
      },
      {
        title: 'Draft, Pending, Paid, Overdue',
        body:
          'A new invoice can be saved as a draft while you check it. Once issued it sits at Pending until payment is recorded, and turns Overdue automatically past its due date. Recording a part payment shows the outstanding balance under the amount.',
      },
      {
        title: 'Send, print and download',
        body:
          'Open any invoice to preview it exactly as it will print. From there you can download a PDF, print to A4, email it to the customer, or share it on WhatsApp — WhatsApp attaches the actual PDF where your device supports it.',
      },
      {
        title: 'Record a payment',
        body:
          'Use Record Payment from the invoice row menu to log part or full payment without leaving the list. Full payment marks the invoice Paid; a part payment leaves it Pending with the balance shown.',
      },
    ],
  },
  {
    id: 'challans',
    icon: Truck,
    title: 'Delivery Challans',
    summary: 'For goods that move before they are invoiced — job work, approval, or delivery in instalments.',
    steps: [
      {
        where: 'Delivery Challans → New Challan',
        title: 'Issue a challan',
        body:
          'Choose the purpose — job work, supply on approval, goods sent for exhibition, and so on. The purpose is printed on the document because Rule 55 requires it. Add the items, vehicle number and transport details.',
      },
      {
        title: 'When to use one instead of an invoice',
        body:
          'A challan moves goods without recording a sale. Raise the tax invoice when the sale actually happens; the challan stays as the transport record.',
      },
    ],
  },
  {
    id: 'notes',
    icon: FileEdit,
    title: 'Credit & Debit Notes',
    summary: 'Corrections to an invoice you have already issued.',
    steps: [
      {
        where: 'Credit / Debit Notes → New Note',
        title: 'Which one to raise',
        body:
          'A credit note reduces what the customer owes — returns, a discount agreed after billing, or an overcharge. A debit note increases it — an undercharge or additional charges. Choose the type at the top of the form; the numbering follows it (CN for credit, DN for debit).',
      },
      {
        title: 'Link it to the invoice',
        body:
          'Reference the original invoice so the adjustment is traceable. Both note types flow into your GSTR-1 and adjust the outstanding balance for that customer.',
      },
    ],
  },
  {
    id: 'receipts',
    icon: Receipt,
    title: 'Receipts',
    summary: 'Money actually received, matched against the invoices it settles.',
    steps: [
      {
        where: 'Receipts → Create Receipt',
        title: 'Log a payment',
        body:
          'Select the customer and the invoice being paid, then enter the amount, payment mode and reference number. The invoice status and the outstanding figures update from this.',
      },
      {
        title: 'Part payments',
        body:
          'Receipts can be for less than the invoice total. The invoice stays Pending and carries the remaining balance until receipts cover it in full.',
      },
    ],
  },
  {
    id: 'outstanding',
    icon: TrendingUp,
    title: 'Outstanding',
    summary: 'Who owes you, how much, and for how long.',
    steps: [
      {
        title: 'Chase what is unpaid',
        body:
          'Every invoice with a balance appears here, grouped by customer and aged so the oldest debts stand out. Use it as your collections list rather than scrolling the invoice register.',
      },
    ],
  },
  {
    id: 'reports',
    icon: BarChart3,
    title: 'Reports & GSTR-1',
    summary: 'Three reports are live: GSTR-1, Sales, and Tax Summary.',
    steps: [
      {
        where: 'Reports & GSTR-1 → GSTR-1 Report',
        title: 'GSTR-1',
        body:
          'Your outward supplies for a month, split into B2B and B2C, with the HSN summary and any credit or debit notes. Use it to fill your return on the GST portal.',
        note:
          'It reports what you entered. A missing GSTIN or HSN code shows up here as a gap, so it is worth reviewing before filing rather than at the deadline.',
      },
      {
        where: 'Reports & GSTR-1 → Tax Summary',
        title: 'Tax Summary',
        body: 'CGST, SGST and IGST collected over a period, with your total tax liability.',
      },
      {
        where: 'Reports & GSTR-1 → Sales Report',
        title: 'Sales Report',
        body: 'Sales over a chosen period with invoice and payment detail, for a view of the business rather than compliance.',
      },
    ],
  },
  {
    id: 'auditors',
    icon: UserCog,
    title: 'Auditors',
    summary: 'Give your CA or accountant their own restricted login instead of sharing yours.',
    steps: [
      {
        where: 'Auditor Management → Add Auditor',
        title: 'Create an auditor account',
        body:
          'Set their name, email and password, then tick the sections they may open — and for each, whether they can view, create, edit or delete. An auditor only sees what you grant; everything else is hidden from their menu entirely.',
      },
      {
        title: 'How they sign in',
        body:
          'Auditors use the "Auditor sign-in" link on the landing page with the email and password you set. If the same person audits several businesses on the platform, they pick which workspace to enter after entering their email.',
        note:
          'Auditors cannot reset their own password by email. If they forget it, you set a new one from Auditor Management.',
      },
    ],
  },
  {
    id: 'signing-in',
    icon: Lock,
    title: 'Signing in & passwords',
    summary: 'Your password is the master key; the MPIN is a shortcut on one device.',
    steps: [
      {
        title: 'MPIN quick sign-in',
        body:
          'On your own device you can set a 4-digit MPIN and sign in with that instead of typing your password. The PIN is stored encrypted in that browser only and never reaches our servers — which is why it works on one device and not another.',
      },
      {
        title: 'Forgot your MPIN',
        body:
          'Choose "Forgot MPIN?" on the sign-in screen and enter your email, password and a new PIN. Because the PIN protects your stored password, only the password can replace it.',
      },
      {
        title: 'Forgot your password',
        body:
          'Choose "Forgot password?" and we email a link that is valid for 15 minutes and works once. Open it, set a new password, then sign in — you will be asked to pick a new MPIN, since the old one was tied to the old password.',
      },
      {
        where: 'Settings → Security',
        title: 'Change a password you still know',
        body: 'Enter your current password and the new one. No email needed.',
      },
    ],
  },
];

export function UserGuide() {
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
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight">User Guide</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            How each part of the app works, in the order you will need it.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-violet-200 dark:border-violet-400/25 bg-violet-50/60 dark:bg-violet-500/[0.06] p-5">
        <h2 className="text-[14px] font-semibold text-foreground">New here? Do these four things</h2>
        <ol className="mt-3 space-y-1.5 text-[13px] text-muted-foreground leading-relaxed list-decimal list-inside">
          <li>Fill in <span className="font-medium text-foreground">Settings → Company</span>, including your GSTIN and bank details.</li>
          <li>Set your taxpayer type and invoice numbering in <span className="font-medium text-foreground">Settings → Invoice Settings</span>.</li>
          <li>Add the customers and items you bill most often.</li>
          <li>Raise your first invoice — everything else follows from it.</li>
        </ol>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <GuideSectionCard key={section.id} section={section} />
        ))}
      </div>

      <p className="text-[12.5px] text-muted-foreground text-center">
        Something not covered here?{' '}
        <a
          href="mailto:office@kapsca.in"
          className="font-semibold text-violet-600 dark:text-violet-300 hover:text-violet-700 dark:hover:text-violet-200"
        >
          Email us
        </a>{' '}
        and we will add it.
      </p>
    </div>
  );
}
