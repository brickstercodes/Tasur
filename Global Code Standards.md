## Philosophy

  

> "Code is read 10x more than it's written. Optimize for the reader."

>

> "If you need a comment to explain what code does, simplify the code first. Comments explain why, not what."

  

---

  

## Part 1: Code Design Principles

  

Claude enforces these. Tools cannot.

  

### 1.1 Readability First

  

Write code for the maintainer who will read it at 2am during an incident. Your code should be boring to read — no puzzles, no cleverness, no surprises.

  

**Go — Bad:**

```go

func p(u *U) error {

    if u.s == 1 && u.v && time.Now().Sub(u.c) < time.Hour*24 {

        return nil

    }

    return ErrInvalid

}

```

  

**Go — Good:**

```go

func validateUserSession(user *User) error {

    isActive := user.Status == StatusActive

    isVerified := user.Verified

    isRecent := time.Since(user.CreatedAt) < sessionTTL

  

    if isActive && isVerified && isRecent {

        return nil

    }

    return ErrInvalidSession

}

```

  

**TypeScript — Bad:**

```typescript

const r = await db.query(`SELECT * FROM users WHERE id = ${id} AND s = 1 AND v = true`);

```

  

**TypeScript — Good:**

```typescript

const activeVerifiedUser = await userRepository.findActiveVerifiedById(userId);

```

  

**Why it's better:** Named intermediates and descriptive function names act as documentation.

  

**Boring code wins.** If a helper function is 5 lines and used in 3 places, that's better than a 50-line generic framework used in 3 places. Optimize for the person reading your code during an incident at 2am -- no abstractions that require 4 files of context to understand.

  

---

  

### 1.2 WHY Comments, Not WHAT Comments

  

Comments explain why the code exists or why this approach was chosen. The code itself shows what it does.

  

**Bad — WHAT comment (obvious from code):**

```go

// Increment retry count

retryCount++

```

  

**Good — WHY comment (not obvious from code):**

```go

// Retry count increments before validation because the rate limiter

// checks attempt count, not successful auth count (SOC2 AC-12)

retryCount++

```

  

#### File-level WHY (every file should have this)

  

**Go:**

```go

// Package userauth handles authentication and session management.

//

// This package exists separately from the user package because authentication

// logic changes frequently with security requirements, while user data models

// are stable. Separating them allows security updates without touching core

// user logic.

package userauth

```

  

**Python:**

```python

"""

Async S3 Repository for S3 operations using aioboto3.

  

This repository provides async methods for S3 operations,

replacing the sync boto3 client with aioboto3 for better concurrency.

  

AWS credentials are handled via credential chain:

- Local: AWS SSO via ~/.aws (run: aws sso login --profile dev)

- EC2: IAM instance profile (automatic)

"""

```

  

**TypeScript:**

```typescript

/**

* User authentication and session management.

*

* This module exists separately from the user module because authentication

* logic changes frequently with security requirements, while user data models

* are stable.

*/

```

  

**Terraform:**

```hcl

# EKS Cluster Module

#

# This module creates an EKS cluster with managed node groups.

# Separated from VPC module because cluster lifecycle differs from

# network infrastructure — clusters are replaced more frequently.

```

  

#### Function-level WHY

  

**Go:**

```go

// ValidateToken checks JWT validity on every request rather than caching

// results, ensuring token revocation takes effect immediately per SOC2 AC-12.

func ValidateToken(token string) (Claims, error) {

```

  

**Python:**

```python

def validate_token(token: str) -> Claims:

    """

    Check if a JWT token is valid and not expired.

  

    Validates on every request rather than caching because token revocation

    must take effect immediately (SOC2 requirement AC-12).

    """

```

  

**TypeScript:**

```typescript

/**

* Validates JWT on every request rather than caching results.

* Token revocation must take effect immediately (SOC2 AC-12).

*/

function validateToken(token: string): Claims {

```

  

---

  

### 1.3 Single Responsibility Principle

  

Each function does one thing. Each file owns one concept. If you can't describe it without "and", split it.

  

**Bad — function doing multiple things:**

