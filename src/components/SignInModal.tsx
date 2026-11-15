import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Flame,
  Lock,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { SavedUserAccountWorkspace } from '../types/psi';
import {
  findSavedAccountByFullName,
  generateResearcherIdFromName,
} from '../services/accountSession';

interface SignInModalProps {
  isOpen: boolean;
  contextLabel?: string;
  onClose: () => void;
  onConfirmNameSignIn: (fullName: string) => void;
  onContinueAsGuest: () => void;
}

export const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  contextLabel,
  onClose,
  onConfirmNameSignIn,
  onContinueAsGuest,
}) => {
  const [fullNameInput, setFullNameInput] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorText(null);
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  const trimmedName = fullNameInput.trim().replace(/\s+/g, ' ');
  const previewResearcherId = useMemo(
    () =>
      trimmedName.length > 0
        ? generateResearcherIdFromName(trimmedName)
        : 'RES-XX-0000',
    [trimmedName]
  );

  const returningWorkspace: SavedUserAccountWorkspace | null = useMemo(() => {
    if (trimmedName.length < 2) return null;
    return findSavedAccountByFullName(trimmedName);
  }, [trimmedName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmedName.length < 2) {
      setErrorText('Please enter your full name (at least 2 characters).');
      return;
    }
    onConfirmNameSignIn(trimmedName);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-[#27272A] bg-[#09090B] text-[#FAFAFA] shadow-2xl overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-5 py-4 border-b border-[#27272A] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[#18181B] border border-[#27272A] flex items-center justify-center shrink-0">
              <Flame className="w-3.5 h-3.5 text-[#FAFAFA]" />
            </div>
            <div>
              <h2
                id="signin-modal-title"
                className="font-display text-sm font-semibold tracking-tight text-white"
              >
                Researcher Sign In
              </h2>
              <p className="text-[11px] font-sans text-zinc-400">
                {contextLabel
                  ? `Sign in to continue to ${contextLabel}`
                  : 'Save your chats, preferences, and model corrections locally'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="w-7 h-7 rounded-lg border border-[#27272A] bg-[#121215] text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="researcher-full-name-input"
              className="block text-xs font-sans font-medium text-zinc-200"
            >
              Full Name
            </label>
            <input
              id="researcher-full-name-input"
              type="text"
              autoFocus
              value={fullNameInput}
              onChange={(e) => {
                setFullNameInput(e.target.value);
                if (errorText) setErrorText(null);
              }}
              placeholder="Enter your full name"
              className="w-full px-3 py-2.5 rounded-lg border border-[#27272A] bg-[#121215] text-sm font-sans text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400"
            />
            {errorText && (
              <p className="text-[11px] font-sans text-[#EF4444]">
                {errorText}
              </p>
            )}
          </div>

          {/* Deterministic Locked Read-Only Researcher ID Preview */}
          <div className="p-3 rounded-lg border border-[#27272A] bg-[#121215] flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-sans font-medium text-zinc-400">
                Locked Researcher ID
              </div>
              <div className="text-[10px] font-sans text-zinc-500">
                Automatically assigned from your full name
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#27272A] bg-[#09090B]">
              <Lock className="w-3 h-3 text-zinc-400 shrink-0" />
              <input
                type="text"
                readOnly
                tabIndex={-1}
                aria-label="Generated Researcher ID"
                value={
                  returningWorkspace?.researcherId ?? previewResearcherId
                }
                className="w-[102px] bg-transparent font-mono text-xs font-semibold text-zinc-100 focus:outline-none tabular-nums"
              />
            </div>
          </div>

          {/* Returning Saved Local Profile Confirmation Prompt */}
          {returningWorkspace && (
            <div className="p-3 rounded-lg border border-[#10B981]/35 bg-[#10B981]/10 space-y-1.5">
              <div className="flex items-start gap-2 text-xs font-sans text-[#10B981] font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Welcome back, {returningWorkspace.fullName} (
                  <span className="font-mono">{returningWorkspace.researcherId}</span>
                  ). Continue with your saved workspace?
                </span>
              </div>
              <p className="text-[11px] font-sans text-zinc-300 pl-6">
                Restores{' '}
                <span className="font-mono tabular-nums">
                  {returningWorkspace.chatThreads.length}
                </span>{' '}
                saved chat thread(s),{' '}
                <span className="font-mono tabular-nums">
                  {returningWorkspace.verifiedCorrections.length}
                </span>{' '}
                learned correction(s), and{' '}
                <span className="font-mono tabular-nums">
                  {returningWorkspace.customRuns.length}
                </span>{' '}
                custom run(s).
              </p>
            </div>
          )}

          {/* Primary Sign-In + Secondary Guest Actions */}
          <div className="space-y-2.5 pt-1">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#FAFAFA] text-[#09090B] font-sans text-sm font-semibold hover:bg-zinc-200 transition-colors active:scale-[0.99] cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>
                {returningWorkspace
                  ? 'Continue Saved Workspace'
                  : 'Sign In'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <div className="relative py-1 flex items-center gap-3">
              <div className="flex-1 h-px bg-[#27272A]" />
              <span className="text-[10px] font-sans uppercase tracking-wider text-zinc-500">
                Or explore without saving an account
              </span>
              <div className="flex-1 h-px bg-[#27272A]" />
            </div>

            <button
              type="button"
              onClick={onContinueAsGuest}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#27272A] bg-[#121215] text-zinc-200 font-sans text-xs font-medium hover:bg-[#18181B] hover:border-zinc-500 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-zinc-400" />
              <span>Continue as Guest</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
