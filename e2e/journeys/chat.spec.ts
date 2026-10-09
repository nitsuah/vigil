import { test, expect, step, openDashboard, signedInContext } from './vigil';
import { NOW } from '../fixtures/demo-portfolio';

test(
  'owner asks vigil about stale docs and gets a doc-edit proposal',
  { tag: ['@feature:per-repo-conversational-interface', '@feature:chat-driven-doc-edit-proposals'] },
  async ({ page }) => {
    await step(page, 'open the chat for vigil', async () => {
      await signedInContext(page);
      // A seeded thread, so the journey never calls an AI provider.
      const at = NOW.toISOString();
      const thread = {
        vigil: [
          { id: 'u1', role: 'user', content: 'Summarize my stale docs', createdAt: at },
          {
            id: 'a1', role: 'assistant', createdAt: at,
            content: 'METRICS.md was last updated 41 days ago, so the 81.2% coverage figure may be stale. I drafted a refresh below.',
            proposal: { docType: 'metrics', summary: 'Refresh METRICS.md with the current coverage and test counts', content: '# Metrics\n\n| Metric | Value |\n|---|---|\n| Coverage | 81.2% |\n' },
          },
        ],
      };
      await page.addInitScript((t) => window.localStorage.setItem('vigil.repo-chat.v1.demo%40example.com', t), JSON.stringify(thread));
      await openDashboard(page);
      await page.locator('table tbody').getByRole('button', { name: 'Chat about vigil' }).click();
      await expect(page.getByRole('dialog')).toContainText('Health 92/100');
    });

    await step(page, 'read the proposed doc edit', async () => {
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText('Summarize my stale docs');
      await expect(dialog).toContainText('Refresh METRICS.md with the current coverage and test counts');
    }, { docs: 'chat-driven-doc-edit-proposals' });
  },
);