```go

func ProcessOrder(order *Order) error {

    // Validate (20 lines)

    // Calculate pricing (30 lines)

    // Save to database (20 lines)

    // Send notification (15 lines)

    // Update inventory (15 lines)

    return nil

}

```

  

**Good — single responsibility per function:**

```go

func ProcessOrder(order *Order) (*ProcessedOrder, error) {

    // Orchestrates workflow — each step can be tested independently

    if err := validateOrder(order); err != nil {

        return nil, err

    }

    pricedOrder := calculatePricing(order)

    savedOrder, err := saveOrder(pricedOrder)

    if err != nil {

        return nil, err

    }

    go notifyCustomer(savedOrder)  // async, non-blocking

    go updateInventory(savedOrder)

    return savedOrder, nil

}

```

  

**Guideline thresholds (moderate strictness):**

  

| Metric | Threshold | Action |

|--------|-----------|--------|

| Function length | > 100 lines | Must split |

| Cyclomatic complexity | > 15 | Must simplify |

| Function parameters | > 6 | Use config struct/object |

| File length | > 500 lines | Consider splitting |

  

---

  

### 1.4 DRY First, Abstract Second

  

If you write the same logic twice, extract it into a shared function. That's it. Don't create interfaces, base classes, or new architectural layers just to "organize." A simple helper function that eliminates copy-paste is worth more than an elegant abstraction nobody asked for.

  

If you write the same value twice, make it a constant.

  

**Bad — magic values:**

```go

if retryCount > 3 {

    return ErrMaxRetries

}

time.Sleep(5 * time.Second)

```

  

**Good — named constants:**

```go

const (

    maxRetries    = 3

    retryInterval = 5 * time.Second

)

  

if retryCount > maxRetries {

    return ErrMaxRetries

}

time.Sleep(retryInterval)

```

  

**Constants over magic values:** Strings, numbers, timeouts, thresholds -- if a value appears in more than one place, name it. If you'd have to grep the codebase to change it, it should be a constant. This isn't style. It's preventing the bug where you update 4 of 5 occurrences.

  

**Bad — repeated validation:**

```typescript

// In userService.ts

if (!bucketName || !bucketName.trim()) {

  throw new Error('bucketName cannot be empty');

}

  

// In documentService.ts

if (!bucketName || !bucketName.trim()) {

  throw new Error('bucketName cannot be empty');

}

```

  

**Good — extracted utility:**

```typescript

// In validation.ts

function validateRequired(value: string, fieldName: string): void {

  if (!value || !value.trim()) {

    throw new ValidationError(`${fieldName} cannot be empty`);

  }

}

```

  

---

  

### 1.5 Naming: Names Should Make Comments Unnecessary

  

If you need a comment to explain what a variable or function does, rename it instead.

  

**Bad:**

```python

t = 3600  # Time in seconds before token expires

def proc(d): ...  # Process the data

```

  

**Good:**

```python

TOKEN_TTL_SECONDS = 3600

def extract_text_from_pdf(pdf_content: bytes) -> str: ...

```

  

**Naming conventions by language:**

  

| Type | Go | Python | TypeScript |

|------|-----|--------|------------|

| Boolean | `isActive`, `hasPermission` | `is_active`, `has_permission` | `isActive`, `hasPermission` |

| Function | `ValidateToken` | `validate_token` | `validateToken` |

| Constant | `maxRetries` | `MAX_RETRIES` | `MAX_RETRIES` or `maxRetries` |

| Private | lowercase, unexported | `_private_method` | `#privateMethod` or `_privateMethod` |

| Error | `ErrNotFound` | `NotFoundError` | `NotFoundError` |

  

---

  

### 1.6 Rule of Three

  

Don't create an abstraction until you have 3 concrete reasons to. One implementation with an interface is speculative. Two is suspicious. Three is a pattern. This applies to interfaces, packages, services, and shared libraries. Build for what exists, not what might exist.

  

**Bad — premature abstraction (1 implementation):**

```go

// Created an interface for a single provider — speculative

type PaymentProcessor interface {

    Charge(amount int) error

}

  

type StripeProcessor struct{}

func (s *StripeProcessor) Charge(amount int) error { ... }

```

  

**Good — wait for the pattern (3 implementations):**

