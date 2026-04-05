# AGM Portal MVP: Project Introduction

## Overview

**AGM Portal MVP** is a centralized platform for tracking and governing AI projects across an organization. It provides a single place for teams to register projects, monitor progress, manage access, and give leadership a portfolio-level view of ongoing initiatives.

This document is intentionally non-technical. Its purpose is to explain what the product does, who it serves, and why it matters.

---

## Why It Was Built

Information about AI projects is often fragmented across spreadsheets, emails, and team-specific tools. This makes it difficult to maintain visibility, track progress consistently, and support governance discussions.

AGM Portal was built to address these challenges by bringing project information into one shared platform so that teams can:

- maintain a clear and common view of ongoing AI initiatives
- track project maturity and progress over time
- monitor funding and project activity
- reduce ambiguity around access using role-based and project-based permissions
- support governance and leadership reporting with up-to-date portfolio summaries

---

## Who Uses It

The platform supports three primary user roles:

- **Researcher**: Works on project records they own or have been granted access to
- **Management**: Reviews portfolio performance and can run data imports
- **Admin**: Manages users and has full control over governance actions

### Global Roles and Capabilities


| Capability                     | Researcher | Management | Admin |
| ------------------------------ | ---------- | ---------- | ----- |
| Login and use registry         | Yes        | Yes        | Yes   |
| Dashboard                      | No         | Yes        | Yes   |
| AMGrant ingest                 | No         | Yes        | Yes   |
| User provisioning / revocation | No         | No         | Yes   |
| Delete project                 | No         | No         | Yes   |
| End project                    | No         | No         | Yes   |


### Visibility Rules

- **Admin** has the highest level of access and can view all project details.
- **Researcher** and **Management** users can see the project name and team members involved across the registry.
- Detailed project information is only visible to users who have been granted project-level access.
- Admins are responsible for assigning access where needed.

---

## Core Features

## 1. Secure Sign-In and Role-Based Experience

- Users sign in with their accounts.
- Navigation and available pages are tailored based on role.
- Each user only sees the features they are authorized to use.

## 2. Project Registry as a Single Source of Truth

- All authenticated users can browse the project registry.
- Users can search for projects and see who is involved.
- Sensitive project details remain protected if the user does not have project-level access.

## 3. Structured Project Records

Each project record captures standardized information such as:

- institution
- domain
- AI type
- lifecycle stage
- maturity level
- funding information
- collaboration notes
- project context notes

To ensure consistency, fields are designed to use dropdown selections wherever appropriate. This keeps records structured, comparable, and easier to analyze.

## 4. Project Updates and Funding Tracking

- Teams can post updates to maintain a clear history of project activity.
- Funding events can be logged to provide transparent spend tracking.
- Project history is kept in one place for easier accountability and review.

## 5. Project-Level Access Control

- Project owners and admins can grant, update, or revoke access for specific users.
- Access can be assigned according to responsibility.

Examples of access responsibilities include:

- **Principal Investigator**: view details, edit project, post updates, log funding, manage access
- **Team Member**: view details, edit project, post updates, log funding
- **Viewer**: view details only

Permissions are flexible rather than fixed. For example, a team member may be allowed to edit a project but restricted from posting updates. Users with access-management rights can fine-tune permissions as project teams evolve.

## 6. Version History and Restore

- Important project changes are captured as versions.
- Users can review earlier versions of a project record.
- Previous versions can be restored when needed.

## 7. Portfolio Dashboard for Oversight

For **Management** and **Admin** users, the dashboard provides:

- portfolio totals
- active project counts
- breakdowns by institution, domain, and lifecycle stage
- funding views across organizational segments
- indicators for overdue or inactive projects

This supports governance, monitoring, and decision-making at the portfolio level.

## 8. AMGrant CSV Import

- Management and Admin users can upload CSV exports to create or update project records in bulk.
- This reduces manual entry effort.
- It also helps keep the registry aligned with external project data sources.

## 9. Built-In AI Assistant

- Users can ask portfolio questions in plain language.
- Responses are generated only from the projects visible within the user’s permitted scope.
- A project is considered visible if the user has one or more relevant permissions, such as:
  - view detail
  - edit project
  - post updates
  - log funding
  - manage access

This allows users to quickly understand project status, funding patterns, and portfolio distribution without manually searching the registry.

## 10. Governance and Audit Readiness

- Key user and project actions are logged for traceability.
- Administrative safeguards are built in to reduce risky actions.
- For example, safeguards help prevent accidental loss of critical admin access.

---

## Typical Workflow

1. A user creates or updates a project in the registry.
2. The project owner grants access to collaborators as needed.
3. Team members add updates and funding entries over time.
4. Management reviews dashboard insights and identifies risks or inactivity.
5. Admins manage user accounts and governance controls as organizational needs evolve.

---

## What This MVP Delivers

AGM Portal MVP provides a practical foundation for AI portfolio governance by enabling:

- better visibility across projects
- clearer ownership and access boundaries
- more reliable leadership reporting
- faster portfolio understanding through assistant support

---

## Related Documentation

- Technical and implementation details: `[documentation.md](./documentation.md)`
- Setup and operations overview: `[README.md](./README.md)`
- Database operations guide: `[databaseNavigate.md](./databaseNavigate.md)`

