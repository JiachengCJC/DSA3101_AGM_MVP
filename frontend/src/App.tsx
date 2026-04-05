import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import ProjectForm from './pages/ProjectForm'
import ImportPage from './pages/Import'
import UserManagement from './pages/UserManagement'
import ChangePassword from './pages/ChangePassword'
import UserDetail from './pages/UserDetail'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  if (!auth.token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRoles({
  roles,
  children,
}: {
  roles: Array<'researcher' | 'management' | 'admin'>
  children: React.ReactNode
}) {
  const auth = useAuth()
  if (!auth.role || !roles.includes(auth.role)) return <Navigate to="/projects" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/projects" replace />} />
        <Route
          path="dashboard"
          element={
            <RequireRoles roles={['management', 'admin']}>
              <Dashboard />
            </RequireRoles>
          }
        />
        <Route
          path="users"
          element={
            <RequireRoles roles={['admin']}>
              <UserManagement />
            </RequireRoles>
          }
        />
        <Route
          path="users/:id"
          element={
            <RequireRoles roles={['admin']}>
              <UserDetail />
            </RequireRoles>
          }
        />
        <Route
          path="import"
          element={
            <RequireRoles roles={['management', 'admin']}>
              <ImportPage />
            </RequireRoles>
          }
        />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/new" element={<ProjectForm />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="projects/:id/edit" element={<ProjectForm />} />
        <Route path="change-password" element={<ChangePassword />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