```go

// Now we have Stripe, PayPal, and Square — the interface is justified

type PaymentProcessor interface {

    Charge(ctx context.Context, amount Money) (*Receipt, error)

}

  

type StripeProcessor struct{ ... }

type PayPalProcessor struct{ ... }

type SquareProcessor struct{ ... }

```

  

**Rule of thumb:** If you're writing `type Xer interface` and there's only one `struct` implementing it, delete the interface and use the struct directly. Add the interface when the second or third implementation arrives.

  

---

  

### 1.7 Strategy Pattern Replaces Type Branching, Not Logic

  

Use polymorphism when code branches on type or variant -- provider selection, file format routing, auth methods. An `if/else` chain that grows with every new variant is a strategy pattern candidate. A guard clause, an error check, or a switch on a fixed enum is not. Don't turn `if err != nil` into an interface.

  

**Good candidate — branches grow with new variants:**

```go

// Bad: this switch grows every time we add a provider

func SendNotification(method string, msg Message) error {

    switch method {

    case "email":

        return sendEmail(msg)

    case "sms":

        return sendSMS(msg)

    case "slack":

        return sendSlack(msg)

    // ... grows forever

    }

}

  

// Good: strategy pattern — new providers don't touch existing code

type Notifier interface {

    Send(ctx context.Context, msg Message) error

}

  

func SendNotification(notifier Notifier, msg Message) error {

    return notifier.Send(ctx, msg)

}

```

  

**Not a candidate — fixed logic, not type branching:**

```go

// This is fine as-is. Don't abstract guard clauses.

func CreateUser(user *User) error {

    if user == nil {

        return ErrNilUser

    }

    if user.Email == "" {

        return ErrMissingEmail

    }

    return db.Save(user)

}

```

  

---

  

### 1.8 Dependencies Flow Inward

  

Business logic never imports transport concerns (HTTP, GraphQL, middleware). Services receive clean data as parameters. Sanitization, auth extraction, and request parsing happen at the boundary and pass results inward. If a service needs `context.Value`, the caller should extract it and pass it explicitly.

  

```

┌─────────────────────────────────────┐

│  Transport (HTTP, gRPC, CLI)        │  ← Parses requests, extracts auth

│  ┌─────────────────────────────┐    │

│  │  Service (Business Logic)   │    │  ← Receives clean params, no http.Request

│  │  ┌─────────────────────┐    │    │

│  │  │  Repository (Data)  │    │    │  ← Talks to DB/S3/external APIs

│  │  └─────────────────────┘    │    │

│  └─────────────────────────────┘    │

└─────────────────────────────────────┘

```

  

**Bad — service knows about HTTP:**

```go

func (s *UserService) CreateUser(r *http.Request) (*User, error) {

    token := r.Header.Get("Authorization")

    userID := r.Context().Value("userID").(string)

    // ...

}

```

  

**Good — service receives clean data:**

```go

func (s *UserService) CreateUser(ctx context.Context, input CreateUserInput, callerID string) (*User, error) {

    // No knowledge of HTTP, headers, or middleware

    // ...

}

  

// Handler (boundary) extracts and passes explicitly

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {

    callerID := auth.UserIDFromContext(r.Context())

    input := decodeCreateUserRequest(r)

    user, err := h.userService.CreateUser(r.Context(), input, callerID)

    // ...

}

```

  

---

  

### 1.9 Security Defaults Are Loud Failures

  

If a security mechanism can't initialize, the system refuses to start in production. No silent fallbacks, no "log a warning and continue." Development mode can be lenient. Production fails hard and tells you exactly why.

  

**Bad — silent fallback:**

```go

func initAuth() *AuthProvider {

    provider, err := NewOIDCProvider(config.IssuerURL)

    if err != nil {

        log.Warn("OIDC provider failed, falling back to no-auth")

        return &NoopAuthProvider{}  // Production running without auth

    }

    return provider

}

```

  

**Good — loud failure in production:**

```go

func initAuth(env string) *AuthProvider {

    provider, err := NewOIDCProvider(config.IssuerURL)

    if err != nil {

        if env == "production" {

            log.Fatalf("FATAL: OIDC provider initialization failed: %v", err)

        }

        log.Warn("OIDC provider failed, using dev-mode no-auth provider")

        return &DevAuthProvider{}

    }

    return provider

}

```

  

