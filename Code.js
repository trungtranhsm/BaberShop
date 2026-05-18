/**
 * @fileoverview Backend logic for the Barber Shop Management System.
 * Handles data retrieval from Google Sheets, caching, and business logic.
 * @version 3.0.0
 */

// =================================================================
// CÀI ĐẶT CHÍNH (MAIN CONFIGURATION)
// =================================================================

const CONFIG = {
  SHEETS: {
    APPOINTMENTS: 'Lịch hẹn',
    SERVICES: 'Dịch vụ',
    STAFF: 'Nhân viên',
    CUSTOMERS: 'Khách hàng',
    SETTINGS: 'Cài Đặt',
    USERS: 'Users',
    LOGS: 'Logs',
  },
  APPOINTMENT_HEADERS: ['ID', 'Tên khách hàng', 'Số điện thoại', 'Dịch vụ', 'Ngày', 'Giờ', 'Nhân viên', 'Trạng thái', 'Ghi chú'],
  SERVICE_HEADERS: ['ID', 'Tên dịch vụ', 'Giá'],
  STAFF_HEADERS: ['ID', 'Tên nhân viên', 'Chuyên môn'],
  CUSTOMER_HEADERS: ['Tên', 'Số điện thoại', 'Ngày tạo'],
  USER_HEADERS: ['Email', 'Role', 'Tên nhân viên liên kết', 'Trạng thái', 'Ngày tạo', 'Quyền'],
  LOG_HEADERS: ['Thời gian', 'Email', 'Role', 'Hành động', 'Chi tiết'],
  LOG_MAX_ROWS: 5000, // tự cắt bớt log cũ khi vượt
  CACHE_DURATION_SECONDS: 300, // Cache tồn tại trong 5 phút
};

// =================================================================
// HÀM CHÍNH (CORE FUNCTIONS)
// =================================================================

/**
 * Hàm chính để khởi tạo giao diện web app.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Barber Shop Management System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Tải tất cả dữ liệu ban đầu cho ứng dụng.
 * Dữ liệu được cache lại để tăng tốc độ cho các lần gọi sau.
 */
function initializeAllData() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'allAppData_v3'; // Increment version to avoid old cache
  // Cần lấy user trước để cache theo từng user (data đã filter theo role)
  const earlyUser = getCurrentUser();
  if (earlyUser.isSetupNeeded) return { isSetupNeeded: true, email: earlyUser.email };
  if (earlyUser.denied) return { denied: true, email: earlyUser.email, reason: earlyUser.reason };

  const userCacheKey = cacheKey + '_' + (earlyUser.email || 'anon');
  const cached = cache.get(userCacheKey);
  if (cached) {
    console.log('✅ Returning data from CacheService for', earlyUser.email);
    return JSON.parse(cached);
  }

  try {
    console.log('🔄 Loading all initial data from Sheets...');

    const currentUser = earlyUser;
    let appointments = loadAppointments();
    const services = loadServices();
    const staff = loadStaff();
    let customers = loadCustomers();

    // RBAC: Nhân viên chỉ thấy lịch của mình. Khách hàng theo quyền riêng.
    if (currentUser.role === 'staff') {
      const myName = String(currentUser.staffName || '').trim().toLowerCase();
      appointments = appointments.filter(a => String(a.staff || '').trim().toLowerCase() === myName);
    }
    if (currentUser.role !== ROLE.ADMIN && !(currentUser.permissions && currentUser.permissions.viewCustomers)) {
      customers = [];
    }

    const result = {
      appointments: appointments,
      services: services,
      staff: staff,
      customers: customers,
      currentUser: currentUser,
      permissionDefs: USER_PERMISSION_DEFS,
      loadedAt: new Date().toISOString()
    };

    // Cache theo từng user vì data đã filter
    const userCacheKey = cacheKey + '_' + (currentUser.email || 'anon');
    cache.put(userCacheKey, JSON.stringify(result), CONFIG.CACHE_DURATION_SECONDS);

    console.log('✅ All data loaded successfully and cached.');
    return result;

  } catch (error) {
    console.error('❌ Error in initializeAllData:', error.stack);
    return { error: error.toString() };
  }
}

