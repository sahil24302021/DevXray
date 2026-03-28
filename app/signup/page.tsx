import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Grain */}
      <div className="grain-overlay" />

      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #cdff00, transparent 70%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-md flex justify-center">
        <SignUp appearance={{
          elements: {
            card: "bg-[#0a0a0a] border border-[#222]",
            headerTitle: "text-white font-syne",
            headerSubtitle: "text-[#888]",
            socialButtonsBlockButton: "text-white border-[#333] hover:bg-[#111]",
            dividerLine: "bg-[#222]",
            dividerText: "text-[#555]",
            formFieldLabel: "text-[#888]",
            formFieldInput: "bg-[#111] border-[#333] text-white",
            formButtonPrimary: "bg-[#cdff00] text-black hover:bg-[#b0e600]",
            footerActionText: "text-[#888]",
            footerActionLink: "text-[#cdff00] hover:text-[#b0e600]"
          }
        }} />
      </div>
    </main>
  );
}
