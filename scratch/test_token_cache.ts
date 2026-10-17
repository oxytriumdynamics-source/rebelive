import { shiprocketService } from '../src/modules/shipping/shiprocket.service';
import fs from 'fs';

async function main() {
  console.log('--- Step 1: Requesting token for the first time ---');
  const t1 = await shiprocketService.getAuthToken();
  console.log('Got token:', !!t1, 'Length:', t1 ? t1.length : 0);
  console.log('.shiprocket-token.json exists:', fs.existsSync('.shiprocket-token.json'));

  console.log('\n--- Step 2: Requesting token again (in-memory cache test) ---');
  const t2 = await shiprocketService.getAuthToken();
  console.log('Got token:', !!t2, 'Identical to t1:', t1 === t2);

  if (fs.existsSync('.shiprocket-token.json')) {
    const raw = JSON.parse(fs.readFileSync('.shiprocket-token.json', 'utf8'));
    console.log('\n--- Step 3: Inspecting persistent disk cache ---');
    console.log('Cached token exists:', !!raw.token);
    console.log('Expires at:', new Date(raw.expiresAt).toISOString());
    console.log('Days remaining:', ((raw.expiresAt - Date.now()) / (1000 * 3600 * 24)).toFixed(1));
    console.log('Email:', raw.email);
  }
}

main().catch(console.error);