**The principle:** Security misconfigurations should be impossible to miss. A warning in a log file that nobody reads is not a security control. A process that refuses to start gets immediate attention.

  

---

  

## Part 2: Ordering Principles

  

### Priority Order

  

When ordering any code elements — struct fields, functions, config keys, imports, Makefile targets:

  

1. **Semantic order first** — lifecycle, importance, or natural flow

2. **Logical grouping second** — related items stay together

3. **Alphabetical third** — only when neither above applies

  

**Key question:** "Does order convey meaning here?"

- Yes → semantic/logical order

- No → alphabetize

  

### What to Alphabetize vs Not

  

| ✅ Alphabetize | ❌ Do NOT Alphabetize |

|----------------|----------------------|

| Imports (within groups) | Struct/class fields |

| Flat config keys | Function parameters |

| Enum values (no natural order) | Local variables |

| Dependencies in package files | Makefile targets |

| `.env.example` variables | Terraform resource arguments |

| Map/dict literals (no semantic meaning) | Kubernetes manifest fields |

  

---

  

### Language-Specific Ordering

  

#### Go Imports

```go

import (

    // stdlib - alphabetical

    "context"

    "fmt"

    "time"

  

    // external - alphabetical

    "github.com/google/uuid"

    "github.com/redis/go-redis/v9"

  

    // internal - alphabetical

    "github.com/your-org/project/internal/config"

    "github.com/your-org/project/internal/db"

)

```

  

#### Go Struct Fields (Semantic)

```go

type User struct {

    // Identity

    ID    string

    Email string

    Name  string

  

    // State

    Status   Status

    Verified bool

  

    // Timestamps

    CreatedAt time.Time

    UpdatedAt time.Time

}

```

  

#### Python Imports

```python

# stdlib - alphabetical

import os

from datetime import datetime

  

# third-party - alphabetical

import httpx

from fastapi import Depends

  

# local - alphabetical

from src.config import settings

from src.repositories import S3Repository

```

  

#### TypeScript Imports

```typescript

// node builtins

import fs from 'fs';

import path from 'path';

  

// external packages - alphabetical

import { z } from 'zod';

import express from 'express';

  

// internal - alphabetical

import { config } from '@/config';

import { db } from '@/db';

  

// relative

import { helper } from './utils';

```

  

#### Terraform Resource Arguments (Semantic)

```hcl

resource "aws_instance" "app" {

  # Identity

  ami           = var.ami_id

  instance_type = var.instance_type

  

  # Network

  subnet_id              = var.subnet_id

  vpc_security_group_ids = [aws_security_group.app.id]

  

  # IAM

  iam_instance_profile = aws_iam_instance_profile.app.name

  

  # Storage

  root_block_device {

    volume_size = 100

    encrypted   = true

  }

  

  # Metadata - always last

  tags = local.common_tags

}

```

  

#### Kubernetes Manifest Fields (Semantic)

```yaml

apiVersion: apps/v1

kind: Deployment

metadata:

  name: app

  namespace: production

spec:

  replicas: 3

  selector:

    matchLabels:

      app: myapp

  template:

    spec:

      # Security first

      serviceAccountName: myapp

      securityContext:

        runAsNonRoot: true

  

      # Containers

      containers:

        - name: app

          image: myapp:latest

  

          # Ports

          ports:

            - containerPort: 8080

  

          # Resources

          resources:

            requests:

              memory: "256Mi"

            limits:

              memory: "512Mi"

  

          # Probes

          livenessProbe:

            httpGet:

              path: /health

              port: 8080

  

          # Environment - alphabetical

          env:

            - name: DATABASE_URL

              valueFrom:

                secretKeyRef:

                  name: db-secret

                  key: url

            - name: LOG_LEVEL

              value: "info"

```

  

#### Makefile Targets (Lifecycle)

```makefile

.PHONY: help install dev build test lint deploy clean

  

help:        ## Show help (always first)

install:     ## Install dependencies

dev:         ## Run development server

build:       ## Build for production

test:        ## Run tests

lint:        ## Run linters

deploy:      ## Deploy

clean:       ## Clean artifacts (always last)

```

  

