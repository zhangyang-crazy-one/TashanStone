import React, { useState, useEffect } from 'react';
import { Lock, User, ArrowRight, Shield, KeyRound, Crosshair, AlertTriangle } from 'lucide-react';
import { isRegistered, register, verifyLogin, getUsername } from '../services/authService';

interface LoginScreenProps {
  onLogin: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isRegistered()) {
      setMode('register');
    } else {
      setMode('login');
      setUsername(getUsername());
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'register') {
        if (!username.trim() || !password) {
          throw new Error("ID and Code required");
        }
        if (password !== confirmPassword) {
          throw new Error("Security Codes do not match");
        }
        if (password.length < 4) {
          throw new Error("Code too weak (min 4 chars)");
        }
        await register(username, password);
        onLogin();
      } else {
        const isValid = await verifyLogin(password);
        if (isValid) {
          onLogin();
        } else {
          throw new Error("Access Denied: Invalid Code");
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-900 text-zinc-100 font-sans relative overflow-hidden selection:bg-yellow-900 selection:text-white">
        {/* Gritty Background Texture */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" 
             style={{ 
                 backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E"), linear-gradient(to bottom, #18181b, #09090b)` 
             }}
        />
        
        {/* Camo/Dirt overlay */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,#000000_100%)] opacity-80" />

        <div className="w-full max-w-md relative z-10 px-4">
             {/* Main Card */}
             <div className="bg-zinc-800 border-4 border-zinc-700 shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-1 transform transition-transform hover:scale-[1.01]">
                {/* Inner Bezel */}
                <div className="border border-zinc-600 p-8 bg-zinc-800 relative overflow-hidden">
                    {/* Scratches/Noise */}
                    <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ filter: 'contrast(150%) noise(100%)' }}></div>

                    {/* Decorative Bolts */}
                    <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-zinc-900 border border-zinc-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"></div>
                    <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-zinc-900 border border-zinc-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"></div>
                    <div className="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-zinc-900 border border-zinc-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"></div>
                    <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-zinc-900 border border-zinc-600 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"></div>

                    {/* Header */}
                    <div className="text-center mb-8 relative">
                        <div className="w-20 h-20 bg-zinc-900 border-2 border-zinc-600 mx-auto flex items-center justify-center mb-4 shadow-inner relative group overflow-hidden">
                            <div className="absolute inset-0 border border-zinc-700 opacity-50"></div>
                            {/* Spinning effect on hover */}
                            <div className="absolute inset-0 bg-transparent group-hover:bg-white/5 transition-colors"></div>
                            
                            <Shield className="text-yellow-600 w-10 h-10 drop-shadow-md z-10" strokeWidth={2.5} />
                            
                            {/* Warning stripes inside icon box */}
                            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[repeating-linear-gradient(45deg,#000,#000_5px,#eab308_5px,#eab308_10px)] border-t border-black"></div>
                        </div>
                        
                        <h1 className="text-3xl font-black text-zinc-100 tracking-wider uppercase drop-shadow-md" style={{ fontFamily: '"Black Ops One", cursive' }}>
                            {mode === 'login' ? 'Security Clearance' : 'New Recruit'}
                        </h1>
                        <p className="text-yellow-600 font-mono text-xs uppercase tracking-[0.2em] mt-2 border-t border-b border-zinc-700 py-1 inline-block">
                             {mode === 'login' ? `Welcome back, ${username}` : 'Initialize Protocol'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6 relative">
                        {/* ID Input */}
                        {mode === 'register' && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                                <Crosshair size={10} /> Operator ID
                            </label>
                            <div className="relative group">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-yellow-500 transition-colors" size={18} />
                              <input 
                                type="text" 
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-black border-2 border-zinc-600 text-zinc-300 font-mono focus:border-yellow-600 focus:ring-1 focus:ring-yellow-600 focus:outline-none placeholder-zinc-700 transition-all uppercase tracking-wider"
                                placeholder="IDENTIFIER"
                                autoFocus
                                autoComplete="off"
                              />
                            </div>
                          </div>
                        )}

                        {/* Password Input */}
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                               <Lock size={10} /> Security Code
                           </label>
                           <div className="relative group">
                              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-yellow-500 transition-colors" size={18} />
                              <input 
                                type="password" 
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-black border-2 border-zinc-600 text-zinc-300 font-mono focus:border-yellow-600 focus:ring-1 focus:ring-yellow-600 focus:outline-none placeholder-zinc-700 transition-all tracking-wider"
                                placeholder="******"
                              />
                           </div>
                        </div>

                        {/* Confirm Password */}
                        {mode === 'register' && (
                          <div className="space-y-1">
                           <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                               <Lock size={10} /> Confirm Code
                           </label>
                           <div className="relative group">
                              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-yellow-500 transition-colors" size={18} />
                              <input 
                                type="password" 
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-black border-2 border-zinc-600 text-zinc-300 font-mono focus:border-yellow-600 focus:ring-1 focus:ring-yellow-600 focus:outline-none placeholder-zinc-700 transition-all tracking-wider"
                                placeholder="******"
                              />
                           </div>
                          </div>
                        )}

                        {error && (
                          <div className="p-3 bg-red-900/20 border-l-4 border-red-600 text-red-400 text-xs font-mono flex items-center gap-2">
                             <AlertTriangle size={14} className="shrink-0" />
                             <span className="uppercase">{error}</span>
                          </div>
                        )}

                        <button 
                          type="submit" 
                          disabled={isLoading}
                          className="w-full py-4 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 font-black uppercase tracking-widest border-b-4 border-black active:border-b-0 active:translate-y-1 active:border-t-4 active:border-transparent transition-all flex items-center justify-center gap-3 group relative overflow-hidden mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                             <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.2)_10px,rgba(0,0,0,0.2)_20px)] opacity-30 pointer-events-none"></div>
                             <span className="relative z-10">{isLoading ? 'PROCESSING...' : (mode === 'login' ? 'AUTHENTICATE' : 'ENLIST')}</span>
                             {!isLoading && <ArrowRight className="w-5 h-5 text-yellow-500 relative z-10 group-hover:translate-x-1 transition-transform" strokeWidth={3} />}
                        </button>
                    </form>

                     {/* Footer Link */}
                    {mode === 'login' && (
                         <div className="mt-8 text-center pt-4 border-t border-zinc-700/50">
                            <button 
                                onClick={() => { 
                                    if(confirm("WARNING: This action will permanently erase all local data and reset the system. Proceed?")) {
                                        localStorage.clear(); 
                                        window.location.reload();
                                    }
                                }}
                                className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-red-500 transition-colors flex items-center justify-center gap-1 mx-auto hover:underline"
                            >
                                <AlertTriangle size={10} /> Factory Reset / Wipe Data
                            </button>
                         </div>
                    )}
                </div>
             </div>
             
             {/* Decorative Corner Brackets (Outside) */}
             <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-zinc-500 pointer-events-none"></div>
             <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-zinc-500 pointer-events-none"></div>
             <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-zinc-500 pointer-events-none"></div>
             <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-zinc-500 pointer-events-none"></div>
        </div>
    </div>
  );
};