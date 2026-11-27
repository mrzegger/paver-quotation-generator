import React, { useEffect, useState } from 'react';
import { LogIn, Mail, Lock, AlertCircle, Loader2, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import {
  signInWithGoogle,
  signInWithEmail,
  signOutUser,
  checkUserEmailAllowed,
  isSupabaseConfigured,
} from '../utils/supabaseClient';

interface AuthModalProps {
  onSuccess: () => void;
  onClose: () => void;
  initialError?: string | null;
  fullScreen?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  onSuccess,
  onClose,
  initialError,
  fullScreen = false,
}) => {
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError || null);

  const isConfigured = isSupabaseConfigured();

  useEffect(() => {
    setErrorMsg(initialError || null);
  }, [initialError]);

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      setErrorMsg(err.message || 'Failed to start Google sign-in.');
      setGoogleLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setEmailLoading(true);

    try {
      const data = await signInWithEmail(email, password);
      const { allowed, reason } = await checkUserEmailAllowed(data.user?.email || email);
      if (!allowed) {
        await signOutUser();
        setErrorMsg(reason || 'This email is not authorized to access the workspace.');
        return;
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Auth error:', err);
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div
      className={
        fullScreen
          ? 'min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 flex flex-col items-center justify-center p-4'
          : 'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4'
      }
    >
      {fullScreen && (
        <div className="mb-6 bg-white rounded-xl px-5 py-3 shadow-xl border border-gray-200/80">
          <img
            src="/logo_header.jpeg"
            alt="Kuma Concrete Logo"
            className="h-12 w-auto object-contain"
          />
        </div>
      )}

      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-gray-900 text-white p-6 relative">
          {!fullScreen && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-lg transition"
            >
              ✕
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <LogIn className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">
                {fullScreen ? 'Kuma Concrete Portal' : 'Sign In to Kuma Concrete'}
              </h3>
              <p className="text-xs text-gray-300">
                {fullScreen
                  ? 'Private workspace — authorized Google accounts only'
                  : 'Access your cloud quotations, billing statements, and team price list'}
              </p>
            </div>
          </div>
        </div>

        {/* Not Configured Alert */}
        {!isConfigured && (
          <div className="m-5 mb-0 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              Supabase Credentials Not Yet Configured
            </div>
            <p className="leading-relaxed">
              Add your <span className="font-semibold">VITE_SUPABASE_URL</span> and{' '}
              <span className="font-semibold">VITE_SUPABASE_ANON_KEY</span> in Vercel Environment
              Variables or <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">.env.local</code>.
            </p>
          </div>
        )}

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Primary Google Sign-In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || emailLoading || !isConfigured}
            className="w-full py-3 px-4 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-800 font-semibold text-sm border border-gray-300 rounded-xl shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {googleLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                <span>Redirecting to Google...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.37 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-gray-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>
              {fullScreen
                ? 'Only pre-registered Google accounts can access this app. Contact the administrator if you need access.'
                : 'Access is restricted to authorized Kuma Concrete Google accounts.'}
            </span>
          </div>

          {/* Subtle collapsible email/password sign-in for existing accounts */}
          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setShowEmailLogin(!showEmailLogin);
                setErrorMsg(null);
              }}
              className="w-full text-xs text-gray-500 hover:text-gray-800 font-medium flex items-center justify-center gap-1 py-1 transition"
            >
              <span>Sign in with email &amp; password instead</span>
              {showEmailLogin ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showEmailLogin && (
              <form onSubmit={handleEmailSignIn} className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={emailLoading || googleLoading || !isConfigured}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-gray-950 font-bold text-xs rounded-lg shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {emailLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-gray-950" />
                      <span>Signing In...</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
