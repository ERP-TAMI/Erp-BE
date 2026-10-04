import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const parameter = process.env.DEPLOYMENT_CONFIG_PARAMETER;
const target = process.env.TARGET_ENV;
const region = process.env.AWS_REGION;
const role = process.env.DEPLOY_ROLE_ARN;
function requireValue(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('Invalid deployment config: ' + label);
  return value;
}
requireValue(parameter, /^\/[A-Za-z0-9/_-]+$/, 'SSM parameter');
requireValue(target, /^(dev|prod)$/, 'environment');
requireValue(region, /^[a-z]{2}(-gov)?-[a-z]+-[0-9]+$/, 'region');
requireValue(role, /^arn:aws:iam::[0-9]{12}:role\/[A-Za-z0-9+=,.@_/-]+$/, 'role');
const aws = (...args) => execFileSync('aws', [...args, '--region', region, '--output', 'json'], { encoding: 'utf8' });
const identity = JSON.parse(aws('sts', 'get-caller-identity'));
const config = JSON.parse(JSON.parse(aws('ssm', 'get-parameter', '--name', parameter)).Parameter.Value);
if (config.schema_version !== 1 || config.environment !== target || config.region !== region ||
    config.account_id !== identity.Account || identity.Account !== role.split(':')[4]) {
  throw new Error('Deployment account/environment does not match the selected GitHub environment.');
}
const patterns = {
  app_url: /^https:\/\/[A-Za-z0-9.-]+$/,
  ecr_repository: /^[a-z0-9][a-z0-9._/-]*$/,
  instance_id: /^i-[0-9a-f]+$/,
  frontend_bucket: /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
  cloudfront_distribution_id: /^[A-Z0-9]+$/,
  deploy_document: /^[A-Za-z0-9_.-]+$/,
  ssm_log_group: /^\/[A-Za-z0-9/_-]+$/,
};
for (const [key, pattern] of Object.entries(patterns)) {
  const value = requireValue(config[key], pattern, key);
  appendFileSync(process.env.GITHUB_OUTPUT, key + '=' + value + '\n');
}
appendFileSync(process.env.GITHUB_OUTPUT, 'account_id=' + identity.Account + '\n');
console.log('Validated deployment target ' + target + ' in AWS account ' + identity.Account);