// =================================================================
// CÁC HÀM TẢI DỮ LIỆU (DATA LOADERS)
// =================================================================

/**
 * Tải và làm sạch dữ liệu lịch hẹn, chuyển đổi thành object.
 * SỬA LỖI: Xử lý an toàn hơn khi dữ liệu ở cột Ngày hoặc Giờ có thể không hợp lệ.
 */
function loadAppointments() {
  const data = getSheetData(CONFIG.SHEETS.APPOINTMENTS);
  return data.map(row => {
    let formattedDate = row[4];
    // Kiểm tra xem row[4] (Ngày) có phải là Date hợp lệ không
    if (row[4] instanceof Date && !isNaN(row[4])) {
      formattedDate = row[4].toISOString().split('T')[0];
    }

    let formattedTime = row[5];
    // Kiểm tra xem row[5] (Giờ) có phải là Date hợp lệ không
    if (row[5] instanceof Date && !isNaN(row[5])) {
      formattedTime = row[5].toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (row[5]) {
      formattedTime = String(row[5]); // Nếu không phải Date, giữ nguyên giá trị dạng chuỗi
    } else {
      formattedTime = ''; // Nếu trống thì là chuỗi rỗng
    }

    return {
      id: row[0] || '',
      customerName: row[1] || '',
      phone: row[2] || '',
      service: row[3] || '',
      date: formattedDate,
      time: formattedTime,
      staff: row[6] || '',
      status: row[7] || 'Đã đặt',
      notes: row[8] || '',
    };
  });
}

/**
 * Tải dữ liệu dịch vụ, bao gồm cả trạng thái.
 */
function loadServices() {
  const data = getSheetData(CONFIG.SHEETS.SERVICES);
  return data.map(row => ({
    id: row[0],
    name: row[1],
    price: Number(row[2]) || 0,
    duration: row[3] || 0,
    // status: (row[4] || 'Đang phục vụ').trim() // Đọc cột E là cột Trạng thái mới
  }));
}

/**
 * Tải dữ liệu nhân viên.
 * (Cột C: Chuyên môn, Cột D: SĐT, Cột E: Trạng thái).
 */
function loadStaff() {
  const data = getSheetData(CONFIG.SHEETS.STAFF);
  return data.map(row => ({
    id: row[0],
    name: row[1],
    specialty: row[2] || 'Chưa có',
    phone: row[3] || '', // Thêm thuộc tính SĐT
    status: (row[4] || 'Đang làm').trim() // Lấy trạng thái từ cột E (index 4)
  }));
}

/**
 * Tải và làm sạch dữ liệu khách hàng.
 */
function loadCustomers() {
  const data = getSheetData(CONFIG.SHEETS.CUSTOMERS);
  return data.map(row => ({
    // Cấu trúc đúng: Cột A(0-ID), B(1-Tên), C(2-SĐT), D(3-Email), E(4-Ngày tạo), F(5-Ghi chú)
    id: row[0] || '',
    name: row[1] || '',
    phone: row[2] || '',
    email: row[3] || '',
    // Kiểm tra xem row[4] có tồn tại không trước khi xử lý
    createdDate: row[4] ? (row[4] instanceof Date ? row[4].toISOString().split('T')[0] : row[4]) : null,
    notes: row[5] || ''
  }));
}

// =================================================================
// CÁC HÀM TIỆN ÍCH (UTILITY FUNCTIONS)
// =================================================================

/**
 * Xóa cache chính của ứng dụng.
 * Được gọi bởi tất cả các hàm làm thay đổi dữ liệu (create, update, delete).
 */
function clearCache() {
  try {
    const cache = CacheService.getScriptCache();
    // Xoá cache cho tất cả user đã đăng ký để không ai thấy data cũ
    const baseKey = 'allAppData_v3';
    cache.remove(baseKey);
    try {
      const users = listUsersRaw();
      const keys = users.map(u => baseKey + '_' + u.email);
      keys.push(baseKey + '_anon');
      if (keys.length) cache.removeAll(keys);
    } catch (e) { /* user sheet might not exist yet */ }
    console.log('🗑️ Cache cleared for all user keys');
  } catch(e) {
    console.error('Error clearing cache:', e);
  }
}

/**
 * Lấy một sheet theo tên, nếu không tồn tại thì tạo mới.
 */
function getOrCreateSheet(sheetName, headers = []) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers.length > 0) {
      sheet.appendRow(headers);
    }
  }
  return sheet;
}

