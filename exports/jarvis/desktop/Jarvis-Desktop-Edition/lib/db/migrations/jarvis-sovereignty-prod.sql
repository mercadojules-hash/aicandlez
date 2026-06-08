-- Jarvis sovereignty prod schema (#225) — ADDITIVE + IDEMPOTENT.
-- Generated from dev DATABASE_URL via: pg_dump --schema-only -t 'jarvis_*'.
-- CREATE TABLE/INDEX rewritten to IF NOT EXISTS. ADD CONSTRAINT statements are
-- applied with duplicate-tolerance by the runner (no IF NOT EXISTS for
-- constraints in Postgres). No drops, no data, no non-jarvis tables touched.

CREATE EXTENSION IF NOT EXISTS vector;

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: jarvis_agent_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_agent_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_agent_id uuid,
    from_agent_name character varying(200),
    to_agent_id uuid,
    to_agent_name character varying(200),
    run_id uuid,
    message_type character varying(32) DEFAULT 'notify'::character varying NOT NULL,
    subject character varying(200) NOT NULL,
    body text,
    payload jsonb,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_agent_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid,
    agent_name character varying(200),
    agent_type character varying(48),
    trigger character varying(32) DEFAULT 'scheduled'::character varying NOT NULL,
    status character varying(32) DEFAULT 'running'::character varying NOT NULL,
    summary text,
    output jsonb,
    items_processed integer DEFAULT 0 NOT NULL,
    error text,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    finished_at timestamp without time zone,
    duration_ms integer
);


--
-- Name: jarvis_agent_trust; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_agent_trust (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid,
    agent_name character varying(200),
    agent_type character varying(48),
    score integer DEFAULT 100 NOT NULL,
    total_runs integer DEFAULT 0 NOT NULL,
    successful_runs integer DEFAULT 0 NOT NULL,
    failed_runs integer DEFAULT 0 NOT NULL,
    denied_actions integer DEFAULT 0 NOT NULL,
    approved_actions integer DEFAULT 0 NOT NULL,
    window_started_at timestamp without time zone DEFAULT now(),
    last_computed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    role character varying(120) DEFAULT ''::character varying NOT NULL,
    description text,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    agent_type character varying(48) DEFAULT 'custom'::character varying NOT NULL,
    capabilities jsonb,
    config jsonb,
    enabled boolean DEFAULT false NOT NULL,
    schedule_seconds integer,
    priority integer DEFAULT 100 NOT NULL,
    runtime_status character varying(32) DEFAULT 'idle'::character varying NOT NULL,
    last_run_at timestamp without time zone,
    last_run_status character varying(32),
    last_error text
);


--
-- Name: jarvis_aicandlez_daily_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_aicandlez_daily_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_date character varying(10) NOT NULL,
    closed_trades integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    win_rate real,
    cumulative_realized_pnl_usd real DEFAULT 0 NOT NULL,
    gross_profit_usd real DEFAULT 0 NOT NULL,
    gross_loss_usd real DEFAULT 0 NOT NULL,
    profit_factor real,
    active_trades integer,
    open_trade_value_usd real,
    degraded boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    requested_by character varying(255),
    decided_by character varying(255),
    decided_at timestamp without time zone,
    business_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    policy_id uuid,
    subject_type character varying(32),
    subject_id uuid,
    auto_generated boolean DEFAULT false NOT NULL,
    decision_reason text
);


--
-- Name: jarvis_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(255) NOT NULL,
    user_email character varying(320),
    action character varying(64) NOT NULL,
    entity_type character varying(64) NOT NULL,
    entity_id character varying(255),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_briefings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_briefings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    summary text,
    content text,
    period character varying(32) DEFAULT 'weekly'::character varying NOT NULL,
    audience character varying(64) DEFAULT 'executive'::character varying NOT NULL,
    business_id uuid,
    published_at timestamp without time zone,
    tags jsonb,
    status character varying(32) DEFAULT 'draft'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    source_mode character varying(32) DEFAULT 'manual'::character varying NOT NULL,
    cognition_run_id uuid,
    citations jsonb,
    grounding_score integer
);


--
-- Name: jarvis_budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    scope_type character varying(32) DEFAULT 'global'::character varying NOT NULL,
    scope_value character varying(200),
    limit_count integer DEFAULT 0 NOT NULL,
    window_seconds integer DEFAULT 3600 NOT NULL,
    consumed integer DEFAULT 0 NOT NULL,
    window_started_at timestamp without time zone DEFAULT now(),
    enabled boolean DEFAULT true NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_businesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(140) NOT NULL,
    description text,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    monthly_revenue real,
    health_status character varying(32)
);


--
-- Name: jarvis_code_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_code_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    path character varying(1024) NOT NULL,
    artifact character varying(160),
    language character varying(32),
    kind character varying(32) DEFAULT 'source'::character varying NOT NULL,
    size_bytes integer,
    line_count integer,
    summary text,
    symbols jsonb,
    content_hash character varying(64),
    indexed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_cognition_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_cognition_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind character varying(48) NOT NULL,
    agent_id uuid,
    agent_type character varying(48),
    model character varying(120),
    params jsonb,
    prompt_hash character varying(64),
    retrieved_refs jsonb,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cost_micros integer DEFAULT 0 NOT NULL,
    latency_ms integer,
    status character varying(32) DEFAULT 'ok'::character varying NOT NULL,
    grounding_score integer,
    raw_output text,
    parsed_proposal jsonb,
    error text,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_commands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    command_text character varying(500) NOT NULL,
    verb character varying(64),
    args jsonb,
    issued_by character varying(255),
    status character varying(32) DEFAULT 'received'::character varying NOT NULL,
    routed_agent_type character varying(48),
    routing_rule_id uuid,
    workflow_run_id uuid,
    delegation_id uuid,
    result jsonb,
    error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    governance_state character varying(32) DEFAULT 'none'::character varying NOT NULL,
    policy_evaluation_id uuid,
    approval_id uuid
);


