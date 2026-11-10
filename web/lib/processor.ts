import { AwsClient } from "aws4fetch";

const WORKFLOW = "https://api.github.com/repos/monishpatalay/lecture-copilot/actions/workflows/process.yml/dispatches";
const ECS_REGION = "us-west-1"; // as in worker/aws/setup.sh
const ECS_NAME = "lecture-copilot"; // the cluster and the task definition family
const WAKE_TIMEOUT_MS = 8000; // the upload's response waits on this, and the lecture is queued either way

/**
 * The fast worker: a 16-core machine on Modal (worker/modal_app.py), which processes a 25-minute 1080p
 * lecture in 3 minutes against 7 on GitHub's machine. Needs PROCESSOR_URL and PROCESSOR_TOKEN.
 */
async function wakeModal(): Promise<void> {
  const url = process.env.PROCESSOR_URL;
  const token = process.env.PROCESSOR_TOKEN;
  if (!url || !token) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
  });
  if (!res.ok) console.error(`could not start the Modal worker: it answered ${res.status}`);
}

/** The free worker: a GitHub Actions run. Needs GITHUB_DISPATCH_TOKEN. */
async function wakeGitHub(): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return;
  const res = await fetch(WORKFLOW, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ ref: "main" }),
    signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
  });
  if (!res.ok) console.error(`could not start the GitHub worker: GitHub answered ${res.status}`);
}

/** The ECS RunTask request: one worker task on Fargate Spot, in the default VPC's public subnets. */
export function runTaskRequest(subnets: string, securityGroup: string) {
  return {
    cluster: ECS_NAME,
    taskDefinition: ECS_NAME,
    count: 1,
    capacityProviderStrategy: [{ capacityProvider: "FARGATE_SPOT", weight: 1 }],
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: subnets.split(",").map((s) => s.trim()).filter(Boolean),
        securityGroups: [securityGroup.trim()],
        assignPublicIp: "ENABLED", // the public subnets have no NAT; a public IP is how the task reaches R2 and Postgres
      },
    },
  };
}

/**
 * The container worker on AWS ECS Fargate (worker/Dockerfile, worker/aws/setup.sh). Needs ECS_ACCESS_KEY_ID,
 * ECS_SECRET_ACCESS_KEY (a user allowed only to start this task), ECS_SUBNETS and ECS_SECURITY_GROUP.
 */
async function wakeEcs(): Promise<void> {
  const { ECS_ACCESS_KEY_ID, ECS_SECRET_ACCESS_KEY, ECS_SUBNETS, ECS_SECURITY_GROUP } = process.env;
  if (!ECS_ACCESS_KEY_ID || !ECS_SECRET_ACCESS_KEY || !ECS_SUBNETS || !ECS_SECURITY_GROUP) return;
  const aws = new AwsClient({ accessKeyId: ECS_ACCESS_KEY_ID, secretAccessKey: ECS_SECRET_ACCESS_KEY, region: ECS_REGION, service: "ecs" });
  const res = await aws.fetch(`https://ecs.${ECS_REGION}.amazonaws.com/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "AmazonEC2ContainerServiceV20141113.RunTask" },
    body: JSON.stringify(runTaskRequest(ECS_SUBNETS, ECS_SECURITY_GROUP)),
    signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
  });
  if (!res.ok) return console.error(`could not start the ECS worker: AWS answered ${res.status} ${await res.text()}`);
  // A 200 can still carry failures, such as no Spot capacity at the moment.
  const { failures } = (await res.json()) as { failures?: { reason?: string }[] };
  if (failures?.length) console.error(`could not start the ECS worker: ${failures.map((f) => f.reason).join(", ")}`);
}

/**
 * Starts the cloud workers so a newly queued lecture is processed without a laptop. Both are woken: workers
 * claim lectures with SKIP LOCKED, so the first to start takes it and the other finds an empty queue and
 * exits in seconds. Modal usually starts within half a minute, but once took four, and GitHub covers that.
 * With neither configured this does nothing: a local worker, or GitHub's six-hourly schedule, picks it up.
 */
export async function wakeProcessor(): Promise<void> {
  const results = await Promise.allSettled([wakeModal(), wakeGitHub(), wakeEcs()]);
  for (const result of results) {
    // The lecture is queued either way; the other worker or the scheduled run will find it.
    if (result.status === "rejected") console.error("could not start a processor:", result.reason);
  }
}
