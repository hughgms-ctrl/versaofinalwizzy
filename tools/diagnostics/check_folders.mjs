import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: folders, error: fErr } = await supabase.from('flow_folders').select('*').ilike('name', '%Cópia%').order('created_at', { ascending: false }).limit(2);
  if (fErr) console.error('Folders error:', fErr);
  console.log('Duplicated Folders:', JSON.stringify(folders, null, 2));
  
  if (folders && folders.length > 0) {
    for (const f of folders) {
      const { data: flows, error: flErr } = await supabase.from('flows').select('id, name, folder_id, workspace_id').eq('folder_id', f.id);
      if (flErr) console.error('Flows error:', flErr);
      console.log(`Flows in folder ${f.name} (${f.id}):`, flows);
    }
  }
}
check();
