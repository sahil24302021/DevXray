import Link from "next/link";
import { signupUser } from "../actions/auth";

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="grain-overlay" />
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #cdff00, transparent 70%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-sm flex justify-center mt-10">
        <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl p-8 w-full shadow-2xl backdrop-blur-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-[family-name:var(--font-syne)] font-bold text-white mb-2">Create Account</h1>
            <p className="text-[#888] text-sm font-[family-name:var(--font-dm-sans)]">Join DevXray AI</p>
          </div>

          <form action={signupUser} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-xs text-[#888] uppercase tracking-wider mb-1.5 font-[family-name:var(--font-space)]">Full Name</label>
              <input 
                id="name" 
                name="name" 
                type="text" 
                required
                placeholder="Linus Torvalds"
                className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#cdff00]/50 transition-colors"
              />
            </div>
            
            <div>
              <label htmlFor="email" className="block text-xs text-[#888] uppercase tracking-wider mb-1.5 font-[family-name:var(--font-space)]">Email</label>
              <input 
                id="email" 
                name="email" 
                type="email" 
                required
                placeholder="linus@linux.org"
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
              Sign Up
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-[#222] text-center">
            <p className="text-[#888] text-sm">
              Already have an account?{' '}
              <Link href="/signin" className="text-[#cdff00] hover:text-[#b0e600] transition-colors">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