#### Dockerfile Instructions (Lifecycle)

```dockerfile

# Base and args first

FROM golang:1.22-alpine AS builder

ARG VERSION=dev

  

# System dependencies (rarely change)

RUN apk add --no-cache git ca-certificates

  

# Dependency files (change occasionally)

COPY go.mod go.sum ./

RUN go mod download

  

# Source code (changes frequently)

COPY . .

RUN go build -o /app

  

# Runtime stage

FROM alpine:3.19

COPY --from=builder /app /app

ENTRYPOINT ["/app"]

```

  

---

  

## Part 3: Tool-Enforced Standards

  

Claude follows these. Tools enforce them automatically. Don't fight the tools.

  

### Responsibility Matrix

  

| Concern | Claude Writes | Tools Enforce |

|---------|---------------|---------------|

| Import ordering | Follow pattern | ✅ goimports/ruff/eslint |

| Struct field grouping | ✅ Semantic | ❌ |

| Function length | ✅ Write short | ⚠️ Linters warn |

| WHY comments | ✅ | ❌ |

| Naming clarity | ✅ | ❌ |

| Single responsibility | ✅ | ⚠️ Complexity metrics |

| Formatting/whitespace | Let tool do it | ✅ gofmt/ruff/prettier |

| Type safety | ✅ | ✅ Type checkers |

  

### Tools by Language

  

| Language | Formatter | Linter | Type Checker |

|----------|-----------|--------|--------------|

| Go | `gofmt` | `golangci-lint` | Built-in |

| Python | `ruff format` | `ruff` | `mypy` |

| TypeScript | `prettier` | `eslint` | `tsc` |

| Terraform | `terraform fmt` | `tflint` | — |

| YAML | `prettier` | `yamllint` | — |

| Docker | — | `hadolint` | — |

  

---

  

## Part 4: Project Structure Principles

  

### General Rules

  

1. **Group by feature/domain**, not by type (except for small projects)

2. **Separate concerns**: API layer → Service layer → Repository layer

3. **Keep entry points thin**: `main.go`, `main.py`, `index.ts` should only wire things together

4. **Co-locate tests** with source or in parallel `tests/` directory

  

### Common Patterns

  

**Repository Pattern:** Data access abstraction

```

repositories/

  s3_repository.go      # S3 operations

  db_repository.go      # Database operations

```

  

**Service Pattern:** Business logic

```

services/

  indexing_service.go   # Orchestrates indexing workflow

  search_service.go     # Orchestrates search workflow

```

  

**Handler/Route Pattern:** HTTP layer

```

handlers/               # Go

routes/                 # Python/TypeScript

  health.go

  indexing.go

```

  

---

  

## Part 5: Quick Reference

  

### Before Writing Any Code

  

1. Does this file have a WHY comment at the top?

2. Does this function have a WHY comment if non-obvious?

3. Is the name clear enough that I don't need a WHAT comment?

4. Is this function doing one thing?

5. Is this function under 100 lines?

6. Am I repeating logic that exists elsewhere?

7. Would the order make sense to someone new?

  

### Before Submitting PR

  

1. Run linter and tests (`make lint`, `make test`)

2. Verify WHY comments on new files and complex functions

3. Check for magic values → should be constants

4. Check for repeated logic → should be extracted

5. Check naming → would a stranger understand?

  

---

  

## Part 6: Config Templates

  

Commented out for future expansion. Uncomment and customize as you collect real examples from your repos.

  

<!--

=============================================================================

GO CONFIG TEMPLATES

=============================================================================

  

### .golangci.yml

```yaml

# Add your actual golangci-lint config here

```

  

=============================================================================

PYTHON CONFIG TEMPLATES

=============================================================================

  

### pyproject.toml (ruff section)

```toml

# Add your actual ruff config here

```

  

=============================================================================

TYPESCRIPT CONFIG TEMPLATES

=============================================================================

  

### eslint.config.js

```javascript

// Add your actual eslint config here

```

  

### tsconfig.json

```json

// Add your actual tsconfig here

```

  

=============================================================================

TERRAFORM CONFIG TEMPLATES

=============================================================================

  

