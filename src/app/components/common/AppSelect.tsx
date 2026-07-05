import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus } from 'lucide-react';

export type AppSelectOption = { value: string; label: string; disabled?: boolean };

interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<AppSelectOption | string>;
  placeholder?: string;
  disabled?: boolean;
  /** Classes for the trigger button (sizing / border / bg). */
  className?: string;
  /** Optional "+ …" action pinned to the bottom of the menu. */
  onAddNew?: () => void;
  addLabel?: string;
  ariaLabel?: string;
}

function normalize(options: Array<AppSelectOption | string>): AppSelectOption[] {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

/**
 * A styled single-select dropdown that renders the same violet popover design
 * as the invoice item combobox — so every dropdown in the app looks uniform.
 * Drop-in replacement for a native <select value onChange> with <option>s.
 */
export function AppSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  className = '',
  onAddNew,
  addLabel = 'Add new',
  ariaLabel,
}: AppSelectProps) {
  const opts = normalize(options);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [rect, setRect] = useState<{
    top: number;
    bottom: number;
    left: number;
    width: number;
    placement: 'below' | 'above';
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = opts.find((o) => o.value === value);

  const updateRect = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const gap = 4;
    const DESIRED = 240; // matches the old max-h-60
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    // Flip up only when there isn't enough room below AND there's more above.
    const openAbove = spaceBelow < Math.min(DESIRED, 180) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(DESIRED, openAbove ? spaceAbove : spaceBelow));
    setRect({
      top: r.bottom + gap,
      bottom: window.innerHeight - r.top + gap,
      left: r.left,
      width: r.width,
      placement: openAbove ? 'above' : 'below',
      maxHeight,
    });
  };

  const openMenu = () => {
    if (disabled) return;
    updateRect();
    setHighlight(opts.findIndex((o) => o.value === value));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const reposition = () => updateRect();
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', onDocDown);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('mousedown', onDocDown);
    };
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, opts.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter' && open && highlight >= 0 && opts[highlight]) {
      e.preventDefault();
      choose(opts[highlight].value);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        className={`inline-flex items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      >
        <span className={`truncate ${selected ? '' : 'text-muted-foreground'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-300" />
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            maxHeight: rect.maxHeight,
            zIndex: 70,
            ...(rect.placement === 'above' ? { bottom: rect.bottom } : { top: rect.top }),
          }}
          className="flex flex-col overflow-hidden rounded-lg border border-violet-200 dark:border-violet-400/30 bg-white dark:bg-[#0d0d2a] shadow-xl"
        >
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {opts.length === 0 && !onAddNew && (
              <div className="px-3 py-2 text-sm text-muted-foreground">No options</div>
            )}
            {opts.map((o, index) => (
              <button
                key={o.value}
                type="button"
                disabled={o.disabled}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (!o.disabled) choose(o.value);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={`block w-full text-left px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
                  o.value === value ? 'font-semibold text-violet-700 dark:text-violet-300' : 'text-foreground'
                } ${index === highlight ? 'bg-violet-50 dark:bg-violet-500/10' : 'hover:bg-violet-50 dark:hover:bg-violet-500/10'}`}
              >
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
          {onAddNew && (
            <div className="shrink-0 border-t border-violet-100 dark:border-violet-400/15">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  onAddNew();
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10"
              >
                <Plus className="w-4 h-4 shrink-0" />
                {addLabel}
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
