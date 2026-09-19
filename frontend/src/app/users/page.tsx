'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import FloatingToast from '@/components/FloatingToast';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { User, Role, UserListResult } from '@/types/auth';
import { api, ApiError } from '@/lib/api';
import {
  Users,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Mail,
  Lock,
  User as UserIcon,
  Shield,
  Pencil,
  Trash2,
} from 'lucide-react';

export default function UsersPage() {
  const { role, user: currentUser } = useAuth();
  const { t, language } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userRole, setUserRole] = useState<Role>('warehouse_staff');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<UserListResult>('/users?page=1&limit=50');
      if (res.success && res.data) {
        setUsers(res.data.users || []);
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to fetch user list');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Edit Form States
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<Role>('warehouse_staff');
  const [editIsActive, setEditIsActive] = useState(true);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete State
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditPassword('');
    setEditRole(u.role);
    setEditIsActive(u.is_active);
    setEditError(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);
    setIsEditSubmitting(true);

    try {
      const payload: any = {
        name: editName,
        email: editEmail,
        role: editRole,
        is_active: editIsActive,
      };
      if (editPassword.trim()) {
        payload.password = editPassword;
      }

      const res = await api.put<User>(`/users/${editingUser.id}`, payload);
      if (res.success) {
        setSuccessMsg(
          language === 'id'
            ? `Pengguna ${editName} berhasil diperbarui!`
            : `User ${editName} successfully updated!`
        );
        setEditingUser(null);
        fetchUsers();
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setEditError(err.message);
      } else {
        setEditError('Failed to update user');
      }
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setDeleteError(null);
    setIsDeleting(true);

    try {
      const res = await api.delete(`/users/${deletingUser.id}`);
      if (res.success) {
        setSuccessMsg(
          language === 'id'
            ? `Pengguna ${deletingUser.name} berhasil dihapus!`
            : `User ${deletingUser.name} successfully deleted!`
        );
        setDeletingUser(null);
        fetchUsers();
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setDeleteError(err.message);
      } else {
        setDeleteError('Failed to delete user');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await api.post<User>(`/users`, {
        name,
        email,
        password,
        role: userRole,
      });

      if (res.success) {
        setSuccessMsg(
          language === 'id'
            ? `Pengguna ${res.data?.name} berhasil dibuat!`
            : `User ${res.data?.name} successfully created!`
        );
        setShowModal(false);
        setName('');
        setEmail('');
        setPassword('');
        fetchUsers();
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('Failed to create user');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadge = (r: Role) => {
    switch (r) {
      case 'super_admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
            <ShieldAlert className="w-3 h-3" /> {t('roleSuperAdmin')}
          </span>
        );
      case 'warehouse_manager':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            <ShieldCheck className="w-3 h-3" /> {t('roleWarehouseManager')}
          </span>
        );
      case 'warehouse_staff':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            <UserCheck className="w-3 h-3" /> {t('roleWarehouseStaff')}
          </span>
        );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1B1B1F] dark:text-white">
              {t('usersTitle')}
            </h1>
            <p className="text-sm text-[#8B8B99] dark:text-slate-400 mt-1">
              {t('usersSubtitle')}
            </p>
          </div>

          {role === 'super_admin' && (
            <button
              onClick={() => {
                setName('');
                setEmail('');
                setPassword('');
                setUserRole('warehouse_staff');
                setFormError(null);
                setShowModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 self-start sm:self-auto cursor-pointer"
            >
              <UserPlus className="w-4 h-4 stroke-[2.5]" />
              <span>{t('addNewUserBtn')}</span>
            </button>
          )}
        </div>

        {/* Floating Notifications */}
        <FloatingToast
          type="success"
          message={successMsg}
          onClose={() => setSuccessMsg(null)}
        />
        <FloatingToast
          type="error"
          message={error}
          onClose={() => setError(null)}
        />

        {/* Users Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
              <p className="text-sm">Fetching team members...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
              <p className="text-base font-semibold text-slate-800 dark:text-slate-200">No users found</p>
              <p className="text-xs text-slate-500">Click &apos;Add New User&apos; to register warehouse staff.</p>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 [&>tr>th]:bg-slate-50 dark:[&>tr>th]:bg-slate-900 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 shadow-xs">
                  <tr>
                    <th className="px-6 py-3.5">{t('colName')}</th>
                    <th className="px-6 py-3.5">{t('colEmail')}</th>
                    <th className="px-6 py-3.5">{t('colRole')}</th>
                    <th className="px-6 py-3.5">{t('status')}</th>
                    <th className="px-6 py-3.5">{t('colRegistered')}</th>
                    {role === 'super_admin' && (
                      <th className="px-6 py-3.5 text-right">{language === 'id' ? 'Aksi' : 'Actions'}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                            {u.name.charAt(0)}
                          </div>
                          <span>{u.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {u.email}
                      </td>
                      <td className="px-6 py-4">
                        {getRoleBadge(u.role)}
                      </td>
                      <td className="px-6 py-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            {t('active')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            {language === 'id' ? 'Nonaktif' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(u.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      {role === 'super_admin' && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(u)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-[#7C6EF0] hover:bg-[#7C6EF0]/10 dark:hover:bg-[#7C6EF0]/20 transition-colors cursor-pointer"
                              title={language === 'id' ? 'Ubah Pengguna' : 'Edit User'}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {currentUser?.id !== u.id && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeletingUser(u);
                                  setDeleteError(null);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                title={language === 'id' ? 'Hapus Pengguna' : 'Delete User'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('modalAddUserTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('fullNameLabel')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full h-10 pl-9 pr-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    placeholder="Budi Santoso"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('emailAddress')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full h-10 pl-9 pr-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    placeholder="budi@stockflow.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('initialPasswordLabel')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full h-10 pl-9 pr-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    placeholder="Min. 8 characters"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('colRole')}
                </label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as Role)}
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                >
                  <option value="warehouse_staff">{t('roleWarehouseStaff')}</option>
                  <option value="warehouse_manager">{t('roleWarehouseManager')}</option>
                  {role === 'super_admin' && (
                    <option value="super_admin">{t('roleSuperAdmin')}</option>
                  )}
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('submitting')}
                    </>
                  ) : (
                    t('create')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('modalEditUserTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleUpdateUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('fullNameLabel')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="block w-full h-10 pl-9 pr-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('emailAddress')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="block w-full h-10 pl-9 pr-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('colRole')}
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                >
                  <option value="warehouse_staff">{t('roleWarehouseStaff')}</option>
                  <option value="warehouse_manager">{t('roleWarehouseManager')}</option>
                  <option value="super_admin">{t('roleSuperAdmin')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('userStatus')}
                </label>
                <select
                  value={editIsActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditIsActive(e.target.value === 'active')}
                  className="block w-full h-10 px-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                >
                  <option value="active">{t('userActive')}</option>
                  <option value="inactive">{t('userInactive')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('newPasswordOptional')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    minLength={8}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="block w-full h-10 pl-9 pr-3.5 bg-white dark:bg-slate-800 border border-[#EEEDF5] dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7C6EF0]/20 focus:border-[#7C6EF0] transition-colors"
                    placeholder={language === 'id' ? 'Min. 8 karakter (opsional)' : 'Min. 8 characters (optional)'}
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#7C6EF0] hover:bg-[#6C5CE7] text-white font-semibold text-sm transition-all shadow-sm shadow-[#7C6EF0]/20 cursor-pointer disabled:opacity-50"
                >
                  {isEditSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('submitting')}
                    </>
                  ) : (
                    t('editUserBtn')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                {t('deleteUserConfirmTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deleteError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
                {deleteError}
              </div>
            )}

            <div className="mt-4 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t('deleteUserConfirmDesc')}
              </p>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-sm">
                  {deletingUser.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {deletingUser.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate font-mono">
                    {deletingUser.email}
                  </p>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeletingUser(null)}
                  className="px-5 py-2.5 text-sm font-semibold rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={isDeleting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-all shadow-sm shadow-rose-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('submitting')}
                    </>
                  ) : (
                    language === 'id' ? 'Hapus' : 'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
