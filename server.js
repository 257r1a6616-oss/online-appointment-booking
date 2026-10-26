/**
 * Online Appointment Booking System - Main Backend Server
 * Technology Stack: Node.js, Express.js, MySQL (mysql2), bcryptjs
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'carepulse_btech_secret_key';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Standard Working Time Slots (9:00 AM - 5:00 PM)
const ALL_TIME_SLOTS = [
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "12:00 PM", "02:00 PM",
  "02:30 PM", "03:00 PM", "03:30 PM", "04:00 PM",
  "04:30 PM", "05:00 PM"
];

// Helper: Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Session expired or invalid token.' });
    req.user = user;
    next();
  });
};

// Helper: Admin Authorization Middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Administrator privileges required.' });
  }
  next();
};

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================

// POST /api/auth/register - Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // Check if email already exists
    const [existing] = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user into MySQL
    const [result] = await db.query(
      'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone, hashedPassword, 'customer']
    );

    const newUser = {
      user_id: result.insertId,
      name,
      email,
      phone,
      role: 'customer'
    };

    const token = jwt.sign(newUser, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to MedPulse.',
      user: newUser,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
});

// POST /api/auth/login - User login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email address or password.' });
    }

    const user = rows[0];

    // Verify bcrypt password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email address or password.' });
    }

    const userPayload = {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Login successful.',
      user: userPayload,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// ==========================================
// 2. SERVICES ROUTES
// ==========================================

// GET /api/services - Retrieve active services
app.get('/api/services', async (req, res) => {
  try {
    const [services] = await db.query('SELECT * FROM services WHERE is_active = TRUE ORDER BY service_id ASC');
    res.json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not fetch services.' });
  }
});

// ==========================================
// 3. REAL-TIME AVAILABILITY & DOUBLE BOOKING PREVENTION
// ==========================================

// GET /api/availability - Check booked slots for a given service and date
app.get('/api/availability', async (req, res) => {
  try {
    const { service_id, date } = req.query;

    if (!service_id || !date) {
      return res.status(400).json({ success: false, message: 'service_id and date are required.' });
    }

    // Query confirmed appointments for this service and date
    const [bookedRows] = await db.query(
      'SELECT appointment_time FROM appointments WHERE service_id = ? AND appointment_date = ? AND status = "confirmed"',
      [service_id, date]
    );

    const bookedTimes = new Set(bookedRows.map(r => r.appointment_time));

    const slots = ALL_TIME_SLOTS.map(time => ({
      time,
      is_available: !bookedTimes.has(time),
      reason: bookedTimes.has(time) ? 'Slot already reserved by another patient' : 'Available'
    }));

    res.json({ success: true, date, service_id, slots });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error checking slot availability.' });
  }
});

// ==========================================
// 4. APPOINTMENT BOOKING & MANAGEMENT
// ==========================================

// POST /api/appointments - Book a new appointment
app.post('/api/appointments', authenticateToken, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { service_id, appointment_date, appointment_time, notes } = req.body;
    const user_id = req.user.user_id;

    if (!service_id || !appointment_date || !appointment_time) {
      return res.status(400).json({ success: false, message: 'Please select a service, date, and available slot.' });
    }

    // Start MySQL Transaction to strictly prevent race conditions / double bookings
    await connection.beginTransaction();

    // CRITICAL: Check if slot is already booked (SELECT ... FOR UPDATE)
    const [conflictCheck] = await connection.query(
      'SELECT appointment_id FROM appointments WHERE service_id = ? AND appointment_date = ? AND appointment_time = ? AND status = "confirmed" FOR UPDATE',
      [service_id, appointment_date, appointment_time]
    );

    if (conflictCheck.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Conflict: This time slot was just booked by another customer. Please select another time.'
      });
    }

    // Generate unique human-readable booking token
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const booking_code = `APT-${new Date().getFullYear()}-${randomCode}`;

    // Insert Appointment
    const [result] = await connection.query(
      'INSERT INTO appointments (booking_code, user_id, service_id, appointment_date, appointment_time, status, notes) VALUES (?, ?, ?, ?, ?, "confirmed", ?)',
      [booking_code, user_id, service_id, appointment_date, appointment_time, notes || null]
    );

    await connection.commit();

    // Fetch joined appointment record
    const [details] = await db.query(
      `SELECT a.*, s.service_name, s.price, s.duration, u.name as patient_name, u.email as patient_email, u.phone as patient_phone
       FROM appointments a
       JOIN services s ON a.service_id = s.service_id
       JOIN users u ON a.user_id = u.user_id
       WHERE a.appointment_id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully!',
      booking: details[0]
    });
  } catch (error) {
    await connection.rollback();
    console.error('Booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to process appointment booking.' });
  } finally {
    connection.release();
  }
});

// GET /api/appointments/my - Get appointments for current user
app.get('/api/appointments/my', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const [appointments] = await db.query(
      `SELECT a.*, s.service_name, s.price, s.duration, s.category
       FROM appointments a
       JOIN services s ON a.service_id = s.service_id
       WHERE a.user_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time ASC`,
      [user_id]
    );

    res.json({ success: true, data: appointments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch appointments.' });
  }
});

// PUT /api/appointments/:id/cancel - Cancel appointment
app.put('/api/appointments/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const appointment_id = req.params.id;
    const user_id = req.user.user_id;
    const isAdmin = req.user.role === 'admin';

    // Verify ownership if not admin
    const condition = isAdmin ? 'WHERE appointment_id = ?' : 'WHERE appointment_id = ? AND user_id = ?';
    const params = isAdmin ? [appointment_id] : [appointment_id, user_id];

    const [existing] = await db.query(`SELECT * FROM appointments ${condition}`, params);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found or unauthorized.' });
    }

    await db.query('UPDATE appointments SET status = "cancelled" WHERE appointment_id = ?', [appointment_id]);

    res.json({ success: true, message: 'Appointment has been cancelled successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to cancel appointment.' });
  }
});

// ==========================================
// 5. ADMIN DASHBOARD ROUTES
// ==========================================

// GET /api/admin/overview - Overall statistics
app.get('/api/admin/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [totalBookings] = await db.query('SELECT COUNT(*) as count FROM appointments');
    const [activeBookings] = await db.query('SELECT COUNT(*) as count FROM appointments WHERE status = "confirmed"');
    const [completed] = await db.query('SELECT COUNT(*) as count FROM appointments WHERE status = "completed"');
    const [cancelled] = await db.query('SELECT COUNT(*) as count FROM appointments WHERE status = "cancelled"');
    const [totalUsers] = await db.query('SELECT COUNT(*) as count FROM users WHERE role = "customer"');
    const [revenue] = await db.query(
      `SELECT COALESCE(SUM(s.price), 0) as total 
       FROM appointments a 
       JOIN services s ON a.service_id = s.service_id 
       WHERE a.status = "completed"`
    );

    res.json({
      success: true,
      stats: {
        total_appointments: totalBookings[0].count,
        active_appointments: activeBookings[0].count,
        completed_appointments: completed[0].count,
        cancelled_appointments: cancelled[0].count,
        total_customers: totalUsers[0].count,
        total_revenue: revenue[0].total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not fetch admin metrics.' });
  }
});

// GET /api/admin/appointments - Search & filter all appointments
app.get('/api/admin/appointments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, date, search } = req.query;
    let query = `
      SELECT a.*, s.service_name, s.price, s.duration, 
             u.name as patient_name, u.email as patient_email, u.phone as patient_phone
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      JOIN users u ON a.user_id = u.user_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (date) {
      query += ' AND a.appointment_date = ?';
      params.push(date);
    }
    if (search) {
      query += ' AND (u.name LIKE ? OR u.email LIKE ? OR a.booking_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY a.appointment_date DESC, a.appointment_time ASC';

    const [appointments] = await db.query(query, params);
    res.json({ success: true, data: appointments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not query appointments.' });
  }
});

// PUT /api/admin/appointments/:id/status - Update appointment status
app.put('/api/admin/appointments/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const appointment_id = req.params.id;

    if (!['confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    await db.query('UPDATE appointments SET status = ? WHERE appointment_id = ?', [status, appointment_id]);
    res.json({ success: true, message: `Appointment status updated to ${status}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
});

// POST /api/contact - Submit feedback/inquiry
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Please provide your name, email, and message.' });
    }

    await db.query(
      'INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
      [name, email, subject || 'General Inquiry', message]
    );

    res.status(201).json({ success: true, message: 'Thank you! Your message has been received.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not save message.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` MedPulse Appointment Booking System (B.Tech Project)`);
  console.log(` Server running on: http://localhost:${PORT}`);
  console.log(`==================================================`);
});