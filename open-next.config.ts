// OpenNext adapter config for deploying to Cloudflare Workers.
// Defaults: no incremental cache (the app has no ISR/revalidate), which keeps
// the Worker free of R2/KV/D1 bindings and inside the Workers Free plan.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
