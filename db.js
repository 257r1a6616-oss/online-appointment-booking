/**
 * Database Connection Pool Configuration
 * Uses mysql2/promise for modern async/await queries
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'appointment_booking_db',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

// Test connection on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Connected successfully to MySQL database:', process.env.DB_NAME || 'appointment_booking_db');
    connection.release();
  } catch (error) {
    console.error('❌ Failed to connect to MySQL database:', error.message);
    console.warn('⚠️  Please verify that your MySQL server is running and .env credentials match.');
  }
})();

module.exports = pool;