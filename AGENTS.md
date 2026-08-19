# Backend agent instructions

## Mandatory TAMI Git workflow

These rules are mandatory for humans and all coding agents:

- Fetch the remote and create every work branch from the latest `origin/dev`.
- Open feature, fix, documentation, Entity, and migration PRs against `dev`, never `main`.
- Never merge or enable auto-merge. Never bypass branch protection or approve your own PR. A teammate must provide all required reviews and approvals.
- Keep Entity/schema mapping changes, new database migrations, and application logic in separate branches and separate PRs.
- Existing committed or shared-environment migrations are immutable. Never edit, delete, rename, reorder, or overwrite them. Add a new forward-only migration.
- After opening a PR, return its clickable URL for the Jira ticket, request review only from known teammates or configured CODEOWNERS, and report `Pending code review/approval`.
- Notify the team chat/Zalo with PR type, changed Entities (or none), added migrations (or none), data impact, and PR URL. Without delivery access or evidence, prepare the exact message and report `Pending Zalo notification`; never claim it was sent.
- A task request never authorizes a merge. Stop after PR handoff and wait for teammate approval.

Before changing code, inspect the production `src` tree and follow the existing architecture, naming, module boundaries, validation, and test conventions. Do not copy code from demo projects or invent a parallel structure.

## Backend architecture

- This repository is a NestJS application using TypeORM and the Express platform adapter. Do not introduce a separate standalone Express application.
- Follow the current domain structure under `src/features/`, shared code under `src/common/`, and database infrastructure under `src/database/`.
- Keep controllers, services, repositories, DTOs/validation, entities, and tests within the established feature boundaries.
- Register modules through the existing NestJS module graph.
- Add focused unit tests and API E2E coverage for behavior or endpoint changes.
- Run the repository's relevant lint, test, E2E, and build commands before opening a PR.