### .tflint.hcl

```hcl

# Add your actual tflint config here

```

  

=============================================================================

DOCKER CONFIG TEMPLATES

=============================================================================

  

### Dockerfile

```dockerfile

# Add your actual Dockerfile patterns here

```

  

### .hadolint.yaml

```yaml

# Add your actual hadolint config here

```

  

=============================================================================

PRE-COMMIT CONFIG TEMPLATES

=============================================================================

  

### .pre-commit-config.yaml (Go repo)

```yaml

# Add your actual Go pre-commit config here

```

  

### .pre-commit-config.yaml (Python repo)

```yaml

# Add your actual Python pre-commit config here

```

  

### .pre-commit-config.yaml (TypeScript repo)

```yaml

# Add your actual TypeScript pre-commit config here

```

  

=============================================================================

MAKEFILE TEMPLATES

=============================================================================

  

### Makefile (Go)

```makefile

# Add your actual Go Makefile here

```

  

### Makefile (Python)

```makefile

# Add your actual Python Makefile here

```

  

### Makefile (TypeScript)

```makefile

# Add your actual TypeScript Makefile here

```

  

=============================================================================

CI/CD TEMPLATES

=============================================================================

  

### .github/workflows/pr.yaml

```yaml

# Add your actual PR workflow here

```

  

### .github/workflows/on-merge.yaml

```yaml

# Add your actual merge workflow here

```

  

-->

  

---

  

## Part 7: Documentation Standards (Divio System)

  

> Based on the Divio documentation framework, which aligns with Google's internal documentation practices.

  

### Quadrant Numbering System

  

Documentation files use a numbering system that maps to four documentation types:

  

```

                        PRACTICAL

                            │

      00-09 Tutorials       │       20-29 How-to Guides

      (Learning)            │       (Task/Goal)

                            │

STUDYING ──────────────────┼────────────────── WORKING

                            │

      10-19 Explanation     │       30-39 Reference

      (Understanding)       │       (Information)

                            │

                        THEORETICAL

```

  

| Range | Quadrant | Question Answered | Audience |

|-------|----------|-------------------|----------|

| **00-09** | Tutorials | "Can you teach me?" | New users, onboarding |

| **10-19** | Explanation | "Why does this work this way?" | Engineers needing context |

| **20-29** | How-to Guides | "How do I do X?" | Engineers doing work |

| **30-39** | Reference | "What are the details?" | Engineers looking up facts |

| **99** | Troubleshooting | "Something broke!" | Anyone debugging |

  

### 00-09: Tutorials (Learning-oriented)

  

**Purpose:** Teach newcomers through hands-on steps with guaranteed working outcome.

  

**Characteristics:**

- Step-by-step with minimal explanation

- Start simple, build complexity

- Every step works if followed exactly

- Ends with a working result

  

**Examples:**

- `00-index.md` - Entry point (always exists)

- `01-quickstart.md` - "Your first X in 5 minutes"

  

**Template:**

```markdown

# Tutorial: [What You'll Learn]

  

## Prerequisites

- [What they need before starting]

  

## What You'll Build

[Screenshot or description of end result]

  

## Steps

  

### Step 1: [Action]

[Brief instruction]

\`\`\`bash

[Command]

\`\`\`

  

### Step 2: [Action]

...

  

## Next Steps

- [Link to next tutorial or how-to guides]

```

  

### 10-19: Explanation (Understanding-oriented)

  

**Purpose:** Explain concepts, architecture, and decisions. Provide context and background.

  

**Characteristics:**

- Explains WHY, not just WHAT

- Uses diagrams to illustrate

- Discusses alternatives and tradeoffs

- Provides historical context when relevant

  

**Examples:**

- `10-architecture.md` - System design overview

- `11-concepts-*.md` - Deep-dive into specific concepts

- `12-decisions-*.md` - ADRs, why we chose X over Y

  

**Template:**

```markdown

# [Concept/System Name]

  

## Overview

[1-2 sentence summary]

  

## Why This Exists

[Problem it solves, context]

  

## How It Works

  

\`\`\`

[ASCII diagram]

\`\`\`

  

[Explanation of the flow]

  

## Key Concepts

  

### [Concept 1]

[Explanation]

  

## Design Decisions

  

### Why [Decision]?

**Context:** [What problem we faced]

**Decision:** [What we chose]

**Alternatives:** [What we considered]

**Tradeoffs:** [What we gave up]

```

  