--
-- Name: jarvis_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    system_id uuid,
    name character varying(200) NOT NULL,
    category character varying(32) DEFAULT 'other'::character varying NOT NULL,
    purpose text,
    storage_location character varying(200),
    dependent_systems jsonb,
    present boolean,
    last_verified_at timestamp without time zone,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    context text,
    decision text,
    rationale text,
    status character varying(32) DEFAULT 'proposed'::character varying NOT NULL,
    business_id uuid,
    decided_by character varying(255),
    decided_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_delegations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_delegations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_agent_id uuid,
    from_agent_name character varying(200),
    to_agent_id uuid,
    to_agent_name character varying(200),
    task_id uuid,
    workflow_run_id uuid,
    objective character varying(300) NOT NULL,
    action character varying(64),
    input jsonb,
    status character varying(32) DEFAULT 'assigned'::character varying NOT NULL,
    priority character varying(16) DEFAULT 'medium'::character varying NOT NULL,
    due_at timestamp without time zone,
    result jsonb,
    error text,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    governance_state character varying(32) DEFAULT 'none'::character varying NOT NULL,
    policy_evaluation_id uuid,
    approval_id uuid
);


--
-- Name: jarvis_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_type character varying(64) NOT NULL,
    subject_id uuid NOT NULL,
    model character varying(120) NOT NULL,
    dims integer DEFAULT 1536 NOT NULL,
    embedding public.vector(1536) NOT NULL,
    content_hash character varying(64) NOT NULL,
    business_id uuid,
    created_by character varying(255),
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_escalation_chain_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_escalation_chain_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chain_id uuid,
    level integer DEFAULT 0 NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    agent_type character varying(48),
    agent_id uuid,
    sla_seconds integer DEFAULT 3600 NOT NULL,
    notify_role character varying(32),
    instruction text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_escalation_chains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_escalation_chains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    enabled boolean DEFAULT true NOT NULL,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_escalations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    severity character varying(16) DEFAULT 'medium'::character varying NOT NULL,
    status character varying(32) DEFAULT 'open'::character varying NOT NULL,
    business_id uuid,
    assignee_agent_id uuid,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    chain_id uuid,
    current_level integer DEFAULT 0 NOT NULL,
    next_escalation_at timestamp without time zone,
    governance_state character varying(32) DEFAULT 'none'::character varying NOT NULL,
    policy_evaluation_id uuid,
    approval_id uuid
);


--
-- Name: jarvis_findings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_findings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    summary text,
    detail text,
    category character varying(64) DEFAULT 'general'::character varying NOT NULL,
    severity character varying(16) DEFAULT 'medium'::character varying NOT NULL,
    confidence integer DEFAULT 50 NOT NULL,
    source character varying(255),
    business_id uuid,
    project_id uuid,
    tags jsonb,
    status character varying(32) DEFAULT 'open'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_infra_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_infra_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    system_id uuid,
    resource_type character varying(32) DEFAULT 'other'::character varying NOT NULL,
    name character varying(320) NOT NULL,
    provider character varying(160),
    purpose text,
    location text,
    depends_on jsonb,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    metadata jsonb,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    content text,
    insight_type character varying(32) DEFAULT 'trend'::character varying NOT NULL,
    confidence integer DEFAULT 50 NOT NULL,
    source character varying(255),
    finding_id uuid,
    business_id uuid,
    tags jsonb,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_knowledge_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_knowledge_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    summary text,
    content text,
    asset_type character varying(32) DEFAULT 'document'::character varying NOT NULL,
    source_url character varying(2048),
    category_id uuid,
    business_id uuid,
    tags jsonb,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    source_path character varying(1024)
);


