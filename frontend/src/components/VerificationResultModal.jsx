import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertOctagon,
  MapPin,
  Clock,
  ShieldCheck,
  X,
  Sparkles,
} from 'lucide-react';

export default function VerificationResultModal({ isOpen, onClose, result }) {
  if (!isOpen || !result) return null;

  const isSuccess = result.success;
  const errorType = result.errorType || 'UNKNOWN_ERROR';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg glass-panel p-6 lg:p-8 rounded-3xl border border-slate-700 shadow-2xl space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success Header Card */}
        {isSuccess ? (
          <div className="text-center space-y-3">
            <div className="inline-flex p-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              <CheckCircle2 className="w-12 h-12 animate-bounce" />
            </div>
            <h3 className="font-display text-2xl font-extrabold text-white">
              Attendance Verified!
            </h3>
            <p className="text-xs font-mono text-emerald-400">
              AES-256 Decrypted • Timestamp Valid • Geofence Verified
            </p>
          </div>
        ) : (
          /* Error Header Card */
          <div className="text-center space-y-3">
            <div className="inline-flex p-4 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-[0_0_30px_rgba(244,63,94,0.3)]">
              <XCircle className="w-12 h-12" />
            </div>
            <h3 className="font-display text-2xl font-extrabold text-white">
              Verification Failed
            </h3>
            <p className="text-xs font-mono text-rose-400 uppercase tracking-wider">
              {errorType}
            </p>
          </div>
        )}

        {/* Body Breakdown Details */}
        <div className="space-y-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-xs font-mono">
          {isSuccess && result.data && (
            <>
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span className="text-slate-500">STUDENT ID:</span>
                <span className="font-bold text-cyan-300">{result.data.user}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span className="text-slate-500">STUDENT NAME:</span>
                <span className="font-bold text-slate-200">{result.data.userName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span className="text-slate-500">EVENT SESSION:</span>
                <span className="font-bold text-slate-200">{result.data.event}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span className="text-slate-500">GPS DISTANCE:</span>
                <span className="font-bold text-emerald-400">
                  {result.data.distanceMeters} meters away (Allowed: {result.data.allowedRadiusMeters}m)
                </span>
              </div>
              <div className="flex justify-between py-1 text-slate-300">
                <span className="text-slate-500">TOKEN AGE:</span>
                <span className="font-bold text-cyan-400">
                  {result.data.tokenAgeSeconds} seconds old (Fresh)
                </span>
              </div>
            </>
          )}

          {!isSuccess && (
            <div className="p-3 bg-rose-950/40 rounded-xl border border-rose-500/30 text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertOctagon className="w-5 h-5 text-rose-400" />
                <span>Error Reason:</span>
              </div>
              <p className="text-xs leading-relaxed">{result.error}</p>

              {result.distanceMeters !== undefined && (
                <div className="pt-2 text-[11px] text-slate-300 border-t border-rose-900/60">
                  <div>Your distance: <strong className="text-rose-400">{result.distanceMeters} meters</strong></div>
                  <div>Max allowed geofence radius: <strong className="text-emerald-400">{result.allowedRadiusMeters} meters</strong></div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Action Button */}
        <button
          onClick={onClose}
          className={`w-full py-3 rounded-xl font-display font-bold text-sm transition-all ${
            isSuccess
              ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
        >
          {isSuccess ? 'Done' : 'Try Again'}
        </button>
      </div>
    </div>
  );
}