### 20-29: How-to Guides (Task-oriented)

  

**Purpose:** Help users accomplish a specific goal. Assumes basic knowledge.

  

**Characteristics:**

- Goal-oriented ("How to X")

- Assumes reader knows the basics

- Focuses on practical outcome

- Can be followed in any order

  

**Examples:**

- `20-add-new-service.md` - "How to add a new service"

- `21-configure-*.md` - "How to configure X"

- `22-migrate-*.md` - "How to migrate from X to Y"

  

**Template:**

```markdown

# How to [Achieve Goal]

  

## Prerequisites

- [What they need to know/have]

  

## Steps

  

### 1. [Action]

[Instruction with code]

  

### 2. [Action]

[Instruction with code]

  

## Verification

[How to confirm it worked]

  

## Common Issues

[Brief troubleshooting, link to 99-troubleshooting.md]

```

  

### 30-39: Reference (Information-oriented)

  

**Purpose:** Provide accurate, complete facts for lookup. NOT for reading start-to-finish.

  

**Characteristics:**

- Structured for quick lookup

- Accurate and complete

- Consistent format

- **Auto-generate when possible**

  

**Rules:**

1. **Prefer auto-generation** from source (OpenAPI, code comments, schemas)

2. **If manual, link to source** rather than duplicating code

3. Use tables for structured data

4. Keep descriptions terse

  

**Examples:**

- `30-api-reference.md` - API documentation

- `31-config-options.md` - Configuration reference

- `32-environment-vars.md` - Environment variables

  

**Template:**

```markdown

# [System] Reference

  

> **Source:** [Link to source file or generation script]

  

## [Category]

  

| Option | Type | Default | Description |

|--------|------|---------|-------------|

| `name` | type | default | Brief description |

  

## See Also

- [Link to source code]

- [Link to upstream docs]

```

  

### 99: Troubleshooting

  

**Purpose:** Help users fix problems quickly. Always numbered 99 (at the end).

  

**Characteristics:**

- Symptom → Cause → Solution format

- Searchable error messages

- Diagnostic commands included

- Links to relevant docs

  

**Template:**

```markdown

# Troubleshooting

  

## Quick Diagnostics

\`\`\`bash

[Commands to check status]

\`\`\`

  

## Common Issues

  

### [Error Message or Symptom]

  

**Symptoms:**

- [What the user sees]

  

**Cause:**

[Why this happens]

  

**Solution:**

\`\`\`bash

[Commands to fix]

\`\`\`

  

**See also:** [Link to relevant explanation doc]

```

  

### Exceptions

  

#### README.md

Repository root `README.md` is exempt from numbering. It serves as the repository entry point and typically combines:

- What is this? (Explanation)

- Quick start (Tutorial)

- How to contribute (How-to)

  

Keep `README.md` focused and link to `/docs` for detailed documentation.

  

#### CHANGELOG.md

