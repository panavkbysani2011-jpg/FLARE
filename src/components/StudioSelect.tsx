import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface StudioSelectOption<T extends string = string> {
  value: T;
  label: string;
  subtitle?: string;
  group?: string;
  disabled?: boolean;
}

export interface StudioSelectProps<T extends string = string> {
  id?: string;
  ariaLabel?: string;
  value: T;
  onChange: (value: T) => void;
  options: StudioSelectOption<T>[];
  height?: 'h-6' | 'h-9' | 'h-10';
  placement?: 'bottom' | 'top' | 'auto-flip';
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  placeholder?: string;
}

export function StudioSelect<T extends string = string>({
  id,
  ariaLabel,
  value,
  onChange,
  options,
  height = 'h-10',
  placement = 'auto-flip',
  disabled = false,
  className = '',
  buttonClassName = '',
  popoverClassName = '',
  placeholder = 'Select option...',
}: StudioSelectProps<T>) {
  const generatedId = useId();
  const selectId = id || `studio-select-${generatedId}`;
  const listboxId = `${selectId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [effectivePlacement, setEffectivePlacement] = useState<'top' | 'bottom'>('bottom');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Calculate placement on open
  const updatePlacement = useCallback(() => {
    if (placement === 'top') {
      setEffectivePlacement('top');
      return;
    }
    if (placement === 'bottom') {
      setEffectivePlacement('bottom');
      return;
    }

    // auto-flip
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const estimatedHeight = Math.min(options.length * 40 + 16, 260);

      if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
        setEffectivePlacement('top');
      } else {
        setEffectivePlacement('bottom');
      }
    } else {
      setEffectivePlacement('bottom');
    }
  }, [placement, options.length]);

  const openMenu = () => {
    if (disabled) return;
    updatePlacement();
    setIsOpen(true);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleSelect = (val: T) => {
    onChange(val);
    closeMenu();
    buttonRef.current?.focus();
  };

  // Outside click & Escape dismissal
  useEffect(() => {
    if (!isOpen) return;

    const onOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onOutsideClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onOutsideClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [isOpen, highlightedIndex]);

  // Navigate options skipping disabled ones
  const moveHighlight = (direction: 1 | -1) => {
    if (options.length === 0) return;
    let nextIdx = highlightedIndex + direction;
    while (nextIdx >= 0 && nextIdx < options.length) {
      if (!options[nextIdx].disabled) {
        setHighlightedIndex(nextIdx);
        return;
      }
      nextIdx += direction;
    }
  };

  const handleButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      const firstEnabled = options.findIndex((o) => !o.disabled);
      if (firstEnabled >= 0) setHighlightedIndex(firstEnabled);
    } else if (e.key === 'End') {
      e.preventDefault();
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) {
          setHighlightedIndex(i);
          break;
        }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        const target = options[highlightedIndex];
        if (!target.disabled) {
          handleSelect(target.value);
        }
      }
    } else if (e.key === 'Tab') {
      closeMenu();
    }
  };

  const heightClasses =
    height === 'h-6'
      ? 'h-6 px-2 text-[10.5px] rounded-md font-semibold'
      : height === 'h-9'
      ? 'h-9 px-3 text-xs rounded-lg font-medium'
      : 'h-10 px-3 text-xs rounded-lg font-medium';

  const iconSizeClass = height === 'h-6' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <div ref={containerRef} className={`relative inline-block ${isOpen ? 'z-40' : 'z-10'} ${className}`}>
      <button
        ref={buttonRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleButtonKeyDown}
        className={`w-full font-sans border flex items-center justify-between gap-2 shadow-2xs transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-1 text-left ${heightClasses} ${
          disabled
            ? 'opacity-50 cursor-not-allowed pointer-events-none'
            : isOpen
            ? 'bg-zinc-100 border-zinc-400 text-[#18181B] ring-1 ring-zinc-400/30 dark:bg-[#09090B] dark:border-zinc-400 dark:text-[#FAFAFA] dark:ring-zinc-500/30'
            : 'bg-zinc-50 border-[#E4E4E7] text-[#18181B] hover:bg-zinc-100 hover:border-zinc-300 dark:bg-[#09090B] dark:border-[#27272A] dark:text-[#FAFAFA] dark:hover:bg-zinc-800/90 dark:hover:text-zinc-50 dark:hover:border-zinc-500'
        } ${buttonClassName}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`${iconSizeClass} text-zinc-400 transition-transform duration-150 shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          className={`absolute left-0 z-50 w-full min-w-[140px] max-h-60 overflow-y-auto p-1 rounded-xl border shadow-2xl backdrop-blur-xl bg-white/95 border-[#E4E4E7] text-[#18181B] dark:bg-[#121216]/95 dark:border-[#27272A] dark:text-[#FAFAFA] ${
            effectivePlacement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${popoverClassName}`}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIndex;
            const showGroupHeader =
              opt.group && (idx === 0 || options[idx - 1].group !== opt.group);

            return (
              <React.Fragment key={`${opt.value}-${idx}`}>
                {showGroupHeader && (
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 select-none">
                    {opt.group}
                  </div>
                )}
                <button
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  id={`${listboxId}-opt-${idx}`}
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => !opt.disabled && setHighlightedIndex(idx)}
                  className={`w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left rounded-md transition-colors duration-150 ${
                    height === 'h-6' ? 'text-[10.5px] py-1' : 'text-xs'
                  } ${
                    opt.disabled
                      ? 'opacity-40 cursor-not-allowed text-zinc-400 dark:text-zinc-600'
                      : isSelected
                      ? 'bg-[#18181B] text-[#FFFFFF] font-semibold dark:bg-[#FAFAFA] dark:text-[#09090B] dark:font-semibold cursor-pointer'
                      : isHighlighted
                      ? 'bg-zinc-100 text-[#18181B] dark:bg-zinc-800/80 dark:text-[#FAFAFA] cursor-pointer'
                      : 'text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800/90 dark:hover:text-zinc-50 cursor-pointer'
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.subtitle && (
                      <span
                        className={`text-[11px] font-sans truncate ${
                          isSelected
                            ? 'text-zinc-300 dark:text-zinc-600'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {opt.subtitle}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Check className={`${iconSizeClass} shrink-0`} />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
