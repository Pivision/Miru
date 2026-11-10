/** 对本地 harness 跑的端到端断言，不参与部署。这里只确认服务活着、按顺序跑各段、汇总结果。顺序不能调：02-auth 的 cookie 与 06-admin 的「首个账号即管理员」前提都依赖执行次序。 */
import { BASE, failures, skipped, passed } from './e2e/harness.mjs';

try {
  await fetch(BASE + '/', { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`无法连接 ${BASE}`);
  console.error('请先启动本地服务：node tests/serve.mjs');
  process.exit(1);
}

console.log('Miru e2e · local harness');

await import('./e2e/01-anonymous.mjs');
await import('./e2e/02-auth.mjs');
await import('./e2e/03-csrf.mjs');
await import('./e2e/04-records.mjs');
await import('./e2e/05-shell.mjs');
await import('./e2e/06-admin.mjs');
await import('./e2e/07-account.mjs');

console.log('');
if (failures.length) {
  console.log(`${failures.length} check(s) failed:`);
  for (const failure of failures) console.log(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`All ${passed} checks passed.`);
}
if (skipped.length) {
  // 跳过必须显式列出：否则上游挂掉时整段没跑，输出里只剩「All N checks passed」。唯一例外是管理员段（只在全新内存库上成立），但也只免退出码、不免打印。
  const onlyAdmin = skipped.every((entry) => entry.startsWith('site admin section'));
  console.log(`${skipped.length} check(s) skipped:`);
  for (const entry of skipped) console.log(` - ${entry}`);
  if (!onlyAdmin) process.exitCode = 1;
}

// 下限只抓「某个 e2e 文件没被 import」，不是防回归指标：断言删掉一半仍会绿。此数只随段落增删调整。
const MIN_CHECKS = 100;
if (passed < MIN_CHECKS) {
  console.log(`只跑了 ${passed} 项，低于下限 ${MIN_CHECKS}：有 e2e 文件没被 import，或某段断言被整段跳过。`);
  process.exitCode = 1;
}
