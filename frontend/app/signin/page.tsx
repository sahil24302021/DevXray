import Link from "next/link";
import { loginUser } from "../actions/auth";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="grain-overlay" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#cdff00]/[0.03] blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#cdff00]/[0.02] blur-[100px] rounded-full mix-blend-screen pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm flex justify-center">
        <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-8 w-full shadow-2xl backdrop-blur-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-[family-name:var(--font-syne)] font-bold text-white mb-2">Welcome Back</h1>
            <p className="text-[#888] text-sm font-[family-name:var(--font-dm-sans)]">Sign in to DevXray AI</p>
          </div>

          <form action={loginUser} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs text-[#888] uppercase tracking-wider mb-1.5 font-[family-name:var(--font-space)]">Email</label>
              <input 
                id="email" 
                name="email" 
                type="email" 
                required
                placeholder="dev@example.com"
                className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#cdff00]/50 transition-colors"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-xs text-[#888] uppercase tracking-wider mb-1.5 font-[family-name:var(--font-space)]">Password</label>
              <input 
                id="password" 
                name="password" 
                type="password" 
                required
                placeholder="••••••••"
                className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#cdff00]/50 transition-colors"
              />
            </div>

            <button 
              type="submit" 
              className="w-full bg-[#cdff00] text-black font-semibold rounded-xl px-4 py-3 hover:bg-[#b0e600] transition-colors mt-6 font-[family-name:var(--font-space)]"
            >
              Sign In
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-[#222] text-center">
            <p className="text-[#888] text-sm">
              Don't have an account?{' '}
              <Link href="/signup" className="text-[#cdff00] hover:text-[#b0e600] transition-colors">
                Create Account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
