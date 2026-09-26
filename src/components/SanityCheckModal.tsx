import React, { useMemo } from 'react';
import { runSanityCheck } from '../utils/demProcessor';
import { CheckCircle2, XCircle, ShieldCheck, X } from 'lucide-react';

interface SanityCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SanityCheckModal: React.FC<SanityCheckModalProps> = ({ isOpen, onClose }) => {
  const result = useMemo(() => runSanityCheck(), []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl text-slate-100 flex flex-col gap-4 max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Depression & Elevation Sanity Checks
              </h3>
              <p className="text-xs text-slate-400">
                Automated validation of core inundation rules
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Result Banner */}
        <div
          className={`p-3 rounded-xl border flex items-center gap-3 text-xs font-semibold ${
            result.passed
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/40 border-red-500/40 text-red-300'
          }`}
        >
          {result.passed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <div>
            {result.passed
              ? `All ${result.checks.length} sanity checks PASSED. Below-sea-level dry terrain, marine noise, and existing oceans are strictly protected.`
              : 'One or more sanity checks failed. Review details below.'}
          </div>
        </div>

        {/* Check Items List */}
        <div className="overflow-y-auto space-y-2 pr-1 custom-scrollbar flex-1">
          {result.checks.map((c, idx) => {
            const isMatch = c.actual === c.expected;
            return (
              <div
                key={idx}
                className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{c.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      isMatch
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {isMatch ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">{c.detail}</p>
                <div className="text-[10px] text-slate-500 flex gap-4 pt-1">
                  <span>Expected newly submerged: <strong>{String(c.expected)}</strong></span>
                  <span>Actual: <strong>{String(c.actual)}</strong></span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
