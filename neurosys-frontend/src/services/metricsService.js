import api from './api';

const API_BASE = '/api/v1';

/**
 * Resilient API Fetcher with Axios + Native Fetch fallback
 * Guarantees data arrays and HTTP requests (GET, POST, PUT, DELETE) are cleanly handled across all network conditions.
 */
export const fetchRealApi = async (endpoint, options = {}) => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();
  
  // 1. Try Axios Service
  try {
    let res;
    if (method === 'POST') {
      let bodyData = {};
      if (options.body) {
        try {
          bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch (e) {
          bodyData = options.body;
        }
      }
      res = await api.post(path, bodyData);
    } else if (method === 'PUT') {
      let bodyData = {};
      if (options.body) {
        try {
          bodyData = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch (e) {
          bodyData = options.body;
        }
      }
      res = await api.put(path, bodyData);
    } else if (method === 'DELETE') {
      res = await api.delete(path);
    } else {
      res = await api.get(path);
    }

    if (res && res.data !== undefined) {
      return res.data;
    }
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') return res;
  } catch (axiosErr) {
    console.warn(`Axios ${method} call to ${path} failed, attempting direct native fetch...`, axiosErr);
  }

  // 2. Direct Native Fetch Fallback
  try {
    const fetchOptions = {
      method,
      headers: options.headers || { 'Content-Type': 'application/json' },
    };
    if (options.body) {
      fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }
    const rawRes = await fetch(`${API_BASE}${path}`, fetchOptions);
    if (rawRes.ok) {
      const rawData = await rawRes.json();
      if (rawData && rawData.data !== undefined) {
        return rawData.data;
      }
      return rawData;
    }
  } catch (fetchErr) {
    console.error(`Native fetch ${method} to ${API_BASE}${path} failed`, fetchErr);
  }

  return null;
};

export const metricsService = {
  fetchRealApi,
  
  // Computer Management APIs
  getAllComputers: async (labId) => fetchRealApi(labId && labId !== 'ALL' ? `/computers?labId=${labId}` : '/computers'),
  getPendingComputers: async () => fetchRealApi('/computers/pending'),
  getComputerById: async (id) => fetchRealApi(`/computers/${id}`),
  getComputersByLab: async (labName) => fetchRealApi(`/computers/lab/${labName}`),
  getComputersByLabId: async (labId) => fetchRealApi(`/computers?labId=${labId}`),
  approveComputer: async (id) => api.put(`/computers/${id}/approve`),
  rejectComputer: async (id) => api.put(`/computers/${id}/reject`),
  deleteLab: async (id) => fetchRealApi(`/labs/${id}`, { method: 'DELETE' }),

  // Telemetry History & Metrics APIs
  getMetricHistory: async (id, limit = 30) => fetchRealApi(`/agent/metrics/history/${id}?limit=${limit}`),
  getHealthScore: async (id) => fetchRealApi(`/health-score/${id}`),
  getProcesses: async (id, search = '', sortBy = 'cpu', page = 0, size = 10) =>
    fetchRealApi(`/computers/${id}/processes?search=${search}&sortBy=${sortBy}&page=${page}&size=${size}`),
  getFileAnalysis: async (id) => fetchRealApi(`/computers/${id}/file-analyzer/summary`),
  getLogs: async (id, logLevel = '', page = 0, size = 15) =>
    fetchRealApi(`/computers/${id}/logs?logLevel=${logLevel}&page=${page}&size=${size}`),

  // Alert Center APIs
  getAllAlerts: async (labId) => fetchRealApi(labId && labId !== 'ALL' ? `/alerts?labId=${labId}` : '/alerts'),
  getActiveAlerts: async (labId) => fetchRealApi(labId && labId !== 'ALL' ? `/alerts?labId=${labId}` : '/alerts'),
  getComputerAlerts: async (id) => fetchRealApi(`/alerts/computer/${id}`),
  acknowledgeAlert: async (id) => api.put(`/alerts/${id}/acknowledge`),
  resolveAlert: async (id) => api.put(`/alerts/${id}/resolve`),

  // Bulk Remote Power Management API
  bulkPowerAction: async (labId, action, computerIds) => api.post(`/computers/bulk-power?labId=${labId || ''}&action=${action || 'SHUTDOWN'}`, computerIds || []),

  // Remote Power Management APIs
  lockComputer: async (computerId) => api.post(`/computers/${computerId}/lock`, {}),
  restartComputer: async (computerId) => api.post(`/computers/${computerId}/restart`, {}),
  shutdownComputer: async (computerId) => api.post(`/computers/${computerId}/shutdown`, {}),
  sendPowerCommand: async (computerId, commandType) => {
    const endpoint = (commandType || 'SHUTDOWN').toLowerCase();
    return api.post(`/computers/${computerId}/${endpoint}`, {});
  },
  remoteAction: async (computerId, commandType) => {
    const endpoint = (commandType || 'SHUTDOWN').toLowerCase();
    return api.post(`/computers/${computerId}/${endpoint}`, {});
  },
  getPowerAudits: async (computerId) => fetchRealApi(`/computers/${computerId}/power-audits`),

  // AI Performance, Prediction & Diagnosis APIs
  getCrashPrediction: async (id) => fetchRealApi(`/predictions/crash/${id}`),
  evaluateCrashRisk: async (id) => api.post(`/predictions/crash/${id}/evaluate`, {}),
  getAIDiagnosis: async (computerId) => fetchRealApi(`/diagnostics/${computerId}`),
  getAnalyticsSummary: async () => fetchRealApi('/analytics/summary'),
  getAIInsights: async (timeRange = '24h', computerId = '', labId = '') =>
    fetchRealApi(`/analytics/ai-insights?timeRange=${timeRange}&computerId=${computerId || ''}&labId=${labId || ''}`),
  askAiAssistant: async (message, computerId) => api.post('/ai-assistant/chat', { message, computerId }),

  // Centralized Software Deployment APIs
  getDeploymentPackages: async () => fetchRealApi('/admin/deployments/packages'),
  addDeploymentPackage: async (pkg) => fetchRealApi('/admin/deployments/packages', { method: 'POST', body: pkg }),
  createSoftwareDeployment: async (req) => fetchRealApi('/admin/deployments', { method: 'POST', body: req }),
  getAllDeployments: async () => fetchRealApi('/admin/deployments'),
  getDeploymentsByLab: async (labId) => fetchRealApi(`/admin/deployments/lab/${labId}`),
  cancelSoftwareDeployment: async (id) => fetchRealApi(`/admin/deployments/${id}/cancel`, { method: 'POST' }),
};