--
-- Name: jarvis_knowledge_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_knowledge_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(140) NOT NULL,
    description text,
    color character varying(32),
    parent_id uuid,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_knowledge_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_knowledge_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_type character varying(64) NOT NULL,
    source_id uuid NOT NULL,
    target_type character varying(64) NOT NULL,
    target_id uuid NOT NULL,
    relation_type character varying(48) DEFAULT 'relates_to'::character varying NOT NULL,
    note text,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_memories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    content text,
    memory_type character varying(32) DEFAULT 'fact'::character varying NOT NULL,
    importance character varying(16) DEFAULT 'normal'::character varying NOT NULL,
    category_id uuid,
    business_id uuid,
    source_type character varying(64),
    source_id character varying(255),
    pinned boolean DEFAULT false NOT NULL,
    tags jsonb,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    scope_type character varying(32) DEFAULT 'global'::character varying NOT NULL,
    scope_value character varying(200),
    effect character varying(32) DEFAULT 'allow'::character varying NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    conditions jsonb,
    require_approval_role character varying(32) DEFAULT 'admin'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_policy_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_policy_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    policy_id uuid,
    policy_name character varying(200),
    subject_type character varying(32) NOT NULL,
    subject_id uuid,
    agent_type character varying(48),
    action character varying(64),
    decision character varying(32) NOT NULL,
    reason text,
    approval_id uuid,
    trust_score_at_eval integer,
    budget_snapshot jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    name character varying(200) NOT NULL,
    description text,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    rationale text,
    action text,
    priority character varying(16) DEFAULT 'medium'::character varying NOT NULL,
    impact character varying(16) DEFAULT 'medium'::character varying NOT NULL,
    effort character varying(16) DEFAULT 'medium'::character varying NOT NULL,
    finding_id uuid,
    business_id uuid,
    tags jsonb,
    status character varying(32) DEFAULT 'proposed'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_render_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_render_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    render_service_id character varying(120) NOT NULL,
    name character varying(240),
    service_type character varying(48),
    env character varying(48),
    region character varying(48),
    repo text,
    branch character varying(160),
    auto_deploy boolean,
    suspended character varying(32),
    dashboard_url text,
    service_url text,
    last_deploy_id character varying(120),
    last_deploy_status character varying(48),
    last_deploy_commit character varying(120),
    last_deploy_created_at timestamp without time zone,
    last_deploy_finished_at timestamp without time zone,
    raw jsonb,
    last_synced_at timestamp without time zone,
    sync_error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    title character varying(240) NOT NULL,
    report_type character varying(32) DEFAULT 'executive_summary'::character varying NOT NULL,
    period_start character varying(10),
    period_end character varying(10),
    compare_period_start character varying(10),
    compare_period_end character varying(10),
    data jsonb,
    narrative text,
    cognition_run_id uuid,
    grounding_score integer,
    status character varying(32) DEFAULT 'complete'::character varying NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_repositories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_repositories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    system_id uuid,
    business_id uuid,
    provider character varying(32) DEFAULT 'github'::character varying NOT NULL,
    full_name character varying(320) NOT NULL,
    url text,
    default_branch character varying(160),
    description text,
    last_commit_sha character varying(64),
    last_commit_message text,
    last_commit_author character varying(200),
    last_commit_at timestamp without time zone,
    open_pr_count integer,
    last_workflow_status character varying(48),
    last_workflow_conclusion character varying(48),
    last_synced_at timestamp without time zone,
    sync_error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_routing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_routing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    match_type character varying(32) DEFAULT 'any'::character varying NOT NULL,
    match_value character varying(200),
    target_agent_type character varying(48),
    target_agent_id uuid,
    chain_id uuid,
    fallback_agent_type character varying(48),
    priority integer DEFAULT 100 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_runbooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_runbooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    system_id uuid,
    business_id uuid,
    title character varying(240) NOT NULL,
    kind character varying(32) DEFAULT 'operational'::character varying NOT NULL,
    content text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    source_path character varying(1024)
);


--
-- Name: jarvis_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(120) NOT NULL,
    value jsonb,
    updated_by character varying(255),
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_systems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_systems (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    name character varying(200) NOT NULL,
    slug character varying(160) NOT NULL,
    kind character varying(32) DEFAULT 'service'::character varying NOT NULL,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    description text,
    architecture text,
    infrastructure text,
    build_process text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    status character varying(32) DEFAULT 'todo'::character varying NOT NULL,
    priority character varying(16) DEFAULT 'medium'::character varying NOT NULL,
    business_id uuid,
    project_id uuid,
    assignee_agent_id uuid,
    due_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_voice_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_voice_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    business_id uuid,
    created_by character varying(255),
    user_email character varying(320),
    turn_count integer DEFAULT 0 NOT NULL,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    last_turn_at timestamp without time zone,
    ended_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_voice_turns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_voice_turns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    turn_index integer DEFAULT 0 NOT NULL,
    transcript text,
    transcript_confidence integer,
    intent character varying(64),
    intent_confidence integer,
    capability character varying(64),
    reply_text text,
    tts_ok boolean DEFAULT false NOT NULL,
    status character varying(32) DEFAULT 'ok'::character varying NOT NULL,
    error text,
    cognition_run_id uuid,
    links jsonb,
    cost_micros integer DEFAULT 0 NOT NULL,
    latency_ms integer,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_workflow_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_workflow_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid,
    workflow_name character varying(200),
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    trigger character varying(32) DEFAULT 'manual'::character varying NOT NULL,
    context jsonb,
    initiated_by character varying(255),
    steps_total integer DEFAULT 0 NOT NULL,
    steps_completed integer DEFAULT 0 NOT NULL,
    error text,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    finished_at timestamp without time zone,
    duration_ms integer,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jarvis_workflow_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_workflow_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_run_id uuid,
    step_key character varying(120) NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    agent_id uuid,
    agent_name character varying(200),
    agent_type character varying(48),
    action character varying(64),
    depends_on jsonb,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp without time zone,
    finished_at timestamp without time zone,
    duration_ms integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    governance_state character varying(32) DEFAULT 'none'::character varying NOT NULL,
    policy_evaluation_id uuid,
    approval_id uuid
);


--
-- Name: jarvis_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.jarvis_workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    trigger character varying(120) DEFAULT 'manual'::character varying NOT NULL,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    definition jsonb,
    version integer DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT false NOT NULL
);


--
-- Name: jarvis_agent_messages jarvis_agent_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_agent_messages
    ADD CONSTRAINT jarvis_agent_messages_pkey PRIMARY KEY (id);


--
-- Name: jarvis_agent_runs jarvis_agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_agent_runs
    ADD CONSTRAINT jarvis_agent_runs_pkey PRIMARY KEY (id);


--
-- Name: jarvis_agent_trust jarvis_agent_trust_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_agent_trust
    ADD CONSTRAINT jarvis_agent_trust_pkey PRIMARY KEY (id);


--
-- Name: jarvis_agents jarvis_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_agents
    ADD CONSTRAINT jarvis_agents_pkey PRIMARY KEY (id);


--
-- Name: jarvis_aicandlez_daily_snapshots jarvis_aicandlez_daily_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_aicandlez_daily_snapshots
    ADD CONSTRAINT jarvis_aicandlez_daily_snapshots_pkey PRIMARY KEY (id);


