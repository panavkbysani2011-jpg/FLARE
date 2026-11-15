import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Download } from 'lucide-react';
import {
  DefaultExportFormat,
  ExportFileFormat,
  ThemeMode,
} from '../types/psi';
import { getExportFormatLabel } from '../utils/exportGenerators';

interface ExportDropdownProps<F extends ExportFileFormat> {
  theme: ThemeMode;
  label: string;
  formats: F[];
  defaultFormat?: DefaultExportFormat;
  disabled?: boolean;
  title?: string;
  onSelectFormat: (format: F) => void;
}

export function ExportDropdown<F extends ExportFileFormat>({
  theme,
  label,
  formats,
  defaultFormat,
  disabled = false,
  title,
  onSelectFormat,
}: ExportDropdownProps<F>) {
  const isDark = theme === 'dark';
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={title ?? `${label} format options`}
        className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-sans font-medium rounded-lg border shadow-2xs transition-all duration-150 active:scale-[0.98] focus-visible:outline-none disabled:opacity-45 whitespace-nowrap cursor-pointer ${
          open
            ? isDark
              ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA]'
              : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B]'
            : isDark
            ? 'bg-[#09090B] border-[#27272A] text-zinc-200 hover:bg-zinc-800 hover:border-zinc-500'
            : 'bg-zinc-50 border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>{label}</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`${label} formats`}
          className={`absolute right-0 mt-1.5 w-[212px] rounded-lg border shadow-lg p-1.5 z-50 space-y-0.5 ${
            isDark
              ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
              : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]'
          }`}
        >
          <div className="px-2 py-1 text-[10px] font-sans font-semibold uppercase tracking-wider text-zinc-500">
            Choose File Format
          </div>
          {formats.map((fmt) => {
            const isPreferred = fmt === defaultFormat;
            return (
              <button
                key={fmt}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelectFormat(fmt);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs font-sans text-left transition-colors cursor-pointer ${
                  isDark
                    ? 'hover:bg-[#18181B] text-zinc-200'
                    : 'hover:bg-zinc-100 text-zinc-800'
                }`}
              >
                <span className="truncate font-medium">
                  {getExportFormatLabel(fmt)}
                </span>
                {isPreferred && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-sans text-zinc-500 dark:text-zinc-400 shrink-0">
                    <Check className="w-3 h-3" />
                    <span>Default</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
