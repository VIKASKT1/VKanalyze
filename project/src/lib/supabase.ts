import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is not set');
if (!supabaseAnonKey) throw new Error('VITE_SUPABASE_ANON_KEY is not set');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function saveChatMessage(
  datasetName: string,
  role: 'user' | 'assistant',
  content: string
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('chat_messages').insert({
    user_id: user.id,
    dataset_name: datasetName,
    role,
    content,
    created_at: new Date().toISOString(),
  });
}

export async function loadChatHistory(
  datasetName: string
): Promise<Array<{ role: string; content: string; timestamp: string }>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('user_id', user.id)
    .eq('dataset_name', datasetName)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) return [];
  return (data ?? []).map(m => ({
    role: m.role,
    content: m.content,
    timestamp: m.created_at,
  }));
}