Follows [Keep a Changelog](https://keepachangelog.com) format, not Divio.

  

#### ADRs (Architecture Decision Records)

If using a dedicated `/docs/adr` or `/docs/decisions` directory, ADRs follow their own numbering (ADR-0001, ADR-0002) but conceptually fall under 10-19 Explanation.

  

### When to Create an ADR

  

Create an ADR when making a **significant decision** that:

- Is hard to reverse later

- Affects multiple components or teams

- Has multiple viable alternatives

- Will make future engineers ask "why did we do it this way?"

  

**Examples of ADR-worthy decisions:**

- Choosing a database (PostgreSQL vs DynamoDB)

- Selecting an authentication method (JWT vs sessions)

- Picking a messaging system (Kafka vs SQS)

- Adopting a new framework or language

- Changing deployment strategy (ECS vs EKS)

- Selecting an observability stack (OTel vs Datadog)

  

**NOT ADR-worthy:**

- Code style choices (use linters)

- Library version bumps

- Bug fixes

- Small refactors

  

### ADR Template

  

Store in `/docs/adr/` or `/docs/decisions/` with naming: `ADR-NNNN-short-title.md`

  

```markdown

# ADR-NNNN: [Short Title]

  

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXXX]

  

## Context

[What is the issue? What forces are at play? 2-3 paragraphs max]

  

## Decision

[What is the change we're making? Be specific.]

  

## Alternatives Considered

  

### [Alternative 1]

- **Pros:** [List]

- **Cons:** [List]

- **Why not:** [Brief reason]

  

### [Alternative 2]

- **Pros:** [List]

- **Cons:** [List]

- **Why not:** [Brief reason]

  

## Consequences

  

### Positive

- [What becomes easier]

  

### Negative

- [What becomes harder, tradeoffs accepted]

  

### Risks

- [What could go wrong, mitigation if any]

  

## References

- [Links to relevant docs, discussions, RFCs]

```

  

### ADR Example

  

```markdown

# ADR-0001: Use OpenTelemetry for Observability

  

## Status

Accepted

  

## Context

PMM needs observability (metrics, traces, logs) across EKS and EC2 workloads,

exported to GCP Cloud Monitoring. We currently use a mix of CloudWatch,

custom StatsD, and scattered logging approaches.

  

## Decision

Adopt OpenTelemetry (OTel) as the unified observability framework:

- OTel SDK in applications (Go, .NET)

- OTel Collector as DaemonSet (EKS) and Windows Service (EC2)

- Export to GCP via otlphttp and googlecloud exporters

  

## Alternatives Considered

  

### Datadog

- **Pros:** All-in-one, great UX, easy setup

- **Cons:** Cost (~$15/host/month), vendor lock-in

- **Why not:** Budget constraints, want to use GCP Cloud Monitoring

  

### AWS CloudWatch + X-Ray

- **Pros:** Native AWS integration, no extra cost

- **Cons:** Poor multi-cloud story, limited trace correlation

- **Why not:** We export to GCP, not AWS

  

### Prometheus + Jaeger + Loki

- **Pros:** Open source, widely adopted

- **Cons:** Three separate systems, complex operations

- **Why not:** OTel provides unified approach with same backend flexibility

  

## Consequences

  

### Positive

- Single SDK for all signals (traces, metrics, logs)

- Vendor-neutral, can switch backends later

- Native OTLP support in GCP

  

### Negative

- Learning curve for teams unfamiliar with OTel

- More complex than managed solutions like Datadog

  

### Risks

- OTel is still evolving (mitigated: we use stable APIs only)

  

## References

- [OpenTelemetry docs](https://opentelemetry.io/docs/)

- [GCP Telemetry API](https://cloud.google.com/stackdriver/docs/reference/telemetry/overview)

```

  

### File Naming Convention

  

```

[NN]-[slug].md

  

Where:

- NN = two-digit number indicating quadrant

- slug = lowercase, hyphen-separated description

  

Examples:

- 00-index.md

- 01-quickstart.md

- 10-architecture.md

- 11-wif-authentication.md

- 20-add-new-service.md

- 30-api-reference.md

- 99-troubleshooting.md

```

  

### Anti-patterns

  

| Don't | Do Instead |

|-------|------------|

| Mix quadrants in one doc | Each doc serves one purpose |

| Duplicate code in docs | Link to source file |

| Manually write reference docs | Auto-generate or keep minimal with links |

| Explain WHAT code does | Explain WHY (code shows what) |

| Create docs for docs' sake | Every doc answers a real question |

  

### Quick Reference

  

**Before writing a doc, ask:**

1. What question does this answer?

2. Which quadrant does it belong to?

3. Does a doc for this already exist?

4. Am I duplicating code that could be linked?

  

**Quadrant decision tree:**

```

Is the reader trying to LEARN something new?

  → Yes: 00-09 Tutorial

  → No: Continue

  

Is the reader trying to DO a specific task?

  → Yes: 20-29 How-to Guide

  → No: Continue

  

Is the reader trying to UNDERSTAND how/why?

  → Yes: 10-19 Explanation

  → No: Continue

  

Is the reader LOOKING UP specific facts?

  → Yes: 30-39 Reference

  → No: Reconsider if doc is needed

```