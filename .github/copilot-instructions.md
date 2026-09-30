# GitHub Copilot Instructions

This file provides custom instructions to GitHub Copilot when working in this repository.

## Project Context

**Project Name:** Vigil  
**Description:** Meta-Repository Intelligence Layer
**Tech Stack:** TypeScript, React, Next.js

## Code Style & Conventions

### General Guidelines

- Follow existing code patterns and file structure.
- Prioritize readability and maintainability.
- Write concise and well-documented code.
- Favor functional programming principles where appropriate.

### TypeScript Guidelines

- Use strict mode (`strict: true` in `tsconfig.json`).
- Prefer `const` over `let` whenever possible.
- Use explicit types for function parameters and return values.
- Leverage generics for reusable components and functions.
- Use enums for representing a fixed set of values.

**Good:**

```typescript
interface User {
  id: string;
  name: string;
}

const getUser = async (id: string): Promise<User | null> => {
  // ... fetch user logic
};
```

**Bad:**

```typescript
const getUser = async (id) => {
  // ... fetch user logic
};
```

### React Guidelines

- Use functional components with hooks.
- Prefer controlled components.
- Separate UI logic from data fetching.
- Use prop types for component validation.
- Structure components using atomic design (atoms, molecules, organisms).

**Good:**

```typescript
const Button: React.FC<{ onClick: () => void, children: React.ReactNode }> = ({ onClick, children }) => {
  return <button onClick={onClick}>{children}</button>;
};
```

**Bad:**

```typescript
class Button extends React.Component {
  render() {
    return <button onClick={this.props.onClick}>{this.props.children}</button>;
  }
}
```

### File Organization

- Group related files into feature directories.
- Use `index.ts` files for barrel exports.
- Place types in a `types` directory within the relevant module or component directory.
- Follow the pattern: `src/components/ComponentName/ComponentName.tsx`, `src/components/ComponentName/ComponentName.module.css`, `src/components/ComponentName/types.ts`, `src/components/ComponentName/index.ts`

### Commit Conventions

- Use Conventional Commits (e.g., `feat: add new feature`, `fix: correct a bug`).
- Keep commit messages concise and descriptive.
- Reference related issues in commit messages (e.g., `Fixes #123`).

## Architecture Patterns

- Prefer server components for data fetching where possible (Next.js).
- Implement optimistic updates for improved UX.
- Use a centralized state management solution (e.g., Zustand, Redux) for complex application state.

## Testing Strategy

- Write unit tests for individual components and functions.
- Write integration tests for API endpoints and component interactions.
- Use Vitest and React Testing Library for testing (the repo's actual test runner — `package.json`'s `test` script and every existing suite use Vitest, not Jest).
- Aim for high test coverage ( > 80%).

**Example:**

```typescript
// Component.test.tsx
import { render, screen } from '@testing-library/react';
import Component from './Component';

test('renders learn react link', () => {
  render(<Component />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
```

## Security Considerations

- Never commit secrets, API keys, or credentials.
- Sanitize user inputs to prevent XSS attacks.
- Use environment variables for configuration.

## Performance Guidelines

- Optimize database queries.
- Implement caching strategies.
- Use code splitting and lazy loading.
- Optimize images and assets.

## Documentation Requirements

- Document all public APIs and components.
- Update README.md with setup instructions and usage examples.
- Use JSDoc for documenting code.

## Common Pitfalls to Avoid

- Avoid using `any` type in TypeScript.
- Avoid using `@ts-ignore` without a valid reason.
- Avoid committing `console.log` statements.
- Avoid hardcoding configuration values.
- Avoid skipping error handling.
- Avoid large, monolithic components.
- Avoid unnecessary re-renders.

## Preferred Libraries & Tools

- **React Testing Library:** For component testing. Reason: Encourages testing from a user perspective.
- **Vitest:** For unit testing. Reason: the repo's actual test runner (Vite-native, fast, ESM-first) — no Jest dependency exists in `package.json`.
- **Zustand:** For state management. Reason: Simple, unopinionated, and easy to learn.
- **Axios/Fetch:** For making API requests. Reason: Reliable and well-tested.
- **ESLint/Prettier:** For code linting and formatting. Reason: Ensures code consistency.

## Additional Context

- TODO: Add link to architectural decision records (ADRs).
- TODO: Add team preferences regarding state management.
- TODO: Specify preferred method for handling environment variables.

## Closing tracked work

week-sotu and vigil read `TASKS.md` from `main`, so an item left unmarked keeps showing as open work. A PR that finishes a tracked item closes it in the same PR, in this order:

1. Finish the code and tests.
2. Before the **last** push, update the docs in the same branch: mark the `TASKS.md` item `- [x]` with a one-line `Done <date>: <what>` note (or record partial progress; to cite the PR number, open the PR as a draft first and add it in this commit). If the `TASKS.md` footer says finished items are removed rather than ticked, remove it and condense it into `CHANGELOG.md` / `FEATURES.md` instead. Tick or condense the matching `ROADMAP.md` line, add a `CHANGELOG.md` Unreleased line, and fix `README.md` / `FEATURES.md` if the change alters what they claim.
3. Commit and push, then open the PR. Say in its description which items it closes (the PR template has a slot for it).
4. **Pre-merge check**, next to CI and review threads: `git diff origin/main...HEAD --stat` must include the tracking docs whenever the PR completes a tracked item. If it doesn't, add the docs commit before merging. Never merge first and "follow up with a docs PR"; that's how stash#158/#159 and avatar#35 left finished work open (2026-09-30).

**A docs-only status PR changes status, nothing else.** When you do have to close items after the fact, touch only the lines for the items you cite (tick, `Done` note, PR link). Don't add, reword, reorder or delete other items, and don't regenerate the file from a template.

---

**Note:** These instructions help GitHub Copilot provide more relevant and consistent suggestions. Update this file as project conventions evolve.