/**
 * Lấy toàn bộ dữ liệu từ một sheet, trừ dòng tiêu đề.
 */
function getSheetData(sheetName) {
  const sheet = getOrCreateSheet(sheetName);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

/**
 * Bao gồm file HTML khác vào trong một file HTML chính.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Sắp xếp trang tính "Lịch hẹn" theo cột Ngày (cột 5), từ mới nhất đến cũ nhất.
 */
function sortAppointmentsSheet() {
  try {
    const sheet = getOrCreateSheet(CONFIG.SHEETS.APPOINTMENTS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 3) return;

    const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    // Sắp xếp trên cột 5 (Ngày) giảm dần, sau đó cột 6 (Giờ) giảm dần
    dataRange.sort([{ column: 5, ascending: false }, { column: 6, ascending: false }]);
    console.log('✅ Sorted "Lịch hẹn" sheet successfully.');
  } catch (error) {
    console.error('Error sorting sheet:', error);
  }
}

// =================================================================
// AUTH & RBAC (PHÂN QUYỀN)
// =================================================================
// 2 cấp: 'admin' (full) | 'staff' (chỉ thấy & sửa lịch của mình)
// Auth dùng Session.getActiveUser().getEmail() — webapp phải deploy chạy theo
// "User accessing the web app" và cho "Anyone with Google account" để có email hợp lệ.

const ROLE = { ADMIN: 'admin', STAFF: 'staff' };
const USER_PERMISSION_DEFS = [
  { key: 'viewHome', label: 'Xem trang chủ' },
  { key: 'viewRevenue', label: 'Xem doanh thu' },
  { key: 'viewCustomers', label: 'Xem khách hàng' },
  { key: 'viewSettings', label: 'Xem cài đặt' },
  { key: 'shortcutCreateBooking', label: 'Shortcut tạo lịch' },
  { key: 'shortcutRevenue', label: 'Shortcut doanh thu' },
  { key: 'shortcutStaffSettings', label: 'Shortcut nhân viên' },
  { key: 'manageStaff', label: 'Quản lý nhân viên' },
  { key: 'manageServices', label: 'Quản lý dịch vụ' },
  { key: 'manageUsers', label: 'Quản lý user/quyền' },
  { key: 'viewLogs', label: 'Xem nhật ký' },
];
const USER_PERMISSION_KEYS = USER_PERMISSION_DEFS.map(p => p.key);
const DEFAULT_STAFF_PERMISSIONS = {
  viewHome: true,
  viewRevenue: true,
  viewCustomers: false,
  viewSettings: false,
  shortcutCreateBooking: true,
  shortcutRevenue: true,
  shortcutStaffSettings: false,
  manageStaff: false,
  manageServices: false,
  manageUsers: false,
  viewLogs: false,
};

function getActiveUserEmail_() {
  try {
    const email = Session.getActiveUser().getEmail();
    return email ? String(email).trim().toLowerCase() : '';
  } catch (e) {
    return '';
  }
}

function ensureUsersSheetSchema_() {
  const sheet = getOrCreateSheet(CONFIG.SHEETS.USERS, CONFIG.USER_HEADERS);
  const headerRange = sheet.getRange(1, 1, 1, CONFIG.USER_HEADERS.length);
  const headers = headerRange.getValues()[0];
  let changed = false;
  CONFIG.USER_HEADERS.forEach((header, index) => {
    if (!String(headers[index] || '').trim()) {
      headers[index] = header;
      changed = true;
    }
  });
  if (changed) headerRange.setValues([headers]);
  return sheet;
}

function normalizeUserPermissions_(role, rawPermissions) {
  const normalized = Object.assign({}, DEFAULT_STAFF_PERMISSIONS);
  if (String(role || '').trim().toLowerCase() === ROLE.ADMIN) {
    USER_PERMISSION_KEYS.forEach(key => { normalized[key] = true; });
    return normalized;
  }

  if (rawPermissions) {
    try {
      const parsed = typeof rawPermissions === 'string' ? JSON.parse(rawPermissions) : rawPermissions;
      USER_PERMISSION_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(parsed || {}, key)) {
          normalized[key] = parsed[key] === true;
        }
      });
    } catch (e) {
      String(rawPermissions).split(',').map(s => s.trim()).filter(Boolean).forEach(key => {
        if (USER_PERMISSION_KEYS.includes(key)) normalized[key] = true;
      });
    }
  }
  return normalized;
}

