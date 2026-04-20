export default function Logo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <img
      src="/devxray-logo.png"
      alt="DevXray Logo"
      className={`${className} object-contain`}
    />
  );
}
