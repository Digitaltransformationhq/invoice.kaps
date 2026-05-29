import { Mail, Phone, MessageCircle, Book, Video, HelpCircle, FileText, Search, ChevronDown, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function HelpSupport() {
  const [searchQuery, setSearchQuery] = useState('');

  const faqs = [
    {
      question: 'How do I create a new invoice?',
      answer: 'Navigate to "Tax Invoices" from the sidebar and click the "Create Invoice" button. Fill in customer details, add line items with HSN codes and GST rates, then save or send the invoice.',
    },
    {
      question: 'How to generate GSTR-1 report?',
      answer: 'Go to "Reports & GSTR-1" section, select the date range for your reporting period, and click "Generate GSTR-1". The report will include B2B, B2CL, and HSN summary tables ready for filing.',
    },
    {
      question: 'Can I customize invoice templates?',
      answer: 'Yes, go to Settings → Invoice Settings to customize invoice prefix, numbering, terms & conditions, and print settings including company logo and bank details.',
    },
    {
      question: 'How do I track outstanding payments?',
      answer: 'Visit the "Outstanding" section to see all pending invoices grouped by customer or invoice. You can view aging analysis and send payment reminders directly.',
    },
    {
      question: 'What is the difference between Credit Note and Debit Note?',
      answer: 'Credit Note is issued when you need to reduce the invoice amount (returns, discounts). Debit Note is issued when you need to increase the invoice amount (additional charges).',
    },
    {
      question: 'How to record a payment received?',
      answer: 'Go to "Receipts" section, click "Create Receipt", select the customer and invoice, enter payment details (amount, mode, reference number), and save.',
    },
  ];

  const resources = [
    {
      icon: Book,
      title: 'User Guide',
      description: 'Complete documentation and tutorials',
    },
    {
      icon: Video,
      title: 'Video Tutorials',
      description: 'Step-by-step video guides',
    },
    {
      icon: FileText,
      title: 'GST Compliance',
      description: 'GST filing guides and tax updates',
    },
    {
      icon: MessageCircle,
      title: 'Community Forum',
      description: 'Connect with other users',
    },
  ];

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const comingSoon = (label: string) => () => toast.info(`${label} is coming soon.`);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-200 dark:border-violet-400/25 bg-gradient-to-br from-violet-50/80 via-violet-50/40 to-card dark:from-violet-500/[0.08] dark:via-violet-500/[0.04] dark:to-card p-8 md:p-10">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-violet-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-500/15 border border-violet-200 dark:border-violet-400/25 text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-700 dark:text-violet-300">
            <Sparkles className="w-3 h-3" />
            Help Center
          </div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold text-foreground tracking-tight leading-tight mt-3">
            How can we help you today?
          </h1>
          <p className="text-[14px] text-muted-foreground mt-2 leading-relaxed">
            Search the knowledge base or reach out — most questions are answered in seconds.
          </p>

          <div className="relative mt-6 max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-500" />
            <input
              type="text"
              placeholder="Search invoices, GST, customers…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 h-12 border border-violet-300 dark:border-violet-400/30 bg-card rounded-xl text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 shadow-[0_2px_12px_-4px_rgba(139,92,246,0.25)] transition"
            />
          </div>
        </div>
      </div>

      {/* Contact Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ContactCard
          icon={Mail}
          title="Email Support"
          subtitle="Get help via email within 24 hours."
          actionLabel="support@gstinvoice.com"
          actionHref="mailto:support@gstinvoice.com"
        />
        <ContactCard
          icon={Phone}
          title="Phone Support"
          subtitle="Mon–Fri, 9 AM – 6 PM IST."
          actionLabel="+91 98765 43210"
          actionHref="tel:+919876543210"
        />
        <ContactCard
          icon={MessageCircle}
          title="Live Chat"
          subtitle="Chat with our support team in real time."
          actionLabel="Start Chat"
          onClick={comingSoon('Live chat')}
        />
      </div>

      {/* Learning Resources */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-6 w-6 rounded-full bg-violet-500 text-white flex items-center justify-center">
            <Book className="w-3.5 h-3.5" strokeWidth={2.5} />
          </div>
          <h2 className="text-[16px] font-semibold text-foreground tracking-tight">Learning Resources</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {resources.map((resource) => (
            <button
              key={resource.title}
              onClick={comingSoon(resource.title)}
              className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 text-left shadow-[0_1px_2px_rgba(139,92,246,0.06)] hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.25)] hover:border-violet-400 dark:hover:border-violet-400/55 transition-all"
            >
              <div className="w-11 h-11 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 flex items-center justify-center mb-3">
                <resource.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-foreground tracking-tight">{resource.title}</h3>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-1">{resource.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* FAQs */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-6 w-6 rounded-full bg-violet-500 text-white flex items-center justify-center">
            <HelpCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
          </div>
          <h2 className="text-[16px] font-semibold text-foreground tracking-tight">Frequently Asked Questions</h2>
        </div>
        <div className="space-y-3">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq, index) => (
              <details
                key={index}
                className="group bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden open:border-violet-400 dark:open:border-violet-400/55 open:shadow-[0_4px_16px_-6px_rgba(139,92,246,0.18)]"
              >
                <summary className="list-none cursor-pointer px-5 md:px-6 py-4 flex items-center justify-between gap-4 hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.05] transition-colors">
                  <div className="font-medium text-foreground text-[14.5px]">{faq.question}</div>
                  <ChevronDown className="w-4 h-4 text-violet-600 dark:text-violet-300 flex-shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-5 md:px-6 py-4 border-t border-violet-100 dark:border-violet-400/15 bg-violet-50/40 dark:bg-violet-500/[0.04]">
                  <p className="text-[13.5px] text-muted-foreground leading-relaxed">{faq.answer}</p>
                </div>
              </details>
            ))
          ) : (
            <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-10 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
                <Search className="w-5 h-5 text-violet-600 dark:text-violet-300" />
              </div>
              <p className="text-sm text-foreground/80">
                No FAQs found matching <span className="font-semibold">"{searchQuery}"</span>.
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-3 text-[12.5px] font-medium text-violet-600 dark:text-violet-300 hover:underline"
              >
                Clear search
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 p-8 md:p-10 text-center shadow-[0_8px_28px_-12px_rgba(139,92,246,0.6)]">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/15 mb-3">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-[20px] font-semibold text-white tracking-tight">Still need help?</h3>
          <p className="text-[13.5px] text-violet-100 mt-2 max-w-md mx-auto leading-relaxed">
            Our support team is ready to assist you with any questions about invoicing, GST filing, or your account.
          </p>
          <a
            href="mailto:support@gstinvoice.com"
            className="inline-flex items-center gap-2 mt-5 px-6 h-11 bg-white text-violet-700 rounded-lg text-[13.5px] font-semibold hover:bg-violet-50 transition-colors"
          >
            <Mail className="w-4 h-4" />
            Contact Support Team
          </a>
        </div>
      </div>
    </div>
  );
}

function ContactCard({
  icon: Icon,
  title,
  subtitle,
  actionLabel,
  actionHref,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  actionLabel: string;
  actionHref?: string;
  onClick?: () => void;
}) {
  const action = actionHref ? (
    <a
      href={actionHref}
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-violet-700 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-200 transition-colors"
    >
      {actionLabel}
    </a>
  ) : (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-violet-700 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-200 transition-colors"
    >
      {actionLabel}
    </button>
  );

  return (
    <div className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl p-5 md:p-6 shadow-[0_1px_2px_rgba(139,92,246,0.06)] hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.25)] hover:border-violet-400 dark:hover:border-violet-400/55 transition-all">
      <div className="w-11 h-11 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-semibold text-foreground tracking-tight">{title}</h3>
      <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-1 mb-4">{subtitle}</p>
      {action}
    </div>
  );
}
