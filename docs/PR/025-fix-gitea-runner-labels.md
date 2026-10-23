# PR 025 — Fix Gitea Actions runner label matching

## Summary

Correct the workflow `runs-on` labels to match the labels actually declared by the registered `act_runner`.

## Root cause

The runner registration metadata uses the `label:executor` format internally:

- `production:host`
- `docker:host`

However, `act_runner` declares the effective labels to Gitea as:

- `production`
- `docker`

The workflow must therefore use `production` and `docker`. Using the internal registration strings causes jobs to remain queued because no runner matches those labels.

## Changes

- Set both workflow jobs to `runs-on: [production, docker]`.
- Keep `cancel-in-progress: true` so stale queued runs do not block a corrected run.
- Keep host-side deployment locking in `scripts/deploy-gitea.sh` for serial deployment protection.

## Verification

- `act_runner v4.0.1` declared successfully with labels `[production docker]`.
- Workflow YAML and shell syntax validated.
- Existing application containers were not modified by this CI configuration fix.
