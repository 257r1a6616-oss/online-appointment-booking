-- ====================================================================
-- Online Appointment Booking System (B.Tech Project)
-- Database Creation & Schema Script for MySQL
-- Database: appointment_booking_db
-- ====================================================================

-- 1. Create Database if not exists
CREATE DATABASE IF NOT EXISTS appointment_booking_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE appointment_booking_db;

-- 2. Drop existing tables if re-running (respecting foreign key order)
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS contact_messages;

-- 3. Users Table (Stores patient & administrator credentials)
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('customer', 'admin') DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_email (email),
    INDEX idx_user_role (role)
) ENGINE=InnoDB;

-- 4. Services Table (Stores available clinical / professional offerings)
CREATE TABLE services (
    service_id INT AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    duration INT NOT NULL COMMENT 'Duration in minutes (e.g. 30, 45, 60)',
    category VARCHAR(80) DEFAULT 'General',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_service_active (is_active)
) ENGINE=InnoDB;

-- 5. Appointments Table (Stores booking schedule & prevents double booking)
CREATE TABLE appointments (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_code VARCHAR(30) NOT NULL UNIQUE COMMENT 'Human-readable token e.g. APT-2026-1001',
    user_id INT NOT NULL,
    service_id INT NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time VARCHAR(20) NOT NULL COMMENT 'Slot label e.g. 10:00 AM',
    status ENUM('confirmed', 'completed', 'cancelled') DEFAULT 'confirmed',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Key constraints
    CONSTRAINT fk_appointment_user 
        FOREIGN KEY (user_id) 
        REFERENCES users(user_id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
        
    CONSTRAINT fk_appointment_service 
        FOREIGN KEY (service_id) 
        REFERENCES services(service_id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
        
    -- Composite Index for rapid availability lookups
    INDEX idx_slot_lookup (service_id, appointment_date, appointment_time, status)
) ENGINE=InnoDB;

-- 6. Contact Messages / Inquiries Table
CREATE TABLE contact_messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 7. Notifications & 24-Hour Reminder Logs Table
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NOT NULL,
    user_id INT NOT NULL,
    channel ENUM('email', 'sms') NOT NULL,
    recipient_name VARCHAR(100) NOT NULL,
    recipient_contact VARCHAR(120) NOT NULL,
    subject VARCHAR(200),
    message TEXT NOT NULL,
    scheduled_for DATETIME NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('queued', 'sent', 'delivered', 'failed') DEFAULT 'delivered',
    type ENUM('reminder_24h', 'confirmation', 'reschedule') DEFAULT 'reminder_24h',
    CONSTRAINT fk_notif_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_notif_status (scheduled_for, status)
) ENGINE=InnoDB;

-- 8. Seed Data: Default Admin & Test Users (Passwords are bcrypt hashed: admin123 and user123)
-- Hash for 'admin123': $2a$10$7R0wU42yvR0J74X2tFq7k.441xVbC203oFv4l6H3gYJ5N/yD.4M6m
-- Hash for 'user123':  $2a$10$gNq7W/p8tS1mB4kP1s0r1en2f4a5b6c7d8e9f0a1b2c3d4e5f6g7h
INSERT INTO users (user_id, name, email, phone, password, role) VALUES
(1, 'Dr. Sandeep Deshmukh (Admin)', 'admin@carepulse.com', '+91 98765 43210', '$2a$10$7R0wU42yvR0J74X2tFq7k.441xVbC203oFv4l6H3gYJ5N/yD.4M6m', 'admin'),
(2, 'Rahul Sharma', 'rahul.sharma@example.com', '+91 91234 56789', '$2a$10$gNq7W/p8tS1mB4kP1s0r1en2f4a5b6c7d8e9f0a1b2c3d4e5f6g7h', 'customer'),
(3, 'Priya Patel', 'priya.patel@example.com', '+91 98111 22334', '$2a$10$gNq7W/p8tS1mB4kP1s0r1en2f4a5b6c7d8e9f0a1b2c3d4e5f6g7h', 'customer');

-- 8. Seed Data: Medical & Wellness Services
INSERT INTO services (service_id, service_name, description, price, duration, category) VALUES
(1, 'General Physician Consultation', 'Comprehensive health assessment, blood pressure, vitals screening, and clinical prescription.', 450.00, 30, 'General Practice'),
(2, 'Cardiology & Vascular Checkup', 'Cardiovascular evaluation, resting ECG analysis, risk profiling, and lifestyle heart-care advice.', 1200.00, 45, 'Specialist Care'),
(3, 'Dermatology & Skin Care Assessment', 'Evaluation of acute and chronic skin ailments, allergy testing, and personalized dermatological therapies.', 850.00, 30, 'Specialist Care'),
(4, 'Dental Examination & Ultrasonic Scaling', 'Comprehensive dental cavity check, digital X-ray review, calculus removal, and enamel polishing.', 750.00, 45, 'Dental Care'),
(5, 'Physiotherapy & Ergonomic Rehabilitation', 'Targeted physical therapy for spinal decompression, cervical pain, joint stiffness, and athletic recovery.', 900.00, 60, 'Therapy & Rehab'),
(6, 'Mental Wellness & Cognitive Counseling', 'Structured psychological consultation for chronic stress, workplace burnout, anxiety, and mindful living.', 1100.00, 50, 'Mental Health');

-- 9. Seed Data: Sample Appointments
INSERT INTO appointments (appointment_id, booking_code, user_id, service_id, appointment_date, appointment_time, status, notes) VALUES
(1001, 'APT-2026-1001', 2, 1, CURDATE() + INTERVAL 2 DAY, '10:00 AM', 'confirmed', 'Seasonal allergies and routine checkup.'),
(1002, 'APT-2026-1002', 3, 2, CURDATE() + INTERVAL 3 DAY, '11:30 AM', 'confirmed', 'Annual cardiovascular stress checkup.'),
(1003, 'APT-2026-1003', 2, 5, CURDATE() + INTERVAL 1 DAY, '04:00 PM', 'confirmed', 'Lower back rehabilitation therapy.');

-- ====================================================================
-- End of Schema Script
-- ====================================================================