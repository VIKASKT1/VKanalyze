import { useState, useEffect } from 'react';
import {
  Briefcase, Plus, Trash2, Edit3, Save, CheckCircle, Users,
  Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import OverlayPageNav from '../OverlayPageNav';

interface Props {
  onNavigate: (page: string) => void;
  onBackToWorkspace?: () => void;
}

interface Workspace {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export default function WorkspacesPage({ onNavigate, onBackToWorkspace }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from('workspaces').select('*').eq('owner_id', user.id).order('created_at', { ascending: false });
    if (data) setWorkspaces(data as Workspace[]);
    setLoading(false);
  }

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    await supabase.from('workspaces').insert({
      owner_id: user.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
    });
    setForm({ name: '', description: '' });
    setShowCreate(false);
    setSaving(false);
    load();
  }

  async function update(id: string) {
    await supabase.from('workspaces').update({
      name: editForm.name.trim(),
      description: editForm.description.trim() || null,
    }).eq('id', id);
    setEditId(null);
    load();
  }

  async function remove(id: string) {
    await supabase.from('workspaces').delete().eq('id', id);
    setWorkspaces(prev => prev.filter(w => w.id !== id));
  }

  return (
    <div className="min-h-screen bg-ink text-paper">
      <OverlayPageNav title="Workspaces" onNavigate={onNavigate} onBackToWorkspace={onBackToWorkspace} />

      <main id="main-content" className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold text-paper mb-1">Workspaces</h1>
            <p className="text-paper-dim">Organize your analyses into named workspaces for future collaboration.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-bright text-ink text-sm font-semibold rounded-xl transition"
          >
            <Plus className="w-4 h-4" />
            New Workspace
          </button>
        </div>

        {/* Privacy note */}
        <div className="flex items-start gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl mb-8">
          <Lock className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-300">Privacy-First Workspaces</p>
            <p className="text-xs text-paper-dim mt-0.5">Workspaces store names and descriptions only. Dataset contents are never saved to any workspace.</p>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="bg-ink-surface border border-ink-border rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-paper mb-4 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-accent-bright" />
              Create Workspace
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Workspace name"
                className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer"
              />
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description (optional)"
                rows={3}
                className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer resize-none"
              />
              <div className="flex gap-3">
                <button onClick={create} disabled={saving || !form.name.trim()} className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-bright disabled:opacity-50 text-ink text-sm font-semibold rounded-xl transition">
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Creating…' : 'Create'}
                </button>
                <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm rounded-xl transition">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : workspaces.length === 0 ? (
          <div className="text-center py-16 text-paper-dim">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="mb-2">No workspaces yet</p>
            <p className="text-xs">Create a workspace to organize your analyses</p>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaces.map(w => (
              <div key={w.id} className="bg-ink-surface border border-ink-border rounded-xl p-5 hover:border-ink-borderStrong transition">
                {editId === w.id ? (
                  <div className="space-y-3">
                    <input
                      value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <input
                      value={editForm.description}
                      onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full bg-ink-raised border border-ink-borderStrong text-paper text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => update(w.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-bright text-ink text-xs rounded-lg transition">
                        <CheckCircle className="w-3.5 h-3.5" /> Save
                      </button>
                      <button onClick={() => setEditId(null)} className="px-3 py-1.5 bg-ink-raised text-paper/90 text-xs rounded-lg hover:bg-ink-borderStrong transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-5 h-5 text-accent-bright" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-paper">{w.name}</h3>
                      {w.description && <p className="text-xs text-paper-dim mt-0.5">{w.description}</p>}
                      <p className="text-xs text-paper-dimmer mt-1">{new Date(w.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditId(w.id); setEditForm({ name: w.name, description: w.description ?? '' }); }}
                        className="p-1.5 rounded-lg text-paper-dim hover:text-paper hover:bg-ink-borderStrong transition">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(w.id)} className="p-1.5 rounded-lg text-paper-dim hover:text-red-400 hover:bg-red-500/10 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Future collaboration note */}
        <div className="mt-10 p-6 bg-ink-surface/50 border border-ink-border rounded-2xl">
          <div className="flex items-center gap-3 mb-3">
            <Users className="w-5 h-5 text-accent-bright" />
            <h3 className="text-sm font-semibold text-paper">Team Collaboration — Coming Soon</h3>
          </div>
          <p className="text-xs text-paper-dim leading-relaxed">
            Future versions will support inviting team members to workspaces, shared dashboard access, and collaborative analysis workflows.
            Workspaces created now will be automatically upgraded when collaboration features launch.
          </p>
        </div>
      </main>
    </div>
  );
}
