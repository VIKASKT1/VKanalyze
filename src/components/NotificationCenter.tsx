import { useState, useEffect } from 'react';
import {
  Bell, CheckCheck, Trash2, Info, CheckCircle, AlertTriangle, Megaphone,
} from 'lucide-react';
import { loadNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../lib/supabase';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'announcement';
  read: boolean;
  link?: string;
  created_at: string;
}

interface Props {
  onClose: () => void;
}

const TYPE_ICONS = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertTriangle,
  announcement: Megaphone,
};

const TYPE_COLORS = {
  info: 'text-accent-bright',
  success: 'text-emerald-400',
  warning: 'text-data',
  error: 'text-red-400',
  announcement: 'text-purple-400',
};

export default function NotificationCenter({ onClose }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAllNotifications(); }, []);

  async function loadAllNotifications() {
    try {
      const data = await loadNotifications();
      setNotifications(data as Notification[]);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function markRead(id: string) {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function deleteOne(id: string) {
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(iso).toLocaleDateString();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-16" role="dialog" aria-label="Notifications" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-ink-surface border border-ink-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-ink-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent-bright" />
            <span className="text-sm font-semibold text-paper">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[11px] px-1.5 py-0.5 bg-accent text-ink rounded-full font-semibold font-mono">{unreadCount}</span>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-accent-bright hover:text-accent transition flex items-center gap-1.5">
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* Notifications list */}
        <div className="overflow-y-auto max-h-[60vh] scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-paper-dim">
              <Bell className="w-8 h-8 mb-3 opacity-25" />
              <p className="text-sm">No notifications yet</p>
              <p className="text-xs text-paper-dimmer mt-1">You're all caught up</p>
            </div>
          ) : (
            notifications.map(n => {
              const Icon = TYPE_ICONS[n.type] ?? Info;
              const color = TYPE_COLORS[n.type] ?? 'text-accent-bright';
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-ink-border last:border-0 transition-colors group cursor-pointer ${!n.read ? 'bg-accent/5' : 'hover:bg-ink-raised'}`}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <Icon className={`w-4 h-4 ${color} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-paper truncate">{n.title}</p>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-accent-bright flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-paper-dim mt-0.5 leading-relaxed">{n.message}</p>
                    <p className="text-xs text-paper-dimmer mt-1 font-mono">{timeAgo(n.created_at)}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteOne(n.id); }}
                    className="p-1.5 rounded-lg text-paper-dimmer hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition flex-shrink-0"
                    aria-label="Delete notification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
