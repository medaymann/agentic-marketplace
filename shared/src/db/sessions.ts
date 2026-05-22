import type { Selectable } from "kysely";
import { getDb } from "./kysely";
import type { SessionsTable } from "./types";

export type SessionRecord = Selectable<SessionsTable>;

export async function issueSession(input: {
  token: string;
  kind: "registration" | "siws" | "cli_onboarding";
  wallet: string | null;
  data: unknown;
  expiresAt: Date;
}): Promise<void> {
  await getDb()
    .insertInto("sessions")
    .values({
      token: input.token,
      kind: input.kind,
      wallet: input.wallet,
      data: input.data,
      expires_at: input.expiresAt,
    })
    .execute();
}

export async function getSession(
  token: string,
): Promise<SessionRecord | undefined> {
  return getDb()
    .selectFrom("sessions")
    .selectAll()
    .where("token", "=", token)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
}

export async function setSessionWallet(
  token: string,
  wallet: string,
): Promise<void> {
  await getDb()
    .updateTable("sessions")
    .set({ wallet })
    .where("token", "=", token)
    .execute();
}

export async function patchSessionData(
  token: string,
  data: unknown,
): Promise<void> {
  await getDb()
    .updateTable("sessions")
    .set({ data })
    .where("token", "=", token)
    .execute();
}

export async function deleteSession(token: string): Promise<void> {
  await getDb()
    .deleteFrom("sessions")
    .where("token", "=", token)
    .execute();
}