function serializeUserPermissions_(role, permissions) {
  return JSON.stringify(normalizeUserPermissions_(role, permissions || {}));
}

function getStaffSheet_() {
  return getOrCreateSheet(CONFIG.SHEETS.STAFF, CONFIG.STAFF_HEADERS);
}

function getStaffNameIndex_(data, staffName) {
  const target = String(staffName || '').trim().toLowerCase();
  if (!target) return -1;
  return data.findIndex((row, i) => i > 0 && String(row[1] || '').trim().toLowerCase() === target);
}

function getStaffSpecialtyMap_() {
  const data = getSheetData(CONFIG.SHEETS.STAFF);
  return data.reduce((map, row) => {
    const name = String(row[1] || '').trim();
    if (name) map[name.toLowerCase()] = String(row[2] || '').trim();
    return map;
  }, {});
}

function upsertStaffForUser_(staffName, specialty, oldStaffName) {
  const name = String(staffName || '').trim();
  if (!name) return;

  const sheet = getStaffSheet_();
  const data = sheet.getDataRange().getValues();
  let rowIndex = getStaffNameIndex_(data, oldStaffName || name);
  if (rowIndex === -1 && oldStaffName && oldStaffName !== name) {
    rowIndex = getStaffNameIndex_(data, name);
  }

  if (rowIndex === -1) {
    sheet.appendRow([sheet.getLastRow(), name, String(specialty || '').trim()]);
  } else {
    const rowNum = rowIndex + 1;
    sheet.getRange(rowNum, 2).setValue(name);
    if (specialty !== undefined) {
      sheet.getRange(rowNum, 3).setValue(String(specialty || '').trim());
    }
  }

  clearCache('staff');
}

/**
 * Đọc Users sheet thô. Trả [{email, role, staffName, status, createdAt}, ...]
 */
function listUsersRaw() {
  ensureUsersSheetSchema_();
  const data = getSheetData(CONFIG.SHEETS.USERS);
  return data.map(row => ({
    email: String(row[0] || '').trim().toLowerCase(),
    role: String(row[1] || '').trim().toLowerCase(),
    staffName: String(row[2] || '').trim(),
    status: String(row[3] || 'active').trim().toLowerCase(),
    createdAt: row[4] || '',
    permissions: normalizeUserPermissions_(row[1], row[5])
  })).filter(u => u.email);
}

