"use client";
export default function Logo({ size = 40, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <div className="flex items-center gap-3 select-none">
      <div
        className="relative flex items-center justify-center rounded-2xl shadow-lg"
        style={{ width: size, height: size, background: "linear-gradient(135deg,#FF6B6B 0%,#FF8E53 100%)" }}
      >
        {/* house shape */}
        <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 40 40" fill="none">
          <path d="M20 6 L6 18 L8 18 L8 32 L16 32 L16 24 L24 24 L24 32 L32 32 L32 18 L34 18 Z" fill="white" opacity="0.95" />
          {/* heart inside */}
          <path d="M20 26 C20 26 14 22 14 18.5 C14 16.5 15.5 15 17.5 15 C18.7 15 19.6 15.6 20 16.4 C20.4 15.6 21.3 15 22.5 15 C24.5 15 26 16.5 26 18.5 C26 22 20 26 20 26 Z" fill="#FF6B6B" stroke="#FFE66D" strokeWidth="0.5" />
          {/* small dots for family */}
          <circle cx="12" cy="12" r="1.2" fill="#FFE66D" />
          <circle cx="28" cy="12" r="1.2" fill="#4ECDC4" />
        </svg>
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#FFE66D] rounded-full border-2 border-white animate-pulse" />
      </div>
      {showText && (
        <div className="leading-tight">
          <div className="font-black tracking-tight text-[19px] flex gap-0.5">
            <span style={{ color: "#FF6B6B" }}>Family</span>
            <span style={{ color: "#2D3436" }}>Planner</span>
          </div>
          <div className="text-[10px] tracking-[0.2em] font-bold text-[#FF8A65] -mt-0.5">함께 만드는 우리 일정</div>
        </div>
      )}
    </div>
  );
}
