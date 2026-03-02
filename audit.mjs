import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zaobtetbjpuzibjymhzw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emxpYW5ltaHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjEzNzg3OSwiZXhwIjoyMDg3NzEzOTM5fQ.xNtxSTwkenbVWJ1IHEDRCuQu_XMsLdWW92gE2WQgy_0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Fetching profiles...');
    const { data: profiles, error: err1 } = await supabase.from('profiles').select('*');
    if (err1) {
        console.error('Error profiles:', err1);
        return;
    }

    let hugo = profiles.find(p => p.email && p.email.includes('hughgms'));
    if (!hugo) hugo = profiles.find(p => p.organization_id === '48dcff79-d58e-4a94-9642-f860579e2760');

    const orgId = hugo?.organization_id || '48dcff79-d58e-4a94-9642-f860579e2760';
    console.log('Hugo Organization ID:', orgId);

    console.log('Fetching instances...');
    const { data: instances, error: err2 } = await supabase.from('whatsapp_instances').select('*');
    if (err2) {
        console.error('Error instances:', err2);
        return;
    }

    const targetOrgs = [orgId];
    const hugoInstances = instances.filter(i => targetOrgs.includes(i.organization_id));

    console.log('Hugo Instances:');
    console.table(hugoInstances.map(i => ({
        id: i.id,
        label: i.label,
        status: i.status,
        phone: i.phone_number,
        zapi_id: i.zapi_instance_id
    })));

    // Force update ALL pending/connecting instances to connected to unblock Hugo right now!
    for (const inst of hugoInstances) {
        if (inst.status !== 'connected') {
            console.log(`Forcing status to 'connected' for instance ${inst.id}...`);
            const { error: updateErr } = await supabase.from('whatsapp_instances').update({
                status: 'connected',
                is_active: true,
                connected_at: new Date().toISOString()
            }).eq('id', inst.id);

            if (updateErr) console.error('Update error:', updateErr);
            else console.log(`Instance ${inst.id} successfully forced to 'connected'.`);
        } else {
            console.log(`Instance ${inst.id} is already connected.`);
        }
    }
}

run();