--
-- Name: jarvis_aicandlez_daily_snapshots jarvis_aicandlez_daily_snapshots_snapshot_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_aicandlez_daily_snapshots
    ADD CONSTRAINT jarvis_aicandlez_daily_snapshots_snapshot_date_unique UNIQUE (snapshot_date);


--
-- Name: jarvis_approvals jarvis_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_approvals
    ADD CONSTRAINT jarvis_approvals_pkey PRIMARY KEY (id);


--
-- Name: jarvis_audit_logs jarvis_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_audit_logs
    ADD CONSTRAINT jarvis_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: jarvis_briefings jarvis_briefings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_briefings
    ADD CONSTRAINT jarvis_briefings_pkey PRIMARY KEY (id);


--
-- Name: jarvis_budgets jarvis_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_budgets
    ADD CONSTRAINT jarvis_budgets_pkey PRIMARY KEY (id);


--
-- Name: jarvis_businesses jarvis_businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_businesses
    ADD CONSTRAINT jarvis_businesses_pkey PRIMARY KEY (id);


--
-- Name: jarvis_businesses jarvis_businesses_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_businesses
    ADD CONSTRAINT jarvis_businesses_slug_unique UNIQUE (slug);


--
-- Name: jarvis_code_files jarvis_code_files_path_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_code_files
    ADD CONSTRAINT jarvis_code_files_path_unique UNIQUE (path);


--
-- Name: jarvis_code_files jarvis_code_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_code_files
    ADD CONSTRAINT jarvis_code_files_pkey PRIMARY KEY (id);


--
-- Name: jarvis_cognition_runs jarvis_cognition_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_cognition_runs
    ADD CONSTRAINT jarvis_cognition_runs_pkey PRIMARY KEY (id);


--
-- Name: jarvis_commands jarvis_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_commands
    ADD CONSTRAINT jarvis_commands_pkey PRIMARY KEY (id);


--
-- Name: jarvis_credentials jarvis_credentials_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_credentials
    ADD CONSTRAINT jarvis_credentials_name_unique UNIQUE (name);


--
-- Name: jarvis_credentials jarvis_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_credentials
    ADD CONSTRAINT jarvis_credentials_pkey PRIMARY KEY (id);


--
-- Name: jarvis_decisions jarvis_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_decisions
    ADD CONSTRAINT jarvis_decisions_pkey PRIMARY KEY (id);


--
-- Name: jarvis_delegations jarvis_delegations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_delegations
    ADD CONSTRAINT jarvis_delegations_pkey PRIMARY KEY (id);


--
-- Name: jarvis_embeddings jarvis_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_embeddings
    ADD CONSTRAINT jarvis_embeddings_pkey PRIMARY KEY (id);


--
-- Name: jarvis_escalation_chain_steps jarvis_escalation_chain_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_escalation_chain_steps
    ADD CONSTRAINT jarvis_escalation_chain_steps_pkey PRIMARY KEY (id);


--
-- Name: jarvis_escalation_chains jarvis_escalation_chains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_escalation_chains
    ADD CONSTRAINT jarvis_escalation_chains_pkey PRIMARY KEY (id);


--
-- Name: jarvis_escalations jarvis_escalations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_escalations
    ADD CONSTRAINT jarvis_escalations_pkey PRIMARY KEY (id);


--
-- Name: jarvis_findings jarvis_findings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_findings
    ADD CONSTRAINT jarvis_findings_pkey PRIMARY KEY (id);


--
-- Name: jarvis_infra_resources jarvis_infra_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_infra_resources
    ADD CONSTRAINT jarvis_infra_resources_pkey PRIMARY KEY (id);


--
-- Name: jarvis_insights jarvis_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_insights
    ADD CONSTRAINT jarvis_insights_pkey PRIMARY KEY (id);


--
-- Name: jarvis_knowledge_assets jarvis_knowledge_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_knowledge_assets
    ADD CONSTRAINT jarvis_knowledge_assets_pkey PRIMARY KEY (id);


--
-- Name: jarvis_knowledge_assets jarvis_knowledge_assets_source_path_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_knowledge_assets
    ADD CONSTRAINT jarvis_knowledge_assets_source_path_unique UNIQUE (source_path);


--
-- Name: jarvis_knowledge_categories jarvis_knowledge_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_knowledge_categories
    ADD CONSTRAINT jarvis_knowledge_categories_pkey PRIMARY KEY (id);


--
-- Name: jarvis_knowledge_categories jarvis_knowledge_categories_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_knowledge_categories
    ADD CONSTRAINT jarvis_knowledge_categories_slug_unique UNIQUE (slug);


--
-- Name: jarvis_knowledge_relationships jarvis_knowledge_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_knowledge_relationships
    ADD CONSTRAINT jarvis_knowledge_relationships_pkey PRIMARY KEY (id);


--
-- Name: jarvis_memories jarvis_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_memories
    ADD CONSTRAINT jarvis_memories_pkey PRIMARY KEY (id);


--
-- Name: jarvis_policies jarvis_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_policies
    ADD CONSTRAINT jarvis_policies_pkey PRIMARY KEY (id);


--
-- Name: jarvis_policy_evaluations jarvis_policy_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_policy_evaluations
    ADD CONSTRAINT jarvis_policy_evaluations_pkey PRIMARY KEY (id);


--
-- Name: jarvis_projects jarvis_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_projects
    ADD CONSTRAINT jarvis_projects_pkey PRIMARY KEY (id);


--
-- Name: jarvis_recommendations jarvis_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_recommendations
    ADD CONSTRAINT jarvis_recommendations_pkey PRIMARY KEY (id);


--
-- Name: jarvis_render_services jarvis_render_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_render_services
    ADD CONSTRAINT jarvis_render_services_pkey PRIMARY KEY (id);


