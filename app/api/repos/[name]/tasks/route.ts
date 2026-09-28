import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { GitHubClient } from '@/lib/github';
import { getNeonClient } from '@/lib/db';
import { parseTasks } from '@/lib/parsers/tasks';
import { denyIfNoRepoAccess } from '@/lib/repo-access-guard';
import { parseGitHubError } from '@/lib/github-errors';
import logger from '@/lib/log';

const DOC_TARGET_PATHS: Record<string, string> = {
  tasks: 'TASKS.md',
  features: 'FEATURES.md',
  roadmap: 'ROADMAP.md',
};

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ name: string }> }
) {
  const params = await props.params;

  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { operation, taskId, taskTitle, section, newStatus, newSection, summary } = body;

    if (!operation || !summary) {
      return NextResponse.json({ error: 'Operation and summary required' }, { status: 400 });
    }

    const repoName = params.name;
    const denied = await denyIfNoRepoAccess(repoName, session);
    if (denied) return denied;

    const db = getNeonClient();
    const repoRows = await db`SELECT full_name FROM repos WHERE name = ${repoName} LIMIT 1`;
    if (repoRows.length === 0) {
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    }
    const fullName = repoRows[0].full_name as string;
    const [owner, repo] = fullName.split('/');

    // Get GitHub token from session
    const githubToken = (session as { accessToken?: string }).accessToken;
    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub access token not found in session' }, { status: 401 });
    }
    const github = new GitHubClient(githubToken, owner);

    // Fetch the current TASKS.md content
    const tasksContent = await github.getFileContent(repo, 'TASKS.md', owner);
    if (!tasksContent) {
      return NextResponse.json({ error: 'TASKS.md not found in repository' }, { status: 404 });
    }

    // Parse tasks
    const { frontmatter, tasks } = parseTasks(tasksContent);

    // Find the target task
    let taskIndex = -1;
    if (taskId) {
      taskIndex = tasks.findIndex(t => t.id === taskId);
    } else if (taskTitle) {
      // Fuzzy match by title (exact match first, then contains)
      taskIndex = tasks.findIndex(t => t.title === taskTitle);
      if (taskIndex === -1) {
        taskIndex = tasks.findIndex(t => t.title.toLowerCase().includes(taskTitle.toLowerCase()));
      }
    }

    // For add_task, we don't need to find an existing task
    const isAddTask = operation === 'add_task';

    if (!isAddTask && taskIndex === -1) {
      return NextResponse.json({
        error: 'Task not found',
        taskId,
        taskTitle
      }, { status: 404 });
    }

    // Apply the operation
    let newTasks: typeof tasks;
    let modifiedTask: typeof tasks[number] | null = null;

    switch (operation) {
      case 'check_off': {
        // Mark task as done - update status and move to Done section
        newTasks = [...tasks];
        const task = newTasks[taskIndex];
        task.status = 'done';
        task.section = 'Done';
        modifiedTask = task;
        break;
      }

      case 'update_status': {
        // Update task status and optionally section
        if (!newStatus) {
          return NextResponse.json({ error: 'newStatus required for update_status' }, { status: 400 });
        }
        newTasks = [...tasks];
        const task = newTasks[taskIndex];
        task.status = newStatus;
        if (newSection) {
          task.section = newSection;
        } else if (newStatus === 'done' && task.section !== 'Done') {
          task.section = 'Done';
        } else if (newStatus === 'in-progress' && task.section !== 'In Progress') {
          task.section = 'In Progress';
        } else if (newStatus === 'todo' && task.section !== 'Todo') {
          task.section = 'Todo';
        }
        modifiedTask = task;
        break;
      }

      case 'move_to_features': {
        // Remove from TASKS.md, will be added to FEATURES.md
        newTasks = tasks.filter((_, i) => i !== taskIndex);
        modifiedTask = tasks[taskIndex];
        break;
      }

      case 'move_to_roadmap': {
        // Remove from TASKS.md, will be added to ROADMAP.md
        newTasks = tasks.filter((_, i) => i !== taskIndex);
        modifiedTask = tasks[taskIndex];
        break;
      }

      case 'add_task': {
        // Add a new task
        if (!taskTitle || !section) {
          return NextResponse.json({ error: 'taskTitle and section required for add_task' }, { status: 400 });
        }
        newTasks = [...tasks];
        const newTask = {
          id: taskId || `task-${Date.now()}`,
          title: taskTitle,
          status: newStatus || 'todo',
          section,
          subsection: null,
          priority: null,
          owner: null,
        };
        newTasks.push(newTask);
        modifiedTask = newTask;
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown operation: ${operation}` }, { status: 400 });
    }

    // Serialize tasks back to markdown
    const newTasksContent = serializeTasks(frontmatter, newTasks);

    // Create branch and PR
    const branchName = `docs-task-${operation}-${Date.now()}`;
    const prUrl = await github.createPrForFile(
      repo,
      branchName,
      'TASKS.md',
      newTasksContent,
      `docs: ${summary}`
    );

    // If moving to FEATURES.md or ROADMAP.md, also update those files
    let featuresPrUrl: string | undefined;
    let roadmapPrUrl: string | undefined;

    if (operation === 'move_to_features' && modifiedTask) {
      const featuresContent = await github.getFileContent(repo, 'FEATURES.md', owner);
      const { frontmatter: fm, tasks: ftasks } = parseTasks(featuresContent || '# Features\n\n## Done\n');
      const newFeatureTask = {
        ...modifiedTask,
        status: 'done' as const,
        section: 'Done',
        subsection: modifiedTask.subsection ?? null,
        priority: modifiedTask.priority ?? null,
        owner: modifiedTask.owner ?? null,
      };
      const newFeaturesContent = serializeTasks(fm, [...ftasks, newFeatureTask]);
      const featuresBranch = `docs-features-add-${Date.now()}`;
      featuresPrUrl = await github.createPrForFile(
        repo,
        featuresBranch,
        'FEATURES.md',
        newFeaturesContent,
        `docs: move task to features - ${summary}`
      );
    }

    if (operation === 'move_to_roadmap' && modifiedTask) {
      const roadmapContent = await github.getFileContent(repo, 'ROADMAP.md', owner);
      const { frontmatter: fm, tasks: rtasks } = parseTasks(roadmapContent || '# Roadmap\n\n## Planned\n');
      const newRoadmapTask = {
        ...modifiedTask,
        status: 'done' as const, // Roadmap items in TASKS.md format use 'done' status
        section: 'Planned',
        subsection: modifiedTask.subsection ?? null,
        priority: modifiedTask.priority ?? null,
        owner: modifiedTask.owner ?? null,
      };
      const newRoadmapContent = serializeTasks(fm, [...rtasks, newRoadmapTask]);
      const roadmapBranch = `docs-roadmap-add-${Date.now()}`;
      roadmapPrUrl = await github.createPrForFile(
        repo,
        roadmapBranch,
        'ROADMAP.md',
        newRoadmapContent,
        `docs: move task to roadmap - ${summary}`
      );
    }

    return NextResponse.json({
      success: true,
      branch: branchName,
      prUrl,
      featuresPrUrl,
      roadmapPrUrl,
      operation,
      task: modifiedTask,
    });
  } catch (error: unknown) {
    logger.warn('Error performing task operation:', error);

    const errorDetails = parseGitHubError(error);
    return NextResponse.json({
      error: errorDetails.userMessage,
      type: errorDetails.type,
      helpUrl: errorDetails.helpUrl
    }, { status: 500 });
  }
}

/**
 * Serialize tasks back to markdown format matching the parser's expected format.
 */
function serializeTasks(
  frontmatter: Record<string, unknown>,
  tasks: Array<{
    id: string;
    title: string;
    status: 'todo' | 'in-progress' | 'done';
    section: string | null;
    subsection?: string | null;
    priority?: string | null;
    owner?: string | null;
  }>
): string {
  const lines: string[] = [];

  // Write frontmatter if it has content
  const fmKeys = Object.keys(frontmatter).filter(k => frontmatter[k] !== undefined);
  if (fmKeys.length > 0) {
    lines.push('---');
    for (const key of fmKeys) {
      const value = frontmatter[key];
      if (value instanceof Date) {
        lines.push(`${key}: ${value.toISOString().split('T')[0]}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push('---');
    lines.push('');
  }

  // Group tasks by section
  const sections = ['Todo', 'In Progress', 'Done'];
  const tasksBySection: Record<string, typeof tasks> = {};
  for (const task of tasks) {
    const section = task.section || 'Todo';
    if (!tasksBySection[section]) tasksBySection[section] = [];
    tasksBySection[section].push(task);
  }

  for (const section of sections) {
    const sectionTasks = tasksBySection[section] || [];
    if (sectionTasks.length === 0 && section !== 'Todo') continue;

    lines.push(`## ${section}`);
    lines.push('');

    for (const task of sectionTasks) {
      const checkbox = task.status === 'done' ? '[x]' : task.status === 'in-progress' ? '[/]' : '[ ]';
      lines.push(`- ${checkbox} ${task.title}`);

      // Add metadata as sub-bullets
      if (task.priority) {
        lines.push(`  - Priority: ${task.priority}`);
      }
      if (task.owner) {
        lines.push(`  - Owner: ${task.owner}`);
      }
      if (task.id && !task.id.startsWith('task-')) {
        // Only include custom IDs, not generated ones
        lines.push(`  <!-- id: ${task.id} -->`);
      }
    }
    lines.push('');
  }

  // Add agent instructions comment
  lines.push('<!--');
  lines.push('AGENT INSTRUCTIONS:');
  lines.push('This file tracks specific actionable tasks using a structured format.');
  lines.push('');
  lines.push('CRITICAL FORMAT REQUIREMENTS:');
  lines.push('1. Use EXACTLY these section names: "## Todo", "## In Progress", "## Done"');
  lines.push('2. Tasks MUST use checkbox format: "- [ ]" for incomplete, "- [x]" for complete');
  lines.push('3. Keep task titles on single lines');
  lines.push('4. Section headers must be ## (h2) level');
  lines.push('');
  lines.push('STATUS MARKERS:');
  lines.push('- [ ] = todo (not started)');
  lines.push('- [/] = in-progress (actively working) - OPTIONAL, use "In Progress" section instead');
  lines.push('- [x] = done (completed)');
  lines.push('');
  lines.push('GOOD EXAMPLES:');
  lines.push('## Todo');
  lines.push('- [ ] Add user authentication');
  lines.push('- [ ] Implement dark mode');
  lines.push('');
  lines.push('## In Progress');
  lines.push('- [ ] Refactor API endpoints');
  lines.push('');
  lines.push('## Done');
  lines.push('- [x] Set up database schema');
  lines.push('');
  lines.push('BAD EXAMPLES (will break parser):');
  lines.push('### Todo (wrong heading level)');
  lines.push('* [ ] Task (wrong bullet marker)');
  lines.push('- Task without checkbox');
  lines.push('- [ ] Multi-line task');
  lines.push('      with continuation (avoid this)');
  lines.push('');
  lines.push('When updating:');
  lines.push('1. Move tasks between sections as status changes');
  lines.push('2. Mark completed tasks with [x] and move to "Done"');
  lines.push('3. Add new tasks to "Todo" section');
  lines.push('4. Keep descriptions actionable and concise');
  lines.push('-->');

  return lines.join('\n');
}