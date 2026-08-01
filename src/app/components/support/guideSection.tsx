import { useState } from 'react';
import { Book, ChevronDown } from 'lucide-react';

export interface GuideStep {
  /** Where in the app this happens, e.g. "Tax Invoices → New Invoice". */
  where?: string;
  title: string;
  body: string;
  /** Things that are easy to get wrong, shown as a callout. */
  note?: string;
}

export interface GuideSection {
  id: string;
  icon: typeof Book;
  title: string;
  summary: string;
  steps: GuideStep[];
}

/**
 * One collapsible topic, shared by the User Guide and the GST Compliance page so
 * the two read as the same document. Collapsed by default — a wall of text is
 * what stops guides being read.
 */
export function GuideSectionCard({ section, noteLabel = 'Worth knowing' }: { section: GuideSection; noteLabel?: string }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  return (
    <div
      id={section.id}
      className="bg-card border border-violet-200 dark:border-violet-400/25 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(139,92,246,0.06)] scroll-mt-6"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3.5 p-5 text-left hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.05] transition-colors"
      >
        <div className="w-10 h-10 shrink-0 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground tracking-tight">{section.title}</h3>
          <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-1">{section.summary}</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 shrink-0 mt-1 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-5 border-t border-violet-100 dark:border-violet-400/15">
          {section.steps.map((step, index) => (
            <div key={step.title} className="pt-4 first:pt-3">
              <div className="flex items-baseline gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[11px] font-semibold flex items-center justify-center tabular-nums">
                  {index + 1}
                </span>
                <h4 className="text-[13.5px] font-semibold text-foreground">{step.title}</h4>
              </div>

              {step.where && (
                <p className="ml-7.5 mt-1.5 inline-block px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium text-muted-foreground">
                  {step.where}
                </p>
              )}

              <p className="ml-7.5 mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{step.body}</p>

              {step.note && (
                <p className="ml-7.5 mt-2.5 px-3 py-2.5 rounded-lg bg-violet-50/70 dark:bg-violet-500/[0.07] border border-violet-200 dark:border-violet-400/25 text-[12.5px] text-slate-700 dark:text-white/70 leading-relaxed">
                  <span className="font-semibold text-violet-700 dark:text-violet-300">{noteLabel}: </span>
                  {step.note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
