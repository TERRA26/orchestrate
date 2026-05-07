export function Header() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo + product name */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-teal-700 flex items-center justify-center flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <rect x="1" y="9" width="3" height="5" fill="white" rx="0.6" />
              <rect x="6" y="5" width="3" height="9" fill="white" rx="0.6" />
              <rect x="11" y="1" width="3" height="13" fill="white" rx="0.6" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold text-slate-900 tracking-tight whitespace-nowrap">
            Velora Analytics
          </span>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* Date range pill */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="text-slate-400 flex-shrink-0"
              aria-hidden="true"
            >
              <rect
                x="1"
                y="2"
                width="10"
                height="9"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path d="M1 5H11" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M4 1V3M8 1V3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
              Last 30 days
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              className="text-slate-400"
              aria-hidden="true"
            >
              <path
                d="M3 4L5 6L7 4"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Avatar */}
          <button
            aria-label="User menu"
            className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-teal-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 hover:opacity-90 transition-opacity"
          >
            CM
          </button>
        </div>
      </div>
    </header>
  );
}
