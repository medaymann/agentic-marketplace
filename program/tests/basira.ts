import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Basira } from "../target/types/basira";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const TASK_SEED = Buffer.from("task");
const VAULT_SEED = Buffer.from("vault");
const AGENT_SEED = Buffer.from("agent");

const HOUR = 3600;
const MIN_REWARD_LAMPORTS = 10_000_000;

const KEYPAIRS_DIR = resolve(__dirname, "..", "..", "keypairs");

function loadKeypair(name: string): Keypair {
  const bytes = JSON.parse(readFileSync(resolve(KEYPAIRS_DIR, name), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

const TREASURY_KP = loadKeypair("treasury.json");
const ARBITRATOR_KP = loadKeypair("arbitrator.json");
const KEEPER_KP = loadKeypair("keeper.json");

function freshTaskId(): number[] {
  return Array.from(randomBytes(16));
}

function pdaTask(programId: PublicKey, taskId: number[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TASK_SEED, Buffer.from(taskId)],
    programId,
  );
}

function pdaVault(programId: PublicKey, taskId: number[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, Buffer.from(taskId)],
    programId,
  );
}

describe("basira", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.basira as Program<Basira>;

  async function fund(kp: Keypair, lamports = 5 * LAMPORTS_PER_SOL) {
    const sig = await provider.connection.requestAirdrop(kp.publicKey, lamports);
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  // register_agent is now keeper-signed: the platform authority (KEEPER_KP)
  // signs and pays; the agent wallet is passed as an argument. Agents never
  // sign or hold SOL for registration.
  async function registerAgentByKeeper(agentWallet: PublicKey) {
    await program.methods
      .registerAgent(agentWallet)
      .accounts({ platformAuthority: KEEPER_KP.publicKey })
      .signers([KEEPER_KP])
      .rpc();
  }

  // Fund the keeper once — it pays fees + rent for every keeper-signed
  // instruction (register_agent, submit_deliverable, sweeps).
  before(async () => {
    await fund(KEEPER_KP, 10 * LAMPORTS_PER_SOL);
  });

  describe("register_agent", () => {
    it("creates an AgentAccount PDA with default reputation (keeper-signed)", async () => {
      // Agent never signs or holds SOL — the keeper registers on its behalf.
      const agent = Keypair.generate();

      const [agentPda, expectedBump] = PublicKey.findProgramAddressSync(
        [AGENT_SEED, agent.publicKey.toBuffer()],
        program.programId,
      );

      await registerAgentByKeeper(agent.publicKey);

      const account = await program.account.agentAccount.fetch(agentPda);

      assert.ok(account.wallet.equals(agent.publicKey));
      assert.strictEqual(account.completedCount.toNumber(), 0);
      assert.strictEqual(account.disputedCount.toNumber(), 0);
      assert.deepStrictEqual(account.status, { active: {} });
      assert.strictEqual(account.bump, expectedBump);
      assert.ok(account.registeredAt.toNumber() > 0);
    });

    it("rejects re-registration of the same wallet", async () => {
      const agent = Keypair.generate();

      await registerAgentByKeeper(agent.publicKey);

      try {
        await registerAgentByKeeper(agent.publicKey);
        assert.fail("expected re-registration to fail");
      } catch (err) {
        const msg = String(err);
        assert.match(msg, /already in use|custom program error: 0x0/i, msg);
      }
    });

    it("rejects registration signed by a non-keeper", async () => {
      const agent = Keypair.generate();
      const impostor = Keypair.generate();
      await fund(impostor, 2 * LAMPORTS_PER_SOL);

      try {
        await program.methods
          .registerAgent(agent.publicKey)
          .accounts({ platformAuthority: impostor.publicKey })
          .signers([impostor])
          .rpc();
        assert.fail("expected non-keeper registration to fail");
      } catch (err) {
        const msg = String(err);
        // address-constraint violation on platform_authority
        assert.match(msg, /NotPlatformAuthority|ConstraintAddress|custom program error/i, msg);
      }
    });
  });

  describe("create_task_sol", () => {
    it("Direct mode: creates task and vault, escrows SOL", async () => {
      const poster = Keypair.generate();
      const agent = Keypair.generate();
      await fund(poster);

      const taskId = freshTaskId();
      const [taskPda] = pdaTask(program.programId, taskId);
      const [vaultPda] = pdaVault(program.programId, taskId);

      const amount = new BN(MIN_REWARD_LAMPORTS);
      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);

      const posterBefore = await provider.connection.getBalance(poster.publicKey);

      await program.methods
        .createTaskSol(taskId, { direct: {} }, amount, deadline, agent.publicKey)
        .accounts({ poster: poster.publicKey })
        .signers([poster])
        .rpc();

      const task = await program.account.taskAccount.fetch(taskPda);
      assert.deepStrictEqual(task.taskId, taskId);
      assert.ok(task.posterWallet.equals(poster.publicKey));
      assert.ok(task.assignedAgent && task.assignedAgent.equals(agent.publicKey));
      assert.deepStrictEqual(task.mode, { direct: {} });
      assert.deepStrictEqual(task.status, { assigned: {} });
      assert.deepStrictEqual(task.currency, { sol: {} });
      assert.strictEqual(task.amount.toNumber(), MIN_REWARD_LAMPORTS);
      assert.strictEqual(task.feeBps, 500);
      assert.strictEqual(task.deadline.toNumber(), deadline.toNumber());
      assert.strictEqual(task.submittedAt, null);

      const vaultBalance = await provider.connection.getBalance(vaultPda);
      assert.isAtLeast(
        vaultBalance,
        MIN_REWARD_LAMPORTS,
        "vault should hold escrow + rent",
      );

      const posterAfter = await provider.connection.getBalance(poster.publicKey);
      const debited = posterBefore - posterAfter;
      assert.isAtLeast(
        debited,
        MIN_REWARD_LAMPORTS,
        "poster should be debited at least the escrow amount",
      );
    });

    it("Bounty mode: creates task with status Created and no assigned agent", async () => {
      const poster = Keypair.generate();
      await fund(poster);

      const taskId = freshTaskId();
      const [taskPda] = pdaTask(program.programId, taskId);

      const amount = new BN(MIN_REWARD_LAMPORTS);
      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);

      await program.methods
        .createTaskSol(taskId, { bounty: {} }, amount, deadline, null)
        .accounts({ poster: poster.publicKey })
        .signers([poster])
        .rpc();

      const task = await program.account.taskAccount.fetch(taskPda);
      assert.deepStrictEqual(task.mode, { bounty: {} });
      assert.deepStrictEqual(task.status, { created: {} });
      assert.strictEqual(task.assignedAgent, null);
    });

    it("rejects deadline less than 1 hour out", async () => {
      const poster = Keypair.generate();
      await fund(poster);

      const taskId = freshTaskId();
      const amount = new BN(MIN_REWARD_LAMPORTS);
      const deadline = new BN(Math.floor(Date.now() / 1000) + 60);

      try {
        await program.methods
          .createTaskSol(taskId, { bounty: {} }, amount, deadline, null)
          .accounts({ poster: poster.publicKey })
          .signers([poster])
          .rpc();
        assert.fail("expected DeadlineTooSoon");
      } catch (err) {
        assert.match(String(err), /DeadlineTooSoon/);
      }
    });

    it("rejects amount below minimum", async () => {
      const poster = Keypair.generate();
      await fund(poster);

      const taskId = freshTaskId();
      const amount = new BN(MIN_REWARD_LAMPORTS - 1);
      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);

      try {
        await program.methods
          .createTaskSol(taskId, { bounty: {} }, amount, deadline, null)
          .accounts({ poster: poster.publicKey })
          .signers([poster])
          .rpc();
        assert.fail("expected AmountBelowMinimum");
      } catch (err) {
        assert.match(String(err), /AmountBelowMinimum/);
      }
    });

    it("rejects Direct mode without assigned agent", async () => {
      const poster = Keypair.generate();
      await fund(poster);

      const taskId = freshTaskId();
      const amount = new BN(MIN_REWARD_LAMPORTS);
      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);

      try {
        await program.methods
          .createTaskSol(taskId, { direct: {} }, amount, deadline, null)
          .accounts({ poster: poster.publicKey })
          .signers([poster])
          .rpc();
        assert.fail("expected DirectRequiresAssignedAgent");
      } catch (err) {
        assert.match(String(err), /DirectRequiresAssignedAgent/);
      }
    });

    it("rejects Bounty mode with pre-assigned agent", async () => {
      const poster = Keypair.generate();
      const agent = Keypair.generate();
      await fund(poster);

      const taskId = freshTaskId();
      const amount = new BN(MIN_REWARD_LAMPORTS);
      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);

      try {
        await program.methods
          .createTaskSol(taskId, { bounty: {} }, amount, deadline, agent.publicKey)
          .accounts({ poster: poster.publicKey })
          .signers([poster])
          .rpc();
        assert.fail("expected BountyMustNotPreassign");
      } catch (err) {
        assert.match(String(err), /BountyMustNotPreassign/);
      }
    });
  });

  describe("cancel_task_sol", () => {
    async function createBounty(poster: Keypair) {
      const taskId = freshTaskId();
      const amount = new BN(MIN_REWARD_LAMPORTS);
      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);
      await program.methods
        .createTaskSol(taskId, { bounty: {} }, amount, deadline, null)
        .accounts({ poster: poster.publicKey })
        .signers([poster])
        .rpc();
      return { taskId, amount };
    }

    it("refunds the poster and closes the vault", async () => {
      const poster = Keypair.generate();
      await fund(poster);
      const { taskId } = await createBounty(poster);

      const [taskPda] = pdaTask(program.programId, taskId);
      const [vaultPda] = pdaVault(program.programId, taskId);

      const posterBefore = await provider.connection.getBalance(poster.publicKey);

      await program.methods
        .cancelTaskSol()
        .accounts({
          poster: poster.publicKey,
          taskAccount: taskPda,
          vault: vaultPda,
        })
        .signers([poster])
        .rpc();

      const task = await program.account.taskAccount.fetch(taskPda);
      assert.deepStrictEqual(task.status, { refunded: {} });

      const vaultInfo = await provider.connection.getAccountInfo(vaultPda);
      assert.isNull(vaultInfo, "vault should be closed");

      const posterAfter = await provider.connection.getBalance(poster.publicKey);
      assert.isAbove(
        posterAfter,
        posterBefore + MIN_REWARD_LAMPORTS - 100_000,
        "poster should be refunded escrow + vault rent",
      );
    });

    it("rejects cancel by non-poster", async () => {
      const poster = Keypair.generate();
      const stranger = Keypair.generate();
      await fund(poster);
      await fund(stranger);

      const { taskId } = await createBounty(poster);
      const [taskPda] = pdaTask(program.programId, taskId);
      const [vaultPda] = pdaVault(program.programId, taskId);

      try {
        await program.methods
          .cancelTaskSol()
          .accounts({
            poster: stranger.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
          })
          .signers([stranger])
          .rpc();
        assert.fail("expected NotPoster");
      } catch (err) {
        assert.match(String(err), /NotPoster|ConstraintAddress/);
      }
    });

    it("rejects cancel of an Assigned (Direct mode) task", async () => {
      const poster = Keypair.generate();
      const agent = Keypair.generate();
      await fund(poster);

      const taskId = freshTaskId();
      const amount = new BN(MIN_REWARD_LAMPORTS);
      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);
      await program.methods
        .createTaskSol(taskId, { direct: {} }, amount, deadline, agent.publicKey)
        .accounts({ poster: poster.publicKey })
        .signers([poster])
        .rpc();

      const [taskPda] = pdaTask(program.programId, taskId);
      const [vaultPda] = pdaVault(program.programId, taskId);

      try {
        await program.methods
          .cancelTaskSol()
          .accounts({
            poster: poster.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
          })
          .signers([poster])
          .rpc();
        assert.fail("expected InvalidTaskStatus");
      } catch (err) {
        assert.match(String(err), /InvalidTaskStatus/);
      }
    });
  });

  describe("assign_agent", () => {
    async function setupBountyAndAgent() {
      const poster = Keypair.generate();
      const agent = Keypair.generate();
      await fund(poster);
      await fund(agent);

      await registerAgentByKeeper(agent.publicKey);

      const taskId = freshTaskId();
      const amount = new BN(MIN_REWARD_LAMPORTS);
      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);
      await program.methods
        .createTaskSol(taskId, { bounty: {} }, amount, deadline, null)
        .accounts({ poster: poster.publicKey })
        .signers([poster])
        .rpc();

      const [taskPda] = pdaTask(program.programId, taskId);
      const [agentPda] = PublicKey.findProgramAddressSync(
        [AGENT_SEED, agent.publicKey.toBuffer()],
        program.programId,
      );
      return { poster, agent, taskId, taskPda, agentPda };
    }

    it("assigns a registered agent and flips status to Assigned", async () => {
      const { poster, agent, taskPda, agentPda } = await setupBountyAndAgent();

      await program.methods
        .assignAgent()
        .accounts({
          poster: poster.publicKey,
          taskAccount: taskPda,
          agentAccount: agentPda,
        })
        .signers([poster])
        .rpc();

      const task = await program.account.taskAccount.fetch(taskPda);
      assert.deepStrictEqual(task.status, { assigned: {} });
      assert.ok(
        task.assignedAgent && task.assignedAgent.equals(agent.publicKey),
        "assigned_agent should match",
      );
    });

    it("rejects assign by non-poster", async () => {
      const { taskPda, agentPda } = await setupBountyAndAgent();
      const stranger = Keypair.generate();
      await fund(stranger);

      try {
        await program.methods
          .assignAgent()
          .accounts({
            poster: stranger.publicKey,
            taskAccount: taskPda,
            agentAccount: agentPda,
          })
          .signers([stranger])
          .rpc();
        assert.fail("expected NotPoster");
      } catch (err) {
        assert.match(String(err), /NotPoster|ConstraintAddress/);
      }
    });

    it("rejects assigning twice", async () => {
      const { poster, taskPda, agentPda } = await setupBountyAndAgent();

      await program.methods
        .assignAgent()
        .accounts({
          poster: poster.publicKey,
          taskAccount: taskPda,
          agentAccount: agentPda,
        })
        .signers([poster])
        .rpc();

      try {
        await program.methods
          .assignAgent()
          .accounts({
            poster: poster.publicKey,
            taskAccount: taskPda,
            agentAccount: agentPda,
          })
          .signers([poster])
          .rpc();
        assert.fail("expected InvalidTaskStatus");
      } catch (err) {
        assert.match(String(err), /InvalidTaskStatus|AlreadyAssigned/);
      }
    });

    it("rejects assign on a Direct-mode task", async () => {
      const poster = Keypair.generate();
      const agent = Keypair.generate();
      await fund(poster);
      await fund(agent);

      await registerAgentByKeeper(agent.publicKey);

      const taskId = freshTaskId();
      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);
      await program.methods
        .createTaskSol(
          taskId,
          { direct: {} },
          new BN(MIN_REWARD_LAMPORTS),
          deadline,
          agent.publicKey,
        )
        .accounts({ poster: poster.publicKey })
        .signers([poster])
        .rpc();

      const [taskPda] = pdaTask(program.programId, taskId);
      const [agentPda] = PublicKey.findProgramAddressSync(
        [AGENT_SEED, agent.publicKey.toBuffer()],
        program.programId,
      );

      try {
        await program.methods
          .assignAgent()
          .accounts({
            poster: poster.publicKey,
            taskAccount: taskPda,
            agentAccount: agentPda,
          })
          .signers([poster])
          .rpc();
        assert.fail("expected InvalidTaskStatus");
      } catch (err) {
        assert.match(String(err), /InvalidTaskStatus/);
      }
    });
  });

  describe("reject_assignment_sol", () => {
    async function setupDirectTask(amount = MIN_REWARD_LAMPORTS) {
      const poster = Keypair.generate();
      const agent = Keypair.generate();
      await fund(poster);
      await fund(agent);

      const taskId = freshTaskId();
      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);
      await program.methods
        .createTaskSol(
          taskId,
          { direct: {} },
          new BN(amount),
          deadline,
          agent.publicKey,
        )
        .accounts({ poster: poster.publicKey })
        .signers([poster])
        .rpc();

      const [taskPda] = pdaTask(program.programId, taskId);
      const [vaultPda] = pdaVault(program.programId, taskId);
      return { poster, agent, taskId, taskPda, vaultPda };
    }

    it("agent rejects: refunds poster, closes vault, status Refunded", async () => {
      const { poster, agent, taskPda, vaultPda } = await setupDirectTask();

      const posterBefore = await provider.connection.getBalance(poster.publicKey);

      await program.methods
        .rejectAssignmentSol()
        .accounts({
          agent: agent.publicKey,
          taskAccount: taskPda,
          vault: vaultPda,
          posterWallet: poster.publicKey,
        })
        .signers([agent])
        .rpc();

      const task = await program.account.taskAccount.fetch(taskPda);
      assert.deepStrictEqual(task.status, { refunded: {} });

      const vaultInfo = await provider.connection.getAccountInfo(vaultPda);
      assert.isNull(vaultInfo, "vault should be closed");

      const posterAfter = await provider.connection.getBalance(poster.publicKey);
      assert.isAbove(
        posterAfter,
        posterBefore + MIN_REWARD_LAMPORTS - 100_000,
        "poster should be refunded escrow + vault rent",
      );
    });

    it("rejects when signer is not the assigned agent", async () => {
      const { poster, taskPda, vaultPda } = await setupDirectTask();
      const stranger = Keypair.generate();
      await fund(stranger);

      try {
        await program.methods
          .rejectAssignmentSol()
          .accounts({
            agent: stranger.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
            posterWallet: poster.publicKey,
          })
          .signers([stranger])
          .rpc();
        assert.fail("expected NotAssignedAgent");
      } catch (err) {
        assert.match(String(err), /NotAssignedAgent/);
      }
    });

    it("rejects when poster_wallet does not match the task", async () => {
      const { agent, taskPda, vaultPda } = await setupDirectTask();
      const wrongPoster = Keypair.generate();

      try {
        await program.methods
          .rejectAssignmentSol()
          .accounts({
            agent: agent.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
            posterWallet: wrongPoster.publicKey,
          })
          .signers([agent])
          .rpc();
        assert.fail("expected ConstraintAddress");
      } catch (err) {
        assert.match(String(err), /ConstraintAddress|address/i);
      }
    });
  });

  describe("settlement flows", () => {
    before(async () => {
      // Fund treasury, arbitrator, keeper so they can pay their own tx fees and
      // exist as System accounts to receive lamports.
      await fund(TREASURY_KP, 2 * LAMPORTS_PER_SOL);
      await fund(ARBITRATOR_KP, 2 * LAMPORTS_PER_SOL);
      await fund(KEEPER_KP, 2 * LAMPORTS_PER_SOL);
    });

    async function setupSubmittedDirect(
      amount = MIN_REWARD_LAMPORTS,
      deadlineOffset = 2 * HOUR,
    ) {
      const poster = Keypair.generate();
      const agent = Keypair.generate();
      await fund(poster);
      await fund(agent);

      await registerAgentByKeeper(agent.publicKey);

      const taskId = freshTaskId();
      const deadline = new BN(Math.floor(Date.now() / 1000) + deadlineOffset);
      await program.methods
        .createTaskSol(
          taskId,
          { direct: {} },
          new BN(amount),
          deadline,
          agent.publicKey,
        )
        .accounts({ poster: poster.publicKey })
        .signers([poster])
        .rpc();

      const [taskPda] = pdaTask(program.programId, taskId);
      const [vaultPda] = pdaVault(program.programId, taskId);
      const [agentPda] = PublicKey.findProgramAddressSync(
        [AGENT_SEED, agent.publicKey.toBuffer()],
        program.programId,
      );

      await program.methods
        .submitDeliverable()
        .accounts({ platformAuthority: KEEPER_KP.publicKey, taskAccount: taskPda })
        .signers([KEEPER_KP])
        .rpc();

      return {
        poster,
        agent,
        taskId,
        taskPda,
        vaultPda,
        agentPda,
        amount,
        deadline,
      };
    }

    describe("submit_deliverable", () => {
      it("agent submits, status flips to Submitted, submitted_at set", async () => {
        const { taskPda, agent } = await setupSubmittedDirect();
        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { submitted: {} });
        assert.ok(task.submittedAt && task.submittedAt.toNumber() > 0);
        assert.ok(task.assignedAgent && task.assignedAgent.equals(agent.publicKey));
      });

      it("rejects submission by a signer that is not the platform authority", async () => {
        const poster = Keypair.generate();
        const agent = Keypair.generate();
        const stranger = Keypair.generate();
        await fund(poster);
        await fund(stranger);

        const taskId = freshTaskId();
        const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);
        await program.methods
          .createTaskSol(
            taskId,
            { direct: {} },
            new BN(MIN_REWARD_LAMPORTS),
            deadline,
            agent.publicKey,
          )
          .accounts({ poster: poster.publicKey })
          .signers([poster])
          .rpc();

        const [taskPda] = pdaTask(program.programId, taskId);

        try {
          await program.methods
            .submitDeliverable()
            .accounts({ platformAuthority: stranger.publicKey, taskAccount: taskPda })
            .signers([stranger])
            .rpc();
          assert.fail("expected NotPlatformAuthority");
        } catch (err) {
          // Anchor's address constraint surfaces as ConstraintAddress, mapped
          // back to our NotPlatformAuthority error code via the @ annotation.
          assert.match(String(err), /NotPlatformAuthority|ConstraintAddress/);
        }
      });
    });

    describe("approve_sol", () => {
      it("splits 95/5, increments completed_count, settles", async () => {
        const { poster, agent, taskPda, vaultPda, agentPda, amount } =
          await setupSubmittedDirect();

        const agentBefore = await provider.connection.getBalance(agent.publicKey);
        const treasuryBefore = await provider.connection.getBalance(
          TREASURY_KP.publicKey,
        );

        await program.methods
          .approveSol()
          .accounts({
            poster: poster.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
            agentWallet: agent.publicKey,
            agentAccount: agentPda,
            treasury: TREASURY_KP.publicKey,
          })
          .signers([poster])
          .rpc();

        const expectedFee = Math.floor((amount * 500) / 10_000);
        const expectedAgent = amount - expectedFee;

        const agentAfter = await provider.connection.getBalance(agent.publicKey);
        const treasuryAfter = await provider.connection.getBalance(
          TREASURY_KP.publicKey,
        );

        assert.strictEqual(agentAfter - agentBefore, expectedAgent);
        assert.strictEqual(treasuryAfter - treasuryBefore, expectedFee);

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { settled: {} });

        const agentAccount = await program.account.agentAccount.fetch(agentPda);
        assert.strictEqual(agentAccount.completedCount.toNumber(), 1);

        const vaultInfo = await provider.connection.getAccountInfo(vaultPda);
        assert.isNull(vaultInfo, "vault should be closed");
      });

      it("rejects approve by non-poster", async () => {
        const { agent, taskPda, vaultPda, agentPda } = await setupSubmittedDirect();
        const stranger = Keypair.generate();
        await fund(stranger);

        try {
          await program.methods
            .approveSol()
            .accounts({
              poster: stranger.publicKey,
              taskAccount: taskPda,
              vault: vaultPda,
              agentWallet: agent.publicKey,
              agentAccount: agentPda,
              treasury: TREASURY_KP.publicKey,
            })
            .signers([stranger])
            .rpc();
          assert.fail("expected NotPoster");
        } catch (err) {
          assert.match(String(err), /NotPoster|ConstraintAddress/);
        }
      });
    });

    describe("claim_after_timeout_sol", () => {
      it("rejects when timeout has not elapsed", async () => {
        const { poster, agent, taskPda, vaultPda, agentPda } =
          await setupSubmittedDirect();

        try {
          await program.methods
            .claimAfterTimeoutSol()
            .accounts({
              caller: KEEPER_KP.publicKey,
              taskAccount: taskPda,
              vault: vaultPda,
              posterWallet: poster.publicKey,
              agentWallet: agent.publicKey,
              agentAccount: agentPda,
              treasury: TREASURY_KP.publicKey,
            })
            .signers([KEEPER_KP])
            .rpc();
          assert.fail("expected TimeoutNotElapsed");
        } catch (err) {
          assert.match(String(err), /TimeoutNotElapsed/);
        }
      });
    });

    describe("open_dispute", () => {
      it("poster opens dispute, status -> Disputed", async () => {
        const { poster, taskPda } = await setupSubmittedDirect();

        await program.methods
          .openDispute()
          .accounts({ signer: poster.publicKey, taskAccount: taskPda })
          .signers([poster])
          .rpc();

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { disputed: {} });
      });

      it("arbitrator can also open dispute (auto-dispute path)", async () => {
        const { taskPda } = await setupSubmittedDirect();

        await program.methods
          .openDispute()
          .accounts({ signer: ARBITRATOR_KP.publicKey, taskAccount: taskPda })
          .signers([ARBITRATOR_KP])
          .rpc();

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { disputed: {} });
      });

      it("rejects open_dispute by stranger", async () => {
        const { taskPda } = await setupSubmittedDirect();
        const stranger = Keypair.generate();
        await fund(stranger);

        try {
          await program.methods
            .openDispute()
            .accounts({ signer: stranger.publicKey, taskAccount: taskPda })
            .signers([stranger])
            .rpc();
          assert.fail("expected NotDisputeAuthority");
        } catch (err) {
          assert.match(String(err), /NotDisputeAuthority/);
        }
      });
    });

    describe("resolve_dispute_sol", () => {
      async function disputed() {
        const ctx = await setupSubmittedDirect();
        await program.methods
          .openDispute()
          .accounts({ signer: ctx.poster.publicKey, taskAccount: ctx.taskPda })
          .signers([ctx.poster])
          .rpc();
        return ctx;
      }

      it("ForAgent: 95/5 split, agent completed_count++, status Settled", async () => {
        const { poster, agent, taskPda, vaultPda, agentPda, amount } =
          await disputed();

        const agentBefore = await provider.connection.getBalance(agent.publicKey);
        const treasuryBefore = await provider.connection.getBalance(
          TREASURY_KP.publicKey,
        );

        await program.methods
          .resolveDisputeSol({ forAgent: {} })
          .accounts({
            arbitrator: ARBITRATOR_KP.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
            posterWallet: poster.publicKey,
            agentWallet: agent.publicKey,
            agentAccount: agentPda,
            treasury: TREASURY_KP.publicKey,
          })
          .signers([ARBITRATOR_KP])
          .rpc();

        const expectedFee = Math.floor((amount * 500) / 10_000);
        const expectedAgent = amount - expectedFee;

        const agentAfter = await provider.connection.getBalance(agent.publicKey);
        const treasuryAfter = await provider.connection.getBalance(
          TREASURY_KP.publicKey,
        );

        assert.strictEqual(agentAfter - agentBefore, expectedAgent);
        assert.strictEqual(treasuryAfter - treasuryBefore, expectedFee);

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { settled: {} });
        const agentAccount = await program.account.agentAccount.fetch(agentPda);
        assert.strictEqual(agentAccount.completedCount.toNumber(), 1);
      });

      it("ForPoster: full refund, agent disputed_count++, status Refunded", async () => {
        const { poster, agent, taskPda, vaultPda, agentPda, amount } =
          await disputed();

        const posterBefore = await provider.connection.getBalance(poster.publicKey);

        await program.methods
          .resolveDisputeSol({ forPoster: {} })
          .accounts({
            arbitrator: ARBITRATOR_KP.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
            posterWallet: poster.publicKey,
            agentWallet: agent.publicKey,
            agentAccount: agentPda,
            treasury: TREASURY_KP.publicKey,
          })
          .signers([ARBITRATOR_KP])
          .rpc();

        const posterAfter = await provider.connection.getBalance(poster.publicKey);
        assert.isAbove(
          posterAfter - posterBefore,
          amount - 100_000,
          "poster should be refunded the full escrow plus rent",
        );

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { refunded: {} });
        const agentAccount = await program.account.agentAccount.fetch(agentPda);
        assert.strictEqual(agentAccount.disputedCount.toNumber(), 1);
      });

      it("rejects resolve by non-arbitrator", async () => {
        const { poster, agent, taskPda, vaultPda, agentPda } = await disputed();
        const stranger = Keypair.generate();
        await fund(stranger);

        try {
          await program.methods
            .resolveDisputeSol({ forAgent: {} })
            .accounts({
              arbitrator: stranger.publicKey,
              taskAccount: taskPda,
              vault: vaultPda,
              posterWallet: poster.publicKey,
              agentWallet: agent.publicKey,
              agentAccount: agentPda,
              treasury: TREASURY_KP.publicKey,
            })
            .signers([stranger])
            .rpc();
          assert.fail("expected NotArbitrator");
        } catch (err) {
          assert.match(String(err), /NotArbitrator|ConstraintAddress/);
        }
      });
    });

    describe("expire_task_sol", () => {
      it("rejects expire before deadline", async () => {
        const poster = Keypair.generate();
        const agent = Keypair.generate();
        await fund(poster);
        await fund(agent);

        await registerAgentByKeeper(agent.publicKey);

        // We can't create a task with a deadline < 1h, so we use min buffer
        // and... actually we can't realistically wait an hour in CI.
        // Instead, test only the "before deadline" rejection path; expiry happy
        // path will be covered later via clock manipulation in LiteSVM tests.
        const taskId = freshTaskId();
        const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);
        await program.methods
          .createTaskSol(
            taskId,
            { direct: {} },
            new BN(MIN_REWARD_LAMPORTS),
            deadline,
            agent.publicKey,
          )
          .accounts({ poster: poster.publicKey })
          .signers([poster])
          .rpc();

        const [taskPda] = pdaTask(program.programId, taskId);
        const [vaultPda] = pdaVault(program.programId, taskId);
        const [agentPda] = PublicKey.findProgramAddressSync(
          [AGENT_SEED, agent.publicKey.toBuffer()],
          program.programId,
        );

        try {
          await program.methods
            .expireTaskSol()
            .accounts({
              caller: KEEPER_KP.publicKey,
              taskAccount: taskPda,
              vault: vaultPda,
              posterWallet: poster.publicKey,
              agentAccount: agentPda,
            })
            .signers([KEEPER_KP])
            .rpc();
          assert.fail("expected DeadlineTooSoon (not yet past deadline)");
        } catch (err) {
          assert.match(String(err), /DeadlineTooSoon/);
        }
      });
    });
  });

  describe("USDC flows", () => {
    let mintAuthority: Keypair;
    let usdcMint: PublicKey;
    let treasuryAta: PublicKey;
    const MIN_USDC = 1_000_000;

    before(async () => {
      mintAuthority = Keypair.generate();
      await fund(mintAuthority, 5 * LAMPORTS_PER_SOL);
      await fund(TREASURY_KP, 2 * LAMPORTS_PER_SOL);
      await fund(ARBITRATOR_KP, 2 * LAMPORTS_PER_SOL);
      await fund(KEEPER_KP, 2 * LAMPORTS_PER_SOL);

      usdcMint = await createMint(
        provider.connection,
        mintAuthority,
        mintAuthority.publicKey,
        null,
        6,
      );

      treasuryAta = getAssociatedTokenAddressSync(usdcMint, TREASURY_KP.publicKey);
    });

    async function setupPosterWithUsdc(amount = MIN_USDC * 5) {
      const poster = Keypair.generate();
      await fund(poster);

      const posterAta = await createAssociatedTokenAccount(
        provider.connection,
        poster,
        usdcMint,
        poster.publicKey,
      );

      await mintTo(
        provider.connection,
        mintAuthority,
        usdcMint,
        posterAta,
        mintAuthority.publicKey,
        amount,
      );
      return { poster, posterAta };
    }

    async function setupSubmittedUsdcDirect(amount = MIN_USDC) {
      const { poster, posterAta } = await setupPosterWithUsdc(amount * 2);
      const agent = Keypair.generate();
      await fund(agent);

      await registerAgentByKeeper(agent.publicKey);

      const taskId = freshTaskId();
      const [taskPda] = pdaTask(program.programId, taskId);
      const [vaultPda] = pdaVault(program.programId, taskId);
      const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
      const [agentPda] = PublicKey.findProgramAddressSync(
        [AGENT_SEED, agent.publicKey.toBuffer()],
        program.programId,
      );

      const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);
      await program.methods
        .createTaskUsdc(
          taskId,
          { direct: {} },
          new BN(amount),
          deadline,
          agent.publicKey,
        )
        .accounts({
          poster: poster.publicKey,
          usdcMint,
          posterTokenAccount: posterAta,
          vaultTokenAccount: vaultAta,
        })
        .signers([poster])
        .rpc();

      await program.methods
        .submitDeliverable()
        .accounts({ platformAuthority: KEEPER_KP.publicKey, taskAccount: taskPda })
        .signers([KEEPER_KP])
        .rpc();

      const agentAta = getAssociatedTokenAddressSync(usdcMint, agent.publicKey);

      return {
        poster,
        posterAta,
        agent,
        agentAta,
        taskId,
        taskPda,
        vaultPda,
        vaultAta,
        agentPda,
        amount,
      };
    }

    describe("create_task_usdc", () => {
      it("Bounty mode: escrows USDC into PDA-owned token account", async () => {
        const { poster, posterAta } = await setupPosterWithUsdc();
        const taskId = freshTaskId();
        const [taskPda] = pdaTask(program.programId, taskId);
        const [vaultPda] = pdaVault(program.programId, taskId);
        const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);

        const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);

        await program.methods
          .createTaskUsdc(taskId, { bounty: {} }, new BN(MIN_USDC), deadline, null)
          .accounts({
            poster: poster.publicKey,
            usdcMint,
            posterTokenAccount: posterAta,
            vaultTokenAccount: vaultAta,
          })
          .signers([poster])
          .rpc();

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.currency, { usdc: {} });
        assert.deepStrictEqual(task.status, { created: {} });
        assert.strictEqual(task.amount.toNumber(), MIN_USDC);

        const vaultTokenInfo = await getAccount(provider.connection, vaultAta);
        assert.strictEqual(Number(vaultTokenInfo.amount), MIN_USDC);
        assert.ok(
          vaultTokenInfo.owner.equals(vaultPda),
          "vault ATA should be owned by vault PDA",
        );
      });

      it("rejects amount below 1 USDC", async () => {
        const { poster, posterAta } = await setupPosterWithUsdc();
        const taskId = freshTaskId();
        const [vaultPda] = pdaVault(program.programId, taskId);
        const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
        const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);

        try {
          await program.methods
            .createTaskUsdc(
              taskId,
              { bounty: {} },
              new BN(MIN_USDC - 1),
              deadline,
              null,
            )
            .accounts({
              poster: poster.publicKey,
              usdcMint,
              posterTokenAccount: posterAta,
              vaultTokenAccount: vaultAta,
            })
            .signers([poster])
            .rpc();
          assert.fail("expected AmountBelowMinimum");
        } catch (err) {
          assert.match(String(err), /AmountBelowMinimum/);
        }
      });
    });

    describe("cancel_task_usdc", () => {
      it("refunds the poster, closes vault and vault ATA", async () => {
        const { poster, posterAta } = await setupPosterWithUsdc();
        const taskId = freshTaskId();
        const [taskPda] = pdaTask(program.programId, taskId);
        const [vaultPda] = pdaVault(program.programId, taskId);
        const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
        const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);

        await program.methods
          .createTaskUsdc(taskId, { bounty: {} }, new BN(MIN_USDC), deadline, null)
          .accounts({
            poster: poster.publicKey,
            usdcMint,
            posterTokenAccount: posterAta,
            vaultTokenAccount: vaultAta,
          })
          .signers([poster])
          .rpc();

        const posterUsdcBefore = Number(
          (await getAccount(provider.connection, posterAta)).amount,
        );

        await program.methods
          .cancelTaskUsdc()
          .accounts({
            poster: poster.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
            usdcMint,
            vaultTokenAccount: vaultAta,
            posterTokenAccount: posterAta,
          })
          .signers([poster])
          .rpc();

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { refunded: {} });

        const posterUsdcAfter = Number(
          (await getAccount(provider.connection, posterAta)).amount,
        );
        assert.strictEqual(posterUsdcAfter - posterUsdcBefore, MIN_USDC);

        const vaultInfo = await provider.connection.getAccountInfo(vaultPda);
        assert.isNull(vaultInfo, "vault PDA should be closed");

        const vaultAtaInfo = await provider.connection.getAccountInfo(vaultAta);
        assert.isNull(vaultAtaInfo, "vault ATA should be closed");
      });
    });

    describe("reject_assignment_usdc", () => {
      it("agent rejects: refunds poster in USDC, closes vault and ATA", async () => {
        const { poster, posterAta } = await setupPosterWithUsdc();
        const agent = Keypair.generate();
        await fund(agent);

        const taskId = freshTaskId();
        const [taskPda] = pdaTask(program.programId, taskId);
        const [vaultPda] = pdaVault(program.programId, taskId);
        const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
        const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);

        await program.methods
          .createTaskUsdc(
            taskId,
            { direct: {} },
            new BN(MIN_USDC),
            deadline,
            agent.publicKey,
          )
          .accounts({
            poster: poster.publicKey,
            usdcMint,
            posterTokenAccount: posterAta,
            vaultTokenAccount: vaultAta,
          })
          .signers([poster])
          .rpc();

        const posterUsdcBefore = Number(
          (await getAccount(provider.connection, posterAta)).amount,
        );

        await program.methods
          .rejectAssignmentUsdc()
          .accounts({
            agent: agent.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
            posterWallet: poster.publicKey,
            usdcMint,
            vaultTokenAccount: vaultAta,
            posterTokenAccount: posterAta,
          })
          .signers([agent])
          .rpc();

        const posterUsdcAfter = Number(
          (await getAccount(provider.connection, posterAta)).amount,
        );
        assert.strictEqual(posterUsdcAfter - posterUsdcBefore, MIN_USDC);

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { refunded: {} });

        assert.isNull(await provider.connection.getAccountInfo(vaultPda));
        assert.isNull(await provider.connection.getAccountInfo(vaultAta));
      });
    });

    describe("approve_usdc", () => {
      it("splits 95/5 in USDC, creates recipient ATAs as needed", async () => {
        const {
          poster,
          posterAta: _posterAta,
          agent,
          agentAta,
          taskPda,
          vaultPda,
          vaultAta,
          agentPda,
          amount,
        } = await setupSubmittedUsdcDirect();

        await program.methods
          .approveUsdc()
          .accounts({
            poster: poster.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
            agentWallet: agent.publicKey,
            agentAccount: agentPda,
            treasury: TREASURY_KP.publicKey,
            usdcMint,
            vaultTokenAccount: vaultAta,
            agentTokenAccount: agentAta,
            treasuryTokenAccount: treasuryAta,
          })
          .signers([poster])
          .rpc();

        const expectedFee = Math.floor((amount * 500) / 10_000);
        const expectedAgent = amount - expectedFee;

        const agentBalance = Number(
          (await getAccount(provider.connection, agentAta)).amount,
        );
        const treasuryBalance = Number(
          (await getAccount(provider.connection, treasuryAta)).amount,
        );

        assert.strictEqual(agentBalance, expectedAgent);
        assert.strictEqual(treasuryBalance, expectedFee);

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { settled: {} });

        const agentAccount = await program.account.agentAccount.fetch(agentPda);
        assert.strictEqual(agentAccount.completedCount.toNumber(), 1);
      });
    });

    describe("claim_after_timeout_usdc", () => {
      it("rejects when timeout has not elapsed", async () => {
        const {
          agent,
          agentAta,
          taskPda,
          vaultPda,
          vaultAta,
          agentPda,
          poster,
        } = await setupSubmittedUsdcDirect();

        try {
          await program.methods
            .claimAfterTimeoutUsdc()
            .accounts({
              caller: KEEPER_KP.publicKey,
              taskAccount: taskPda,
              vault: vaultPda,
              posterWallet: poster.publicKey,
              agentWallet: agent.publicKey,
              agentAccount: agentPda,
              treasury: TREASURY_KP.publicKey,
              usdcMint,
              vaultTokenAccount: vaultAta,
              agentTokenAccount: agentAta,
              treasuryTokenAccount: treasuryAta,
            })
            .signers([KEEPER_KP])
            .rpc();
          assert.fail("expected TimeoutNotElapsed");
        } catch (err) {
          assert.match(String(err), /TimeoutNotElapsed/);
        }
      });
    });

    describe("resolve_dispute_usdc", () => {
      async function disputed() {
        const ctx = await setupSubmittedUsdcDirect();
        await program.methods
          .openDispute()
          .accounts({ signer: ctx.poster.publicKey, taskAccount: ctx.taskPda })
          .signers([ctx.poster])
          .rpc();
        return ctx;
      }

      it("ForAgent: 95/5 USDC split, completed_count++", async () => {
        const {
          poster,
          posterAta,
          agent,
          agentAta,
          taskPda,
          vaultPda,
          vaultAta,
          agentPda,
          amount,
        } = await disputed();

        await program.methods
          .resolveDisputeUsdc({ forAgent: {} })
          .accounts({
            arbitrator: ARBITRATOR_KP.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
            posterWallet: poster.publicKey,
            agentWallet: agent.publicKey,
            agentAccount: agentPda,
            treasury: TREASURY_KP.publicKey,
            usdcMint,
            vaultTokenAccount: vaultAta,
            agentTokenAccount: agentAta,
            posterTokenAccount: posterAta,
            treasuryTokenAccount: treasuryAta,
          })
          .signers([ARBITRATOR_KP])
          .rpc();

        const expectedFee = Math.floor((amount * 500) / 10_000);
        const expectedAgent = amount - expectedFee;

        const agentBalance = Number(
          (await getAccount(provider.connection, agentAta)).amount,
        );
        assert.strictEqual(agentBalance, expectedAgent);

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { settled: {} });
        const agentAccount = await program.account.agentAccount.fetch(agentPda);
        assert.strictEqual(agentAccount.completedCount.toNumber(), 1);
      });

      it("ForPoster: full USDC refund, agent disputed_count++", async () => {
        const {
          poster,
          posterAta,
          agent,
          agentAta,
          taskPda,
          vaultPda,
          vaultAta,
          agentPda,
          amount,
        } = await disputed();

        const posterBefore = Number(
          (await getAccount(provider.connection, posterAta)).amount,
        );

        await program.methods
          .resolveDisputeUsdc({ forPoster: {} })
          .accounts({
            arbitrator: ARBITRATOR_KP.publicKey,
            taskAccount: taskPda,
            vault: vaultPda,
            posterWallet: poster.publicKey,
            agentWallet: agent.publicKey,
            agentAccount: agentPda,
            treasury: TREASURY_KP.publicKey,
            usdcMint,
            vaultTokenAccount: vaultAta,
            agentTokenAccount: agentAta,
            posterTokenAccount: posterAta,
            treasuryTokenAccount: treasuryAta,
          })
          .signers([ARBITRATOR_KP])
          .rpc();

        const posterAfter = Number(
          (await getAccount(provider.connection, posterAta)).amount,
        );
        assert.strictEqual(posterAfter - posterBefore, amount);

        const task = await program.account.taskAccount.fetch(taskPda);
        assert.deepStrictEqual(task.status, { refunded: {} });
        const agentAccount = await program.account.agentAccount.fetch(agentPda);
        assert.strictEqual(agentAccount.disputedCount.toNumber(), 1);
      });
    });

    describe("expire_task_usdc", () => {
      it("rejects expire before deadline", async () => {
        const { poster, posterAta } = await setupPosterWithUsdc();
        const agent = Keypair.generate();
        await fund(agent);

        await registerAgentByKeeper(agent.publicKey);

        const taskId = freshTaskId();
        const [taskPda] = pdaTask(program.programId, taskId);
        const [vaultPda] = pdaVault(program.programId, taskId);
        const vaultAta = getAssociatedTokenAddressSync(usdcMint, vaultPda, true);
        const [agentPda] = PublicKey.findProgramAddressSync(
          [AGENT_SEED, agent.publicKey.toBuffer()],
          program.programId,
        );

        const deadline = new BN(Math.floor(Date.now() / 1000) + 2 * HOUR);
        await program.methods
          .createTaskUsdc(
            taskId,
            { direct: {} },
            new BN(MIN_USDC),
            deadline,
            agent.publicKey,
          )
          .accounts({
            poster: poster.publicKey,
            usdcMint,
            posterTokenAccount: posterAta,
            vaultTokenAccount: vaultAta,
          })
          .signers([poster])
          .rpc();

        try {
          await program.methods
            .expireTaskUsdc()
            .accounts({
              caller: KEEPER_KP.publicKey,
              taskAccount: taskPda,
              vault: vaultPda,
              posterWallet: poster.publicKey,
              usdcMint,
              vaultTokenAccount: vaultAta,
              posterTokenAccount: posterAta,
              agentAccount: agentPda,
            })
            .signers([KEEPER_KP])
            .rpc();
          assert.fail("expected DeadlineTooSoon");
        } catch (err) {
          assert.match(String(err), /DeadlineTooSoon/);
        }
      });
    });
  });
});
