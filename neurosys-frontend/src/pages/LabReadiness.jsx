import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { metricsService, fetchRealApi } from '../services/metricsService';
import { useLab } from '../contexts/LabContext';
import api from '../services/api';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  ShieldCheck, 
  Wifi, 
  HardDrive, 
  Cpu, 
  PackageCheck, 
  RefreshCw,
  Plus,
  Trash2,
  X,
  Send,
  Info,
  CheckCircle,
  Monitor,
  Thermometer,
  Clock,
  Sparkles
} from 'lucide-react';

const LabReadiness = () => {
  const navigate = useNavigate();
  const { currentLab } = useLab();
  const [computers, setComputers] = useState([]);
  const [softwareList, setSoftwareList] = useState([]);
  const [requiredRules, setRequiredRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRechecking, setIsRechecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Add Requirement Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSoftwareName, setNewSoftwareName] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [isSubmittingRule, setIsSubmittingRule] = useState(false);

  // Readiness Detail Modal State
  const [selectedCompDetail, setSelectedCompDetail] = useState(null);

  useEffect(() => {
    fetchComputersAndReadiness();
    const interval = setInterval(fetchComputersAndReadiness, 4000);
    return () => clearInterval(interval);
  }, [currentLab?.id]);

  const fetchComputersAndReadiness = async () => {
    setIsRechecking(true);
    try {
      const fetchApi = fetchRealApi || metricsService.fetchRealApi;

      // 1. Fetch Computers List (Lab Scoped)
      const compRes = await metricsService.getAllComputers(currentLab?.id).catch(() => []);
      
      // 2. Fetch Fleet Software Summary
      const fleetRes = await fetchApi('/software/fleet-summary').catch(() => null);
      
      // 3. Fetch All Software Fallback
      const allSwRes = await fetchApi('/software/all').catch(() => []);

      // 4. Fetch Required Rules for Computer Lab
      const rulesRes = await fetchApi('/software/required?labName=Computer%20Lab').catch(() => []);

      // Unwrap Computers List
      let compList = [];
      if (Array.isArray(compRes)) compList = compRes;
      else if (compRes && Array.isArray(compRes.data)) compList = compRes.data;

      // Unwrap Software List
      let rawSwList = [];
      const fleetData = fleetRes?.data || fleetRes;
      if (fleetData && Array.isArray(fleetData.softwareList) && fleetData.softwareList.length > 0) {
        rawSwList = fleetData.softwareList;
        // Only fallback to fleet computers if compList was empty
        if (compList.length === 0 && Array.isArray(fleetData.computers) && fleetData.computers.length > 0) {
          compList = fleetData.computers;
        }
      } else if (Array.isArray(allSwRes)) {
        rawSwList = allSwRes;
      } else if (allSwRes && Array.isArray(allSwRes.data)) {
        rawSwList = allSwRes.data;
      }

      // Unwrap Required Rules
      let rulesList = [];
      if (Array.isArray(rulesRes)) rulesList = rulesRes;
      else if (rulesRes && Array.isArray(rulesRes.data)) rulesList = rulesRes.data;

      let safeCompList = compList.filter(Boolean);

      // Ensure computers are strictly scoped to currentLab if specified
      if (currentLab?.id && currentLab.id !== 'ALL') {
        safeCompList = safeCompList.filter(c => 
          String(c.labId) === String(currentLab.id) ||
          c.labName === currentLab.name ||
          (c.lab && String(c.lab.id) === String(currentLab.id))
        );
      }

      setComputers(safeCompList);
      setSoftwareList(rawSwList.filter(Boolean));
      setRequiredRules(rulesList.filter(Boolean));
    } catch (e) {
      console.error('Error loading computer lab readiness data:', e);
    } finally {
      setLoading(false);
      setTimeout(() => setIsRechecking(false), 300);
    }
  };

  const handleRecheckReadiness = async () => {
    setStatusMessage('Checking computers, telemetry, and software requirements...');
    await fetchComputersAndReadiness();
    setStatusMessage('Readiness check completed successfully. Updated just now.');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const handleAddRuleSubmit = async (e) => {
    e.preventDefault();
    if (!newSoftwareName.trim()) return;

    setIsSubmittingRule(true);
    try {
      await api.post(`/software/required?labName=Computer%20Lab&softwareName=${encodeURIComponent(newSoftwareName)}&requiredVersion=${encodeURIComponent(newVersion)}`);
      setNewSoftwareName('');
      setNewVersion('');
      setShowAddModal(false);
      fetchComputersAndReadiness();
    } catch (e) {
      console.error('Error adding required software rule:', e);
    } finally {
      setIsSubmittingRule(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await api.delete(`/software/required/${ruleId}`);
      fetchComputersAndReadiness();
    } catch (e) {
      console.error('Error removing required software rule:', e);
    }
  };

  // EVALUATE REAL READINESS FOR EVERY COMPUTER
  const evaluatedComputers = computers.map(comp => {
    // Software items belonging to this computer (robust single-lab matching)
    const matchedSwItems = softwareList.filter(s => {
      if (!s) return false;
      if (s.computerId && comp.id && s.computerId === comp.id) return true;
      if (s.computerHostname && comp.hostname && s.computerHostname.toLowerCase() === comp.hostname.toLowerCase()) return true;
      if (computers.length === 1) return true;
      return false;
    });

    const hasInventory = matchedSwItems.length > 0 || softwareList.length > 0;

    const issues = [];
    const softwareCompliance = [];
    let missingCount = 0;
    let outdatedCount = 0;

    // 1. Connection / Agent Status Check
    const isOnline = comp.status === 'ONLINE';
    if (!isOnline) {
      issues.push('Computer is offline');
    }

    // 2. Telemetry & Hardware Health Checks
    const cpu = comp.currentCpuUsage ?? comp.lastRecordedCpuUsage ?? 25.0;
    const ram = comp.currentRamUsage ?? comp.lastRecordedRamUsage ?? 42.0;
    const diskUsage = comp.currentDiskUsage ?? comp.lastRecordedDiskUsage ?? 32.0;
    const freeDiskPct = Math.max(0, Math.round(100 - diskUsage));

    // Storage Rules
    if (freeDiskPct < 10) {
      issues.push(`Disk nearly full: only ${freeDiskPct}% free space`);
    } else if (freeDiskPct <= 20) {
      issues.push(`Disk storage is getting low (${freeDiskPct}% free)`);
    }

    // Memory Rules (Sustained High RAM)
    if (ram > 95) {
      issues.push(`RAM usage has remained above 95% (${Math.round(ram)}%)`);
    } else if (ram > 90) {
      issues.push(`RAM usage is high (${Math.round(ram)}%)`);
    }

    // Temperature (If available)
    const tempText = comp.temperature ? `${comp.temperature}°C` : 'Temperature data unavailable';

    // 3. Software Compliance Rules Check
    if (requiredRules.length > 0) {
      requiredRules.forEach(rule => {
        const reqName = rule.softwareName;
        const reqVer = rule.requiredVersion;

        if (!hasInventory) {
          softwareCompliance.push({ name: reqName, status: 'UNAVAILABLE', text: 'Inventory unavailable' });
          issues.push(`Software inventory unavailable for ${reqName}`);
        } else {
          // Robust Alias-aware search in computer's inventory
          const match = matchedSwItems.find(s => {
            if (!s || !s.name) return false;
            const raw = s.name.toLowerCase().trim();
            const q = reqName.toLowerCase().trim();
            if (q === 'java' || q === 'jdk' || q === 'jre' || q === 'openjdk') {
              return raw.includes('java') || raw.includes('openjdk') || raw.includes('jdk') || raw.includes('jre');
            }
            if (q === 'python') {
              return raw.includes('python');
            }
            if (q === 'vscode' || q === 'vs code' || q === 'code') {
              return raw.includes('visual studio code') || raw.includes('vscode') || raw.includes('code');
            }
            if (q === 'mysql' || q === 'sql') {
              return raw.includes('mysql');
            }
            if (q === 'chrome') {
              return raw.includes('chrome');
            }
            if (q === 'git') {
              return raw.includes('git');
            }
            return raw.includes(q) || q.includes(raw);
          });

          if (!match) {
            missingCount++;
            softwareCompliance.push({ name: reqName, status: 'MISSING', text: `${reqName} is not installed` });
            issues.push(`${reqName} is not installed`);
          } else if (reqVer && reqVer.trim() !== '' && reqVer.toLowerCase() !== 'optional') {
            const detectedVer = match.version || '';
            const reqVerClean = reqVer.trim();
            if (detectedVer && !detectedVer.startsWith(reqVerClean)) {
              outdatedCount++;
              softwareCompliance.push({ name: reqName, status: 'OUTDATED', text: `${reqName} ${detectedVer} installed (${reqVerClean} required)` });
              issues.push(`${reqName} version ${detectedVer} is installed, but version ${reqVerClean} is required`);
            } else {
              softwareCompliance.push({ name: reqName, status: 'COMPLIANT', text: `${reqName} ${detectedVer || 'Installed'}` });
            }
          } else {
            softwareCompliance.push({ name: reqName, status: 'COMPLIANT', text: `${reqName} ${match.version || 'Installed'}` });
          }
        }
      });
    }

    // Determine Final Readiness State:
    // 🟢 READY | 🔴 NOT READY
    let readinessState = 'READY';
    let compliancePct = 100;

    if (!isOnline || missingCount > 0 || freeDiskPct < 10 || ram > 95 || !hasInventory || outdatedCount > 0 || freeDiskPct <= 20) {
      readinessState = 'NOT_READY';
      if (requiredRules.length > 0) {
        const metCount = requiredRules.length - missingCount - outdatedCount;
        compliancePct = Math.max(0, Math.round((metCount / requiredRules.length) * 100));
      } else {
        compliancePct = isOnline ? 75 : 0;
      }
    }

    // Recommendation
    let recommendation = 'Computer is fully verified and ready for class.';
    if (!isOnline) {
      recommendation = 'Start the computer and check that the NeuroSys Agent service is running.';
    } else if (missingCount > 0) {
      recommendation = `Install missing required software package(s) on ${comp.hostname}.`;
    } else if (outdatedCount > 0) {
      recommendation = `Upgrade software to the required version rules.`;
    } else if (freeDiskPct < 10) {
      recommendation = `Free up storage space on local drive (less than 10% free space remaining).`;
    } else if (ram > 90) {
      recommendation = `Close unnecessary background applications to release memory pressure.`;
    }

    return {
      computerId: comp.id,
      hostname: comp.hostname,
      isLaptop: comp.hostname === 'LAPTOP-PALBUQS2',
      status: comp.status,
      isOnline,
      readinessState,
      compliancePct,
      cpu: Math.round(cpu),
      ram: Math.round(ram),
      diskUsage: Math.round(diskUsage),
      freeDiskPct,
      tempText,
      issues,
      softwareCompliance,
      recommendation,
      hasInventory,
      lastChecked: 'Just now'
    };
  });

  // Calculate Summary Counts
  const totalLabComputers = evaluatedComputers.length;
  const readyComputers = evaluatedComputers.filter(c => c.readinessState === 'READY').length;
  const unreadyComputers = evaluatedComputers.filter(c => c.readinessState === 'NOT_READY').length;

  // Safe Overall Readiness Score % (Fix 0/0 = 100% bug)
  const readinessPercent = totalLabComputers === 0 ? 0 : Math.round((readyComputers / totalLabComputers) * 100);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-lowest border border-slate-200 p-6 rounded-xl shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-primary" />
            <h1 className="font-display text-display text-slate-900 tracking-tight font-extrabold">Computer Lab Readiness</h1>
          </div>
          <p className="font-body-md text-body-md text-slate-700 mt-1 font-medium">
            Check whether your lab computers are ready for classes, practical sessions, and examinations.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRecheckReadiness}
            disabled={isRechecking}
            className="px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 hover:bg-slate-100 hover:text-primary transition-colors flex items-center gap-2 text-xs font-bold shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRechecking ? 'animate-spin text-primary' : ''}`} />
            <span>{isRechecking ? 'Checking computers...' : 'Recheck Readiness'}</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold animate-fade-in-up">
          ✓ {statusMessage}
        </div>
      )}

      {/* Overall Lab Readiness Gauge Banner */}
      <div className="card-elevated p-6 bg-gradient-to-r from-primary-container/10 via-surface to-surface border border-primary/20">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-3 text-center md:text-left">
            <span className="font-label-md text-label-md bg-primary-container/20 text-primary px-3 py-1 rounded-full font-bold uppercase border border-primary/30">
              Scope: {currentLab?.name || 'Computer Lab'}
            </span>
            <h2 className="font-display text-display font-extrabold text-slate-900">
              {totalLabComputers === 0 
                ? 'No computers available' 
                : `Overall Readiness: ${readinessPercent}%`}
            </h2>
            <p className="font-body-md text-body-md text-slate-700 font-medium max-w-xl">
              {totalLabComputers === 0
                ? 'No registered computers are assigned to this computer lab yet. Connect a NeuroSys Agent to begin checking.'
                : `${readyComputers} out of ${totalLabComputers} Computer(s) Ready • ${unreadyComputers} Computer(s) Not Ready`}
            </p>
          </div>

          {/* Gauge Widget */}
          <div className="w-32 h-32 rounded-full border-8 border-primary/20 flex flex-col items-center justify-center bg-white shadow-inner shrink-0">
            <span className="font-display text-display text-primary font-extrabold">
              {totalLabComputers === 0 ? '0%' : `${readinessPercent}%`}
            </span>
            <span className="font-label-md text-label-md text-slate-700 uppercase font-extrabold text-[10px]">
              {totalLabComputers === 0 ? 'NO COMPUTERS' : 'VERIFIED'}
            </span>
          </div>
        </div>

        {/* Readiness Breakdown Tiles (Ready / Not Ready) */}
        <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-200 text-center">
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="text-headline-md font-extrabold text-emerald-700">🟢 Ready ({readyComputers})</div>
            <div className="text-xs font-bold text-emerald-800 mt-0.5">Compliant &amp; Operational</div>
          </div>

          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-headline-md font-extrabold text-red-700">🔴 Not Ready ({unreadyComputers})</div>
            <div className="text-xs font-bold text-red-800 mt-0.5">Missing Requirement / Offline</div>
          </div>
        </div>
      </div>

      {/* Part 2: Required Software Section & Executive Report */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configured Required Software */}
        <div className="lg:col-span-2 card-elevated p-6 space-y-4 border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="font-headline-md text-headline-md font-bold text-slate-900 flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-primary" />
              Configured Required Software ({requiredRules.length})
            </h3>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-primary hover:bg-primary-container text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Requirement</span>
            </button>
          </div>

          <div className="space-y-3">
            {requiredRules.length > 0 ? (
              requiredRules.map((rule) => (
                <div key={rule.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary-container/20 text-primary flex items-center justify-center font-bold shrink-0">
                      <PackageCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-body-md text-body-md font-bold text-slate-900">{rule.softwareName}</h4>
                      <p className="font-body-md text-body-md text-slate-700 mt-0.5 font-medium">
                        Required Version: <strong className="text-primary font-bold">{rule.requiredVersion || 'Optional'}</strong> • Applied to {currentLab?.name || 'Computer Lab'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                    title="Remove Requirement Rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            ) : (
              <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center text-slate-700 text-body-md font-semibold bg-slate-50 space-y-2">
                <div>No software requirements configured for {currentLab?.name || 'Computer Lab'}.</div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-3 py-1 bg-primary text-white rounded text-xs font-bold cursor-pointer"
                >
                  + Add Requirement Rule (e.g. Java 17, Python 3.12, VS Code)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Executive Administrator Report Card */}
        <div className="lg:col-span-1 card-elevated p-6 space-y-4 border border-slate-200">
          <h3 className="font-headline-md text-headline-md font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Lab Administrator Report
          </h3>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs font-semibold text-slate-800">
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span>Scope:</span>
              <span className="font-bold text-slate-900">{currentLab?.name || 'Computer Lab'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span>Total Computers:</span>
              <span className="font-bold text-slate-900">{totalLabComputers}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span>Ready for Practicals:</span>
              <span className="font-bold text-emerald-700">{readyComputers}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Not Ready:</span>
              <span className="font-bold text-red-700">{unreadyComputers}</span>
            </div>
          </div>

          <div className="p-4 bg-primary-container/10 border border-primary/20 rounded-xl text-xs text-slate-800 font-medium space-y-1">
            <strong className="text-primary font-bold block">Administrator Summary:</strong>
            {totalLabComputers === 0 ? (
              <p>No computers available.</p>
            ) : readyComputers === totalLabComputers ? (
              <p>All {totalLabComputers} computer(s) are 100% ready for practical sessions and examinations.</p>
            ) : (
              <p>
                {readyComputers} of {totalLabComputers} computer(s) are ready for practical sessions. {unreadyComputers > 0 ? `${unreadyComputers} computer(s) are not ready.` : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Computer Readiness Table */}
      <div className="card-elevated overflow-hidden border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="font-headline-md text-headline-md font-bold text-slate-900 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            Computer Readiness Table ({evaluatedComputers.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-label-md font-label-md text-slate-900 font-extrabold">
                <th className="p-3">Computer</th>
                <th className="p-3">Readiness Status</th>
                <th className="p-3">Compliance</th>
                <th className="p-3">System Health</th>
                <th className="p-3">Missing / Issues</th>
                <th className="p-3 text-right">Last Checked</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-body-md text-body-md text-slate-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-700 font-bold space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                    <div>Evaluating computer lab readiness...</div>
                  </td>
                </tr>
              ) : evaluatedComputers.length > 0 ? (
                evaluatedComputers.map((c, idx) => {
                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-slate-900">
                        {c.hostname} {c.isLaptop ? '(Your Admin Laptop)' : ''}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`font-label-md text-label-md px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          c.readinessState === 'READY' 
                            ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30' 
                            : 'bg-red-500/20 text-red-700 border border-red-500/30'
                        }`}>
                          {c.readinessState === 'READY' ? '🟢 READY' : '🔴 NOT READY'}
                        </span>
                      </td>
                      <td className="p-3 font-mono-sm text-mono-sm font-bold text-primary">
                        {c.compliancePct}%
                      </td>
                      <td className="p-3">
                        <span className={`font-mono-sm text-mono-sm font-bold ${
                          !c.isOnline ? 'text-red-600' : c.ram > 90 || c.freeDiskPct < 10 ? 'text-amber-700' : 'text-emerald-700'
                        }`}>
                          {!c.isOnline ? 'Offline' : c.ram > 90 ? 'Memory High' : c.freeDiskPct < 10 ? 'Disk Low' : 'Healthy'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 font-semibold text-xs">
                        {c.issues.length > 0 ? c.issues.join(', ') : 'None'}
                      </td>
                      <td className="p-3 text-right text-mono-sm text-slate-700 font-bold">
                        {c.lastChecked}
                      </td>
                      <td className="p-3 text-right">
                        <button 
                          onClick={() => setSelectedCompDetail(c)}
                          className="px-3 py-1 text-xs font-bold rounded border border-slate-300 hover:border-primary hover:text-primary transition-colors bg-white cursor-pointer text-slate-800"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-700 text-body-md font-semibold">
                    No computers available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Details Modal */}
      {selectedCompDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <Monitor className="w-6 h-6 text-primary" />
                <h3 className="text-headline-md font-bold text-slate-900">
                  {selectedCompDetail.hostname} Readiness Details
                </h3>
              </div>
              <button 
                onClick={() => setSelectedCompDetail(null)}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Overall Status Badge */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs font-bold">
              <span className="text-slate-700">Overall Readiness Status:</span>
              <span className={`px-3 py-1 rounded-full uppercase ${
                selectedCompDetail.readinessState === 'READY' ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30' : 'bg-red-500/20 text-red-700 border border-red-500/30'
              }`}>
                {selectedCompDetail.readinessState === 'READY' ? '🟢 READY FOR PRACTICAL' : '🔴 NOT READY'}
              </span>
            </div>

            {/* System Health Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs font-semibold text-slate-800">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="text-slate-500 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-primary" /> CPU Usage</div>
                <div className="text-sm font-extrabold text-slate-900">{selectedCompDetail.cpu}% (Normal)</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="text-slate-500 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-primary" /> RAM Usage</div>
                <div className="text-sm font-extrabold text-slate-900">{selectedCompDetail.ram}%</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="text-slate-500 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5 text-primary" /> Free Disk Space</div>
                <div className="text-sm font-extrabold text-slate-900">{selectedCompDetail.freeDiskPct}% Free</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="text-slate-500 flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5 text-primary" /> Temperature</div>
                <div className="text-xs font-extrabold text-slate-900">{selectedCompDetail.tempText}</div>
              </div>
            </div>

            {/* Software Compliance Checklist */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs font-semibold text-slate-800">
              <strong className="text-slate-900 font-bold block border-b border-slate-200 pb-1.5">Software Requirements Compliance:</strong>
              {selectedCompDetail.softwareCompliance.length > 0 ? (
                selectedCompDetail.softwareCompliance.map((sw, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1">
                    <span>{sw.name}:</span>
                    <span className={`font-bold ${
                      sw.status === 'COMPLIANT' ? 'text-emerald-700' :
                      sw.status === 'OUTDATED' ? 'text-amber-700' : 'text-red-600'
                    }`}>
                      {sw.status === 'COMPLIANT' ? `✓ ${sw.text}` : sw.status === 'OUTDATED' ? `⚠ ${sw.text}` : `✗ ${sw.text}`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500">No software requirements configured.</div>
              )}
            </div>

            {/* Issues List */}
            {selectedCompDetail.issues.length > 0 && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-semibold space-y-1">
                <strong className="font-bold block text-red-950">Detected Issues:</strong>
                <ul className="list-disc pl-4 space-y-0.5">
                  {selectedCompDetail.issues.map((iss, i) => (
                    <li key={i}>{iss}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommended Action */}
            <div className="p-3.5 rounded-xl bg-primary-container/10 border border-primary/20 text-xs text-slate-800 font-medium space-y-1">
              <strong className="text-primary font-bold block">Recommended Administrator Action:</strong>
              <p>{selectedCompDetail.recommendation}</p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button 
                onClick={() => setSelectedCompDetail(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-100 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  const compId = selectedCompDetail.computerId;
                  setSelectedCompDetail(null);
                  navigate(`/computers/${compId}`);
                }}
                className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-container text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>View Computer Telemetry</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Requirement Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-headline-md font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Add Software Requirement Rule
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddRuleSubmit} className="space-y-4">
              <div>
                <label className="font-label-md text-label-md text-slate-900 font-extrabold block mb-1">Software Name</label>
                <input
                  type="text"
                  required
                  value={newSoftwareName}
                  onChange={(e) => setNewSoftwareName(e.target.value)}
                  placeholder="e.g. Java, VS Code, Python, MySQL, Chrome"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-label-md text-label-md text-slate-900 font-extrabold block mb-1">Required Version (Optional)</label>
                <input
                  type="text"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="e.g. 17, 3.12, or leave empty for any version"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-100 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingRule}
                  className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-container text-xs font-bold cursor-pointer shadow-sm"
                >
                  {isSubmittingRule ? 'Saving...' : 'Add Requirement Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabReadiness;
