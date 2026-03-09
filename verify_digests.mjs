
import { createHash } from 'crypto';

const SUPABASE_URL = "https://zaobtetbjpuzibjymhzw.supabase.co";
const urlDigest = createHash('sha256').update(SUPABASE_URL).digest('hex');
console.log(`URL: ${SUPABASE_URL}`);
console.log(`Digest: ${urlDigest}`);

const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emxpYW5ltaHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjEzNzg3OSwiZXhwIjoyMDg3NzEzOTM5fQ.xNtxSTwkenbVWJ1IHEDRCuQu_XMsLdWW92gE2WQgy_0";
const keyDigest = createHash('sha256').update(key).digest('hex');
console.log(`Key Digest: ${keyDigest}`);
