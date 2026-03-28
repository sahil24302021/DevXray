import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Grain */}
      <div className="grain-overlay" />

      {/* Floating Blobs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#cdff00]/[0.03] blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#cdff00]/[0.02] blur-[100px] rounded-full mix-blend-screen pointer-events-none" />

      <div className="relative z-10 w-full max-w-md flex justify-center">
        <SignIn appearance={{
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
