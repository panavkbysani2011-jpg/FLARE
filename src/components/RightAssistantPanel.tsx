import React, { useState } from 'react';
import {
  X,
  Send,
  BookOpen,
  ArrowUpRight,
  MessageSquareText,
} from 'lucide-react';
import {
  AssistantMessage,
  SimulationResponse,
  ThemeMode,
  VizMode,
} from '../types/psi';

interface RightAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  simulation: SimulationResponse;
  messages: AssistantMessage[];
  isThinking: boolean;
  onSendPrompt: (promptText: string) => void;
  onCitationClick: (psiCode: string) => void;
  onSwitchVizMode: (mode: VizMode) => void;
}

const QUICK_PROMPTS = [
  'Explain current lunar cabin risk step-by-step',
  'Compare Apollo 1, Mir 0g fire & firefighter SCBA lessons',
  'What does ISS Researcher Guide say on cool flames (PSI-69)?',
  'Switch to Material Safety Comparison',
];

export const RightAssistantPanel: React.FC<RightAssistantPanelProps> = ({
  isOpen,
  onClose,
  theme,
  simulation,
  messages,
  isThinking,
  onSendPrompt,
  onCitationClick,
  onSwitchVizMode,
}) => {
  const [inputPrompt, setInputPrompt] = useState('');

  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const drawerSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputPrompt.trim();
    if (!trimmed) return;
    onSendPrompt(trimmed);
    setInputPrompt('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="AI Research Assistant Drawer"
    >
      <aside
        className={`w-full max-w-[380px] h-full border-l p-5 flex flex-col justify-between shadow-2xl ${drawerSurface}`}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-zinc-200 dark:border-[#27272A]">
          <div className="flex items-center gap-2">
            <MessageSquareText className="w-4 h-4" />
            <div>
              <h2 className="font-display text-sm font-bold">
                PSI Research Assistant
              </h2>
              <p className="font-mono text-[10px] text-zinc-500">
                Grounded Archive Citations · {simulation.flameSpread_mms.toFixed(2)} mm/s
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Research Assistant"
            className="p-1.5 rounded-[4px] text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Prompts */}
        <div className="mt-3.5 space-y-1.5">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Quick Analysis Prompts:
          </div>
          <div className="flex flex-col gap-1.5">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onSendPrompt(q)}
                className={`w-full text-left px-3 py-2 text-xs rounded-[4px] border transition-colors duration-150 flex items-center justify-between gap-2 cursor-pointer ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A] text-zinc-200 hover:border-zinc-500'
                    : 'bg-zinc-50 border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
                }`}
              >
                <span className="truncate">{q}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Conversation Feed */}
        <div className="my-3.5 flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3.5 rounded-[5px] border text-xs ${
                msg.role === 'user'
                  ? isDark
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-100'
                    : 'bg-zinc-100 border-zinc-300 text-zinc-900'
                  : isDark
                  ? 'bg-[#09090B]/90 border-[#27272A] text-zinc-200'
                  : 'bg-zinc-50/80 border-[#E4E4E7] text-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1.5">
                <span className="font-semibold uppercase">
                  {msg.role === 'user' ? 'Engineer Query' : 'PSI Synthesis'}
                </span>
                <span>{msg.timestamp}</span>
              </div>

              {msg.text && <p className="leading-relaxed">{msg.text}</p>}

              {msg.steps && msg.steps.length > 0 && (
                <ol className="space-y-2 list-decimal list-inside leading-relaxed">
                  {msg.steps.map((step, i) => (
                    <li key={i} className="text-zinc-700 dark:text-zinc-200">
                      {step}
                    </li>
                  ))}
                </ol>
              )}

              {msg.citations && msg.citations.length > 0 && (
                <div
                  className={`mt-3 pt-2.5 border-t flex flex-wrap items-center gap-1.5 ${
                    isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 mr-1">
                    <BookOpen className="w-3 h-3" />
                    <span>Citations:</span>
                  </span>
                  {msg.citations.map((cite) => (
                    <button
                      key={cite}
                      type="button"
                      onClick={() => onCitationClick(cite)}
                      title={`Inspect ${cite} in Data Archive`}
                      className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded-[3px] border transition-colors cursor-pointer ${
                        isDark
                          ? 'border-[#27272A] bg-zinc-900 text-zinc-200 hover:bg-[#FAFAFA] hover:text-[#09090B]'
                          : 'border-[#E4E4E7] bg-white text-zinc-800 hover:bg-[#18181B] hover:text-white'
                      }`}
                    >
                      {cite}
                    </button>
                  ))}
                </div>
              )}

              {msg.suggestedVizMode && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => onSwitchVizMode(msg.suggestedVizMode!)}
                    className="text-[11px] font-mono font-semibold underline cursor-pointer"
                  >
                    Active Chart Linked →
                  </button>
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="p-2.5 text-xs font-mono text-zinc-400">
              Evaluating boundary-layer correlations...
            </div>
          )}
        </div>

        {/* Bottom Question Input */}
        <form
          onSubmit={handleSubmit}
          className={`pt-3 border-t flex items-center gap-2 ${
            isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
          }`}
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Ask about O2 limits, cool flames, or materials..."
            aria-label="Ask PSI Research Assistant"
            className={`flex-1 px-3 py-2 text-xs rounded-[4px] border focus:outline-none ${
              isDark
                ? 'bg-[#09090B] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500'
                : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500'
            }`}
          />
          <button
            type="submit"
            aria-label="Send question to PSI Research Assistant"
            className={`px-3 py-2 rounded-[4px] transition-colors cursor-pointer shrink-0 ${
              isDark
                ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </aside>
    </div>
  );
};
