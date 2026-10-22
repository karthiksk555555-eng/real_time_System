import React, { useState, useEffect } from 'react';
import { useLab } from '../contexts/LabContext';
import { metricsService } from '../services/metricsService';
import { Building2, Plus, Laptop, RefreshCw, AlertCircle, Check, Trash2 } from 'lucide-react';

const LabManagement = () => {
  const { labs, refreshLabs } = useLab();
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  
  // New Lab Form State
  const [newLabName, setNewLabName] = useState('');
  const [newLabCode, setNewLabCode] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const handleDeleteLab = async (labId, labName) => {
    if (!window.confirm(`Are you sure you want to delete lab "${labName}"? Any workstations assigned to this lab will become unassigned.`)) {
      return;
    }
    try {
      setLoading(true);
      setFormError('');
      setFormSuccess('');
      const res = await metricsService.deleteLab(labId);
      if (res?.success === false) {
        setFormError(res?.message || 'Failed to delete lab.');
        return;
      }
      setFormSuccess(`✓ Lab "${labName}" deleted successfully!`);
      await refreshLabs();
      await fetchUnassigned();
    } catch (err) {
      setFormError(err.message || 'Failed to delete lab.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnassigned();
  }, []);

  const fetchUnassigned = async () => {
    try {
      const res = await metricsService.fetchRealApi('/labs/unassigned-computers');
      const list = Array.isArray(res) ? res : (res?.data || []);
      setUnassigned(list);
    } catch (e) {
      console.error('Failed to fetch unassigned computers', e);
    }
  };

  const handleRefreshClick = async () => {
    try {
      setIsRefreshing(true);
      setRefreshSuccess(false);
      await refreshLabs();
      await fetchUnassigned();
      setRefreshSuccess(true);
      setTimeout(() => setRefreshSuccess(false), 3000);
    } catch (e) {
      console.error('Error refreshing data', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateLab = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!newLabName || !newLabCode || !newLocation) {
      setFormError('Lab Name, Lab Code, and Location are required.');
      return;
    }

    try {
      setLoading(true);
      const res = await metricsService.fetchRealApi('/labs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newLabName.trim(),
          code: newLabCode.trim().toUpperCase(),
          location: newLocation.trim(),
          description: newDescription.trim()
        })
      });

      if (res?.success === false || res?.status >= 400) {
        setFormError(res?.message || 'Lab code already exists.');
        return;
      }

      setFormSuccess(`✓ Lab "${newLabName.trim()}" created successfully!`);
      setNewLabName('');
      setNewLabCode('');
      setNewLocation('');
      setNewDescription('');
      await refreshLabs();
    } catch (err) {
      setFormError(err.message || 'Lab code already exists.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignLab = async (computerId, targetLabId) => {
    if (!targetLabId) return;
    try {
      await metricsService.fetchRealApi(`/labs/assign-computer/${computerId}/to/${targetLabId}`, {
        method: 'PUT'
      });
      fetchUnassigned();
      refreshLabs();
    } catch (e) {
      alert('Failed to assign computer to lab.');
    }
  };

  return (
    <div className="p-gutter space-y-6 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-outline-variant pb-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-on-surface flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            <span>Laboratories Management</span>
          </h1>
          <p className="text-secondary text-xs font-medium mt-1">
            Create computer labs, manage campus rooms, and assign workstations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {refreshSuccess && (
            <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-300 animate-fade-in-up">
              ✓ Data refreshed successfully.
            </span>
          )}
          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="px-3.5 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-outline-variant"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Loading...' : 'Refresh Data'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Create Lab Form */}
        <div className="lg:col-span-5 space-y-6">
          <div className="card-elevated p-6 bg-surface-container-lowest border border-outline-variant rounded-2xl space-y-4 shadow-sm">
            <div className="border-b border-outline-variant pb-3">
              <h2 className="font-headline-md text-base font-bold text-on-surface flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" />
                <span>Create New Computer Lab</span>
              </h2>
              <p className="text-xs text-secondary mt-0.5 font-medium">Add a new laboratory room to your campus infrastructure.</p>
            </div>

            {formError && (
              <div className="p-3 bg-red-100 border border-red-300 text-red-800 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateLab} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-secondary block mb-1">Lab Name *</label>
                <input
                  type="text"
                  required
                  value={newLabName}
                  onChange={(e) => setNewLabName(e.target.value)}
                  placeholder="e.g. Computer Lab 4"
                  className="w-full px-3.5 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-semibold focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-secondary block mb-1">Lab Code *</label>
                <input
                  type="text"
                  required
                  value={newLabCode}
                  onChange={(e) => setNewLabCode(e.target.value)}
                  placeholder="e.g. LAB-004"
                  className="w-full px-3.5 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-semibold focus:outline-none focus:border-primary uppercase"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-secondary block mb-1">Location *</label>
                <input
                  type="text"
                  required
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="e.g. Building C, Room 301"
                  className="w-full px-3.5 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-semibold focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-secondary block mb-1">Description</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows="2"
                  placeholder="Optional notes or laboratory details..."
                  className="w-full px-3.5 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-semibold focus:outline-none focus:border-primary"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary hover:bg-primary-container text-white font-bold text-xs rounded-xl shadow-md shadow-primary/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{loading ? 'Creating...' : 'Create Computer Lab'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Labs Table & Unassigned Workstations */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Active Labs List */}
          <div className="card-elevated p-6 bg-surface-container-lowest border border-outline-variant rounded-2xl space-y-4 shadow-sm">
            <div className="border-b border-outline-variant pb-3 flex items-center justify-between">
              <div>
                <h2 className="font-headline-md text-base font-bold text-on-surface">Configured Laboratories</h2>
                <p className="text-xs text-secondary mt-0.5 font-medium">Active campus laboratory rooms and workstation counts.</p>
              </div>
              <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                {labs.length} Active Labs
              </span>
            </div>

            <div className="space-y-3">
              {labs.map((lab) => (
                <div
                  key={lab.id}
                  className="p-4 bg-surface-container-low rounded-xl border border-outline-variant flex items-center justify-between gap-4 group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-on-surface">{lab.name}</span>
                      <span className="text-[10px] font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                        {lab.code}
                      </span>
                    </div>
                    <p className="text-[11px] text-secondary font-medium">
                      📍 {lab.location || 'College Campus'} • 💻 {lab.totalComputers || 0} Workstations
                    </p>
                  </div>

                  <button
                    onClick={() => handleDeleteLab(lab.id, lab.name)}
                    disabled={loading}
                    title={`Delete ${lab.name}`}
                    className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Unassigned Workstations View */}
          {unassigned.length > 0 && (
            <div className="card-elevated p-6 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-4 shadow-sm">
              <div className="border-b border-amber-200 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-headline-md text-base font-bold text-amber-950 flex items-center gap-2">
                    <Laptop className="w-5 h-5 text-amber-700" />
                    <span>Unassigned Workstations ({unassigned.length})</span>
                  </h2>
                  <p className="text-xs text-amber-800 mt-0.5 font-medium">
                    Registered computers requiring assignment to a specific laboratory room.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {unassigned.map((pc) => (
                  <div
                    key={pc.id}
                    className="p-3.5 bg-white rounded-xl border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{pc.computerName || pc.hostname}</span>
                      <span className="text-[11px] font-mono text-slate-500 block">AgentID: {pc.agentId} • IP: {pc.ipAddress}</span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <select
                        onChange={(e) => handleAssignLab(pc.id, e.target.value)}
                        defaultValue=""
                        className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-primary cursor-pointer w-full sm:w-auto"
                      >
                        <option value="" disabled>Assign to Lab...</option>
                        {labs.map(l => (
                          <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default LabManagement;
