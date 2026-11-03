import { BookOpenCheck, BookOpenText, BrainCircuit, ChevronLeft, ChevronRight, LogOut, Menu, Plus, Settings, Users, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { useAuth } from "@/features/auth/auth-context";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export function AppLayout({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("learngate.sidebar-collapsed") === "true");
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      window.localStorage.setItem("learngate.sidebar-collapsed", String(!value));
      return !value;
    });
  }

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="workspace">
      <header className="workspace-header">
        <button aria-label={open ? "Close navigation" : "Open navigation"} className="icon-button mobile-menu" onClick={() => setOpen(!open)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <Link className="brand" to="/">
          <span className="brand-mark"><BookOpenCheck size={19} /></span>
          <span>Learn<span className="brand-accent">Gate</span></span>
        </Link>
        <div className="header-actions">
          <span className="user-greeting">{user?.firstName} {user?.lastName}</span>
          <Link className="header-profile-photo" aria-label="Open profile" title="Profile" to="/profile">
            {user?.profileImage
              ? <img alt="" src={user.profileImage} />
              : <UserRound aria-hidden="true" size={18} />}
          </Link>
          <ThemeToggle />
          <button className="icon-button" onClick={handleSignOut} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </header>
      <div className={`workspace-body ${collapsed ? "workspace-sidebar-collapsed" : ""}`}>
        <aside aria-label="Workspace navigation" className={`sidebar ${open ? "sidebar-open" : ""} ${collapsed ? "sidebar-collapsed" : ""}`}>
          <div className="sidebar-toggle-row">
            <button aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} className="icon-button sidebar-collapse-toggle" onClick={toggleCollapsed} title={collapsed ? "Expand navigation" : "Collapse navigation"} type="button">
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>
          <div className="sidebar-main-links">
            <NavLink aria-label="Home" end title={collapsed ? "Home" : undefined} to="/" onClick={() => setOpen(false)}><BookOpenText size={18} /><span className="sidebar-link-label">Home</span></NavLink>
            {(user?.role === "student" || user?.role === "faculty") && <NavLink aria-label="My classes" title={collapsed ? "My classes" : undefined} to="/classes" onClick={() => setOpen(false)}><BookOpenCheck size={18} /><span className="sidebar-link-label">My classes</span></NavLink>}
            {user?.role !== "admin" && <NavLink aria-label="Study flashcards" title={collapsed ? "Study flashcards" : undefined} to="/flashcards" onClick={() => setOpen(false)}><BrainCircuit size={18} /><span className="sidebar-link-label">Study flashcards</span></NavLink>}
            {user?.role === "admin" && <NavLink aria-label="User management" title={collapsed ? "User management" : undefined} to="/admin/users" onClick={() => setOpen(false)}><Users size={18} /><span className="sidebar-link-label">User management</span></NavLink>}
            <NavLink aria-label="Profile" title={collapsed ? "Profile" : undefined} to="/profile" onClick={() => setOpen(false)}><Settings size={18} /><span className="sidebar-link-label">Profile</span></NavLink>
          </div>
          <div className="sidebar-caption">ACCOUNT</div>
          <p className="sidebar-role">{user?.role === "faculty" ? "Faculty" : user?.role === "admin" ? "Administrator" : "Student"}</p>
        </aside>
        {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
        <main className="workspace-content">
          <div className="content-toolbar">
            <span className="content-context">Your learning workspace</span>
            {user?.role === "faculty" && <Link className="text-action" to="/subjects/new"><Plus size={16} /> Create subject</Link>}
            {user?.role === "student" && <Link className="text-action" to="/subjects/join"><Plus size={16} /> Join subject</Link>}
          </div>
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