/**
 * Lấy user hiện tại từ session + tra Users sheet.
 * Trả 1 trong các state:
 *   { isSetupNeeded: true, email }  — Users sheet trống, cần setup admin đầu tiên
 *   { denied: true, email }          — email không nằm trong Users
 *   { email, role, staffName, name } — user hợp lệ
 */
function getCurrentUser() {
  const email = getActiveUserEmail_();
  // Đảm bảo sheet tồn tại để biết được "có user nào chưa"
  ensureUsersSheetSchema_();
  const users = listUsersRaw();

  if (users.length === 0) {
    return { isSetupNeeded: true, email: email };
  }
  if (!email) {
    return { denied: true, email: '', reason: 'Không lấy được email Google. Hãy đăng nhập Google trước khi mở app.' };
  }
  const u = users.find(x => x.email === email && x.status !== 'disabled');
  if (!u) return { denied: true, email: email, reason: 'Email này chưa có trong sheet Users hoặc user đang bị disabled.' };
  return { email: u.email, role: u.role || ROLE.STAFF, staffName: u.staffName, name: u.staffName || u.email, permissions: u.permissions };
}

function assertAdmin_() {
  const u = getCurrentUser();
  if (u.isSetupNeeded || u.denied || u.role !== ROLE.ADMIN) {
    throw new Error('Bạn không có quyền thực hiện thao tác này.');
  }
  return u;
}

function assertPermission_(permissionKey) {
  const u = getCurrentUser();
  if (u.isSetupNeeded || u.denied) {
    throw new Error('Phiên không hợp lệ. Vui lòng tải lại trang.');
  }
  if (u.role === ROLE.ADMIN || (u.permissions && u.permissions[permissionKey] === true)) {
    return u;
  }
  throw new Error('Bạn không có quyền thực hiện thao tác này.');
}

/**
 * Tạo admin đầu tiên — chỉ chạy được khi Users sheet trống.
 * Email lấy từ session (không nhận từ client để chống giả mạo).
 */
function setupFirstAdmin(staffName) {
  const sheet = ensureUsersSheetSchema_();
  const existing = listUsersRaw();
  if (existing.length > 0) {
    return { success: false, error: 'Đã có user, không thể setup lần đầu nữa.' };
  }
  const email = getActiveUserEmail_();
  if (!email) {
    return { success: false, error: 'Không lấy được email Google. Hãy đảm bảo đăng nhập Google.' };
  }
  sheet.appendRow([email, ROLE.ADMIN, String(staffName || '').trim(), 'active', new Date(), serializeUserPermissions_(ROLE.ADMIN)]);
  clearCache();
  logAction_('auth_setup_first_admin', { email: email });
  return { success: true, email: email };
}

