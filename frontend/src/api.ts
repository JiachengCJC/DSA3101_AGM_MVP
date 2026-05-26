/**
 * Shared Axios client for backend API calls.
 * Injects the stored JWT into `Authorization` headers and enables credentialed requests for cookie-based flows.
 */
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('agm_token')
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
