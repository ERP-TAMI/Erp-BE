const { spawn } = require('child_process');

const child = spawn(process.execPath, ['node_modules/@nestjs/cli/bin/nest.js', 'start', '--watch'], {
  cwd: process.cwd(),
  env: { ...process.env, APP_PORT: '3000', DB_AUTO_CONNECT: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const timeout = setTimeout(() => {
  console.error(`Timed out verifying start:dev\n${output}`);
  stopChild();
  process.exit(1);
}, 45000);

let output = '';
const collect = (chunk) => {
  output += chunk.toString();
};

child.stdout.on('data', collect);
child.stderr.on('data', collect);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // The dev server is still booting.
    }
    await delay(1000);
  }

  throw new Error(`Timed out waiting for ${url}\n${output}`);
}

async function main() {
  const health = await waitFor('http://localhost:3000/health');
  const healthBody = await health.json();
  const docs = await waitFor('http://localhost:3000/api/docs');
  const docsBody = await docs.text();

  console.log(
    JSON.stringify(
      {
        healthStatus: health.status,
        healthBody,
        docsStatus: docs.status,
        docsHasHtml: docsBody.includes('<html'),
      },
      null,
      2,
    ),
  );
}

function stopChild() {
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }

  child.kill();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(timeout);
    stopChild();
  });
