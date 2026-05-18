import * as tasksDb from "../db/tasks";
import * as deliverablesDb from "../db/deliverables";
import * as judgeVerdictsDb from "../db/judge-verdicts";
import { evaluate } from "../llm/evaluate";
import { selectProvider } from "../llm/select";
import type { Verdict } from "../llm/types";
import type { DeliverableFile, ExternalLink } from "../storage/types";

export async function runJudge(taskId: string): Promise<Verdict> {
  const task = await tasksDb.getTaskById(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const deliverable = await deliverablesDb.getLatestForTask(taskId);
  if (!deliverable) throw new Error(`No deliverable found for task: ${taskId}`);

  const provider = selectProvider();
  const verdict = await evaluate(
    {
      taskId,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptance_criteria as string[],
      deliverableText: deliverable.content_text,
      fileUrls: (deliverable.file_urls ?? []) as string[],
      files: (deliverable.files ?? []) as DeliverableFile[],
      externalLinks: (deliverable.external_links ?? []) as ExternalLink[],
    },
    provider,
  );

  await judgeVerdictsDb.insertVerdict({
    taskId,
    verdict: verdict.verdict,
    confidence: verdict.confidence,
    reasoning: verdict.reasoning,
    failedCriteria: verdict.failedCriteria,
    model: verdict.model,
    promptVersion: verdict.promptVersion,
  });

  return verdict;
}
