import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { metricsService, fetchRealApi } from '../services/metricsService';
import { useLab } from '../contexts/LabContext';
import SoftwareDeploymentTab from '../components/SoftwareDeploymentTab';
import { 
  PackageCheck, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw,
  X,
  Send,
  Layers,
  Monitor,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  Rocket
} from 'lucide-react';

const Software = () => {
  const navigate = useNavigate();
  const { currentLab } = useLab();
  const [computers, setComputers] = useState([]);
  const [softwareList, setSoftwareList] = useState([]);
  const [selectedComputerId, setSelectedComputerId] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [selectedSoftwareName, setSelectedSoftwareName] = useState(null);
  const [activeMainTab, setActiveMainTab] = useState('INVENTORY'); // INVENTORY | DEPLOYMENT

  useEffect(() => {
    setSelectedComputerId('ALL');
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, [currentLab?.id]);

  const loadData = async () => {
    try {
      setErrorMsg(null);

      const fetchApi = fetchRealApi || metricsService.fetchRealApi;

      // Fetch computers using lab-scoped API
      const compRes = await metricsService.getAllComputers(currentLab?.id).catch(err => {
        console.warn('[SOFTWARE] Computer API warning:', err);
        return [];
      });

      // Fetch fleet summary
      const fleetRes = await fetchApi('/software/fleet-summary').catch(err => {
        console.warn('[SOFTWARE] Fleet summary API warning:', err);
        return null;
      });

      // Fetch all software fallback
      const allSwRes = await fetchApi('/software/all').catch(err => {
        console.warn('[SOFTWARE] All software API warning:', err);
        return [];
      });

      // Extract computers array safely
      let compList = [];
      if (Array.isArray(compRes)) {
        compList = compRes;
      } else if (compRes && Array.isArray(compRes.data)) {
        compList = compRes.data;
      }

      // Extract software array safely
      let rawSwList = [];
      const fleetData = fleetRes?.data || fleetRes;
      if (fleetData && Array.isArray(fleetData.softwareList) && fleetData.softwareList.length > 0) {
        rawSwList = fleetData.softwareList;
        // Only use fleet computers as fallback if compList was empty
        if (compList.length === 0 && Array.isArray(fleetData.computers) && fleetData.computers.length > 0) {
          compList = fleetData.computers;
        }
      } else if (Array.isArray(allSwRes)) {
        rawSwList = allSwRes;
      } else if (allSwRes && Array.isArray(allSwRes.data)) {
        rawSwList = allSwRes.data;
      }

      let safeCompList = compList.filter(Boolean);

      // Ensure computers are strictly scoped to currentLab if specified
      if (currentLab?.id && currentLab.id !== 'ALL') {
        safeCompList = safeCompList.filter(c => 
          String(c.labId) === String(currentLab.id) ||
          c.labName === currentLab.name ||
          (c.lab && String(c.lab.id) === String(currentLab.id))
        );
      }

      const safeSwList = rawSwList.filter(Boolean).map(item => {
        const matchedComp = safeCompList.find(c => String(c.id) === String(item.computerId) || c.hostname === item.computerHostname);
        return {
          ...item,
          computerId: item.computerId || matchedComp?.id || 'COMP-1',
          computerHostname: item.computerHostname || matchedComp?.hostname || 'LAPTOP-PALBUQS2',
          computerStatus: matchedComp?.status || 'ONLINE'
        };
      });

      setComputers(safeCompList);
      setSoftwareList(safeSwList);
    } catch (err) {
      console.error('[SOFTWARE] Loading error:', err);
      setErrorMsg(`Failed to load software inventory: ${err?.message || err}`);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  // Filter software by selected computer dropdown
  const scopedList = selectedComputerId === 'ALL'
    ? softwareList
    : softwareList.filter(s => {
        if (!s) return false;
        const targetComp = computers.find(c => String(c.id) === String(selectedComputerId));
        return String(s.computerId) === String(selectedComputerId) ||
               (targetComp && s.computerHostname === targetComp.hostname);
      });

  // Group software into package catalog items
  const catalogMap = new Map();
  scopedList.forEach(item => {
    const rawName = item.name || 'Unknown Application';
    let stdName = rawName;
    const lower = rawName.toLowerCase();

    if (lower.includes('openjdk') || lower.includes('java') || lower.includes('jdk') || lower.includes('jre')) {
      stdName = 'Java';
    } else if (lower.includes('python')) {
      stdName = 'Python';
    } else if (lower.includes('visual studio code') || lower.includes('vscode')) {
      stdName = 'Visual Studio Code';
    } else if (lower.includes('mysql')) {
      stdName = 'MySQL Server';
    } else if (lower.includes('chrome')) {
      stdName = 'Google Chrome';
    } else if (lower.includes('winrar')) {
      stdName = 'WinRAR';
    } else if (lower.includes('git')) {
      stdName = 'Git';
    }

    if (!catalogMap.has(stdName)) {
      catalogMap.set(stdName, {
        displayName: stdName,
        fullName: rawName,
        publisher: item.publisher || 'System Publisher',
        versions: new Set(),
        installedComputers: new Set(),
        items: []
      });
    }

    const entry = catalogMap.get(stdName);
    if (item.version) entry.versions.add(item.version);
    if (item.computerHostname) entry.installedComputers.add(item.computerHostname);
    entry.items.push(item);
  });

  const catalogList = Array.from(catalogMap.values());

  // Filter catalog list:
  // If a specific computer is selected, display ALL installed applications for that computer (or filter if query typed).
  // If 'ALL' computers is selected and query is empty, show empty state prompt requiring computer selection or search query.
  const filteredCatalog = selectedComputerId !== 'ALL'
    ? (!searchQuery.trim() ? catalogList : catalogList.filter(pkg => {
        const q = searchQuery.toLowerCase().trim();
        const dName = (pkg.displayName || '').toLowerCase();
        const fName = (pkg.fullName || '').toLowerCase();
        const pub = (pkg.publisher || '').toLowerCase();
        return dName.includes(q) || fName.includes(q) || pub.includes(q);
      }))
    : (!searchQuery.trim() ? [] : catalogList.filter(pkg => {
        const q = searchQuery.toLowerCase().trim();
        const dName = (pkg.displayName || '').toLowerCase();
        const fName = (pkg.fullName || '').toLowerCase();
        const pub = (pkg.publisher || '').toLowerCase();

        if (q === 'java' || q === 'jdk' || q === 'jre' || q === 'openjdk') {
          return dName.includes('java') || fName.includes('openjdk') || fName.includes('jdk') || fName.includes('jre') || fName.includes('java');
        }
        if (q === 'python' || q === 'pyhton' || q === 'pythn') {
          return dName.includes('python') || fName.includes('python');
        }
        if (q === 'vscode' || q === 'vs code' || q === 'code') {
          return dName.includes('visual studio code') || fName.includes('visual studio code') || fName.includes('vscode') || fName.includes('code');
        }
        if (q === 'mysql' || q === 'sql') {
          return dName.includes('mysql') || fName.includes('mysql');
        }
        if (q === 'chrome' || q === 'google chrome') {
          return dName.includes('chrome') || fName.includes('chrome');
        }
        if (q === 'git') {
          return dName.includes('git') || fName.includes('git');
        }

        return dName.includes(q) || fName.includes(q) || pub.includes(q);
      }));

  // Calculate card counts
  const totalComputersCount = computers.length;
  const displayApplicationsCount = (selectedComputerId !== 'ALL' || searchQuery.trim())
    ? filteredCatalog.reduce((acc, p) => acc + p.items.length, 0)
    : 0;

  // Selected Software computer breakdown (e.g. Java)
  const targetSoftwareItems = softwareList.filter(item => {
    if (!selectedSoftwareName) return false;
    const lower = (item.name || '').toLowerCase();
    const targetLower = selectedSoftwareName.toLowerCase();
    if (targetLower === 'java') {
      return lower.includes('java') || lower.includes('openjdk') || lower.includes('jdk') || lower.includes('jre');
    }
    return lower.includes(targetLower);
  });

  const computerBreakdownList = computers.map(comp => {
    const matched = targetSoftwareItems.filter(s => s.computerId === comp.id || s.computerHostname === comp.hostname);
    const installed = matched.length > 0;
    const item = matched[0];
    const hasScan = softwareList.some(s => s.computerId === comp.id || s.computerHostname === comp.hostname);

    let state = 'NOT_INSTALLED';
    if (!hasScan) {
      state = 'UNAVAILABLE';
    } else if (installed) {
      state = 'INSTALLED';
    }

    return {
      computerId: comp.id,
      hostname: comp.hostname,
      status: comp.status,
      state,
      version: item?.version || (hasScan ? 'Not Installed' : 'Scan Pending'),
      publisher: item?.publisher || 'Microsoft / Oracle',
      lastScannedAt: item?.lastScannedAt || comp.lastSeenAt
    };
  });

  const installedCount = computerBreakdownList.filter(c => c.state === 'INSTALLED').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-lowest border border-slate-200 p-6 rounded-xl shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <PackageCheck className="w-8 h-8 text-primary" />
            <h1 className="font-display text-display text-slate-900 tracking-tight font-extrabold">Software Management</h1>
          </div>
          <p className="font-body-md text-body-md text-slate-700 mt-1 font-medium">
            Search application inventory, audit workstation software, or push centralized software deployments to lab computers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 hover:bg-slate-100 hover:text-primary transition-colors flex items-center gap-2 text-xs font-bold shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span>Refresh Inventory</span>
          </button>
        </div>
      </div>

      {/* Main Tab Navigation Bar */}
      <div className="flex border-b border-slate-200 space-x-4">
        <button
          onClick={() => setActiveMainTab('INVENTORY')}
          className={`pb-3 px-4 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeMainTab === 'INVENTORY'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>Software Inventory &amp; Audit</span>
        </button>

        <button
          onClick={() => setActiveMainTab('DEPLOYMENT')}
          className={`pb-3 px-4 text-xs font-extrabold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeMainTab === 'DEPLOYMENT'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Rocket className="w-4 h-4" />
          <span>Centralized Software Deployment</span>
          <span className="px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded-full font-bold">ADMIN</span>
        </button>
      </div>

      {activeMainTab === 'DEPLOYMENT' ? (
        <SoftwareDeploymentTab />
      ) : (
        <>
          {/* Part 1: Top Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in-up">
            {/* Total Computers */}
            <div className="card-elevated p-4 flex flex-col justify-between border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-label-md font-label-md text-slate-700 font-bold">Total Computers</span>
                <Monitor className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-display font-display text-slate-900 font-extrabold">{totalComputersCount}</div>
                <div className="text-body-md font-body-md text-slate-700 mt-0.5 font-semibold">Computers Scanned</div>
              </div>
            </div>

            {/* Total Software Applications */}
            <div className="card-elevated p-4 flex flex-col justify-between border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-label-md font-label-md text-slate-700 font-bold">Software Applications</span>
                <PackageCheck className="w-4 h-4 text-emerald-600 font-bold" />
              </div>
              <div>
                <div className="text-display font-display text-slate-900 font-extrabold">
                  {displayApplicationsCount}
                </div>
                <div className="text-body-md font-body-md text-emerald-700 mt-0.5 font-semibold">
                  {selectedComputerId !== 'ALL' ? 'Installed on Selected Computer' : (searchQuery.trim() ? 'Matching Scanned Records' : 'Select Computer or Search')}
                </div>
              </div>
            </div>
          </div>

          {/* CATALOG VIEW MODE */}
          {!selectedSoftwareName ? (
            <div className="space-y-6">
              {/* Toolbar: Search & Computer Dropdown */}
              <div className="card-elevated p-4 flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-200">
                <div className="relative w-full md:w-96">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search software (e.g. java, python, chrome, git)..."
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-primary shadow-inner"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-label-md font-label-md text-slate-900 font-extrabold">Filter Computer:</span>
                  <select
                    value={selectedComputerId}
                    onChange={(e) => setSelectedComputerId(e.target.value)}
                    className="h-10 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-body-md font-bold text-slate-900 focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Computers ({computers.length})</option>
                    {computers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.hostname} {c.hostname === 'LAPTOP-PALBUQS2' ? '(Your Admin Laptop)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* INSTANT WORKSTATION INSTALLATION STATUS CARD WHEN SEARCHING */}
              {searchQuery.trim() && (
                <div className="card-elevated p-5 border-l-4 border-l-primary border-y border-r border-slate-200 space-y-3 animate-fade-in-up">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-headline-md font-extrabold text-slate-900 flex items-center gap-2">
                      <PackageCheck className="w-5 h-5 text-primary" />
                      Workstation Installation Status for "{searchQuery}"
                    </h4>
                    <span className="text-xs font-bold text-slate-600">
                      Real data across {computers.length} computer(s)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {computers.length > 0 ? (
                      computers.map(comp => {
                        const match = softwareList.find(s => {
                          const isComp = (String(s.computerId) === String(comp.id) || s.computerHostname === comp.hostname);
                          if (!isComp) return false;
                          const rawName = (s.name || '').toLowerCase();
                          const q = searchQuery.toLowerCase().trim();
                          if (q === 'java') {
                            return rawName.includes('java') || rawName.includes('openjdk') || rawName.includes('jdk') || rawName.includes('jre');
                          }
                          return rawName.includes(q);
                        });
                        const hasScan = softwareList.some(s => String(s.computerId) === String(comp.id) || s.computerHostname === comp.hostname);

                        let statusBadge = '🔴 NOT INSTALLED';
                        let badgeStyle = 'bg-red-500/20 text-red-700 border-red-500/30';
                        let versionText = 'Not found on this computer';

                        if (match) {
                          statusBadge = '🟢 INSTALLED';
                          badgeStyle = 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30';
                          versionText = `Version: ${match.version || 'Detected'} (${match.name})`;
                        } else if (!hasScan) {
                          statusBadge = '⚪ INVENTORY UNAVAILABLE';
                          badgeStyle = 'bg-slate-200 text-slate-700 border-slate-300';
                          versionText = 'Waiting for agent scan';
                        }

                        return (
                          <div key={comp.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 text-xs">
                                {comp.hostname} {comp.hostname === 'LAPTOP-PALBUQS2' ? '(Your Admin Laptop)' : ''}
                              </span>
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border uppercase ${badgeStyle}`}>
                                {statusBadge}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-700 font-semibold truncate" title={versionText}>
                              {versionText}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="col-span-3 text-center text-xs font-semibold text-slate-600 p-2">
                        Connecting to workstations...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Software Catalog Table */}
              <div className="card-elevated p-6 border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="font-headline-md text-headline-md font-bold text-slate-900 flex items-center gap-2">
                    <PackageCheck className="w-5 h-5 text-primary" />
                    {selectedComputerId !== 'ALL'
                      ? (searchQuery.trim() 
                          ? `Search Results for "${searchQuery}" (${filteredCatalog.length})` 
                          : `Installed Software on ${computers.find(c => String(c.id) === String(selectedComputerId))?.hostname || 'Selected Computer'} (${filteredCatalog.length})`)
                      : (searchQuery.trim() 
                          ? `Search Results for "${searchQuery}" (${filteredCatalog.length})` 
                          : 'Installed Software Catalog')}
                  </h3>
                  <span className="text-xs text-slate-700 font-bold">
                    {selectedComputerId !== 'ALL'
                      ? 'Showing all applications installed on selected workstation'
                      : (searchQuery.trim() ? 'Click any application row to view computer breakdown details' : 'Select a computer or search to inspect software')}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-label-md font-label-md text-slate-900 font-extrabold">
                        <th className="p-3">Application Name</th>
                        <th className="p-3">Publisher</th>
                        <th className="p-3">Computers Installed</th>
                        <th className="p-3">Detected Version(s)</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-body-md text-body-md text-slate-800 font-medium">
                      {loading ? (
                        <tr>
                          <td colSpan="6" className="p-8 text-center text-slate-700 font-bold space-y-2">
                            <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                            <div>Loading software inventory from backend...</div>
                          </td>
                        </tr>
                      ) : errorMsg ? (
                        <tr>
                          <td colSpan="6" className="p-8 text-center text-red-600 font-bold space-y-2">
                            <AlertTriangle className="w-6 h-6 text-red-600 mx-auto mb-2" />
                            <div>{errorMsg}</div>
                            <button onClick={handleRefresh} className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold cursor-pointer mt-2">
                              Retry Connection
                            </button>
                          </td>
                        </tr>
                      ) : (!searchQuery.trim() && selectedComputerId === 'ALL') ? (
                        /* INITIAL & CLEARED SEARCH MANDATORY EMPTY STATE WHEN ALL COMPUTERS IS SELECTED */
                        <tr>
                          <td colSpan="6" className="p-12 text-center text-slate-600 font-medium space-y-2">
                            <Search className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                            <div className="text-slate-900 font-extrabold text-base">Select a computer from the dropdown above or search for an application.</div>
                            <p className="text-xs text-slate-500 max-w-md mx-auto">
                              Choose a workstation from the "Filter Computer" dropdown to view all software installed on it, or type an application name to search across the lab.
                            </p>
                          </td>
                        </tr>
                      ) : filteredCatalog.length > 0 ? (
                    filteredCatalog.map((pkg, idx) => {
                      const count = pkg.installedComputers.size;

                      return (
                        <tr 
                          key={idx} 
                          onClick={() => setSelectedSoftwareName(pkg.displayName)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="p-3 font-bold text-slate-900 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary-container/20 text-primary flex items-center justify-center font-bold shrink-0">
                              <PackageCheck className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-primary hover:underline font-bold block">{pkg.displayName}</span>
                              {pkg.fullName !== pkg.displayName && (
                                <span className="text-[11px] text-slate-500 font-medium block truncate max-w-xs">{pkg.fullName}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-slate-700 font-semibold">{pkg.publisher}</td>
                          <td className="p-3 font-bold text-slate-900">
                            <span className="text-primary font-extrabold">{count}</span> / {computers.length || 1} Computer(s)
                          </td>
                          <td className="p-3 font-mono-sm text-mono-sm text-slate-700 font-bold">
                            {Array.from(pkg.versions).join(', ') || 'Installed'}
                          </td>
                          <td className="p-3">
                            <span className="font-label-md text-label-md px-2.5 py-0.5 rounded-full font-bold uppercase bg-emerald-500/20 text-emerald-700 border border-emerald-500/30">
                              🟢 Installed
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSoftwareName(pkg.displayName);
                              }}
                              className="px-3 py-1 text-xs font-bold rounded border border-slate-300 hover:border-primary hover:text-primary transition-colors bg-white cursor-pointer text-slate-800 flex items-center gap-1 ml-auto"
                            >
                              <span>View Breakdown</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-slate-700 text-body-md font-semibold space-y-2">
                        <div>No software applications found matching search "{searchQuery}".</div>
                        <button
                          onClick={() => setSearchQuery('')}
                          className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold shadow-sm cursor-pointer hover:bg-primary-container mt-2"
                        >
                          Clear Search
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* COMPUTER BREAKDOWN VIEW MODE */
        <div className="space-y-6 animate-fade-in-up">
          <div className="flex items-center justify-between bg-surface-container-lowest border border-slate-200 p-4 rounded-xl shadow-sm">
            <button
              onClick={() => setSelectedSoftwareName(null)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:text-primary flex items-center gap-2 text-xs font-bold transition-colors cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Software Catalog</span>
            </button>

            <span className="font-mono-sm text-mono-sm text-slate-700 font-bold">
              Software Entity: <strong className="text-primary font-extrabold">{selectedSoftwareName}</strong>
            </span>
          </div>

          <div className="card-elevated p-6 border-l-4 border-l-primary border-y border-r border-slate-200 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center shadow-md shrink-0">
                  <PackageCheck className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900">{selectedSoftwareName}</h2>
                  <p className="text-xs text-slate-700 font-bold mt-0.5">
                    Publisher: <strong className="text-slate-900">Oracle Corporation / Microsoft</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold text-slate-800">
                <span className="px-3 py-1 bg-slate-100 rounded-lg border border-slate-200">
                  Total Installed Workstations: <strong className="text-primary font-extrabold">{installedCount} / {computers.length || 1}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Computer Installation Cards */}
          <div className="space-y-4">
            <h3 className="text-headline-md font-bold text-slate-900 flex items-center gap-2">
              <Monitor className="w-5 h-5 text-primary" />
              Computer Installation Details ({computerBreakdownList.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {computerBreakdownList.map((item, idx) => {
                const isLaptop = item.hostname === 'LAPTOP-PALBUQS2';

                return (
                  <div 
                    key={idx}
                    className={`card-elevated p-5 space-y-3 border ${
                      item.state === 'INSTALLED' 
                        ? 'border-l-4 border-l-emerald-500 border-y border-r border-slate-200' 
                        : item.state === 'OUTDATED'
                        ? 'border-l-4 border-l-amber-500 bg-amber-50/30 border-y border-r border-slate-200'
                        : item.state === 'NOT_INSTALLED'
                        ? 'border-l-4 border-l-red-600 bg-red-50/30 border-y border-r border-slate-200'
                        : 'border-l-4 border-l-slate-400 bg-slate-50 border-y border-r border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2.5">
                        <Monitor className="w-5 h-5 text-slate-700" />
                        <h4 className="font-bold text-slate-900 text-base">
                          {item.hostname} {isLaptop ? '(Your Admin Laptop)' : ''}
                        </h4>
                      </div>

                      <span className={`font-label-md text-label-md px-2.5 py-0.5 rounded-full border uppercase ${
                        item.state === 'INSTALLED'
                          ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30'
                          : item.state === 'OUTDATED'
                          ? 'bg-amber-500/20 text-amber-700 border border-amber-500/30'
                          : item.state === 'NOT_INSTALLED'
                          ? 'bg-red-500/20 text-red-700 border border-red-500/30'
                          : 'bg-slate-200 text-slate-700 border border-slate-300'
                      }`}>
                        {item.state === 'INSTALLED' ? '🟢 INSTALLED' : item.state === 'OUTDATED' ? '🟠 OUTDATED' : item.state === 'NOT_INSTALLED' ? '🔴 NOT INSTALLED' : '⚪ INVENTORY UNAVAILABLE'}
                      </span>
                    </div>

                    {item.state === 'INSTALLED' ? (
                      <div className="space-y-1.5 text-xs text-slate-800 font-medium">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Software Version:</span>
                          <strong className="text-emerald-700 font-bold">{item.version}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Publisher:</span>
                          <span className="font-bold text-slate-900">{item.publisher}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-red-100/60 border border-red-200 rounded-lg text-red-900 font-semibold text-xs">
                        {selectedSoftwareName} was not found on this computer.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default Software;
