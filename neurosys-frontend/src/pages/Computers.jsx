import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { metricsService } from '../services/metricsService';
import { useLab } from '../contexts/LabContext';
import { 
  Laptop, 
  Search, 
  Filter, 
  Power, 
  RotateCcw, 
  Lock, 
  CheckSquare, 
  Square,
  AlertTriangle,
  ArrowUpDown,
  RefreshCw,
  X,
  Monitor,
  CheckCircle2
} from 'lucide-react';

const formatLastSeen = (timestamp) => {
  if (!timestamp) return 'Just now';
  const now = new Date();
  const date = new Date(timestamp);
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 3) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
};

const Computers = () => {
  const navigate = useNavigate();
  const { currentLab, labs, selectLab } = useLab();
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status');

  const [computers, setComputers] = useState(() => {
    try {
      const cached = sessionStorage.getItem('neurosys_computers_cache');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      return !sessionStorage.getItem('neurosys_computers_cache');
    } catch (e) {
      return true;
    }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(statusParam || 'ALL');
  const [healthFilter, setHealthFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('hostname');
  const [sortOrder, setSortOrder] = useState('asc');

  // Selection & Power Modal State
  const [selectedIds, setSelectedIds] = useState([]);
  const [powerModal, setPowerModal] = useState({ open: false, action: null, targetCount: 0, targetIds: [] });
  const [actionStatusMsg, setActionStatusMsg] = useState('');

  useEffect(() => {
    fetchComputers();
    const interval = setInterval(fetchComputers, 1000);

    // SSE EventSource for real-time targeted status updates (no full page reload)
    let eventSource;
    try {
      eventSource = new EventSource('/api/v1/events/status-stream');
      eventSource.addEventListener('COMPUTER_STATUS_CHANGED', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload && payload.computerId) {
            setComputers((prev) =>
              prev.map((comp) => {
                if (comp.id === payload.computerId || comp.agentId === payload.agentId) {
                  return {
                    ...comp,
                    status: payload.status,
                    lastSeenAt: payload.lastSeenAt || new Date().toISOString()
                  };
                }
                return comp;
              })
            );
          }
        } catch (err) {
          console.error('Error parsing SSE status payload', err);
        }
      });
    } catch (e) {
      console.warn('SSE stream unavailable, using 1s fallback', e);
    }

    return () => {
      clearInterval(interval);
      if (eventSource) eventSource.close();
    };
  }, [currentLab?.id]);

  const fetchComputers = async () => {
    try {
      const data = await metricsService.getAllComputers(currentLab?.id);
      const compList = Array.isArray(data) ? data : (data?.data || []);
      if (Array.isArray(compList) && compList.length > 0) {
        setComputers([...compList]);
        try {
          sessionStorage.setItem('neurosys_computers_cache', JSON.stringify(compList));
        } catch (e) {}
      }
    } catch (e) {
      console.error('Failed to fetch computer lab workstations', e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchComputers();
  };

  // Filter Logic
  const filteredComputers = computers
    .filter((comp) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        !q ||
        (comp.hostname || '').toLowerCase().includes(q) ||
        (comp.ipAddress || '').toLowerCase().includes(q) ||
        (comp.osName || '').toLowerCase().includes(q);

      const matchesStatus = 
        statusFilter === 'ALL' || 
        (statusFilter === 'ONLINE' && comp.status === 'ONLINE') ||
        (statusFilter === 'OFFLINE' && comp.status === 'OFFLINE') ||
        (statusFilter === 'WARNING' && comp.status === 'WARNING') ||
        (statusFilter === 'CRITICAL' && (comp.status === 'CRITICAL' || comp.status === 'OFFLINE'));

      const ram = Math.round(comp.currentRamUsage ?? comp.lastRecordedRamUsage ?? 0);
      const matchesHealth = 
        healthFilter === 'ALL' ||
        (healthFilter === 'HEALTHY' && ram < 80 && comp.status === 'ONLINE') ||
        (healthFilter === 'ATTENTION' && (ram >= 80 || comp.status !== 'ONLINE'));

      return matchesSearch && matchesStatus && matchesHealth;
    })
    .sort((a, b) => {
      let valA = a[sortBy] ?? '';
      let valB = b[sortBy] ?? '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  // Checkbox Selection Handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredComputers.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Power Action Triggers
  const handleTriggerSelectedPowerAction = (action) => {
    if (selectedIds.length === 0) return;
    setPowerModal({ open: true, action, targetCount: selectedIds.length, targetIds: selectedIds });
  };

  const handleTriggerSinglePowerAction = (compId, action) => {
    setPowerModal({ open: true, action, targetCount: 1, targetIds: [compId] });
  };

  const handleExecutePowerAction = async () => {
    const idsToProcess = powerModal.targetIds || selectedIds;

    if (powerModal.action === 'SHUTDOWN') {
      setActionStatusMsg(`Sending shutdown command to ${idsToProcess.length} workstation(s)...`);
      try {
        await Promise.all(idsToProcess.map(id => metricsService.sendPowerCommand(id, 'SHUTDOWN')));
        setActionStatusMsg(`Shutdown command sent. Waiting for computer to go offline...`);
        
        let checkCount = 0;
        const checkOfflineInterval = setInterval(async () => {
          checkCount++;
          const data = await metricsService.getAllComputers();
          const compList = Array.isArray(data) ? data : (data?.data || []);
          const targetComps = compList.filter(c => idsToProcess.includes(c.id));
          const allOffline = targetComps.every(c => c.status === 'OFFLINE');

          if (allOffline || checkCount >= 8) {
            clearInterval(checkOfflineInterval);
            if (allOffline) {
              setActionStatusMsg(`✓ Shutdown confirmed by loss of connection.`);
            } else {
              setActionStatusMsg(`✓ Shutdown command delivered.`);
            }
            setTimeout(() => {
              setPowerModal({ open: false, action: null, targetCount: 0, targetIds: [] });
              setSelectedIds([]);
              setActionStatusMsg('');
              fetchComputers();
            }, 1200);
          }
        }, 1000);
      } catch (e) {
        console.error('Error executing shutdown command', e);
        setPowerModal({ open: false, action: null, targetCount: 0, targetIds: [] });
      }
    } else {
      setActionStatusMsg(`Sending ${powerModal.action} command to ${idsToProcess.length} workstation(s)...`);
      try {
        await Promise.all(idsToProcess.map(id => metricsService.sendPowerCommand(id, powerModal.action)));
        setActionStatusMsg(`✓ ${powerModal.action} command successfully issued!`);
        setTimeout(() => {
          setPowerModal({ open: false, action: null, targetCount: 0, targetIds: [] });
          setSelectedIds([]);
          setActionStatusMsg('');
          fetchComputers();
        }, 1200);
      } catch (e) {
        console.error('Error executing power action', e);
        setPowerModal({ open: false, action: null, targetCount: 0, targetIds: [] });
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-lowest border border-slate-200 p-6 rounded-xl shadow-sm">
        <div>
          <h1 className="font-display text-display text-slate-900 tracking-tight font-extrabold">Computer Lab Workstations</h1>
          <p className="font-body-md text-body-md text-slate-700 mt-1 font-medium">
            Manage all active computers in your computer lab with instant ~1s real-time Online/Offline status detection.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 hover:bg-slate-100 hover:text-primary transition-colors flex items-center gap-2 text-xs font-bold shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span>Refresh Fleet</span>
          </button>
        </div>
      </div>

      {/* Selected System Power Control Bar */}
      <div className="p-4 bg-slate-900 text-white rounded-xl shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Power className="w-6 h-6 text-red-400" />
          <div>
            <h3 className="text-sm font-extrabold text-white">Selected System Remote Power Management</h3>
            <p className="text-xs text-slate-400 font-medium">Select workstation checkboxes in the table below to execute targeted remote power actions</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.length > 0 ? (
            <div className="flex items-center gap-2 animate-fade-in-up">
              <span className="text-xs font-extrabold text-amber-400 mr-2">{selectedIds.length} Workstation(s) Selected</span>
              <button
                onClick={() => handleTriggerSelectedPowerAction('LOCK')}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Lock className="w-4 h-4 text-amber-400" /> Lock Selected ({selectedIds.length})
              </button>
              <button
                onClick={() => handleTriggerSelectedPowerAction('RESTART')}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <RotateCcw className="w-4 h-4" /> Restart Selected ({selectedIds.length})
              </button>
              <button
                onClick={() => handleTriggerSelectedPowerAction('SHUTDOWN')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Power className="w-4 h-4" /> Shutdown Selected ({selectedIds.length})
              </button>
            </div>
          ) : (
            <div className="text-xs font-semibold text-slate-400 italic bg-slate-800/60 px-4 py-2 rounded-lg border border-slate-700/60">
              Select checkbox(es) in the table below to enable Selected System Shutdown
            </div>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card-elevated p-4 flex flex-wrap items-center justify-between gap-4 border border-slate-200">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search computer name, IP..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-primary"
            />
          </div>

          {/* Lab Selector */}
          <select
            value={currentLab?.id || 'ALL'}
            onChange={(e) => selectLab(e.target.value)}
            className="h-10 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:outline-none"
          >
            <option value="ALL">🌐 All Laboratories</option>
            {labs && labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="ONLINE">Online</option>
            <option value="WARNING">Warning</option>
            <option value="OFFLINE">Offline</option>
            <option value="CRITICAL">Critical</option>
          </select>

          {/* Health Filter */}
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value)}
            className="h-10 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-900 focus:outline-none"
          >
            <option value="ALL">All Health</option>
            <option value="HEALTHY">Healthy</option>
            <option value="ATTENTION">Needs Attention</option>
          </select>
        </div>
      </div>

      {/* Computers Fleet Table */}
      <div className="card-elevated overflow-hidden border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="font-headline-md text-headline-md font-bold text-slate-900 flex items-center gap-2">
            <Laptop className="w-5 h-5 text-primary" />
            Computer Lab Fleet ({filteredComputers.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-label-md font-label-md text-slate-900 font-extrabold">
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={selectedIds.length > 0 && selectedIds.length === filteredComputers.length}
                    className="accent-primary cursor-pointer"
                  />
                </th>
                <th className="p-3">Status</th>
                <th className="p-3">Computer Name</th>
                <th className="p-3">IP Address</th>
                <th className="p-3">CPU %</th>
                <th className="p-3">RAM %</th>
                <th className="p-3">Storage %</th>
                <th className="p-3 text-right">Quick Power Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-body-md text-body-md text-slate-800 font-medium">
              {filteredComputers.length > 0 ? (
                filteredComputers.map((comp) => {
                  const isOffline = comp.status === 'OFFLINE';
                  const cpu = isOffline ? null : (comp.currentCpuUsage != null ? Math.round(comp.currentCpuUsage) : (comp.lastRecordedCpuUsage != null ? Math.round(comp.lastRecordedCpuUsage) : null));
                  const ram = isOffline ? null : (comp.currentRamUsage != null ? Math.round(comp.currentRamUsage) : (comp.lastRecordedRamUsage != null ? Math.round(comp.lastRecordedRamUsage) : null));
                  const disk = Math.round(comp.currentDiskUsage ?? comp.lastRecordedDiskUsage ?? 0);
                  const isLaptop = comp.hostname === 'LAPTOP-PALBUQS2';
                  const isSelected = selectedIds.includes(comp.id);

                  return (
                    <tr key={comp.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-primary-container/10' : ''}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(comp.id)}
                          className="accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${comp.status === 'ONLINE' ? 'bg-emerald-500 status-dot-active' : comp.status === 'WARNING' ? 'bg-amber-500 status-dot-active' : 'bg-red-600'}`}></div>
                            <span className={`text-mono-sm font-mono-sm font-bold ${comp.status === 'ONLINE' ? 'text-emerald-700' : comp.status === 'WARNING' ? 'text-amber-700' : 'text-red-700'}`}>
                              {comp.status}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Last seen: {formatLastSeen(comp.lastSeenAt)}
                          </span>
                        </div>
                      </td>
                      <td 
                        onClick={() => navigate(`/computers/${comp.id}`)}
                        className="p-3 cursor-pointer"
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-primary hover:underline">
                            {comp.displayName || comp.computerName || comp.hostname} {isLaptop ? '(Admin Laptop)' : ''}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                            <span className="bg-primary/10 text-primary font-bold px-1.5 py-0.2 rounded border border-primary/20">
                              {comp.labName || 'Computer Lab 1'} ({comp.labCode || 'LAB-001'})
                            </span>
                            <span>Host: {comp.hostname}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-mono-sm text-slate-700 font-semibold">{comp.ipAddress || '10.33.199.161'}</td>
                      <td className="p-3 font-mono-sm font-bold text-primary">{cpu !== null ? `${cpu}%` : '--'}</td>
                      <td className="p-3 font-mono-sm font-bold text-emerald-700">{ram !== null ? `${ram}%` : '--'}</td>
                      <td className="p-3 font-mono-sm font-bold text-slate-700">{disk}%</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleTriggerSinglePowerAction(comp.id, 'LOCK')}
                            className="p-1.5 text-slate-700 hover:bg-slate-100 rounded border border-slate-300 transition-colors cursor-pointer"
                            title="Lock Computer Screen"
                          >
                            <Lock className="w-3.5 h-3.5 text-amber-600" />
                          </button>
                          <button
                            onClick={() => handleTriggerSinglePowerAction(comp.id, 'RESTART')}
                            className="p-1.5 text-amber-700 hover:bg-amber-50 rounded border border-amber-300 transition-colors cursor-pointer"
                            title="Restart Computer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleTriggerSinglePowerAction(comp.id, 'SHUTDOWN')}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-red-300 transition-colors cursor-pointer"
                            title="Shutdown Computer"
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => navigate(`/computers/${comp.id}`)}
                            className="px-2.5 py-1 text-xs font-bold rounded border border-slate-300 hover:border-primary hover:text-primary transition-colors bg-white cursor-pointer text-slate-800 ml-1"
                          >
                            View Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-700 text-body-md font-semibold">
                    {loading ? 'Loading computer lab workstations...' : 'No computers found matching selected filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Power Action Modal */}
      {powerModal.open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-headline-md font-bold text-slate-900 flex items-center gap-2">
                <Power className="w-5 h-5 text-red-600" />
                Confirm {powerModal.action} Command
              </h3>
              <button 
                onClick={() => setPowerModal({ open: false, action: null, targetCount: 0, targetIds: [] })}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-body-md text-slate-700 font-medium">
              Are you sure you want to send <strong className="text-red-600 font-bold">{powerModal.action}</strong> command to <strong className="text-slate-900 font-bold">{powerModal.targetCount}</strong> workstation(s)?
            </p>

            {actionStatusMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-800 animate-pulse">
                {actionStatusMsg}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setPowerModal({ open: false, action: null, targetCount: 0, targetIds: [] })}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-100 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleExecutePowerAction}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer shadow-sm"
              >
                Send {powerModal.action} Command
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Computers;
