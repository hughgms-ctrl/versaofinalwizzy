
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://zaobtetbjpuzibjymhzw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emlianltaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzc5MzksImV4cCI6MjA4NzcxMzkzOX0.HBUI1OK1eYq9FE2SzIvuAkxuCG0frApCQZqcjjDx43k";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getOrgId() {
  const { data, error } = await supabase.from('conversations').select('organization_id').limit(1);
  if (error) {
    console.error('Error:', error);
    return;
  }
  if (data && data.length > 0) {
    console.log('Found Org ID:', data[0].organization_id);
  } else {
    console.log('No conversations found.');
    const { data: agents } = await supabase.from('ai_agents').select('organization_id').limit(1);
    if (agents && agents.length > 0) {
      console.log('Found Org ID from Agent:', agents[0].organization_id);
    } else {
      console.log('No agents found either.');
    }
  }
}

getOrgId();
