import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ThemeMode } from '../types/psi';

interface CollapsibleCardProps {
  theme: ThemeMode;
  title: string;
  subtitle?: string;
  summaryLine?: React.ReactNode;
  rightActions?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (nextOpen: boolean) => void;
  className?: string;
  bodyClassName?: string;
  compactHeader?: boolean;
  children: React.ReactNode;
}

export const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  theme,
  title,
  subtitle,
  summaryLine,
  rightActions,
  defaultOpen = true,
  open: controlledOpen,
  onToggle,
  className = '',
  bodyClassName = '',
  compactHeader = false,
  children,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const isDark = theme === 'dark';
  const surfaceClass = isDark
    ? 'bg-[#18181B] border-[#27272A] text-[#FAFAFA]'
    : 'bg-white border-[#E4E4E7] text-[#18181B]';

  const handleToggle = () => {
    const next = !isOpen;
    if (controlledOpen === undefined) {
      setInternalOpen(next);
    }
    onToggle?.(next);
  };

  return (
    <section
      className={`rounded-lg border transition-colors duration-150 ${surfaceClass} ${className}`}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-3 ${
          compactHeader ? 'px-4 py-2.5' : 'px-5 py-3.5'
        } ${
          isOpen
            ? `border-b ${isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'}`
            : ''
        }`}
      >
        <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="font-display text-sm sm:text-base font-semibold tracking-[-0.015em] truncate">
            {title}
          </h2>
          {isOpen && subtitle && (
            <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400 truncate">
              {subtitle}
            </span>
          )}
          {!isOpen && summaryLine && (
            <div className="text-xs font-sans text-zinc-500 dark:text-zinc-400 truncate">
              {summaryLine}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {rightActions}
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={isOpen}
            className={`inline-flex items-center gap-1 h-8 px-3 text-[11px] font-sans font-medium rounded-lg border shadow-2xs transition-all duration-150 active:scale-[0.98] focus-visible:outline-none cursor-pointer ${
              isDark
                ? 'bg-[#09090B] border-[#27272A] text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white'
                : 'bg-zinc-50 border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 hover:text-zinc-950'
            }`}
            title={isOpen ? `Collapse ${title}` : `Expand ${title}`}
          >
            {isOpen ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Hide</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Show</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className={bodyClassName || 'p-5'}>{children}</div>
      )}
    </section>
  );
};
