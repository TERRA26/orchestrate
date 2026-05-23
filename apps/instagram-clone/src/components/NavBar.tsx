import { Heart, Home, Search, PlusSquare, Film, Send, Instagram } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useUserStore } from "../store/userStore";

export default function NavBar() {
  const currentUser = useUserStore((s) => s.getCurrentUser());
  const navigate = useNavigate();

  const navItems = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/explore", icon: Search, label: "Explore" },
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-[244px] border-r border-gray-200 bg-white px-3 py-5 z-40">
        <div
          className="mb-8 px-3 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <Instagram size={28} className="stroke-[#262626]" />
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-gray-100 ${
                  isActive ? "font-bold" : ""
                }`
              }
            >
              <Icon size={24} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium hover:bg-gray-100 text-left">
            <PlusSquare size={24} />
            <span>Create</span>
          </button>
          <button className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium hover:bg-gray-100 text-left">
            <Film size={24} />
            <span>Reels</span>
          </button>
          <NavLink
            to={`/profile/${currentUser.username}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-gray-100 ${
                isActive ? "font-bold" : ""
              }`
            }
          >
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.username}
              className="w-6 h-6 rounded-full object-cover"
            />
            <span>Profile</span>
          </NavLink>
        </nav>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-[60px] bg-white border-b border-gray-200 flex items-center justify-between px-4 z-40">
        <Instagram size={28} className="stroke-[#262626]" />
        <div className="flex items-center gap-4">
          <button aria-label="Notifications">
            <Heart size={24} className="stroke-[#262626]" />
          </button>
          <button aria-label="Messages">
            <Send size={24} className="stroke-[#262626]" />
          </button>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex items-center justify-around z-40">
        <NavLink to="/" end aria-label="Home">
          {({ isActive }) => <Home size={26} className={isActive ? "stroke-[#262626] fill-[#262626]" : "stroke-[#262626]"} />}
        </NavLink>
        <NavLink to="/explore" aria-label="Explore">
          {({ isActive }) => <Search size={26} className={isActive ? "stroke-[#262626] fill-gray-200" : "stroke-[#262626]"} />}
        </NavLink>
        <button aria-label="Create">
          <PlusSquare size={26} className="stroke-[#262626]" />
        </button>
        <button aria-label="Reels">
          <Film size={26} className="stroke-[#262626]" />
        </button>
        <NavLink to={`/profile/${currentUser.username}`} aria-label="Profile">
          {() => (
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.username}
              className="w-7 h-7 rounded-full object-cover"
            />
          )}
        </NavLink>
      </nav>
    </>
  );
}
