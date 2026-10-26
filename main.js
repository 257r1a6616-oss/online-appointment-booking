/**
 * Client-Side JavaScript for MedPulse Appointment System
 */
const API_BASE = '/api';

// Check auth state
function getCurrentUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

function getAuthToken() {
  return localStorage.getItem('token');
}

function updateNavAuth() {
  const user = getCurrentUser();
  const authContainer = document.getElementById('authActions');
  if (!authContainer) return;

  if (user) {
    authContainer.innerHTML = `
      <span style="font-size:0.9rem; margin-right:1rem;">Hi, <strong>${user.name}</strong></span>
      ${user.role === 'admin' ? '<a href="admin.html" class="btn btn-outline" style="margin-right:0.5rem;">Admin Panel</a>' : ''}
      <button onclick="handleLogout()" class="btn btn-outline">Sign Out</button>
    `;
  }
}

function handleLogout() {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  window.location.href = 'index.html';
}

// Load services dynamically
async function loadServices() {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;

  try {
    const res = await fetch(`${API_BASE}/services`);
    const data = await res.json();
    if (data.success) {
      grid.innerHTML = data.data.map(s => `
        <div class="service-card">
          <div>
            <h3>${s.service_name}</h3>
            <div class="service-meta">${s.category} · ${s.duration} mins</div>
            <p style="color:#64748b; font-size:0.9rem; margin-bottom:1.5rem;">${s.description}</p>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="service-price">₹${s.price}</div>
            <a href="book.html?service_id=${s.service_id}" class="btn btn-primary">Book Now</a>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    grid.innerHTML = '<p style="color:red;">Failed to connect to API server. Ensure Node.js server is running.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
  loadServices();
});