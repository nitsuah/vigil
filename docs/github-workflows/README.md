# Installing the Deploy workflow

This file is the Deploy workflow for `vigil.nitsuah.io`.
Copy it to `.github/workflows/deploy.yml` (needs the GitHub `workflow` scope) and merge.
It already skips the deploy when `CLOUDFLARE_API_TOKEN` is unset.

```bash
git mv docs/github-workflows/deploy.yml .github/workflows/deploy.yml
```