function listUsers() {
  try {
    assertPermission_('manageUsers');
    const raw = listUsersRaw();
    const specialtyMap = getStaffSpecialtyMap_();
    // Date không serialize ổn định qua google.script.run — chuyển ISO string
    const data = raw.map(u => ({
      email: u.email,
      role: u.role,
      staffName: u.staffName,
      specialty: specialtyMap[String(u.staffName || '').trim().toLowerCase()] || '',
      status: u.status,
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt || ''),
      permissions: u.permissions
    }));
    return { success: true, data: data, permissionDefs: USER_PERMISSION_DEFS };
  } catch (e) {
    console.error('listUsers error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

function addUser(payload) {
  try {
    assertPermission_('manageUsers');
    const email = String(payload && payload.email || '').trim().toLowerCase();
    const role = String(payload && payload.role || '').trim().toLowerCase();
    const staffName = String(payload && payload.staffName || '').trim();
    const specialty = String(payload && payload.specialty || '').trim();
    const permissions = payload && payload.permissions;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { success: false, error: 'Email không hợp lệ.' };
    }
    if (role !== ROLE.ADMIN && role !== ROLE.STAFF) {
      return { success: false, error: 'Role phải là admin hoặc staff.' };
    }
    if (role === ROLE.STAFF && !staffName) {
      return { success: false, error: 'Nhân viên phải gắn tên nhân viên (khớp sheet Nhân viên).' };
    }
    const sheet = ensureUsersSheetSchema_();
    if (listUsersRaw().some(u => u.email === email)) {
      return { success: false, error: 'Email đã tồn tại.' };
    }
    sheet.appendRow([email, role, staffName, 'active', new Date(), serializeUserPermissions_(role, permissions)]);
    if (staffName) upsertStaffForUser_(staffName, specialty);
    clearCache();
    logAction_('user_add', { email: email, role: role, staffName: staffName });
    return { success: true };
  } catch (e) {
    console.error('addUser error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

function updateUser(payload) {
  try {
  assertPermission_('manageUsers');
  const target = String(payload && payload.email || '').trim().toLowerCase();
  const newRole = String(payload && payload.role || '').trim().toLowerCase();
  const newStaffName = payload && typeof payload.staffName === 'string' ? payload.staffName.trim() : undefined;
  const newSpecialty = payload && typeof payload.specialty === 'string' ? payload.specialty.trim() : undefined;
  const newStatus = String(payload && payload.status || '').trim().toLowerCase();
  const newPermissions = payload && payload.permissions;
  if (!target) return { success: false, error: 'Thiếu email.' };
  if (newRole && newRole !== ROLE.ADMIN && newRole !== ROLE.STAFF) {
    return { success: false, error: 'Role phải là admin hoặc staff.' };
  }

  const sheet = ensureUsersSheetSchema_();
  const all = sheet.getDataRange().getValues();
  const idx = all.findIndex((row, i) => i > 0 && String(row[0] || '').trim().toLowerCase() === target);
  if (idx === -1) return { success: false, error: 'Không tìm thấy user.' };
  const rowNum = idx + 1;
  const oldStaffName = String(all[idx][2] || '').trim();
  const effectiveRole = newRole || String(all[idx][1] || '').trim().toLowerCase();
  const effectiveStaffName = newStaffName !== undefined ? newStaffName : oldStaffName;
  if (effectiveRole === ROLE.STAFF && !effectiveStaffName) {
    return { success: false, error: 'Nhân viên phải gắn tên nhân viên.' };
  }

  // Không cho hạ chính mình khỏi admin nếu đang là admin duy nhất
  const current = getCurrentUser();
  if (target === current.email && newRole && newRole !== ROLE.ADMIN) {
    const adminCount = listUsersRaw().filter(u => u.role === ROLE.ADMIN && u.status !== 'disabled').length;
    if (adminCount <= 1) return { success: false, error: 'Không thể hạ quyền admin duy nhất.' };
  }

  if (newRole) sheet.getRange(rowNum, 2).setValue(newRole);
  if (newStaffName !== undefined) sheet.getRange(rowNum, 3).setValue(newStaffName);
  if (newStatus) sheet.getRange(rowNum, 4).setValue(newStatus);
  if (newPermissions) sheet.getRange(rowNum, 6).setValue(serializeUserPermissions_(newRole || all[idx][1], newPermissions));
  if (newStaffName !== undefined && newStaffName) {
    upsertStaffForUser_(newStaffName, newSpecialty, oldStaffName);
  }
  clearCache();
  logAction_('user_update', { email: target, role: newRole, staffName: newStaffName, status: newStatus, permissions: newPermissions });
  return { success: true };
  } catch (e) {
    console.error('updateUser error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

function deleteUser(email) {
  try {
  assertPermission_('manageUsers');
  const target = String(email || '').trim().toLowerCase();
  const current = getCurrentUser();
  if (target === current.email) return { success: false, error: 'Không thể xoá chính mình.' };
  const adminCount = listUsersRaw().filter(u => u.role === ROLE.ADMIN && u.status !== 'disabled').length;
  const targetUser = listUsersRaw().find(u => u.email === target);
  if (!targetUser) return { success: false, error: 'Không tìm thấy user.' };
  if (targetUser.role === ROLE.ADMIN && adminCount <= 1) {
    return { success: false, error: 'Không thể xoá admin duy nhất.' };
  }

  const sheet = ensureUsersSheetSchema_();
  const all = sheet.getDataRange().getValues();
  const idx = all.findIndex((row, i) => i > 0 && String(row[0] || '').trim().toLowerCase() === target);
  if (idx === -1) return { success: false, error: 'Không tìm thấy user.' };
  sheet.deleteRow(idx + 1);
  clearCache();
  logAction_('user_delete', { email: target });
  return { success: true };
  } catch (e) {
    console.error('deleteUser error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Helper cho các Service kiểm tra quyền sửa 1 appointment.
 * Throw nếu không có quyền.
 */
/**
 * Ghi 1 dòng vào sheet Logs. Best-effort: lỗi log không bao giờ làm hỏng action chính.
 * @param {string} action  Ngắn gọn (snake_case), VD 'appointment_create'
 * @param {string|object} details  Chuỗi hoặc object sẽ JSON.stringify
 */
function logAction_(action, details) {
  try {
    const sheet = getOrCreateSheet(CONFIG.SHEETS.LOGS, CONFIG.LOG_HEADERS);
    const u = getCurrentUser();
    const email = (u && u.email) || getActiveUserEmail_() || '(anon)';
    const role = (u && u.role) || (u && u.isSetupNeeded ? 'setup' : (u && u.denied ? 'denied' : ''));
    let detailStr = '';
    if (details != null) detailStr = typeof details === 'string' ? details : JSON.stringify(details);
    if (detailStr.length > 2000) detailStr = detailStr.slice(0, 2000) + '…';
    sheet.appendRow([new Date(), email, role, String(action || ''), detailStr]);
    // Trim log cũ nếu vượt ngưỡng
    const lastRow = sheet.getLastRow();
    if (lastRow > CONFIG.LOG_MAX_ROWS + 1) {
      sheet.deleteRows(2, lastRow - CONFIG.LOG_MAX_ROWS - 1);
    }
  } catch (e) {
    console.warn('logAction_ failed:', e);
  }
}

/**
 * Trả N log gần nhất (mới → cũ). Admin-only.
 */
function getLogs(limit) {
  try {
    assertPermission_('viewLogs');
    const sheet = getOrCreateSheet(CONFIG.SHEETS.LOGS, CONFIG.LOG_HEADERS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, data: [], total: 0 };
    const n = Math.min(Math.max(Number(limit) || 200, 1), 2000);
    const start = Math.max(2, lastRow - n + 1);
    const rows = sheet.getRange(start, 1, lastRow - start + 1, sheet.getLastColumn()).getValues();
    const data = rows.map(r => ({
      time: r[0] instanceof Date ? r[0].toISOString() : String(r[0] || ''),
      email: String(r[1] || ''),
      role: String(r[2] || ''),
      action: String(r[3] || ''),
      details: String(r[4] || '')
    })).reverse();
    return { success: true, data: data, total: lastRow - 1 };
  } catch (e) {
    console.error('getLogs error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

function assertCanMutateAppointment_(appointmentRow) {
  const u = getCurrentUser();
  if (u.isSetupNeeded || u.denied) throw new Error('Phiên không hợp lệ. Vui lòng tải lại trang.');
  if (u.role === ROLE.ADMIN) return u;
  // staff chỉ được sửa lịch của mình
  const rowStaff = String((appointmentRow && appointmentRow[6]) || '').trim().toLowerCase();
  const myName = String(u.staffName || '').trim().toLowerCase();
  if (!myName || rowStaff !== myName) {
    throw new Error('Bạn chỉ được thao tác trên lịch hẹn của chính mình.');
  }
  return u;
}
