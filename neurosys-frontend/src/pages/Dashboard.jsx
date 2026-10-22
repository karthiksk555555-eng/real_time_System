import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { metricsService } from '../services/metricsService';
import { useLab } from '../contexts/LabContext';
import { 
  Monitor, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  ChevronRight, 
  Brain, 
  Bell, 
  ClipboardCheck, 
  Cpu, 
  HardDrive, 
  Activity,
  ArrowRight
} from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();
  const { currentLab } = useLab();
  const [computers, setComputers] = useState(() => {
    try {
      const cached = sessionStorage.getItem('neurosys_computers_cache');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  const [alerts, setAlerts] = useState([]);
  const [readinessData, setReadinessData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('Just now');
  const [loading, setLoading] = useState(() => {
    try {
      return !sessionStorage.getItem('neurosys_computers_cache');
    } catch (e) {
      return true;
    }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 1000);

    // SSE EventSource for real-time status change push
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
          console.error('Error parsing SSE status event in Dashboard', err);
        }
      });
    } catch (e) {
      console.warn('SSE stream unavailable in Dashboard, using 1s fallback', e);
    }

    return () => {
      clearInterval(interval);
      if (eventSource) eventSource.close();
    };
  }, [currentLab?.id]);

  const fetchDashboardData = async () => {
    try {
      const activeLabId = currentLab?.id;
      // Safely fetch lab-scoped telemetry data
      const [compData, alertData, readinessRes] = await Promise.all([
        metricsService.getAllComputers(activeLabId).catch(() => []),
        metricsService.getActiveAlerts(activeLabId).catch(() => []),
        metricsService.fetchRealApi(`/software/lab-readiness?labId=${activeLabId || ''}`).catch(() => null)
      ]);

      const compList = Array.isArray(compData) ? compData : (compData?.data || []);
      const alertList = Array.isArray(alertData) ? alertData : (alertData?.data || []);

      if (Array.isArray(compList) && compList.length > 0) {
        setComputers(compList);
        try {
          sessionStorage.setItem('neurosys_computers_cache', JSON.stringify(compList));
        } catch (e) {}
      }

      setAlerts(Array.isArray(alertList) ? alertList : []);
      if (readinessRes) setReadinessData(readinessRes.data || readinessRes);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Error loading dashboard telemetry data', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  // Real Database Counts derived strictly from live connected endpoints
  const totalAssets = computers.length;
  const activeCount = computers.filter(c => c.status === 'ONLINE').length;
  const criticalCount = computers.filter(c => c.status === 'OFFLINE').length;
  const warningCount = computers.filter(c => c.status === 'WARNING' || c.status === 'CRITICAL').length;

  const readyCount = readinessData?.readyComputers ?? activeCount;
  const readinessPercent = totalAssets === 0 ? 0 : Math.round((readyCount / totalAssets) * 100);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Welcome Section */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-lowest border border-slate-200 p-6 rounded-xl shadow-sm animate-fade-in-up">
        <div>
          <h1 className="text-display font-display text-slate-900 tracking-tight font-extrabold flex items-center gap-3">
            <Monitor className="w-8 h-8 text-primary" />
            Computer Lab Dashboard
          </h1>
          <p className="text-body-md font-body-md text-slate-700 mt-1 font-medium">
            Real-time operational overview and live telemetry stream of your college computer lab.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            Last updated: {lastUpdated}
          </span>
          <button 
            onClick={handleManualRefresh}
            title="Refresh Data"
            className="p-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-primary transition-colors cursor-pointer shadow-sm flex items-center gap-1.5 text-xs font-bold"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      {/* Summary Metrics Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up">
        {/* Total Computers */}
        <div 
          onClick={() => navigate('/computers')}
          className="card-elevated p-4 flex flex-col justify-between hover:scale-[1.02] hover:shadow-md transition-all duration-300 cursor-pointer border border-slate-200"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-label-md font-label-md text-slate-700 font-bold">Total Computers</span>
            <Monitor className="w-5 h-5 text-primary font-bold" />
          </div>
          <div>
            <div className="text-display font-display text-slate-900 font-extrabold">{totalAssets}</div>
            <div className="text-body-md font-body-md text-slate-700 mt-0.5 font-semibold">Monitored Workstations</div>
          </div>
        </div>

        {/* Active Endpoints */}
        <div 
          onClick={() => navigate('/computers')}
          className="card-elevated p-4 flex flex-col justify-between border-l-4 border-l-emerald-500 hover:scale-[1.02] hover:shadow-md transition-all duration-300 cursor-pointer border-y border-r border-slate-200"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-label-md font-label-md text-emerald-700 font-bold">Online</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600 font-bold" />
          </div>
          <div>
            <div className="text-display font-display text-slate-900 font-extrabold">{activeCount}</div>
            <div className="text-body-md font-body-md text-emerald-700 mt-0.5 font-semibold">Connected &amp; Streaming</div>
          </div>
        </div>

        {/* Offline / Critical */}
        <div 
          onClick={() => navigate('/computers?status=CRITICAL')}
          className="card-elevated p-4 flex flex-col justify-between border-l-4 border-l-red-600 bg-red-50/50 hover:scale-[1.02] hover:shadow-md transition-all duration-300 cursor-pointer border-y border-r border-slate-200"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-label-md font-label-md text-red-700 font-bold">Offline</span>
            <XCircle className="w-5 h-5 text-red-600 font-bold" />
          </div>
          <div>
            <div className="text-display font-display text-red-700 font-extrabold">{criticalCount}</div>
            <div className="text-body-md font-body-md text-red-700 mt-0.5 font-semibold">Disconnected</div>
          </div>
        </div>

        {/* Warning Alerts */}
        <div 
          onClick={() => navigate('/computers?status=WARNING')}
          className="card-elevated p-4 flex flex-col justify-between border-l-4 border-l-amber-500 hover:scale-[1.02] hover:shadow-md transition-all duration-300 cursor-pointer border-y border-r border-slate-200"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-label-md font-label-md text-amber-700 font-bold">Need Attention</span>
            <AlertTriangle className="w-5 h-5 text-amber-600 font-bold" />
          </div>
          <div>
            <div className="text-display font-display text-slate-900 font-extrabold">{warningCount}</div>
            <div className="text-body-md font-body-md text-amber-700 mt-0.5 font-semibold">High Load Warning</div>
          </div>
        </div>
      </section>

      {/* Main Dashboard High-Level View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Computer Lab Workstations & AI Predictive Insights */}
        <div className="lg:col-span-2 space-y-6">
          {/* Live Computer Lab Workstations Table */}
          <section className="card-elevated p-6 animate-fade-in-up border border-slate-200">
            <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
              <h3 className="text-headline-md font-headline-md text-slate-900 font-bold flex items-center gap-2">
                <Monitor className="w-5 h-5 text-primary" />
                Computer Lab Workstations ({computers.length})
              </h3>
              <button 
                onClick={() => navigate('/computers')}
                className="text-label-md font-label-md text-primary hover:underline font-bold cursor-pointer flex items-center gap-1"
              >
                <span>View All Computers</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-label-md font-label-md text-slate-900 font-extrabold">
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Computer Name</th>
                    <th className="py-2.5 px-3">CPU %</th>
                    <th className="py-2.5 px-3">RAM %</th>
                    <th className="py-2.5 px-3">Storage %</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="text-body-md font-body-md text-slate-800 divide-y divide-slate-200 font-medium">
                  {computers.length > 0 ? (
                    computers.map((comp) => {
                      const isOffline = comp.status === 'OFFLINE';
                      const cpu = isOffline ? null : (comp.currentCpuUsage != null ? Math.round(comp.currentCpuUsage) : (comp.lastRecordedCpuUsage != null ? Math.round(comp.lastRecordedCpuUsage) : null));
                      const ram = isOffline ? null : (comp.currentRamUsage != null ? Math.round(comp.currentRamUsage) : (comp.lastRecordedRamUsage != null ? Math.round(comp.lastRecordedRamUsage) : null));
                      const disk = Math.round(comp.currentDiskUsage ?? comp.lastRecordedDiskUsage ?? 0);
                      const isLaptop = comp.hostname === 'LAPTOP-PALBUQS2';

                      return (
                        <tr key={comp.id} className={`hover:bg-slate-50 transition-colors ${isLaptop ? 'bg-primary-container/10 border-l-4 border-l-primary' : ''}`}>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${comp.status === 'ONLINE' ? 'bg-emerald-500 status-dot-active' : comp.status === 'WARNING' ? 'bg-amber-500 status-dot-active' : 'bg-red-600'}`}></div>
                              <span className={`text-mono-sm font-mono-sm font-bold ${comp.status === 'ONLINE' ? 'text-emerald-700' : comp.status === 'WARNING' ? 'text-amber-700' : 'text-red-700'}`}>
                                {comp.status}
                              </span>
                            </div>
                          </td>
                          <td 
                            onClick={() => navigate(`/computers/${comp.id}`)}
                            className="py-2.5 px-3 font-bold text-primary cursor-pointer hover:underline"
                          >
                            {comp.hostname} {isLaptop ? '(Your Admin Laptop)' : ''}
                          </td>
                          <td className="py-2.5 px-3 font-mono-sm font-bold text-primary">{cpu !== null ? `${cpu}%` : '--'}</td>
                          <td className="py-2.5 px-3 font-mono-sm font-bold text-emerald-700">{ram !== null ? `${ram}%` : '--'}</td>
                          <td className="py-2.5 px-3 font-mono-sm font-bold text-slate-700">{disk}%</td>
                          <td className="py-2.5 px-3 text-right">
                            <button 
                              onClick={() => navigate(`/computers/${comp.id}`)}
                              className="text-label-md font-label-md px-3 py-1 rounded border border-slate-300 hover:border-primary hover:text-primary transition-colors bg-white cursor-pointer font-bold text-slate-800"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-slate-600 text-body-md font-medium">
                        {loading ? 'Connecting to computer lab backend database...' : 'No workstations currently connected to database.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Column: Computer Lab Alerts & Single Lab Readiness */}
        <div className="space-y-6">
          {/* Recent Alerts List */}
          <section className="card-elevated p-0 overflow-hidden flex flex-col h-full max-h-[320px] border border-slate-200">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center sticky top-0">
              <h3 className="text-headline-md font-headline-md text-slate-900 font-bold flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-600 font-bold" />
                Recent Alerts ({alerts.length})
              </h3>
              <button onClick={() => navigate('/alerts')} className="text-label-md font-label-md text-primary hover:underline font-bold cursor-pointer">
                View All
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-200">
              {alerts.length > 0 ? (
                alerts.slice(0, 4).map((alert) => (
                  <div key={alert.id} className="p-4 hover:bg-slate-50 transition-colors flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-red-700 font-bold" />
                    </div>
                    <div>
                      <h4 className="text-body-md font-body-md font-bold text-slate-900">{alert.title || alert.message || 'System Alert'}</h4>
                      <p className="text-body-md font-body-md text-slate-700 mt-0.5 font-medium">{alert.description || alert.message}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-600 text-body-md flex flex-col items-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2 font-bold" />
                  <span className="font-bold text-slate-800">No active telemetry alerts recorded.</span>
                </div>
              )}
            </div>
          </section>

          {/* Computer Lab Readiness Overview */}
          <section className="card-elevated p-6 border border-slate-200">
            <h3 
              onClick={() => navigate('/lab-readiness')}
              className="text-headline-md font-headline-md text-slate-900 font-bold mb-4 flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
            >
              <ClipboardCheck className="w-5 h-5 text-primary font-bold" />
              Computer Lab Readiness
            </h3>

            <div 
              onClick={() => navigate('/lab-readiness')}
              className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3 hover:border-primary transition-colors cursor-pointer"
            >
              <div className="flex justify-between items-center text-body-md font-body-md font-bold text-slate-900">
                <span>Computer Lab Compliance</span>
                <span className="text-mono-sm font-mono-sm text-primary font-extrabold">{readyCount} / {totalAssets} Ready ({readinessPercent}%)</span>
              </div>
              <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${readinessPercent}%` }}></div>
              </div>
              <p className="text-xs text-slate-700 font-medium pt-1">
                {totalAssets === 0 
                  ? 'No computers connected to the lab yet.' 
                  : `${readyCount} workstations ready for practicals and exams.`}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
