import { Mail, Phone, MessageCircle, Book, Video, HelpCircle, FileText, Search } from 'lucide-react';
import { useState } from 'react';

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
      answer: 'Yes, go to Settings > Invoice Settings to customize invoice prefix, numbering, terms & conditions, and print settings including company logo and bank details.',
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
      color: 'bg-primary/10 text-primary',
    },
    {
      icon: Video,
      title: 'Video Tutorials',
      description: 'Step-by-step video guides',
      color: 'bg-accent/10 text-accent',
    },
    {
      icon: FileText,
      title: 'GST Compliance',
      description: 'GST filing guides and tax updates',
      color: 'bg-success/10 text-success',
    },
    {
      icon: MessageCircle,
      title: 'Community Forum',
      description: 'Connect with other users',
      color: 'bg-warning/10 text-warning',
    },
  ];

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl font-semibold text-foreground">Help & Support</h1>
        <p className="text-muted-foreground mt-2">
          Find answers to your questions or get in touch with our support team
        </p>
      </div>

      {/* Search */}
      <div className="max-w-2xl mx-auto">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search for help..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 border border-input bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
          />
        </div>
      </div>

      {/* Contact Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
            <Mail className="w-6 h-6 text-accent" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">Email Support</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Get help via email within 24 hours
          </p>
          <a
            href="mailto:support@gstinvoice.com"
            className="text-sm text-accent hover:text-accent/90 font-medium"
          >
            support@gstinvoice.com
          </a>
        </div>

        <div className="bg-white border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center mb-4">
            <Phone className="w-6 h-6 text-success" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">Phone Support</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Mon-Fri, 9 AM - 6 PM IST
          </p>
          <a href="tel:+919876543210" className="text-sm text-accent hover:text-accent/90 font-medium">
            +91 98765 43210
          </a>
        </div>

        <div className="bg-white border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
            <MessageCircle className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">Live Chat</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Chat with our support team
          </p>
          <button className="text-sm text-accent hover:text-accent/90 font-medium">
            Start Chat
          </button>
        </div>
      </div>

      {/* Resources */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Learning Resources</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {resources.map((resource) => (
            <button
              key={resource.title}
              className="bg-white border border-border rounded-lg p-6 text-left hover:shadow-md transition-all hover:border-accent"
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${resource.color}`}>
                <resource.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{resource.title}</h3>
              <p className="text-sm text-muted-foreground">{resource.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* FAQs */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-foreground">Frequently Asked Questions</h2>
        </div>
        <div className="space-y-3">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq, index) => (
              <details
                key={index}
                className="bg-white border border-border rounded-lg overflow-hidden group"
              >
                <summary className="px-6 py-4 cursor-pointer hover:bg-muted transition-colors font-medium text-foreground flex items-center justify-between">
                  {faq.question}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">
                    ▼
                  </span>
                </summary>
                <div className="px-6 py-4 border-t border-border bg-muted/30">
                  <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                </div>
              </details>
            ))
          ) : (
            <div className="bg-white border border-border rounded-lg p-8 text-center">
              <p className="text-muted-foreground">No FAQs found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-8 text-center">
        <h3 className="text-lg font-semibold text-foreground mb-2">Still need help?</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Our support team is ready to assist you with any questions
        </p>
        <button className="px-6 py-2.5 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
          Contact Support Team
        </button>
      </div>
    </div>
  );
}
