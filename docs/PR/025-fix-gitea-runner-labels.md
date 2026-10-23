# PR 025 — Fix Gitea Actions runner label matching

## Summary

Correct the workflow `runs-on` value to the label proven to work with the registered `act_runner`: `production`. The runner executes Docker commands on the host, so a separate `docker` label is not required for job selection.

## Changes

- Set both workflow jobs to `runs-on: [production, docker]`.
- Keep `cancel-in-progress: true` so stale queued runs do not block a corrected run.
- Keep host-side deployment locking in `scripts/deploy-gitea.sh` for serial deployment protection.

## Verification

- `act_runner v4.0.1` declared successfully with labels `[production docker]`.
- Workflow YAML and shell syntax validated.
- Existing application containers were not modified by this CI configuration fix.
