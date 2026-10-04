import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const digest = process.env.IMAGE_DIGEST;
if (!/^sha256:[a-f0-9]{64}$/.test(digest || '')) throw new Error('Invalid release digest');
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const command = aws('ssm', 'send-command',
  '--instance-ids', process.env.EC2_INSTANCE_ID,
  '--document-name', process.env.DEPLOY_DOCUMENT,
  '--document-version', '$LATEST',
  '--parameters', JSON.stringify({ ImageDigest: [digest] }),
  '--cloud-watch-output-config', JSON.stringify({ CloudWatchOutputEnabled: true, CloudWatchLogGroupName: process.env.SSM_LOG_GROUP }));
const commandId = command.Command.CommandId;
console.log('SSM deployment command: ' + commandId);
let success = false;
for (let attempt = 0; attempt < 180; attempt++) {
  await sleep(10000);
  let result;
  try {
    result = aws('ssm', 'get-command-invocation', '--command-id', commandId, '--instance-id', process.env.EC2_INSTANCE_ID);
  } catch (error) {
    if (String(error.stderr).includes('InvocationDoesNotExist')) continue;
    throw new Error('Cannot read SSM deployment status; command ' + commandId);
  }
  if (result.Status === 'Success') { success = true; break; }
  if (['Failed', 'Cancelled', 'TimedOut', 'Cancelling'].includes(result.Status)) {
    throw new Error('SSM deployment ' + result.Status + '; inspect command ' + commandId + ' in CloudWatch.');
  }
}
if (!success) throw new Error('SSM deployment did not finish before the deadline; command ' + commandId);
for (let attempt = 0; attempt < 7; attempt++) {
  try {
    const response = await fetch(process.env.APP_URL + '/api/health/ready', { signal: AbortSignal.timeout(15000) });
    if (response.ok) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'Deployed **' + process.env.TARGET_ENV + '**: `' + digest + '`\n\n' + process.env.APP_URL + '\n');
      console.log('Public API is ready.');
      process.exit(0);
    }
  } catch { /* Retry edge/origin readiness during rollout. */ }
  await sleep(10000);
}
throw new Error('Public API readiness failed after the SSM deployment. Inspect origin and edge logs.');
