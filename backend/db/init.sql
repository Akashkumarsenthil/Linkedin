-- LinkedIn Platform Database Schema
-- MySQL initialization script

CREATE DATABASE IF NOT EXISTS linkedin;
USE linkedin;

-- ─── Members (Applicants) ──────────────────────────────────────
CREATE TABLE members (
    member_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    location_city VARCHAR(100),
    location_state VARCHAR(100),
    location_country VARCHAR(100),
    headline VARCHAR(500),
    about TEXT,
    experience JSON,
    education JSON,
    skills JSON,
    profile_photo_url VARCHAR(500),
    resume_text TEXT,
    connections_count INT DEFAULT 0,
    profile_views INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_location (location_city, location_state),
    FULLTEXT INDEX idx_search (first_name, last_name, headline, about)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Recruiters / Employer Admins ──────────────────────────────
CREATE TABLE recruiters (
    recruiter_id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    company_name VARCHAR(255),
    company_industry VARCHAR(255),
    company_size VARCHAR(50),
    role VARCHAR(100) DEFAULT 'recruiter',
    access_level VARCHAR(50) DEFAULT 'standard',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_recruiter_email (email),
    INDEX idx_company (company_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Job Postings ──────────────────────────────────────────────
CREATE TABLE job_postings (
    job_id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT,
    recruiter_id INT NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    seniority_level VARCHAR(100),
    employment_type VARCHAR(100),
    location VARCHAR(255),
    work_mode ENUM('remote', 'hybrid', 'onsite') DEFAULT 'onsite',
    skills_required JSON,
    salary_min DECIMAL(12, 2),
    salary_max DECIMAL(12, 2),
    posted_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('open', 'closed') DEFAULT 'open',
    views_count INT DEFAULT 0,
    applicants_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (recruiter_id) REFERENCES recruiters(recruiter_id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_recruiter (recruiter_id),
    INDEX idx_posted (posted_datetime),
    FULLTEXT INDEX idx_job_search (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Job Applications ──────────────────────────────────────────
CREATE TABLE applications (
    application_id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    member_id INT NOT NULL,
    resume_url VARCHAR(500),
    resume_text TEXT,
    cover_letter TEXT,
    application_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('submitted', 'reviewing', 'rejected', 'interview', 'offer') DEFAULT 'submitted',
    answers JSON,
    recruiter_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE,
    UNIQUE KEY unique_application (job_id, member_id),
    INDEX idx_app_job (job_id),
    INDEX idx_app_member (member_id),
    INDEX idx_app_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Messaging Threads ─────────────────────────────────────────
CREATE TABLE threads (
    thread_id INT AUTO_INCREMENT PRIMARY KEY,
    subject VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE thread_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thread_id INT NOT NULL,
    user_id INT NOT NULL,
    user_type ENUM('member', 'recruiter') NOT NULL,
    FOREIGN KEY (thread_id) REFERENCES threads(thread_id) ON DELETE CASCADE,
    UNIQUE KEY unique_participant (thread_id, user_id, user_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    thread_id INT NOT NULL,
    sender_id INT NOT NULL,
    sender_type ENUM('member', 'recruiter') NOT NULL,
    message_text TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (thread_id) REFERENCES threads(thread_id) ON DELETE CASCADE,
    INDEX idx_thread (thread_id),
    INDEX idx_sender (sender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Connections ────────────────────────────────────────────────
CREATE TABLE connections (
    connection_id INT AUTO_INCREMENT PRIMARY KEY,
    requester_id INT NOT NULL,
    receiver_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES members(member_id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES members(member_id) ON DELETE CASCADE,
    UNIQUE KEY unique_connection (requester_id, receiver_id),
    INDEX idx_requester (requester_id),
    INDEX idx_receiver (receiver_id),
    INDEX idx_conn_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Saved Jobs ─────────────────────────────────────────────────
CREATE TABLE saved_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    job_id INT NOT NULL,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
    UNIQUE KEY unique_saved (member_id, job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── User Credentials (auth) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_credentials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_type ENUM('member', 'recruiter') NOT NULL,
    user_id INT NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Daily Profile Views (for analytics) ────────────────────────
CREATE TABLE profile_views_daily (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    view_date DATE NOT NULL,
    view_count INT DEFAULT 1,
    FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE,
    UNIQUE KEY unique_daily_view (member_id, view_date),
    INDEX idx_view_date (view_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Failed Kafka Events (dual-write fallback) ───────────────────
-- When a Kafka publish fails after a successful DB commit, the event
-- payload is written here so it is not silently lost.
CREATE TABLE IF NOT EXISTS failed_kafka_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    topic VARCHAR(255) NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    entity_id VARCHAR(255),
    actor_id VARCHAR(255),
    payload TEXT,           -- JSON-serialised event payload
    error_message TEXT,     -- Exception message from the failed publish
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fke_event_type (event_type),
    INDEX idx_fke_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
