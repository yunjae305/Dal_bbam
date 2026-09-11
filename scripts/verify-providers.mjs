import { verifyProviders } from './provider-verification.mjs';

const report = await verifyProviders();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
