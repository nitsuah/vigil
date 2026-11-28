# Verifying open-issue counts

`scripts/github-open-issue-snapshot.mjs` counts a repository's open issues straight from GitHub, to check Vigil's numbers (#311). It only reads, and prints counts: no titles, bodies or token.

```sh
GITHUB_TOKEN=<read-only token> node scripts/github-open-issue-snapshot.mjs owner/repo
```

| Variable            | Required                         | Use                                       |
| ------------------- | -------------------------------- | ----------------------------------------- |
| `GITHUB_TOKEN`      | yes                              | A token with read access to Issues only.  |
| `GITHUB_REPOSITORY` | only without the `owner/repo` argument | The repository to count.            |

Pull requests are excluded and each issue is counted once, in the first matching group: vulnerability, bug, feedback, other. Any failed or malformed page ends the run with exit code 1 and no snapshot, so a printed result always has `"complete": true`. Missing input exits 2.