--
-- Name: jarvis_render_services jarvis_render_services_render_service_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_render_services
    ADD CONSTRAINT jarvis_render_services_render_service_id_unique UNIQUE (render_service_id);


--
-- Name: jarvis_reports jarvis_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_reports
    ADD CONSTRAINT jarvis_reports_pkey PRIMARY KEY (id);


--
-- Name: jarvis_repositories jarvis_repositories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_repositories
    ADD CONSTRAINT jarvis_repositories_pkey PRIMARY KEY (id);


--
-- Name: jarvis_routing_rules jarvis_routing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_routing_rules
    ADD CONSTRAINT jarvis_routing_rules_pkey PRIMARY KEY (id);


--
-- Name: jarvis_runbooks jarvis_runbooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_runbooks
    ADD CONSTRAINT jarvis_runbooks_pkey PRIMARY KEY (id);


--
-- Name: jarvis_runbooks jarvis_runbooks_source_path_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_runbooks
    ADD CONSTRAINT jarvis_runbooks_source_path_unique UNIQUE (source_path);


--
-- Name: jarvis_settings jarvis_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_settings
    ADD CONSTRAINT jarvis_settings_key_unique UNIQUE (key);


--
-- Name: jarvis_settings jarvis_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_settings
    ADD CONSTRAINT jarvis_settings_pkey PRIMARY KEY (id);


--
-- Name: jarvis_systems jarvis_systems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_systems
    ADD CONSTRAINT jarvis_systems_pkey PRIMARY KEY (id);


--
-- Name: jarvis_systems jarvis_systems_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_systems
    ADD CONSTRAINT jarvis_systems_slug_unique UNIQUE (slug);


--
-- Name: jarvis_tasks jarvis_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_tasks
    ADD CONSTRAINT jarvis_tasks_pkey PRIMARY KEY (id);


--
-- Name: jarvis_voice_sessions jarvis_voice_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_voice_sessions
    ADD CONSTRAINT jarvis_voice_sessions_pkey PRIMARY KEY (id);


--
-- Name: jarvis_voice_turns jarvis_voice_turns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_voice_turns
    ADD CONSTRAINT jarvis_voice_turns_pkey PRIMARY KEY (id);


--
-- Name: jarvis_workflow_runs jarvis_workflow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_workflow_runs
    ADD CONSTRAINT jarvis_workflow_runs_pkey PRIMARY KEY (id);


--
-- Name: jarvis_workflow_steps jarvis_workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_workflow_steps
    ADD CONSTRAINT jarvis_workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: jarvis_workflows jarvis_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_workflows
    ADD CONSTRAINT jarvis_workflows_pkey PRIMARY KEY (id);


--
-- Name: jarvis_aicandlez_daily_snapshots_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_aicandlez_daily_snapshots_date_idx ON public.jarvis_aicandlez_daily_snapshots USING btree (snapshot_date);


--
-- Name: jarvis_code_files_artifact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_code_files_artifact_idx ON public.jarvis_code_files USING btree (artifact);


--
-- Name: jarvis_code_files_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_code_files_kind_idx ON public.jarvis_code_files USING btree (kind);


--
-- Name: jarvis_credentials_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_credentials_business_idx ON public.jarvis_credentials USING btree (business_id);


--
-- Name: jarvis_embeddings_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_embeddings_business_idx ON public.jarvis_embeddings USING btree (business_id);


--
-- Name: jarvis_embeddings_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_embeddings_created_by_idx ON public.jarvis_embeddings USING btree (created_by);


--
-- Name: jarvis_embeddings_hnsw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_embeddings_hnsw_idx ON public.jarvis_embeddings USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: jarvis_embeddings_subject_model_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_embeddings_subject_model_uq ON public.jarvis_embeddings USING btree (subject_type, subject_id, model);


--
-- Name: jarvis_infra_resources_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_infra_resources_business_idx ON public.jarvis_infra_resources USING btree (business_id);


--
-- Name: jarvis_infra_resources_type_name_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_infra_resources_type_name_uq ON public.jarvis_infra_resources USING btree (resource_type, name);


--
-- Name: jarvis_memories_source_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_memories_source_uq ON public.jarvis_memories USING btree (source_type, source_id);


--
-- Name: jarvis_render_services_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_render_services_name_idx ON public.jarvis_render_services USING btree (name);


--
-- Name: jarvis_reports_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_reports_business_idx ON public.jarvis_reports USING btree (business_id);


--
-- Name: jarvis_reports_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_reports_created_at_idx ON public.jarvis_reports USING btree (created_at);


--
-- Name: jarvis_reports_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_reports_type_idx ON public.jarvis_reports USING btree (report_type);


--
-- Name: jarvis_repositories_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_repositories_business_idx ON public.jarvis_repositories USING btree (business_id);


--
-- Name: jarvis_repositories_system_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_repositories_system_idx ON public.jarvis_repositories USING btree (system_id);


--
-- Name: jarvis_runbooks_system_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_runbooks_system_idx ON public.jarvis_runbooks USING btree (system_id);


--
-- Name: jarvis_systems_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_systems_business_idx ON public.jarvis_systems USING btree (business_id);


--
-- Name: jarvis_voice_sessions_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_voice_sessions_created_by_idx ON public.jarvis_voice_sessions USING btree (created_by);


--
-- Name: jarvis_voice_sessions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_voice_sessions_status_idx ON public.jarvis_voice_sessions USING btree (status);


--
-- Name: jarvis_voice_turns_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_voice_turns_created_at_idx ON public.jarvis_voice_turns USING btree (created_at);


--
-- Name: jarvis_voice_turns_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS jarvis_voice_turns_session_idx ON public.jarvis_voice_turns USING btree (session_id);


