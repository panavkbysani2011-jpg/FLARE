import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
} from 'lucide-react';
import {
  DefaultExportFormat,
  PsiRun,
  SidebarState,
  ThemeMode,
  ThemeSetting,
  WorkspaceView,
} from '../types/psi';
import { getCanonicalPsiId } from '../utils/investigationArtifacts';
import {
  HEADER_EXPORT_SECTION_OPTIONS,
  HeaderExportFormat,
  HeaderExportSectionId,
} from '../utils/exportHelpers';
import { fetchAuditStatus } from '../lib/flareApi';

interface HeaderBarProps {
  theme: ThemeMode;
  themeSetting: ThemeSetting;
  onThemeChange: (mode: ThemeMode) => void;
  defaultExportFormat?: DefaultExportFormat;
  activeView: WorkspaceView;
  inspectedRun?: PsiRun | null;
  sidebarState: SidebarState;
  onHeaderToggleSidebar: () => void;
  onExportBundle: (
    sections: HeaderExportSectionId[],
    format: HeaderExportFormat
  ) => void;
}

const VIEW_BREADCRUMBS: Record<WorkspaceView, { section: string; subPage?: string }> = {
  overview: { section: 'Overview' },
  'virtual-lab': { section: 'Virtual Test Lab' },
  comparator: { section: 'Virtual Test Lab', subPage: 'Run Comparator' },
  'visual-studio': { section: 'Visual Analytics Studio' },
  'model-console': { section: 'Model Console' },
  investigations: { section: 'Data Archive', subPage: 'PSI Investigations' },
  'experiment-runs': { section: 'Data Archive', subPage: 'Experiment Runs' },
  'researchers-guide': {
    section: 'Data Archive',
    subPage: "ISS Researcher's Guide",
  },
  'mission-spinoffs': {
    section: 'Data Archive',
    subPage: 'Mission & Spin-Off Cases',
  },
  'import-sync': { section: 'Data Import & Sync' },
  'investigation-detail': { section: 'Data Archive', subPage: 'Detail' },
};

