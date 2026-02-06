'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { interestedApi } from '@/lib/api/interested';
import {
  CreateInterestedProfileInput,
  InterestedActivity,
  InterestedDuplicate,
  InterestedMatch,
  InterestedMatchStatus,
  InterestedMetrics,
  InterestedProfile,
  InterestedStatus,
  InterestedSummary,
  InterestedTimelineItem,
} from '@/types/interested';
import { useAuth } from '@/contexts/auth-context';

const STAGE_OPTIONS: InterestedStatus[] = [
  'new',
  'qualified',
  'matching',
  'visit_scheduled',
  'offer_made',
  'won',
  'lost',
];

const MATCH_STATUS_OPTIONS: InterestedMatchStatus[] = [
  'suggested',
  'contacted',
  'visit_scheduled',
  'accepted',
  'rejected',
  'expired',
];

const emptyForm: CreateInterestedProfileInput = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  peopleCount: undefined,
  maxAmount: undefined,
  hasPets: false,
  whiteIncome: false,
  guaranteeTypes: [],
  preferredZones: [],
  propertyTypePreference: 'apartment',
  operation: 'rent',
  status: 'new',
  qualificationLevel: 'mql',
  source: 'manual',
  consentContact: true,
  notes: '',
};

export default function InterestedPage() {
  const { loading: authLoading } = useAuth();
  const t = useTranslations('interested');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [profiles, setProfiles] = useState<InterestedProfile[]>([]);
  const [metrics, setMetrics] = useState<InterestedMetrics | null>(null);
  const [duplicates, setDuplicates] = useState<InterestedDuplicate[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<InterestedProfile | null>(null);
  const [summary, setSummary] = useState<InterestedSummary | null>(null);
  const [timeline, setTimeline] = useState<InterestedTimelineItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingMatches, setRefreshingMatches] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<InterestedStatus | 'all'>('all');

  const [form, setForm] = useState<CreateInterestedProfileInput>(emptyForm);
  const [stageReason, setStageReason] = useState('');
  const [pendingStage, setPendingStage] = useState<InterestedStatus>('new');

  const [activityForm, setActivityForm] = useState({
    type: 'task' as InterestedActivity['type'],
    subject: '',
    body: '',
    dueAt: '',
  });

  const duplicateForSelected = useMemo(() => {
    if (!selectedProfile) return null;
    return duplicates.find((item) => item.profileIds.includes(selectedProfile.id)) ?? null;
  }, [duplicates, selectedProfile]);

  const filteredProfiles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return [...profiles]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .filter((profile) => {
        if (stageFilter !== 'all' && profile.status !== stageFilter) return false;
        if (!term) return true;
        const fullName = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.toLowerCase();
        return (
          fullName.includes(term) ||
          (profile.phone ?? '').toLowerCase().includes(term) ||
          (profile.email ?? '').toLowerCase().includes(term)
        );
      });
  }, [profiles, searchTerm, stageFilter]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesResult, metricsResult, duplicatesResult] = await Promise.all([
        interestedApi.getAll({ limit: 30 }),
        interestedApi.getMetrics(),
        interestedApi.getDuplicates(),
      ]);
      setProfiles(profilesResult.data);
      setMetrics(metricsResult);
      setDuplicates(duplicatesResult);

      if (profilesResult.data.length > 0) {
        await selectProfile(profilesResult.data[0]);
      }
    } catch (error) {
      console.error('Failed to load CRM interested data', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void loadInitial();
  }, [authLoading, loadInitial]);

  async function selectProfile(profile: InterestedProfile) {
    setSelectedProfile(profile);
    setPendingStage(profile.status ?? 'new');
    setLoadingDetail(true);
    try {
      const [summaryResult, timelineResult] = await Promise.all([
        interestedApi.getSummary(profile.id),
        interestedApi.getTimeline(profile.id),
      ]);
      setSummary(summaryResult);
      setTimeline(timelineResult);
    } catch (error) {
      console.error('Failed to load interested summary', error);
      setSummary(null);
      setTimeline([]);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleCreateProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!form.phone?.trim()) {
      alert(t('errors.phoneRequired'));
      return;
    }

    setSaving(true);
    try {
      const payload: CreateInterestedProfileInput = {
        ...form,
        firstName: form.firstName?.trim() || undefined,
        lastName: form.lastName?.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        guaranteeTypes: form.guaranteeTypes?.filter((g) => g.trim().length > 0),
        preferredZones: form.preferredZones?.filter((g) => g.trim().length > 0),
      };

      const created = await interestedApi.create(payload);
      setProfiles((prev) => [created, ...prev]);
      setForm(emptyForm);
      setShowCreateForm(false);
      await selectProfile(created);
      const metricsResult = await interestedApi.getMetrics();
      setMetrics(metricsResult);
    } catch (error) {
      console.error('Failed to create interested profile', error);
      alert(tc('error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeStage() {
    if (!selectedProfile) return;

    try {
      const updated = await interestedApi.changeStage(
        selectedProfile.id,
        pendingStage,
        stageReason.trim() || undefined,
      );
      setProfiles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      await selectProfile(updated);
      setStageReason('');
      setMetrics(await interestedApi.getMetrics());
    } catch (error) {
      console.error('Failed to change stage', error);
      alert(tc('error'));
    }
  }

  async function handleRefreshMatches() {
    if (!selectedProfile) return;

    setRefreshingMatches(true);
    try {
      await interestedApi.refreshMatches(selectedProfile.id);
      await selectProfile(selectedProfile);
    } catch (error) {
      console.error('Failed to refresh matches', error);
      alert(tc('error'));
    } finally {
      setRefreshingMatches(false);
    }
  }

  async function handleUpdateMatchStatus(match: InterestedMatch, status: InterestedMatchStatus) {
    if (!selectedProfile) return;

    try {
      await interestedApi.updateMatch(selectedProfile.id, match.id, status);
      await selectProfile(selectedProfile);
    } catch (error) {
      console.error('Failed to update match status', error);
      alert(tc('error'));
    }
  }

  async function handleCreateActivity(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProfile) return;
    if (!activityForm.subject.trim()) {
      alert(t('errors.activitySubjectRequired'));
      return;
    }

    try {
      await interestedApi.addActivity(selectedProfile.id, {
        type: activityForm.type,
        subject: activityForm.subject.trim(),
        body: activityForm.body.trim() || undefined,
        dueAt: activityForm.dueAt || undefined,
      });

      setActivityForm({
        type: 'task',
        subject: '',
        body: '',
        dueAt: '',
      });

      await selectProfile(selectedProfile);
    } catch (error) {
      console.error('Failed to create activity', error);
      alert(tc('error'));
    }
  }

  const statusLabel = useCallback((status?: string) => t(`status.${status ?? 'new'}`), [t]);

  const timelineFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );

  const formatTimelineTitle = useCallback(
    (item: InterestedTimelineItem) => {
      const meta = (item.metadata ?? {}) as Record<string, any>;
      if (item.type === 'stage') {
        return t('timeline.stageChange', {
          from: statusLabel(meta.fromStatus ?? 'new'),
          to: statusLabel(meta.toStatus ?? 'new'),
        });
      }
      if (item.type === 'activity') {
        return t('timeline.activity', {
          type: t(`activityTypes.${meta.activityType ?? 'task'}`),
          subject: meta.subject ?? '',
        });
      }
      if (item.type === 'match') {
        return t('timeline.match', {
          property: meta.propertyName ?? meta.propertyId ?? '',
        });
      }
      if (item.type === 'visit') {
        return t('timeline.visit', {
          property: meta.propertyName ?? meta.propertyId ?? '',
        });
      }
      return item.title;
    },
    [statusLabel, t],
  );

  const formatTimelineDetail = useCallback(
    (item: InterestedTimelineItem) => {
      const meta = (item.metadata ?? {}) as Record<string, any>;
      if (item.type === 'match' && meta.status) {
        const statusText = t('timeline.matchStatus', {
          status: t(`matchStatus.${meta.status}`),
        });
        if (item.detail) {
          return `${statusText} - ${t('timeline.note', { note: item.detail })}`;
        }
        return statusText;
      }
      if (item.type === 'activity' && meta.status) {
        const statusText = t('timeline.activityStatus', {
          status: t(`activityStatus.${meta.status}`),
        });
        if (item.detail) {
          return `${statusText} - ${t('timeline.note', { note: item.detail })}`;
        }
        return statusText;
      }
      if (item.type === 'stage' && item.detail) {
        return t('timeline.reason', { reason: item.detail });
      }
      if (item.type === 'visit' && item.detail) {
        return t('timeline.note', { note: item.detail });
      }
      if (item.detail) {
        return t('timeline.note', { note: item.detail });
      }
      return null;
    },
    [t],
  );

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((prev) => !prev)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
        >
          {showCreateForm ? t('actions.closeNew') : t('actions.new')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('metrics.totalLeads')}</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{metrics?.totalLeads ?? 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('metrics.conversionRate')}</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{metrics?.conversionRate?.toFixed(2) ?? '0.00'}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('metrics.avgCloseHours')}</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{metrics?.avgHoursToClose?.toFixed(1) ?? '0.0'}h</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('metrics.won')}</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{metrics?.byStage?.won ?? 0}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-4 space-y-6">
            {showCreateForm ? (
              <form
                onSubmit={handleCreateProfile}
                className="space-y-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('newTitle')}</h2>
                <div className="grid grid-cols-1 gap-3">
                  <input
                    type="text"
                    placeholder={t('fields.firstName')}
                    value={form.firstName ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder={t('fields.lastName')}
                    value={form.lastName ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder={t('fields.phone')}
                    value={form.phone ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                  />
                  <input
                    type="email"
                    placeholder={t('fields.email')}
                    value={form.email ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                  />
                  <select
                    value={form.operation}
                    onChange={(e) => setForm((prev) => ({ ...prev, operation: e.target.value as any }))}
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                  >
                    <option value="rent">{t('operations.rent')}</option>
                    <option value="sale">{t('operations.sale')}</option>
                  </select>
                  <select
                    value={form.propertyTypePreference}
                    onChange={(e) => setForm((prev) => ({ ...prev, propertyTypePreference: e.target.value as any }))}
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                  >
                    <option value="apartment">{t('propertyTypes.apartment')}</option>
                    <option value="house">{t('propertyTypes.house')}</option>
                  </select>
                  <textarea
                    placeholder={t('fields.notes')}
                    value={form.notes ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? t('actions.saving') : t('actions.save')}
                </button>
              </form>
            ) : null}

            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('listTitle')}</h2>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as InterestedStatus | 'all')}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              >
                <option value="all">{t('filters.allStages')}</option>
                {STAGE_OPTIONS.map((stage) => (
                  <option key={stage} value={stage}>{statusLabel(stage)}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder={t('listSearchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
              />
              {filteredProfiles.length > 0 ? (
                filteredProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => void selectProfile(profile)}
                    className={`w-full text-left rounded-lg border p-3 transition ${
                      selectedProfile?.id === profile.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {profile.firstName || profile.lastName
                          ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
                          : profile.phone}
                      </p>
                      <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {statusLabel(profile.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{profile.phone}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('operationsLabel', { op: t(`operations.${profile.operation ?? 'rent'}`) })}
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {profiles.length > 0 ? t('noResults') : t('empty')}
                </p>
              )}
            </div>
          </div>

          <div className="xl:col-span-8 space-y-4">
            {!selectedProfile ? (
              <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('matchesHint')}
              </div>
            ) : loadingDetail ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {summary?.profile.firstName || summary?.profile.lastName
                          ? `${summary?.profile.firstName ?? ''} ${summary?.profile.lastName ?? ''}`.trim()
                          : summary?.profile.phone}
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{summary?.profile.email ?? summary?.profile.phone}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={pendingStage}
                        onChange={(e) => setPendingStage(e.target.value as InterestedStatus)}
                        className="rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                      >
                        {STAGE_OPTIONS.map((stage) => (
                          <option key={stage} value={stage}>{statusLabel(stage)}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleChangeStage()}
                        className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                      >
                        {t('actions.changeStage')}
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder={t('fields.stageReason')}
                    value={stageReason}
                    onChange={(e) => setStageReason(e.target.value)}
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                  />

                  {duplicateForSelected ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200">
                      {t('duplicateWarning', { count: duplicateForSelected.count })}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('matchesTitle')}</h3>
                      <button
                        type="button"
                        onClick={() => void handleRefreshMatches()}
                        disabled={refreshingMatches}
                        className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs inline-flex items-center gap-2"
                      >
                        {refreshingMatches ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {t('actions.refreshMatches')}
                      </button>
                    </div>
                    {summary?.matches?.length ? (
                      <div className="space-y-3">
                        {summary.matches.map((match) => (
                          <div key={match.id} className="border border-gray-200 dark:border-gray-700 rounded-md p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {match.property?.name ?? match.propertyId}
                              </p>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{t('labels.score')}: {match.score ?? 0}</span>
                            </div>
                            <select
                              value={match.status}
                              onChange={(e) => void handleUpdateMatchStatus(match, e.target.value as InterestedMatchStatus)}
                              className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-xs"
                            >
                              {MATCH_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{t(`matchStatus.${status}`)}</option>
                              ))}
                            </select>
                            {match.matchReasons?.length ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400">{match.matchReasons.join(' · ')}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('noMatches')}</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('activities.title')}</h3>
                    <form onSubmit={handleCreateActivity} className="space-y-2">
                      <select
                        value={activityForm.type}
                        onChange={(e) => setActivityForm((prev) => ({ ...prev, type: e.target.value as InterestedActivity['type'] }))}
                        className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                      >
                        <option value="task">{t('activityTypes.task')}</option>
                        <option value="call">{t('activityTypes.call')}</option>
                        <option value="note">{t('activityTypes.note')}</option>
                        <option value="email">{t('activityTypes.email')}</option>
                        <option value="whatsapp">{t('activityTypes.whatsapp')}</option>
                        <option value="visit">{t('activityTypes.visit')}</option>
                      </select>
                      <input
                        type="text"
                        placeholder={t('activities.subject')}
                        value={activityForm.subject}
                        onChange={(e) => setActivityForm((prev) => ({ ...prev, subject: e.target.value }))}
                        className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                      />
                      <textarea
                        placeholder={t('activities.body')}
                        value={activityForm.body}
                        onChange={(e) => setActivityForm((prev) => ({ ...prev, body: e.target.value }))}
                        rows={2}
                        className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="datetime-local"
                          value={activityForm.dueAt}
                          onChange={(e) => setActivityForm((prev) => ({ ...prev, dueAt: e.target.value }))}
                          lang={locale}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm"
                        />
                      </div>
                      <button type="submit" className="w-full px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700">
                        {t('activities.add')}
                      </button>
                    </form>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('timelineTitle')}</h3>
                  {timeline.length ? (
                    <div className="space-y-2 max-h-80 overflow-auto">
                      {timeline.map((item) => {
                        const detail = formatTimelineDetail(item);
                        return (
                          <div key={item.id} className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{formatTimelineTitle(item)}</p>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{timelineFormatter.format(new Date(item.at))}</span>
                            </div>
                            {detail ? <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{detail}</p> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('timelineEmpty')}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
