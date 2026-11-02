import React, { useState, useEffect } from 'react';
import { metricsService } from '../services/metricsService';
import { useLab } from '../contexts/LabContext';
import { 
  Rocket, 
  Package, 
  Monitor, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  AlertTriangle, 
  StopCircle, 
  CheckSquare, 
  Square,
  Layers,
  ChevronDown,
  ChevronUp,
  DownloadCloud,
  FileCode,
  ShieldCheck,
  Plus
} from 'lucide-react';

const SoftwareDeploymentTab = () => {
  const { currentLab, labs } = useLab();
  
  const [packages, setPackages] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [labComputers, setLabComputers] = useState([]);
  
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [selectedLabId, setSelectedLabId] = useState(
    currentLab?.id && currentLab.id !== 'ALL' ? currentLab.id : ''
  );
  const [selectedComputerIds, setSelectedComputerIds] = useState([]);
  const [expirationHours, setExpirationHours] = useState(24);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Custom Software Package Modal State
  const [addPackageModalOpen, setAddPackageModalOpen] = useState(false);
  const [newPkgName, setNewPkgName] = useState('');
  const [newPkgVersion, setNewPkgVersion] = useState('');
  const [newPkgUrl, setNewPkgUrl] = useState('');
  const [newPkgType, setNewPkgType] = useState('EXE');
  const [newPkgSilentArgs, setNewPkgSilentArgs] = useState('/S');
  const [newPkgChecksum, setNewPkgChecksum] = useState('');
  const [addingPackage, setAddingPackage] = useState(false);

  // Instant Direct Link Deploy State
  const [directUrl, setDirectUrl] = useState('');
  const [directAppName, setDirectAppName] = useState('');

  // Keep selectedLabId in sync with valid lab (never allow 'ALL' as deployment target)
  useEffect(() => {
    if (labs && labs.length > 0) {
      if (currentLab?.id && currentLab.id !== 'ALL') {
        setSelectedLabId(currentLab.id);
      } else if (!selectedLabId || selectedLabId === 'ALL') {
        setSelectedLabId(labs[0].id);
      }
    }
  }, [currentLab?.id, labs]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadDeployments, 3000);
    return () => clearInterval(interval);
  }, [selectedLabId]);

  useEffect(() => {
    if (selectedLabId) {
      loadLabComputers(selectedLabId);
    }
  }, [selectedLabId]);

  const loadData = async () => {
    setLoading(true);
    try {
      setErrorMsg(null);
      const [pkgsRes, depsRes] = await Promise.all([
        metricsService.getDeploymentPackages().catch(err => {
          console.warn('[DEPLOYMENT] Failed to fetch packages:', err);
          return [];
        }),
        loadDeployments()
      ]);

      const pkgList = Array.isArray(pkgsRes) ? pkgsRes : (pkgsRes?.data || []);
      setPackages(pkgList);
      if (pkgList.length > 0 && !selectedPackageId) {
        setSelectedPackageId(pkgList[0].id);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to load deployment data');
    } finally {
      setLoading(false);
    }
  };

  const loadDeployments = async () => {
    try {
      const res = selectedLabId && selectedLabId !== 'ALL'
        ? await metricsService.getDeploymentsByLab(selectedLabId)
        : await metricsService.getAllDeployments();

      const depList = Array.isArray(res) ? res : (res?.data || []);
      setDeployments(depList);

      if (selectedDeployment) {
        const updated = depList.find(d => d.id === selectedDeployment.id);
        if (updated) setSelectedDeployment(updated);
      }
      return depList;
    } catch (err) {
      console.warn('[DEPLOYMENT] Error loading deployments:', err);
      return [];
    }
  };

  const loadLabComputers = async (labId) => {
    try {
      const compsRes = await metricsService.getAllComputers(labId);
      const compList = Array.isArray(compsRes) ? compsRes : (compsRes?.data || []);
      setLabComputers(compList);
      setSelectedComputerIds([]); // default all selected
    } catch (err) {
      console.warn('[DEPLOYMENT] Error loading lab computers:', err);
    }
  };

  const handleToggleComputer = (compId) => {
    if (selectedComputerIds.includes(compId)) {
      setSelectedComputerIds(selectedComputerIds.filter(id => id !== compId));
    } else {
      setSelectedComputerIds([...selectedComputerIds, compId]);
    }
  };

  const handleSelectAllComputers = () => {
    if (selectedComputerIds.length === labComputers.length) {
      setSelectedComputerIds([]);
    } else {
      setSelectedComputerIds(labComputers.map(c => c.id));
    }
  };

  const handleCreateDeployment = async () => {
    let targetLab = selectedLabId;
    if (!targetLab || targetLab === 'ALL') {
      if (labs && labs.length > 0) {
        targetLab = labs[0].id;
      } else {
        setErrorMsg('Please select a target lab.');
        return;
      }
    }

    if (selectedPackageId === 'CUSTOM_LINK') {
      if (!directUrl || !directUrl.trim()) {
        setErrorMsg('Please enter the direct installer download URL.');
        return;
      }
      const trimmedUrl = directUrl.trim();
      if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
        setErrorMsg('Please enter a valid URL starting with http:// or https://');
        return;
      }
    } else if (!selectedPackageId) {
      setErrorMsg('Please select a software package or choose Direct Link Deploy.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let reqPayload;
      if (selectedPackageId === 'CUSTOM_LINK') {
        reqPayload = {
          customInstallerUrl: directUrl.trim(),
          customAppName: directAppName.trim() || undefined,
          labId: targetLab,
          computerIds: selectedComputerIds.length > 0 ? selectedComputerIds : null,
          expirationHours: Number(expirationHours) || 24
        };
      } else {
        reqPayload = {
          softwarePackageId: selectedPackageId,
          labId: targetLab,
          computerIds: selectedComputerIds.length > 0 ? selectedComputerIds : null,
          expirationHours: Number(expirationHours) || 24
        };
      }

      const res = await metricsService.createSoftwareDeployment(reqPayload);
      setConfirmModalOpen(false);
      setSuccessMsg('Software deployment task created and dispatched to agents!');
      setSelectedComputerIds([]);
      if (selectedPackageId === 'CUSTOM_LINK') {
        setDirectUrl('');
        setDirectAppName('');
      }
      await loadDeployments();
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to create deployment task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCustomPackage = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newPkgName.trim() || !newPkgUrl.trim()) {
      setErrorMsg('Please enter Application Name and Installer Download URL.');
      return;
    }

    setAddingPackage(true);
    setErrorMsg(null);
    try {
      const url = newPkgUrl.trim();
      const detectedType = (newPkgType || (url.toLowerCase().includes('.msi') ? 'MSI' : 'EXE'));
      const detectedArgs = newPkgSilentArgs.trim() || (detectedType === 'MSI' ? '/qn /norestart' : '/S');
      const versionVal = newPkgVersion.trim() || 'Latest';

      const pkgPayload = {
        name: newPkgName.trim(),
        version: versionVal,
        installerUrl: url,
        installerType: detectedType,
        silentArguments: detectedArgs,
        checksum: newPkgChecksum.trim() || null,
        supportedOs: 'Windows',
        active: true
      };

      const createdRes = await metricsService.addDeploymentPackage(pkgPayload);
      const createdPkg = createdRes?.data || createdRes;

      setSuccessMsg(`Custom application "${newPkgName.trim()}" registered successfully!`);
      setAddPackageModalOpen(false);

      // Reset form
      setNewPkgName('');
      setNewPkgVersion('');
      setNewPkgUrl('');
      setNewPkgChecksum('');
      setNewPkgSilentArgs('/S');

      // Reload packages and set active
      const pkgsRes = await metricsService.getDeploymentPackages().catch(() => []);
      const pkgList = Array.isArray(pkgsRes) ? pkgsRes : (pkgsRes?.data || []);
      setPackages(pkgList);
      if (createdPkg?.id) {
        setSelectedPackageId(createdPkg.id);
      } else if (pkgList.length > 0) {
        setSelectedPackageId(pkgList[pkgList.length - 1].id);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to register custom software package');
    } finally {
      setAddingPackage(false);
    }
  };

  const handleCancelDeployment = async (depId) => {
    if (!window.confirm('Are you sure you want to cancel this deployment task? Pending/Downloading agents will abort.')) {
      return;
    }
    try {
      await metricsService.cancelSoftwareDeployment(depId);
      setSuccessMsg('Deployment task cancelled.');
      loadDeployments();
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to cancel deployment');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold border border-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold border border-blue-300 flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> In Progress</span>;
      case 'PARTIALLY_COMPLETED':
        return <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold border border-amber-300 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Partially Done</span>;
      case 'FAILED':
        return <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold border border-red-300 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Failed</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-full text-xs font-bold border border-slate-300 flex items-center gap-1"><StopCircle className="w-3.5 h-3.5" /> Cancelled</span>;
      default:
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-200 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Pending</span>;
    }
  };

  const getTargetStatusBadge = (status) => {
    switch (status) {
      case 'INSTALLED':
        return <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-700 rounded-full text-[11px] font-bold border border-emerald-500/30">🟢 INSTALLED</span>;
      case 'ALREADY_INSTALLED':
        return <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-800 rounded-full text-[11px] font-bold border border-cyan-500/30">🔵 ALREADY INSTALLED</span>;
      case 'DOWNLOADING':
        return <span className="px-2 py-0.5 bg-blue-500/20 text-blue-800 rounded-full text-[11px] font-bold border border-blue-500/30 animate-pulse">⏬ DOWNLOADING</span>;
      case 'INSTALLING':
        return <span className="px-2 py-0.5 bg-purple-500/20 text-purple-800 rounded-full text-[11px] font-bold border border-purple-500/30 animate-pulse">⚙️ INSTALLING</span>;
      case 'FAILED':
        return <span className="px-2 py-0.5 bg-red-500/20 text-red-700 rounded-full text-[11px] font-bold border border-red-500/30">🔴 FAILED</span>;
      case 'CANCELLED':
        return <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full text-[11px] font-bold border border-slate-300">⚪ CANCELLED</span>;
      case 'OFFLINE':
        return <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-[11px] font-bold border border-gray-300">⚠️ EXPIRED / OFFLINE</span>;
      default:
        return <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[11px] font-bold border border-amber-200">⏳ PENDING</span>;
    }
  };

  const activePkg = packages.find(p => p.id === selectedPackageId);
  const activeLab = labs?.find(l => l.id === selectedLabId);

  return (
    <div className="space-y-6">
      {/* Top Banner Alert / Success Notifications */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 font-bold text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-300 rounded-xl text-red-900 font-bold text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-700 hover:text-red-900 cursor-pointer font-bold">✕</button>
        </div>
      )}

      {/* 1-Click Quick Deploy Popular Apps Library */}
      <div className="card-elevated p-5 border border-slate-200 space-y-3 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" />
            <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">⚡ 1-Click Quick Deploy Popular Applications</h4>
          </div>
          <span className="text-[11px] text-slate-500 font-semibold">Click any app to auto-select for deployment</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { name: 'Google Chrome', icon: '🌐', color: 'hover:border-blue-400 hover:bg-blue-50' },
            { name: 'Visual Studio Code', icon: '💻', color: 'hover:border-sky-400 hover:bg-sky-50' },
            { name: 'Python 3.12', icon: '🐍', color: 'hover:border-emerald-400 hover:bg-emerald-50' },
            { name: 'VLC Media Player', icon: '🎬', color: 'hover:border-amber-400 hover:bg-amber-50' },
            { name: 'Git for Windows', icon: '📦', color: 'hover:border-orange-400 hover:bg-orange-50' },
            { name: 'Notepad++', icon: '📝', color: 'hover:border-emerald-400 hover:bg-emerald-50' },
            { name: '7-Zip', icon: '🗜️', color: 'hover:border-indigo-400 hover:bg-indigo-50' },
            { name: 'Zoom Meetings', icon: '🎥', color: 'hover:border-blue-400 hover:bg-blue-50' },
            { name: 'WinRAR', icon: '🗄️', color: 'hover:border-purple-400 hover:bg-purple-50' }
          ].map((app) => {
            const matchedPkg = packages.find(p => p.name.toLowerCase().includes(app.name.toLowerCase().split(' ')[0]));
            const isSelected = activePkg && activePkg.name.toLowerCase().includes(app.name.toLowerCase().split(' ')[0]);

            return (
              <button
                key={app.name}
                type="button"
                onClick={() => {
                  if (matchedPkg) {
                    setSelectedPackageId(matchedPkg.id);
                  }
                }}
                className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                  isSelected 
                    ? 'border-primary bg-primary text-white shadow-md' 
                    : `bg-white text-slate-800 border-slate-200 ${app.color}`
                }`}
              >
                <span>{app.icon}</span>
                <span>{app.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Deploy Software Form Card */}
      <div className="card-elevated p-6 border border-slate-200 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold shadow-md">
              <Rocket className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-headline-md text-headline-md font-extrabold text-slate-900">Create Software Deployment Task</h3>
              <p className="text-xs text-slate-600 font-semibold">Distribute approved software installers directly to real Windows agents in selected labs</p>
            </div>
          </div>
          <span className="text-xs font-extrabold px-3 py-1 bg-primary-container/20 text-primary rounded-lg border border-primary/20">
            ADMIN CENTRAL DEPLOYER
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 1. Software Package Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-primary" />
                1. Software Package:
              </label>
              <button
                type="button"
                onClick={() => setAddPackageModalOpen(true)}
                className="px-2 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom App</span>
              </button>
            </div>
            <select
              value={selectedPackageId}
              onChange={(e) => setSelectedPackageId(e.target.value)}
              className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-primary shadow-sm"
            >
              <option value="CUSTOM_LINK">🔗 Direct Download Link / URL (Instant Deploy)</option>
              {packages.map(pkg => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} v{pkg.version} ({pkg.installerType})
                </option>
              ))}
            </select>

            {selectedPackageId === 'CUSTOM_LINK' ? (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 text-xs">
                <div className="space-y-1">
                  <label className="font-extrabold text-blue-900 block">Direct Download Link (.exe or .msi) *</label>
                  <input
                    type="url"
                    required
                    placeholder="https://example.com/software.exe"
                    value={directUrl}
                    onChange={(e) => setDirectUrl(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-primary shadow-sm"
                  />
                  <p className="text-[10px] text-slate-500 font-medium">Direct URL to installer. Auto-detects EXE or MSI silently.</p>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">App Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Custom Software Tool"
                    value={directAppName}
                    onChange={(e) => setDirectAppName(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-primary shadow-sm"
                  />
                </div>
              </div>
            ) : activePkg && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  SHA-256 Checksum Verified
                </div>
                <div className="truncate text-slate-500 font-mono text-[10px]" title={activePkg.checksum}>
                  {activePkg.checksum}
                </div>
                <div className="text-slate-600 font-medium">Silent Args: <code className="bg-slate-200 px-1 rounded font-bold text-slate-800">{activePkg.silentArguments || '/S'}</code></div>
              </div>
            )}
          </div>

          {/* 2. Target Lab Selector */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-primary" />
              2. Target Computer Lab:
            </label>
            <select
              value={selectedLabId}
              onChange={(e) => setSelectedLabId(e.target.value)}
              className="w-full h-11 px-3 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-primary shadow-sm"
            >
              {labs?.map(lab => (
                <option key={lab.id} value={lab.id}>
                  {lab.name || lab.labName} ({lab.code || 'ACTIVE'})
                </option>
              ))}
            </select>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 space-y-1">
              <div className="font-bold text-slate-900">Lab Computers: {labComputers.length} Registered Host(s)</div>
              <div className="text-slate-600 font-medium">
                {selectedComputerIds.length === 0 
                  ? `Targeting ALL ${labComputers.length} computers in this lab` 
                  : `Targeting ${selectedComputerIds.length} custom selected computer(s)`}
              </div>
            </div>
          </div>

          {/* 3. Computer Selection & Task Expiration */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <Monitor className="w-4 h-4 text-primary" />
              3. Computer Isolation & Expiration:
            </label>
            
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800">Target Computers:</span>
                <button
                  type="button"
                  onClick={handleSelectAllComputers}
                  className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                >
                  {selectedComputerIds.length === labComputers.length ? 'Clear Selection' : 'Select All'}
                </button>
              </div>

              <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1">
                {labComputers.length > 0 ? (
                  labComputers.map(comp => {
                    const isSelected = selectedComputerIds.includes(comp.id) || selectedComputerIds.length === 0;
                    return (
                      <div
                        key={comp.id}
                        onClick={() => handleToggleComputer(comp.id)}
                        className={`flex items-center justify-between p-1.5 rounded cursor-pointer text-xs font-bold transition-colors ${
                          isSelected ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-white text-slate-600 border border-slate-200'
                        }`}
                      >
                        <span className="truncate">{comp.hostname}</span>
                        <span className={`text-[10px] px-1.5 rounded ${comp.status === 'ONLINE' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                          {comp.status}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-[11px] text-slate-500 font-semibold text-center py-2">No computers found in lab</div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">Offline Expiry:</span>
                <select
                  value={expirationHours}
                  onChange={(e) => setExpirationHours(e.target.value)}
                  className="h-8 px-2 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800"
                >
                  <option value={12}>12 Hours</option>
                  <option value={24}>24 Hours</option>
                  <option value={48}>48 Hours</option>
                  <option value={72}>72 Hours</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={() => setConfirmModalOpen(true)}
            disabled={
              submitting ||
              (selectedPackageId === 'CUSTOM_LINK' ? !directUrl.trim() : !selectedPackageId) ||
              labComputers.length === 0
            }
            className="px-6 py-3 bg-primary hover:bg-primary-container text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Rocket className="w-4 h-4" />
            <span>Deploy Package to Lab ({selectedComputerIds.length === 0 ? labComputers.length : selectedComputerIds.length} Target Host(s))</span>
          </button>
        </div>
      </div>

      {/* CONFIRMATION DEPLOYMENT MODAL */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl border border-slate-200 animate-fade-in-up">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
                <Rocket className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Confirm Software Deployment</h3>
                <p className="text-xs text-slate-600 font-semibold">Review parameters before dispatching task</p>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-600">Software Package:</span>
                <strong className="text-primary font-extrabold">
                  {selectedPackageId === 'CUSTOM_LINK'
                    ? (directAppName.trim() || 'Direct Installer Link')
                    : `${activePkg?.name} v${activePkg?.version}`}
                </strong>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-600">Installer Type &amp; Url:</span>
                <span className="font-mono text-slate-900 font-bold truncate max-w-xs" title={selectedPackageId === 'CUSTOM_LINK' ? directUrl : activePkg?.installerUrl}>
                  {selectedPackageId === 'CUSTOM_LINK'
                    ? `${directUrl.toLowerCase().includes('.msi') ? 'MSI' : 'EXE'} (${directUrl})`
                    : `${activePkg?.installerType} (${activePkg?.installerUrl})`}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-600">Target Lab:</span>
                <strong className="text-slate-900 font-bold">{activeLab?.name || activeLab?.labName || 'Computer Lab'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Target Computers:</span>
                <strong className="text-emerald-700 font-extrabold">
                  {selectedComputerIds.length === 0 ? labComputers.length : selectedComputerIds.length} Eligible Machine(s)
                </strong>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 font-medium">
              Upon confirmation, the task will be pushed to all eligible online agents in the target lab. Each Windows agent will download the installer, verify SHA-256 checksum, and execute silent installation.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={handleCreateDeployment}
                disabled={submitting}
                className="px-5 py-2.5 bg-primary hover:bg-primary-container text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-md cursor-pointer"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                <span>Confirm &amp; Dispatch Task</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DEPLOYMENT HISTORY TABLE */}
      <div className="card-elevated p-6 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <h3 className="font-headline-md text-headline-md font-bold text-slate-900">Recent Software Deployment Tasks</h3>
          </div>
          <button
            onClick={loadDeployments}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 hover:text-primary transition-colors flex items-center gap-1.5 text-xs font-bold shadow-sm cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Tasks</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-label-md font-label-md text-slate-900 font-extrabold">
                <th className="p-3">Deployment #</th>
                <th className="p-3">Package Name</th>
                <th className="p-3">Target Lab</th>
                <th className="p-3">Overall Status</th>
                <th className="p-3">Target Progress</th>
                <th className="p-3">Created By</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-body-md text-body-md text-slate-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-600 font-bold">
                    <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                    Loading deployment tasks...
                  </td>
                </tr>
              ) : deployments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-600 font-medium">
                    No software deployment tasks recorded yet. Use the form above to dispatch software installers to lab computers.
                  </td>
                </tr>
              ) : (
                deployments.map(dep => {
                  const pct = dep.totalTargets > 0 ? Math.round((dep.completedTargets / dep.totalTargets) * 100) : 0;

                  return (
                    <tr key={dep.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono text-xs font-bold text-primary">{dep.deploymentNumber}</td>
                      <td className="p-3 font-bold text-slate-900">
                        {dep.softwarePackage?.name} <span className="text-slate-500 text-xs font-normal">v{dep.softwarePackage?.version}</span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{dep.labName}</td>
                      <td className="p-3">{getStatusBadge(dep.status)}</td>
                      <td className="p-3 w-44">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-bold text-slate-700">
                            <span>{dep.completedTargets} / {dep.totalTargets} Done</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${
                                dep.status === 'COMPLETED' ? 'bg-emerald-500' : dep.status === 'FAILED' ? 'bg-red-500' : 'bg-primary'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-xs font-semibold text-slate-600">{dep.createdByUser}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedDeployment(dep);
                              setDetailModalOpen(true);
                            }}
                            className="px-3 py-1 bg-white border border-slate-300 hover:border-primary hover:text-primary rounded text-xs font-bold transition-colors cursor-pointer text-slate-800"
                          >
                            Inspect Targets
                          </button>

                          {(dep.status === 'PENDING' || dep.status === 'IN_PROGRESS') && (
                            <button
                              onClick={() => handleCancelDeployment(dep.id)}
                              className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 rounded text-xs font-bold transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INSPECT TARGET COMPUTERS MODAL */}
      {detailModalOpen && selectedDeployment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 space-y-6 shadow-2xl border border-slate-200 animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-primary" />
                  Deployment Details: {selectedDeployment.deploymentNumber}
                </h3>
                <p className="text-xs text-slate-600 font-semibold mt-0.5">
                  Package: <strong className="text-primary">{selectedDeployment.softwarePackage?.name} v{selectedDeployment.softwarePackage?.version}</strong> | Lab: <strong>{selectedDeployment.labName}</strong>
                </p>
              </div>

              <button
                onClick={() => setDetailModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Target Computer Status Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Target Computer Statuses</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-label-md font-label-md text-slate-900 font-extrabold">
                      <th className="p-3">Computer / Hostname</th>
                      <th className="p-3">IP Address</th>
                      <th className="p-3">Target Status</th>
                      <th className="p-3">Status Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs font-semibold text-slate-800">
                    {selectedDeployment.targets?.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{t.hostname || t.computerName}</td>
                        <td className="p-3 font-mono text-slate-600">{t.ipAddress || '10.33.199.161'}</td>
                        <td className="p-3">{getTargetStatusBadge(t.status)}</td>
                        <td className="p-3 text-slate-600 max-w-xs truncate" title={t.statusDetail}>
                          {t.statusDetail || 'Pending agent polling'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setDetailModalOpen(false)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl font-bold text-xs cursor-pointer hover:bg-slate-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CUSTOM SOFTWARE PACKAGE MODAL */}
      {addPackageModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-6 shadow-2xl border border-slate-200 animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Register Custom Application / Software Installer</h3>
                  <p className="text-xs text-slate-600 font-semibold">Add any custom Windows software (.exe or .msi) to deploy to lab computers</p>
                </div>
              </div>

              <button
                onClick={() => setAddPackageModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomPackage} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Application Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. VLC Media Player"
                    value={newPkgName}
                    onChange={(e) => setNewPkgName(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Version *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 3.0.20"
                    value={newPkgVersion}
                    onChange={(e) => setNewPkgVersion(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">Direct Download URL (.exe or .msi) *</label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com/download/installer.exe"
                  value={newPkgUrl}
                  onChange={(e) => setNewPkgUrl(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-primary"
                />
                <p className="text-[11px] text-slate-500 font-medium">Must be a direct HTTP/HTTPS URL accessible by target workstation agents.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Installer Type *</label>
                  <select
                    value={newPkgType}
                    onChange={(e) => {
                      const t = e.target.value;
                      setNewPkgType(t);
                      if (t === 'MSI') setNewPkgSilentArgs('/qn /norestart');
                      else setNewPkgSilentArgs('/S');
                    }}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:border-primary"
                  >
                    <option value="EXE">EXE Executable Installer</option>
                    <option value="MSI">MSI Windows Installer Package</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Silent Installation Arguments</label>
                  <input
                    type="text"
                    placeholder={newPkgType === 'MSI' ? '/qn /norestart' : '/S'}
                    value={newPkgSilentArgs}
                    onChange={(e) => setNewPkgSilentArgs(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-slate-500">e.g. <code>/S</code> or <code>/silent</code> or <code>/qn /norestart</code></p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">SHA-256 Hash Checksum (Optional)</label>
                <input
                  type="text"
                  placeholder="Optional 64-character SHA-256 hex string..."
                  value={newPkgChecksum}
                  onChange={(e) => setNewPkgChecksum(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAddPackageModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={addingPackage}
                  className="px-5 py-2.5 bg-primary hover:bg-primary-container text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {addingPackage ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>Save &amp; Add to Catalog</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoftwareDeploymentTab;
