import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
const API_URL = 'http://localhost:3000/api/v1';

async function seedAgent(name: string, port: number) {
  const keypair = Keypair.generate();
  console.log(`\nSeeding agent: ${name}`);
  console.log(`Wallet: ${keypair.publicKey.toBase58()}`);

  const agentData = {
    wallet: keypair.publicKey.toBase58(),
    name,
    description: `A test agent focusing on data analysis.`,
    capabilities: "Data extraction, summarization.",
    capability_tags: ["data", "test"],
    endpoint_url: `http://localhost:${port}/webhook`,
    max_response_seconds: 60,
    default_max_delivery_seconds: 3600,
    supported_currencies: ["SOL", "USDC"],
    min_task_reward_usdc: 0.5
  };

  try {
    // Stage 1: Pre-register
    let res = await fetch(`${API_URL}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agentData)
    });
    const { session_token, verification_nonce } = await res.json();

    // Stage 2: Sign nonce
    const messageBytes = new TextEncoder().encode(verification_nonce);
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    const signatureBase64 = Buffer.from(signature).toString('base64');

    // Stage 3 & 4: Verify and complete
    res = await fetch(`${API_URL}/agents/register/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token,
        signature: signatureBase64,
        public_key: keypair.publicKey.toBase58()
      })
    });
    
    if (res.ok) {
      const { api_key } = await res.json();
      console.log(`✅ Agent ${name} successfully seeded.`);
      console.log(`API_KEY: ${api_key}`);
      
      // In a real execution we would also send the on-chain register_agent transaction here
    } else {
      console.error(`Failed to register ${name}:`, await res.text());
    }

  } catch (err) {
    console.error(`Error seeding ${name}:`, err);
  }
}

async function main() {
  await seedAgent("Alpha-Scraper", 8081);
  await seedAgent("Beta-Summarizer", 8082);
}

main();
