/**
 * Tests for the visual-docs CI recipe PR workflow.
 * Ensures the template-driven PR generation works end-to-end.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { detectVisualDocs, visualRows, usesTemplatePr, visualSetup } from '@/lib/visual-docs';
import { VISUAL_DOCS_PRACTICE } from '@/lib/visual-docs';

const templatesDir = path.join(process.cwd(), 'templates');

describe('Visual Docs Recipe PR Workflow', () => {
  describe('Template files exist', () => {
    it('should have visual-docs workflow template', async () => {
      const templatePath = path.join(templatesDir, '.github', 'workflows', 'visual-docs.yml');
      await expect(fs.access(templatePath)).resolves.toBeUndefined();
    });

    it('should have HOWTO template', async () => {
      const templatePath = path.join(templatesDir, 'visual-docs', 'HOWTO.md');
      await expect(fs.access(templatePath)).resolves.toBeUndefined();
    });

    it('should have mermaid config template', async () => {
      const templatePath = path.join(templatesDir, 'diagrams', 'mermaid.config.json');
      await expect(fs.access(templatePath)).resolves.toBeUndefined();
    });

    it('should have sample diagram template', async () => {
      const templatePath = path.join(templatesDir, 'diagrams', 'architecture.mmd');
      await expect(fs.access(templatePath)).resolves.toBeUndefined();
    });

    it('should have visual-docs-readme.mjs script', async () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'visual-docs-readme.mjs');
      await expect(fs.access(scriptPath)).resolves.toBeUndefined();
    });
  });

  describe('Template content validation', () => {
    it('should have valid visual-docs workflow', async () => {
      const templatePath = path.join(templatesDir, '.github', 'workflows', 'visual-docs.yml');
      const content = await fs.readFile(templatePath, 'utf-8');
      expect(content).toContain('visual-docs');
      expect(content).toContain('playwright.visual-docs.config.ts');
      expect(content).toContain('bot/visual-docs');
      expect(content).toContain('create-pull-request');
      expect(content).toContain('docs/diagrams');
      expect(content).toContain('docs/screenshots');
    });

    it('should have HOWTO with setup instructions', async () => {
      const templatePath = path.join(templatesDir, 'visual-docs', 'HOWTO.md');
      const content = await fs.readFile(templatePath, 'utf-8');
      expect(content).toContain('visual-docs');
      expect(content).toContain('can_approve_pull_request_reviews');
      expect(content).toContain('architecture.mmd');
      expect(content).toContain('playwright.visual-docs.config.ts');
    });

    it('should have valid mermaid config', async () => {
      const templatePath = path.join(templatesDir, 'diagrams', 'mermaid.config.json');
      const content = await fs.readFile(templatePath, 'utf-8');
      const config = JSON.parse(content);
      expect(config.theme).toBeDefined();
      expect(config.themeVariables).toBeDefined();
      expect(config.flowchart).toBeDefined();
    });

    it('should have valid sample diagram', async () => {
      const templatePath = path.join(templatesDir, 'diagrams', 'architecture.mmd');
      const content = await fs.readFile(templatePath, 'utf-8');
      expect(content).toContain('mermaid');
      expect(content).toContain('flowchart');
    });

    it('should have working readme script', async () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'visual-docs-readme.mjs');
      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('visual-docs:start');
      expect(content).toContain('visual-docs:end');
      expect(content).toContain('DIAGRAMS_DIR');
      expect(content).toContain('SCREENSHOTS_DIR');
    });
  });

  describe('detectVisualDocs status transitions', () => {
    it('returns missing when no assets exist', () => {
      const result = detectVisualDocs(['README.md', 'src/index.ts'], '# Hello');
      expect(result.status).toBe('missing');
      expect(result.details.exists).toBe(false);
    });

    it('returns dormant when assets exist but not in CI and not embedded', () => {
      const result = detectVisualDocs(
        ['docs/diagrams/arch.mmd', 'docs/screenshots/dash.png'],
        '# Hello'
      );
      expect(result.status).toBe('dormant');
      expect(result.details.exists).toBe(true);
    });

    it('returns dormant when assets exist and embedded in README but no CI workflow', () => {
      const result = detectVisualDocs(
        ['docs/diagrams/arch.mmd', 'docs/diagrams/arch.svg', 'docs/screenshots/dash.png'],
        '![dash](docs/screenshots/dash.png) ![arch](docs/diagrams/arch.svg)'
      );
      expect(result.status).toBe('dormant');
      expect(result.details.embedded).toHaveLength(2);
    });

    it('returns healthy when CI workflow exists, both in CI, and both embedded', () => {
      const files = [
        '.github/workflows/visual-docs.yml',
        'playwright.visual-docs.config.ts',
        'docs/diagrams/arch.mmd',
        'docs/diagrams/arch.svg',
        'docs/screenshots/dash.png'
      ];
      const readme = '![dash](docs/screenshots/dash.png) ![arch](docs/diagrams/arch.svg)';
      const result = detectVisualDocs(files, readme, 'test-repo', { '.github/workflows/visual-docs.yml': 'workflow content' });
      expect(result.status).toBe('healthy');
      expect(result.details.elements.screenshots).toBe('ci');
      expect(result.details.elements.diagrams).toBe('ci');
    });

    it('detects inline mermaid as diagram', () => {
      const result = detectVisualDocs(
        ['README.md'],
        '```mermaid\ngraph TD; A-->B\n```'
      );
      expect(result.details.inlineMermaid).toBe(true);
      expect(result.status).toBe('dormant');
    });
  });

  describe('visualRows fix behavior', () => {
    it('offers recipe PR when no workflow exists', () => {
      const elements = { screenshots: 'missing', diagrams: 'static', videos: 'missing', pages: 'deployed' };
      const rows = visualRows('test-repo', elements, false);
      const screenshotFix = rows.find(r => r.row === 'screenshots')!.fix;
      const diagramFix = rows.find(r => r.row === 'diagrams')!.fix;

      expect(screenshotFix).toMatchObject({ kind: 'pr', practice: VISUAL_DOCS_PRACTICE });
      expect(diagramFix).toMatchObject({ kind: 'pr', practice: VISUAL_DOCS_PRACTICE });
    });

    it('offers /promo handoff when workflow exists', () => {
      const elements = { screenshots: 'static', diagrams: 'static', videos: 'missing', pages: 'deployed' };
      const rows = visualRows('test-repo', elements, true);
      const screenshotFix = rows.find(r => r.row === 'screenshots')!.fix;
      const diagramFix = rows.find(r => r.row === 'diagrams')!.fix;

      expect(screenshotFix).toMatchObject({ kind: 'handoff', skill: '/promo' });
      expect(diagramFix).toMatchObject({ kind: 'handoff', skill: '/promo' });
    });
  });

  describe('usesTemplatePr', () => {
    it('returns true only for visual_docs', () => {
      expect(usesTemplatePr('visual_docs')).toBe(true);
      expect(usesTemplatePr('dependabot')).toBe(false);
      expect(usesTemplatePr('env_template')).toBe(false);
      expect(usesTemplatePr('docker')).toBe(false);
      expect(usesTemplatePr('ci_cd')).toBe(false);
      expect(usesTemplatePr('gitignore')).toBe(false);
      expect(usesTemplatePr('pre_commit_hooks')).toBe(false);
      expect(usesTemplatePr('linting')).toBe(false);
      expect(usesTemplatePr('testing_framework')).toBe(false);
      expect(usesTemplatePr('deploy_badge')).toBe(false);
      expect(usesTemplatePr('unknown')).toBe(false);
    });
  });

  describe('visualSetup for /api/context', () => {
    it('returns correct structure with rows, elements, and actions_pr_permission', () => {
      const vd = detectVisualDocs(['docs/screenshots/a.png'], '![a](docs/screenshots/a.png)', 'x');
      const setup = visualSetup([
        { practice_type: 'visual_docs', status: vd.status, details: vd.details },
        { practice_type: 'actions_pr_permission', status: 'missing', details: { exists: false, fix: null } },
      ]);

      expect(setup.status).toBe('dormant');
      expect(setup.rows).toHaveLength(4);
      expect(setup.embedded_in_readme).toBe(true);
      expect(setup.actions_pr_permission).toMatchObject({ status: 'missing', fix: null });
      expect(setup.journeys).toBeNull();
    });
  });
});