--
-- Name: jarvis_agent_messages jarvis_agent_messages_from_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_agent_messages
    ADD CONSTRAINT jarvis_agent_messages_from_agent_id_jarvis_agents_id_fk FOREIGN KEY (from_agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_agent_messages jarvis_agent_messages_run_id_jarvis_agent_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_agent_messages
    ADD CONSTRAINT jarvis_agent_messages_run_id_jarvis_agent_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.jarvis_agent_runs(id) ON DELETE SET NULL;


--
-- Name: jarvis_agent_messages jarvis_agent_messages_to_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_agent_messages
    ADD CONSTRAINT jarvis_agent_messages_to_agent_id_jarvis_agents_id_fk FOREIGN KEY (to_agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_agent_runs jarvis_agent_runs_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_agent_runs
    ADD CONSTRAINT jarvis_agent_runs_agent_id_jarvis_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_agent_trust jarvis_agent_trust_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_agent_trust
    ADD CONSTRAINT jarvis_agent_trust_agent_id_jarvis_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_approvals jarvis_approvals_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_approvals
    ADD CONSTRAINT jarvis_approvals_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_approvals jarvis_approvals_policy_id_jarvis_policies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_approvals
    ADD CONSTRAINT jarvis_approvals_policy_id_jarvis_policies_id_fk FOREIGN KEY (policy_id) REFERENCES public.jarvis_policies(id) ON DELETE SET NULL;


--
-- Name: jarvis_briefings jarvis_briefings_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_briefings
    ADD CONSTRAINT jarvis_briefings_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_briefings jarvis_briefings_cognition_run_id_jarvis_cognition_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_briefings
    ADD CONSTRAINT jarvis_briefings_cognition_run_id_jarvis_cognition_runs_id_fk FOREIGN KEY (cognition_run_id) REFERENCES public.jarvis_cognition_runs(id) ON DELETE SET NULL;


--
-- Name: jarvis_commands jarvis_commands_approval_id_jarvis_approvals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_commands
    ADD CONSTRAINT jarvis_commands_approval_id_jarvis_approvals_id_fk FOREIGN KEY (approval_id) REFERENCES public.jarvis_approvals(id) ON DELETE SET NULL;


--
-- Name: jarvis_commands jarvis_commands_delegation_id_jarvis_delegations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_commands
    ADD CONSTRAINT jarvis_commands_delegation_id_jarvis_delegations_id_fk FOREIGN KEY (delegation_id) REFERENCES public.jarvis_delegations(id) ON DELETE SET NULL;


--
-- Name: jarvis_commands jarvis_commands_policy_evaluation_id_jarvis_policy_evaluations_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_commands
    ADD CONSTRAINT jarvis_commands_policy_evaluation_id_jarvis_policy_evaluations_ FOREIGN KEY (policy_evaluation_id) REFERENCES public.jarvis_policy_evaluations(id) ON DELETE SET NULL;


--
-- Name: jarvis_commands jarvis_commands_routing_rule_id_jarvis_routing_rules_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_commands
    ADD CONSTRAINT jarvis_commands_routing_rule_id_jarvis_routing_rules_id_fk FOREIGN KEY (routing_rule_id) REFERENCES public.jarvis_routing_rules(id) ON DELETE SET NULL;


--
-- Name: jarvis_commands jarvis_commands_workflow_run_id_jarvis_workflow_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_commands
    ADD CONSTRAINT jarvis_commands_workflow_run_id_jarvis_workflow_runs_id_fk FOREIGN KEY (workflow_run_id) REFERENCES public.jarvis_workflow_runs(id) ON DELETE SET NULL;


--
-- Name: jarvis_credentials jarvis_credentials_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_credentials
    ADD CONSTRAINT jarvis_credentials_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_credentials jarvis_credentials_system_id_jarvis_systems_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_credentials
    ADD CONSTRAINT jarvis_credentials_system_id_jarvis_systems_id_fk FOREIGN KEY (system_id) REFERENCES public.jarvis_systems(id) ON DELETE SET NULL;


--
-- Name: jarvis_decisions jarvis_decisions_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_decisions
    ADD CONSTRAINT jarvis_decisions_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_delegations jarvis_delegations_approval_id_jarvis_approvals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_delegations
    ADD CONSTRAINT jarvis_delegations_approval_id_jarvis_approvals_id_fk FOREIGN KEY (approval_id) REFERENCES public.jarvis_approvals(id) ON DELETE SET NULL;


--
-- Name: jarvis_delegations jarvis_delegations_from_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_delegations
    ADD CONSTRAINT jarvis_delegations_from_agent_id_jarvis_agents_id_fk FOREIGN KEY (from_agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_delegations jarvis_delegations_policy_evaluation_id_jarvis_policy_evaluatio; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_delegations
    ADD CONSTRAINT jarvis_delegations_policy_evaluation_id_jarvis_policy_evaluatio FOREIGN KEY (policy_evaluation_id) REFERENCES public.jarvis_policy_evaluations(id) ON DELETE SET NULL;


--
-- Name: jarvis_delegations jarvis_delegations_task_id_jarvis_tasks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_delegations
    ADD CONSTRAINT jarvis_delegations_task_id_jarvis_tasks_id_fk FOREIGN KEY (task_id) REFERENCES public.jarvis_tasks(id) ON DELETE SET NULL;


--
-- Name: jarvis_delegations jarvis_delegations_to_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_delegations
    ADD CONSTRAINT jarvis_delegations_to_agent_id_jarvis_agents_id_fk FOREIGN KEY (to_agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_delegations jarvis_delegations_workflow_run_id_jarvis_workflow_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_delegations
    ADD CONSTRAINT jarvis_delegations_workflow_run_id_jarvis_workflow_runs_id_fk FOREIGN KEY (workflow_run_id) REFERENCES public.jarvis_workflow_runs(id) ON DELETE SET NULL;


--
-- Name: jarvis_embeddings jarvis_embeddings_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_embeddings
    ADD CONSTRAINT jarvis_embeddings_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_escalation_chain_steps jarvis_escalation_chain_steps_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_escalation_chain_steps
    ADD CONSTRAINT jarvis_escalation_chain_steps_agent_id_jarvis_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_escalation_chain_steps jarvis_escalation_chain_steps_chain_id_jarvis_escalation_chains; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_escalation_chain_steps
    ADD CONSTRAINT jarvis_escalation_chain_steps_chain_id_jarvis_escalation_chains FOREIGN KEY (chain_id) REFERENCES public.jarvis_escalation_chains(id) ON DELETE SET NULL;


--
-- Name: jarvis_escalations jarvis_escalations_approval_id_jarvis_approvals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_escalations
    ADD CONSTRAINT jarvis_escalations_approval_id_jarvis_approvals_id_fk FOREIGN KEY (approval_id) REFERENCES public.jarvis_approvals(id) ON DELETE SET NULL;


--
-- Name: jarvis_escalations jarvis_escalations_assignee_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_escalations
    ADD CONSTRAINT jarvis_escalations_assignee_agent_id_jarvis_agents_id_fk FOREIGN KEY (assignee_agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_escalations jarvis_escalations_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_escalations
    ADD CONSTRAINT jarvis_escalations_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_escalations jarvis_escalations_chain_id_jarvis_escalation_chains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_escalations
    ADD CONSTRAINT jarvis_escalations_chain_id_jarvis_escalation_chains_id_fk FOREIGN KEY (chain_id) REFERENCES public.jarvis_escalation_chains(id) ON DELETE SET NULL;


--
-- Name: jarvis_escalations jarvis_escalations_policy_evaluation_id_jarvis_policy_evaluatio; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_escalations
    ADD CONSTRAINT jarvis_escalations_policy_evaluation_id_jarvis_policy_evaluatio FOREIGN KEY (policy_evaluation_id) REFERENCES public.jarvis_policy_evaluations(id) ON DELETE SET NULL;


--
-- Name: jarvis_findings jarvis_findings_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_findings
    ADD CONSTRAINT jarvis_findings_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_findings jarvis_findings_project_id_jarvis_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_findings
    ADD CONSTRAINT jarvis_findings_project_id_jarvis_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.jarvis_projects(id) ON DELETE SET NULL;


--
-- Name: jarvis_infra_resources jarvis_infra_resources_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_infra_resources
    ADD CONSTRAINT jarvis_infra_resources_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_infra_resources jarvis_infra_resources_system_id_jarvis_systems_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_infra_resources
    ADD CONSTRAINT jarvis_infra_resources_system_id_jarvis_systems_id_fk FOREIGN KEY (system_id) REFERENCES public.jarvis_systems(id) ON DELETE SET NULL;


--
-- Name: jarvis_insights jarvis_insights_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_insights
    ADD CONSTRAINT jarvis_insights_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_insights jarvis_insights_finding_id_jarvis_findings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_insights
    ADD CONSTRAINT jarvis_insights_finding_id_jarvis_findings_id_fk FOREIGN KEY (finding_id) REFERENCES public.jarvis_findings(id) ON DELETE SET NULL;


--
-- Name: jarvis_knowledge_assets jarvis_knowledge_assets_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_knowledge_assets
    ADD CONSTRAINT jarvis_knowledge_assets_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_knowledge_assets jarvis_knowledge_assets_category_id_jarvis_knowledge_categories; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_knowledge_assets
    ADD CONSTRAINT jarvis_knowledge_assets_category_id_jarvis_knowledge_categories FOREIGN KEY (category_id) REFERENCES public.jarvis_knowledge_categories(id) ON DELETE SET NULL;


--
-- Name: jarvis_knowledge_categories jarvis_knowledge_categories_parent_id_jarvis_knowledge_categori; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_knowledge_categories
    ADD CONSTRAINT jarvis_knowledge_categories_parent_id_jarvis_knowledge_categori FOREIGN KEY (parent_id) REFERENCES public.jarvis_knowledge_categories(id) ON DELETE SET NULL;


--
-- Name: jarvis_memories jarvis_memories_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_memories
    ADD CONSTRAINT jarvis_memories_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_memories jarvis_memories_category_id_jarvis_knowledge_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_memories
    ADD CONSTRAINT jarvis_memories_category_id_jarvis_knowledge_categories_id_fk FOREIGN KEY (category_id) REFERENCES public.jarvis_knowledge_categories(id) ON DELETE SET NULL;


--
-- Name: jarvis_policy_evaluations jarvis_policy_evaluations_approval_id_jarvis_approvals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_policy_evaluations
    ADD CONSTRAINT jarvis_policy_evaluations_approval_id_jarvis_approvals_id_fk FOREIGN KEY (approval_id) REFERENCES public.jarvis_approvals(id) ON DELETE SET NULL;


--
-- Name: jarvis_policy_evaluations jarvis_policy_evaluations_policy_id_jarvis_policies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_policy_evaluations
    ADD CONSTRAINT jarvis_policy_evaluations_policy_id_jarvis_policies_id_fk FOREIGN KEY (policy_id) REFERENCES public.jarvis_policies(id) ON DELETE SET NULL;


--
-- Name: jarvis_projects jarvis_projects_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_projects
    ADD CONSTRAINT jarvis_projects_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_recommendations jarvis_recommendations_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_recommendations
    ADD CONSTRAINT jarvis_recommendations_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_recommendations jarvis_recommendations_finding_id_jarvis_findings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_recommendations
    ADD CONSTRAINT jarvis_recommendations_finding_id_jarvis_findings_id_fk FOREIGN KEY (finding_id) REFERENCES public.jarvis_findings(id) ON DELETE SET NULL;


--
-- Name: jarvis_reports jarvis_reports_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_reports
    ADD CONSTRAINT jarvis_reports_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_reports jarvis_reports_cognition_run_id_jarvis_cognition_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_reports
    ADD CONSTRAINT jarvis_reports_cognition_run_id_jarvis_cognition_runs_id_fk FOREIGN KEY (cognition_run_id) REFERENCES public.jarvis_cognition_runs(id) ON DELETE SET NULL;


--
-- Name: jarvis_repositories jarvis_repositories_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_repositories
    ADD CONSTRAINT jarvis_repositories_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_repositories jarvis_repositories_system_id_jarvis_systems_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_repositories
    ADD CONSTRAINT jarvis_repositories_system_id_jarvis_systems_id_fk FOREIGN KEY (system_id) REFERENCES public.jarvis_systems(id) ON DELETE CASCADE;


--
-- Name: jarvis_routing_rules jarvis_routing_rules_chain_id_jarvis_escalation_chains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_routing_rules
    ADD CONSTRAINT jarvis_routing_rules_chain_id_jarvis_escalation_chains_id_fk FOREIGN KEY (chain_id) REFERENCES public.jarvis_escalation_chains(id) ON DELETE SET NULL;


--
-- Name: jarvis_routing_rules jarvis_routing_rules_target_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_routing_rules
    ADD CONSTRAINT jarvis_routing_rules_target_agent_id_jarvis_agents_id_fk FOREIGN KEY (target_agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_runbooks jarvis_runbooks_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_runbooks
    ADD CONSTRAINT jarvis_runbooks_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_runbooks jarvis_runbooks_system_id_jarvis_systems_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_runbooks
    ADD CONSTRAINT jarvis_runbooks_system_id_jarvis_systems_id_fk FOREIGN KEY (system_id) REFERENCES public.jarvis_systems(id) ON DELETE CASCADE;


--
-- Name: jarvis_systems jarvis_systems_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_systems
    ADD CONSTRAINT jarvis_systems_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_tasks jarvis_tasks_assignee_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_tasks
    ADD CONSTRAINT jarvis_tasks_assignee_agent_id_jarvis_agents_id_fk FOREIGN KEY (assignee_agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_tasks jarvis_tasks_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_tasks
    ADD CONSTRAINT jarvis_tasks_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_tasks jarvis_tasks_project_id_jarvis_projects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_tasks
    ADD CONSTRAINT jarvis_tasks_project_id_jarvis_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.jarvis_projects(id) ON DELETE SET NULL;


--
-- Name: jarvis_voice_sessions jarvis_voice_sessions_business_id_jarvis_businesses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_voice_sessions
    ADD CONSTRAINT jarvis_voice_sessions_business_id_jarvis_businesses_id_fk FOREIGN KEY (business_id) REFERENCES public.jarvis_businesses(id) ON DELETE SET NULL;


--
-- Name: jarvis_voice_turns jarvis_voice_turns_cognition_run_id_jarvis_cognition_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_voice_turns
    ADD CONSTRAINT jarvis_voice_turns_cognition_run_id_jarvis_cognition_runs_id_fk FOREIGN KEY (cognition_run_id) REFERENCES public.jarvis_cognition_runs(id) ON DELETE SET NULL;


--
-- Name: jarvis_voice_turns jarvis_voice_turns_session_id_jarvis_voice_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_voice_turns
    ADD CONSTRAINT jarvis_voice_turns_session_id_jarvis_voice_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.jarvis_voice_sessions(id) ON DELETE SET NULL;


--
-- Name: jarvis_workflow_runs jarvis_workflow_runs_workflow_id_jarvis_workflows_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_workflow_runs
    ADD CONSTRAINT jarvis_workflow_runs_workflow_id_jarvis_workflows_id_fk FOREIGN KEY (workflow_id) REFERENCES public.jarvis_workflows(id) ON DELETE SET NULL;


--
-- Name: jarvis_workflow_steps jarvis_workflow_steps_agent_id_jarvis_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_workflow_steps
    ADD CONSTRAINT jarvis_workflow_steps_agent_id_jarvis_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.jarvis_agents(id) ON DELETE SET NULL;


--
-- Name: jarvis_workflow_steps jarvis_workflow_steps_approval_id_jarvis_approvals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_workflow_steps
    ADD CONSTRAINT jarvis_workflow_steps_approval_id_jarvis_approvals_id_fk FOREIGN KEY (approval_id) REFERENCES public.jarvis_approvals(id) ON DELETE SET NULL;


--
-- Name: jarvis_workflow_steps jarvis_workflow_steps_policy_evaluation_id_jarvis_policy_evalua; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_workflow_steps
    ADD CONSTRAINT jarvis_workflow_steps_policy_evaluation_id_jarvis_policy_evalua FOREIGN KEY (policy_evaluation_id) REFERENCES public.jarvis_policy_evaluations(id) ON DELETE SET NULL;


--
-- Name: jarvis_workflow_steps jarvis_workflow_steps_workflow_run_id_jarvis_workflow_runs_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jarvis_workflow_steps
    ADD CONSTRAINT jarvis_workflow_steps_workflow_run_id_jarvis_workflow_runs_id_f FOREIGN KEY (workflow_run_id) REFERENCES public.jarvis_workflow_runs(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


