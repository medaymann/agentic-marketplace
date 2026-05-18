import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import { getS3Client, getBucket, isMockMode } from '../shared/src/storage/client.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

async function main() {
  console.log('Mock mode:', isMockMode());
  if (isMockMode()) {
    console.error('R2_ENDPOINT is not set — still in mock mode. Check your .env.');
    process.exit(1);
  }
  const client = getS3Client();
  const bucket = getBucket();
  console.log('Bucket:', bucket);

  await client.send(new PutObjectCommand({ Bucket: bucket, Key: 'test/connection-check.txt', Body: 'ok', ContentType: 'text/plain' }));
  console.log('PUT ok');

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: 'test/connection-check.txt' }));
  console.log('DELETE ok');

  console.log('\nR2 connection working.');
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
