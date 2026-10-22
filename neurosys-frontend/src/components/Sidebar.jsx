import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Sidebar = ({ mobileNavOpen, setMobileNavOpen }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeAlertCount, setActiveAlertCount] = useState(0);

  useEffect(() => {
    fetchAlertCount();
    const interval = setInterval(fetchAlertCount, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAlertCount = async () => {
    try {
      const res = await api.get('/alerts');
      const list = res?.data || (Array.isArray(res) ? res : []);
      if (Array.isArray(list)) {
        setActiveAlertCount(list.length);
      }
    } catch (e) {
      // Ignore background errors
    }
  };

  const handleLogout = () => {
    if (setMobileNavOpen) setMobileNavOpen(false);
    logout();
    navigate('/');
  };

  const navItems = [
    { name: 'Overview', path: '/dashboard', icon: 'dashboard' },
    { name: 'Laboratories', path: '/labs', icon: 'meeting_room' },
    { name: 'My Laptop', path: '/admin-laptop', icon: 'laptop_mac', highlight: true },
    { name: 'Computers', path: '/computers', icon: 'desktop_windows' },
    { name: 'Alerts', path: '/alerts', icon: 'warning', badge: activeAlertCount },
    { name: 'Software Inventory', path: '/software', icon: 'inventory_2' },
    { name: 'Lab Readiness', path: '/lab-readiness', icon: 'fact_check' },
    { name: 'AI Intelligence', path: '/analytics', icon: 'psychology' },
    { name: 'Settings', path: '/settings', icon: 'settings' },
  ];

  const renderNavContent = () => (
    <div className="flex flex-col h-full">
      {/* Header Profile / Admin Info */}
      <div className="p-4 border-b border-outline-variant flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/30 shrink-0">
            <span className="material-symbols-outlined text-primary">person</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-headline-md text-body-lg font-bold text-on-surface truncate">
              {user?.username || user?.name || 'admin'}
            </h2>
            <p className="text-label-md font-label-md text-secondary truncate">Lab Supervisor</p>
          </div>
        </div>

        {/* Mobile Close Button */}
        {setMobileNavOpen && (
          <button
            onClick={() => setMobileNavOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}
      </div>

      {/* Nav Items */}
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            onClick={() => {
              if (setMobileNavOpen) setMobileNavOpen(false);
            }}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 ease-in-out group ${
                isActive
                  ? 'bg-surface-container text-primary font-bold border-r-2 border-primary'
                  : item.highlight
                  ? 'text-primary font-bold bg-primary/5 border border-primary/20 hover:bg-primary/10'
                  : 'text-secondary hover:bg-surface-container-high'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`material-symbols-outlined ${isActive || item.highlight ? 'icon-fill text-primary' : ''} group-hover:scale-110 transition-transform`}>
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.name}</span>
                {item.badge > 0 && (
                  <span className="bg-error text-on-error text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Footer / Logout */}
      <div className="p-3 border-t border-outline-variant space-y-1">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-error hover:bg-error-container transition-colors duration-200 ease-in-out cursor-pointer"
        >
          <span className="font-label-md text-label-md font-medium">Logout</span>
          <span className="material-symbols-outlined text-[18px]">logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <nav className="bg-surface text-primary font-body-md text-body-md w-sidebar-width h-full border-r border-outline-variant fixed left-0 top-0 hidden md:flex flex-col z-40 shadow-sm">
        {renderNavContent()}
      </nav>

      {/* Mobile Drawer Overlay */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer Sidebar */}
          <div className="relative w-72 max-w-[80vw] bg-surface h-full shadow-2xl z-50 flex flex-col border-r border-outline-variant animate-fade-in-up">
            {renderNavContent()}
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
