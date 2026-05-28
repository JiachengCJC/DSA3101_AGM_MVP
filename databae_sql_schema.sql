-- 1. Core Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    role VARCHAR(32) NOT NULL DEFAULT 'researcher',
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Access Roles Catalog
CREATE TABLE project_access_levels (
    key VARCHAR(64) PRIMARY KEY,
    label VARCHAR(64) NOT NULL UNIQUE,
    description VARCHAR(255),
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_add_update BOOLEAN NOT NULL DEFAULT FALSE,
    can_add_funding BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_access BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Core Projects Table
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    institution VARCHAR(128) NOT NULL,
    domain VARCHAR(128) NOT NULL,
    ai_type VARCHAR(128) NOT NULL,
    lifecycle_stage VARCHAR(128) NOT NULL DEFAULT 'Research & ideation',
    trl_level VARCHAR(128) NOT NULL DEFAULT 'TRL 1 - basic concept',
    trc_category VARCHAR(64) NOT NULL DEFAULT 'Research',
    
    -- Funding Metadata
    funding_amount_sgd NUMERIC(12, 2),
    funds_received TEXT,
    funding_scope TEXT,
    grant_year_obtained INTEGER,
    grant_start_date DATE,
    grant_end_date DATE,
    start_date DATE,
    end_date TIMESTAMP WITH TIME ZONE,
    
    -- Collaboration
    collaboration_formal_signed TEXT,
    collaboration_formal_partner VARCHAR(255),
    collaboration_formal_scope TEXT,
    collaboration_informal_partner VARCHAR(255),
    collaboration_informal_scope TEXT,
    patent_count INTEGER,
    publication TEXT,
    possible_synergy TEXT,
    ai_office_involvement TEXT,
    description TEXT,
    
    -- Relations
    owner_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Project Access & Permissions
CREATE TABLE project_permissions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    granted_by_user_id INTEGER NOT NULL REFERENCES users(id),
    access_level_key VARCHAR(64) NOT NULL REFERENCES project_access_levels(key),
    
    override_can_view BOOLEAN,
    override_can_edit BOOLEAN,
    override_can_add_update BOOLEAN,
    override_can_add_funding BOOLEAN,
    override_can_manage_access BOOLEAN,
    
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_add_update BOOLEAN NOT NULL DEFAULT FALSE,
    can_add_funding BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_access BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_project_permission_project_user UNIQUE (project_id, user_id)
);

-- 5. Project Updates & Funding Events
CREATE TABLE project_updates (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_user_id INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(64) NOT NULL DEFAULT 'Update',
    note TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_funding_events (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_user_id INTEGER NOT NULL REFERENCES users(id),
    amount_sgd NUMERIC(12, 2) NOT NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Project Versioning (Snapshots)
CREATE TABLE project_versions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    reason VARCHAR(128) NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Audit & Auth Tables
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id INTEGER NOT NULL,
    diff_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login_otp_challenges (
    id VARCHAR(36) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    purpose VARCHAR(32) NOT NULL DEFAULT 'login',
    hashed_otp VARCHAR(255) NOT NULL,
    pending_password_hash VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resend_available_at TIMESTAMP WITH TIME ZONE NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    used_at TIMESTAMP WITH TIME ZONE,
    invalidated_at TIMESTAMP WITH TIME ZONE,
    invalidation_reason VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE trusted_devices (
    id VARCHAR(36) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Option Catalogs (Repeated schema for normalized UI dropdowns)
CREATE TABLE institution_options (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    created_by_user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Note: The exact same table structure applies for `domain_options`, `ai_type_options`, `lifecycle_stage_options`, `trl_level_options`, and `trc_category_options`.