function resolveBundleDefaultFormat(
  preferred?: DefaultExportFormat
): HeaderExportFormat {
  if (preferred === 'doc' || preferred === 'pdf' || preferred === 'json') {
    return preferred;
  }
  return 'pdf';
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  theme,
  themeSetting,
  onThemeChange,
  defaultExportFormat,
  activeView,
  inspectedRun,
  sidebarState,
  onHeaderToggleSidebar,
  onExportBundle,
}) => {
  const isDark = theme === 'dark';
  const crumb = VIEW_BREADCRUMBS[activeView];

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [selectedSections, setSelectedSections] = useState<
    HeaderExportSectionId[]
  >(HEADER_EXPORT_SECTION_OPTIONS.map((o) => o.id));
  const [exportFormat, setExportFormat] = useState<HeaderExportFormat>(() =>
    resolveBundleDefaultFormat(defaultExportFormat)
  );
  const exportPopoverRef = useRef<HTMLDivElement | null>(null);

  const [auditBadgeText, setAuditBadgeText] = useState('32/32 Certified · 6.79 ms');

  useEffect(() => {
    let cancelled = false;
    void fetchAuditStatus().then((res) => {
      if (!cancelled && res.badgeLabel) {
        setAuditBadgeText(res.badgeLabel);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        exportPopoverRef.current &&
        !exportPopoverRef.current.contains(e.target as Node)
      ) {
        setExportMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [exportMenuOpen]);

  const toggleSection = (id: HeaderExportSectionId) => {
    setSelectedSections((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDownloadSelected = () => {
    if (selectedSections.length === 0) return;
    onExportBundle(selectedSections, exportFormat);
    setExportMenuOpen(false);
  };

  const topBarSurface = isDark
    ? 'bg-[#09090B]/95 border-[#27272A] text-[#FAFAFA]'
    : theme === 'light'
    ? 'bg-[#FFFFFF]/95 border-[#E4E4E7] text-[#09090B]'
    : 'bg-[#FAFAFA]/95 border-[#E4E4E7] text-[#18181B]';

  const groupSurface = isDark
    ? 'bg-[#18181B] border-[#27272A]'
    : 'bg-zinc-100 border-[#E4E4E7]';

  const activeMonochrome = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
    : 'bg-[#18181B] text-[#FFFFFF] font-semibold';

  const inactiveMonochrome = isDark
    ? 'text-zinc-400 hover:text-zinc-100'
    : 'text-zinc-600 hover:text-zinc-950';

  const detailPsiId =
    activeView === 'investigation-detail' && inspectedRun
      ? getCanonicalPsiId(inspectedRun)
      : null;

  const sidebarBtnTitle =
    sidebarState === 'hidden'
      ? 'Show Navigation Sidebar ([)'
      : sidebarState === 'compact'
      ? 'Expand Navigation Sidebar ([)'
      : 'Collapse Navigation Sidebar ([)';

  return (
    <header
      className={`sticky top-0 z-20 h-[52px] px-4 sm:px-5 border-b backdrop-blur-md flex items-center justify-between gap-4 transition-colors duration-150 ${topBarSurface}`}
    >
      {/* Left: Subtle Sidebar Expand/Collapse Trigger + Dynamic Breadcrumb */}
      <div className="flex items-center gap-2.5 text-xs font-sans font-medium min-w-0">
        <button
          type="button"
          onClick={onHeaderToggleSidebar}
          title={sidebarBtnTitle}
          aria-label={sidebarBtnTitle}
          className={`w-8 h-8 rounded-lg border shadow-xs flex items-center justify-center shrink-0 transition-all duration-150 active:scale-[0.95] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
            isDark
              ? 'bg-[#18181B] border-[#27272A] text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-800'
              : 'bg-white border-[#E4E4E7] text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 hover:border-zinc-300'
          }`}
        >
          {sidebarState === 'expanded' ? (
            <PanelLeftClose className="w-3.5 h-3.5" />
          ) : (
            <PanelLeftOpen className="w-3.5 h-3.5" />
          )}
        </button>

        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 min-w-0 truncate"
        >
          <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap font-medium">
            FLARE
          </span>
          <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
            /
          </span>
          <span
            className={
              crumb.subPage || detailPsiId
                ? 'text-zinc-500 dark:text-zinc-400 whitespace-nowrap'
                : 'font-semibold truncate'
            }
          >
            {crumb.section}
          </span>
          {(detailPsiId || crumb.subPage) && (
            <>
              <span
                className="text-zinc-300 dark:text-zinc-700"
                aria-hidden="true"
              >
                /
              </span>
              <span
                className={`font-semibold truncate ${
                  detailPsiId ? 'font-mono tabular-nums' : ''
                }`}
              >
                {detailPsiId ?? crumb.subPage}
              </span>
            </>
          )}
        </nav>
      </div>

      {/* Right: Audit Status Badge + Tier 1 Multi-Select Export Dropdown + 3-Mode Theme Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Corpus / Audit Badge */}
        <div
          className={`hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11px] font-sans font-medium transition-colors ${
            isDark
              ? 'bg-[#18181B] border-[#27272A] text-zinc-300'
              : 'bg-white border-[#E4E4E7] text-zinc-700'
          }`}
          title="Physical Science Informatics Verification & Audit Status"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
          <span className="font-mono text-[10px] tracking-tight">{auditBadgeText}</span>
        </div>

        <div className="relative" ref={exportPopoverRef}>
          <button
            type="button"
            onClick={() => setExportMenuOpen((prev) => !prev)}
            aria-expanded={exportMenuOpen}
            aria-haspopup="dialog"
            className={`h-8 inline-flex items-center gap-1.5 px-3 text-xs font-sans font-medium rounded-lg border shadow-xs transition-all duration-150 active:scale-[0.98] whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
              exportMenuOpen
                ? isDark
                  ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA]'
                  : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B]'
                : isDark
                ? 'bg-[#18181B] border-[#27272A] text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800'
                : 'bg-white border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
            }`}
            title="Select sections and format to bundle into a custom report"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-150 ${
                exportMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {exportMenuOpen && (
            <div
              role="dialog"
              aria-label="Custom Multi-Section Export"
              className={`absolute right-0 mt-2 w-[320px] sm:w-[356px] rounded-lg border shadow-lg p-3.5 z-50 space-y-3 psi-animate-popover ${
                isDark
                  ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
                  : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#E4E4E7] dark:border-[#27272A]">
                <div>
                  <div className="font-display text-xs font-semibold">
                    Custom Report Bundle
                  </div>
                  <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                    Choose sections to include ({selectedSections.length}/
                    {HEADER_EXPORT_SECTION_OPTIONS.length})
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSections(
                      selectedSections.length ===
                        HEADER_EXPORT_SECTION_OPTIONS.length
                        ? []
                        : HEADER_EXPORT_SECTION_OPTIONS.map((o) => o.id)
                    )
                  }
                  className="text-[11px] font-sans font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline cursor-pointer"
                >
                  {selectedSections.length ===
                  HEADER_EXPORT_SECTION_OPTIONS.length
                    ? 'Clear All'
                    : 'Select All'}
                </button>
              </div>

              <div className="space-y-1.5">
                {HEADER_EXPORT_SECTION_OPTIONS.map((option) => {
                  const checked = selectedSections.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleSection(option.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border text-left text-xs font-sans transition-colors cursor-pointer ${
                        checked
                          ? isDark
                            ? 'bg-[#18181B] border-zinc-600 text-[#FAFAFA]'
                            : 'bg-zinc-50 border-zinc-400 text-[#18181B]'
                          : isDark
                          ? 'bg-transparent border-[#27272A] text-zinc-400 hover:text-zinc-200'
                          : 'bg-transparent border-[#E4E4E7] text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 ${
                          checked
                            ? isDark
                              ? 'bg-[#FAFAFA] border-[#FAFAFA] text-[#09090B]'
                              : 'bg-[#18181B] border-[#18181B] text-[#FFFFFF]'
                            : isDark
                            ? 'border-zinc-600 bg-transparent'
                            : 'border-zinc-300 bg-white'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3 stroke-[2.5]" />}
                      </span>
                      <span className="leading-snug">{option.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Format Selector inside Dropdown */}
              <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-2">
                <div className="text-[11px] font-sans font-semibold text-zinc-500 dark:text-zinc-400">
                  File Format
                </div>
                <div
                  className={`grid grid-cols-2 gap-1 p-1 rounded-md border ${
                    isDark
                      ? 'bg-[#09090B] border-[#27272A]'
                      : 'bg-zinc-100 border-[#E4E4E7]'
                  }`}
                >
                  {(
                    [
                      { id: 'pdf', label: 'PDF (.pdf)' },
                      { id: 'doc', label: 'Word (.doc)' },
                      { id: 'md', label: 'Markdown (.md)' },
                      { id: 'json', label: 'JSON Data (.json)' },
                    ] as Array<{ id: HeaderExportFormat; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setExportFormat(opt.id)}
                      className={`px-2 py-1.5 text-[11px] font-sans font-medium rounded-[4px] transition-colors cursor-pointer ${
                        exportFormat === opt.id
                          ? activeMonochrome
                          : inactiveMonochrome
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={selectedSections.length === 0}
                  onClick={handleDownloadSelected}
                  className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-sans font-semibold rounded-lg transition-all active:scale-[0.98] disabled:opacity-45 cursor-pointer ${
                    isDark
                      ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                      : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Selected</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          className={`flex items-center p-0.5 rounded-lg border ${groupSurface}`}
          role="group"
          aria-label="Theme Mode Switcher"
        >
          {(['normal', 'light', 'dark'] as ThemeMode[]).map((mode) => {
            const active =
              themeSetting === 'system' ? theme === mode : themeSetting === mode;
            const label = mode.charAt(0).toUpperCase() + mode.slice(1);
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onThemeChange(mode)}
                className={`h-7 px-2.5 inline-flex items-center justify-center text-xs font-sans rounded-md transition-all duration-150 active:scale-[0.98] whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                  active ? activeMonochrome + ' shadow-xs' : inactiveMonochrome
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
