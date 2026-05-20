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
    STAFF: 'Users',
    CUSTOMERS: 'Khách hàng',
    SETTINGS: 'Cài Đặt',
    USERS_LEGACY: 'Nhân viên', // dùng cho migration ngược lại
    LOGS: 'Logs',
  },
  APPOINTMENT_HEADERS: ['ID', 'Tên khách hàng', 'Số điện thoại', 'Dịch vụ', 'Ngày', 'Giờ', 'Nhân viên', 'Trạng thái', 'Ghi chú'],
  SERVICE_HEADERS: ['ID', 'Tên dịch vụ', 'Giá'],
  // Sheet Nhân viên gộp với Users: cột F-I là tài khoản login, cột J là mật khẩu
  STAFF_HEADERS: ['ID', 'Tên nhân viên', 'Chuyên môn', 'SĐT', 'Trạng thái', 'Email', 'Role', 'Quyền', 'Ngày tạo', 'Mật khẩu'],
  CUSTOMER_HEADERS: ['Tên', 'Số điện thoại', 'Ngày tạo'],
  LOG_HEADERS: ['Thời gian', 'Email', 'Role', 'Hành động', 'Chi tiết'],
  LOG_MAX_ROWS: 5000, // tự cắt bớt log cũ khi vượt
  CACHE_DURATION_SECONDS: 300, // Cache tồn tại trong 5 phút
};

// Index cột (0-based) trong sheet Nhân viên — dùng cho mọi nơi đọc/ghi
const STAFF_COL = {
  ID: 0,
  NAME: 1,
  SPECIALTY: 2,
  PHONE: 3,
  STATUS: 4,  // "Đang làm" / "Đã nghỉ" / "disabled"
  EMAIL: 5,
  ROLE: 6,
  PERMISSIONS: 7,
  CREATED_AT: 8,
  PASSWORD: 9, // SHA-256 hash mật khẩu
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
 * Kiểm tra email client gửi lên, trả về thông tin user (hoặc lỗi).
 * Đây là bước "đăng nhập" duy nhất — client gửi email, server tra sheet.
 */
function loginWithEmail(email) {
  try {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return { denied: true, email: '', reason: 'Vui lòng nhập email.' };
    }
    ensureStaffSheetSchema_();
    const users = listUsersRaw();
    if (users.length === 0) {
      return { isSetupNeeded: true, email: normalizedEmail };
    }
    const u = users.find(x => x.email === normalizedEmail && isLoginActive_(x.status));
    if (!u) {
      return { denied: true, email: normalizedEmail, reason: 'Email này chưa có trong danh sách nhân viên hoặc tài khoản đang bị khóa.' };
    }
    return {
      success: true,
      email: u.email,
      role: u.role || ROLE.STAFF,
      staffName: u.staffName,
      name: u.staffName || u.email,
      permissions: u.permissions
    };
  } catch (e) {
    console.error('loginWithEmail error:', e && e.stack || e);
    return { denied: true, email: String(email || ''), reason: 'Lỗi server: ' + ((e && e.message) || String(e)) };
  }
}

/**
 * Tải tất cả dữ liệu ban đầu cho ứng dụng.
 * @param {string} emailToken Email đã được xác thực ở bước loginWithEmail.
 */
function initializeAllData(emailToken) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'allAppData_v4';
  const normalizedEmail = String(emailToken || '').trim().toLowerCase();

  // Validate email lại mỗi lần (không tin hoàn toàn vào cache)
  ensureStaffSheetSchema_();
  const users = listUsersRaw();
  if (users.length === 0) return { isSetupNeeded: true, email: normalizedEmail };
  if (!normalizedEmail) return { denied: true, email: '', reason: 'Chưa đăng nhập.' };
  const earlyUser = users.find(x => x.email === normalizedEmail && isLoginActive_(x.status));
  if (!earlyUser) return { denied: true, email: normalizedEmail, reason: 'Email không hợp lệ hoặc tài khoản bị khóa.' };

  const currentUser = {
    email: earlyUser.email,
    role: earlyUser.role || ROLE.STAFF,
    staffName: earlyUser.staffName,
    name: earlyUser.staffName || earlyUser.email,
    permissions: earlyUser.permissions
  };

  const userCacheKey = cacheKey + '_' + normalizedEmail;
  const cached = cache.get(userCacheKey);
  if (cached) {
    console.log('✅ Returning data from CacheService for', normalizedEmail);
    const parsed = JSON.parse(cached);
    parsed.currentUser = currentUser; // luôn trả currentUser mới nhất
    return parsed;
  }

  try {
    console.log('🔄 Loading all initial data from Sheets...');

    let appointments = loadAppointments();
    const services = loadServices();
    const staff = loadStaff();
    let customers = loadCustomers();

    // RBAC: Nhân viên chỉ thấy lịch của mình
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

    cache.put(userCacheKey, JSON.stringify(result), CONFIG.CACHE_DURATION_SECONDS);
    console.log('✅ All data loaded and cached for', normalizedEmail);
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
 * Tải danh sách nhân viên (thợ cắt) cho FE — scheduling, dropdown.
 * Loại admin: admin có thể có row trong sheet nhưng không phải thợ cắt nên không hiện trong scheduling.
 * Không expose email/role/permissions — UI staff list chỉ cần info công việc.
 */
function loadStaff() {
  const data = getSheetData(CONFIG.SHEETS.STAFF);
  return data
    .filter(row => {
      const name = String(row[STAFF_COL.NAME] || '').trim();
      const role = String(row[STAFF_COL.ROLE] || '').trim().toLowerCase();
      return name && role !== ROLE.ADMIN;
    })
    .map(row => ({
      id: row[STAFF_COL.ID],
      name: row[STAFF_COL.NAME],
      specialty: row[STAFF_COL.SPECIALTY] || 'Chưa có',
      phone: row[STAFF_COL.PHONE] || '',
      status: String(row[STAFF_COL.STATUS] || 'Đang làm').trim()
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
    if (email) return String(email).trim().toLowerCase();
  } catch (e) {
    // Continue to owner fallback below.
  }
  try {
    const email = Session.getEffectiveUser().getEmail();
    return email ? String(email).trim().toLowerCase() : '';
  } catch (e) {
    return '';
  }
}

/**
 * Đảm bảo sheet Nhân viên có đủ 9 cột (mới gộp Users).
 * Tự nâng cấp sheet cũ (3-5 cột) lên 9 cột nếu cần.
 */
function ensureStaffSheetSchema_() {
  const sheet = getOrCreateSheet(CONFIG.SHEETS.STAFF, CONFIG.STAFF_HEADERS);
  const lastCol = sheet.getLastColumn();
  const targetCols = CONFIG.STAFF_HEADERS.length;
  if (lastCol < targetCols) {
    sheet.insertColumnsAfter(lastCol || 1, targetCols - (lastCol || 1));
  }
  const headerRange = sheet.getRange(1, 1, 1, targetCols);
  const headers = headerRange.getValues()[0];
  let changed = false;
  CONFIG.STAFF_HEADERS.forEach((header, index) => {
    if (!String(headers[index] || '').trim()) {
      headers[index] = header;
      changed = true;
    }
  });
  if (changed) headerRange.setValues([headers]);
  return sheet;
}

function getStaffSheet_() {
  return ensureStaffSheetSchema_();
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

function getStaffNameIndex_(data, staffName) {
  const target = String(staffName || '').trim().toLowerCase();
  if (!target) return -1;
  return data.findIndex((row, i) => i > 0 && String(row[STAFF_COL.NAME] || '').trim().toLowerCase() === target);
}

function getStaffEmailIndex_(data, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return -1;
  return data.findIndex((row, i) => i > 0 && String(row[STAFF_COL.EMAIL] || '').trim().toLowerCase() === target);
}

function getStaffSpecialtyMap_() {
  const data = getSheetData(CONFIG.SHEETS.STAFF);
  return data.reduce((map, row) => {
    const name = String(row[STAFF_COL.NAME] || '').trim();
    if (name) map[name.toLowerCase()] = String(row[STAFF_COL.SPECIALTY] || '').trim();
    return map;
  }, {});
}

/**
 * "Đang làm" hoặc "active" → cho login. "Đã nghỉ"/"disabled" → khóa login.
 */
function isLoginActive_(rawStatus) {
  const s = String(rawStatus || 'active').trim().toLowerCase();
  if (!s) return true;
  return !(s === 'disabled' || s === 'đã nghỉ' || s === 'khóa');
}

/**
 * Đọc các row trong sheet Nhân viên có Email → tài khoản login.
 * Trả [{email, role, staffName, specialty, phone, status, createdAt, permissions, rowIndex}, ...]
 */
function listUsersRaw() {
  const sheet = ensureStaffSheetSchema_();
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.STAFF_HEADERS.length).getValues();
  return data
    .map((row, i) => ({
      email: String(row[STAFF_COL.EMAIL] || '').trim().toLowerCase(),
      role: String(row[STAFF_COL.ROLE] || '').trim().toLowerCase(),
      staffName: String(row[STAFF_COL.NAME] || '').trim(),
      specialty: String(row[STAFF_COL.SPECIALTY] || '').trim(),
      phone: String(row[STAFF_COL.PHONE] || '').trim(),
      status: String(row[STAFF_COL.STATUS] || 'active').trim(),
      createdAt: row[STAFF_COL.CREATED_AT] || '',
      permissions: normalizeUserPermissions_(row[STAFF_COL.ROLE], row[STAFF_COL.PERMISSIONS]),
      rowIndex: i + 2 // 1-based, +1 cho header
    }))
    .filter(u => u.email);
}

/**
 * Lấy user theo email được client truyền lên (thay cho Session.getActiveUser()).
 * @param {string} emailToken Email đã được xác thực ở loginWithEmail.
 */
function getCurrentUser(emailToken) {
  const email = String(emailToken || '').trim().toLowerCase();
  ensureStaffSheetSchema_();
  const users = listUsersRaw();

  if (users.length === 0) {
    return { isSetupNeeded: true, email: email };
  }
  if (!email) {
    return { denied: true, email: '', reason: 'Chưa đăng nhập.' };
  }
  const u = users.find(x => x.email === email && isLoginActive_(x.status));
  if (!u) return { denied: true, email: email, reason: 'Email này chưa có trong danh sách nhân viên hoặc tài khoản bị khóa.' };
  return {
    email: u.email,
    role: u.role || ROLE.STAFF,
    staffName: u.staffName,
    name: u.staffName || u.email,
    permissions: u.permissions
  };
}

function assertAdmin_(emailToken) {
  const u = getCurrentUser(emailToken);
  if (u.isSetupNeeded || u.denied || u.role !== ROLE.ADMIN) {
    throw new Error('Bạn không có quyền thực hiện thao tác này.');
  }
  return u;
}

function assertPermission_(emailToken, permissionKey) {
  const u = getCurrentUser(emailToken);
  if (u.isSetupNeeded || u.denied) {
    throw new Error('Phiên không hợp lệ. Vui lòng tải lại trang.');
  }
  if (u.role === ROLE.ADMIN || (u.permissions && u.permissions[permissionKey] === true)) {
    return u;
  }
  throw new Error('Bạn không có quyền thực hiện thao tác này.');
}

function nextStaffId_(sheet) {
  if (sheet.getLastRow() < 2) return 1;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(r => Number(r[0]) || 0);
  return Math.max(0, ...ids) + 1;
}

function buildStaffRow_(payload) {
  const row = new Array(CONFIG.STAFF_HEADERS.length).fill('');
  row[STAFF_COL.ID] = payload.id != null ? payload.id : '';
  row[STAFF_COL.NAME] = String(payload.staffName || '').trim();
  row[STAFF_COL.SPECIALTY] = String(payload.specialty || '').trim();
  row[STAFF_COL.PHONE] = String(payload.phone || '').trim();
  row[STAFF_COL.STATUS] = String(payload.status || 'Đang làm').trim();
  row[STAFF_COL.EMAIL] = String(payload.email || '').trim().toLowerCase();
  row[STAFF_COL.ROLE] = String(payload.role || '').trim().toLowerCase();
  row[STAFF_COL.PERMISSIONS] = payload.role
    ? serializeUserPermissions_(payload.role, payload.permissions)
    : '';
  row[STAFF_COL.CREATED_AT] = payload.createdAt instanceof Date ? payload.createdAt : new Date();
  return row;
}

/**
 * Tạo admin đầu tiên — chỉ chạy được khi chưa có user nào.
 * Email được client nhập vào form setup.
 */
function setupFirstAdmin(staffName, email, password) {
  var sheet = ensureStaffSheetSchema_();
  if (listUsersRaw().length > 0) {
    return { success: false, error: 'Đã có user, không thể setup lần đầu nữa.' };
  }
  var normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    return { success: false, error: 'Vui lòng nhập email hợp lệ.' };
  }
  if (password && password.length < 6) {
    return { success: false, error: 'Mật khẩu phải từ 6 ký tự.' };
  }

  var data = sheet.getDataRange().getValues();
  var idx = getStaffNameIndex_(data, staffName);
  var newRow = buildStaffRow_({
    staffName: staffName,
    email: normalizedEmail,
    role: ROLE.ADMIN,
    status: 'Đang làm'
  });

  if (idx === -1) {
    newRow[STAFF_COL.ID] = nextStaffId_(sheet);
    sheet.appendRow(newRow);
  } else {
    var rowNum = idx + 1;
    newRow[STAFF_COL.ID] = data[idx][STAFF_COL.ID] || nextStaffId_(sheet);
    sheet.getRange(rowNum, 1, 1, CONFIG.STAFF_HEADERS.length).setValues([newRow]);
  }

  // Lưu password nếu đã cung cấp
  if (password) {
    setUserPassword_(normalizedEmail, password, sheet);
  }

  clearCache();
  logAction_('auth_setup_first_admin', { email: normalizedEmail });
  return { success: true, email: normalizedEmail };
}

function listUsers(emailToken) {
  try {
    assertPermission_(emailToken, 'manageUsers');
    const raw = listUsersRaw();
    const data = raw.map(u => ({
      email: u.email,
      role: u.role,
      staffName: u.staffName,
      specialty: u.specialty,
      phone: u.phone,
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

/**
 * Thêm user mới. 2 trường hợp:
 *  - role=staff + staffName trùng row có sẵn trong Nhân viên → UPDATE row đó (gán email/role/quyền)
 *  - admin hoặc staff mới → APPEND row mới
 */
function addUser(payload) {
  try {
    const emailToken = payload && payload._emailToken;
    assertPermission_(emailToken, 'manageUsers');
    const email = String(payload && payload.email || '').trim().toLowerCase();
    const role = String(payload && payload.role || '').trim().toLowerCase();
    const staffName = String(payload && payload.staffName || '').trim();
    const specialty = String(payload && payload.specialty || '').trim();
    const phone = String(payload && payload.phone || '').trim();
    const permissions = payload && payload.permissions;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { success: false, error: 'Email không hợp lệ.' };
    }
    if (role !== ROLE.ADMIN && role !== ROLE.STAFF) {
      return { success: false, error: 'Role phải là admin hoặc staff.' };
    }
    if (!staffName) {
      return { success: false, error: 'Phải có Tên (admin: tên hiển thị / staff: tên nhân viên).' };
    }

    const sheet = ensureStaffSheetSchema_();
    if (listUsersRaw().some(u => u.email === email)) {
      return { success: false, error: 'Email đã tồn tại.' };
    }

    const data = sheet.getDataRange().getValues();
    const existingIdx = getStaffNameIndex_(data, staffName);

    if (existingIdx !== -1) {
      // Có row staff sẵn → gán email/role/permissions vào row đó (giữ specialty/phone cũ nếu không cấp mới)
      const rowNum = existingIdx + 1;
      const existing = data[existingIdx];
      const merged = buildStaffRow_({
        id: existing[STAFF_COL.ID] || nextStaffId_(sheet),
        staffName: staffName,
        specialty: specialty || existing[STAFF_COL.SPECIALTY] || '',
        phone: phone || existing[STAFF_COL.PHONE] || '',
        status: existing[STAFF_COL.STATUS] || 'Đang làm',
        email: email,
        role: role,
        permissions: permissions,
        createdAt: existing[STAFF_COL.CREATED_AT] || new Date()
      });
      sheet.getRange(rowNum, 1, 1, CONFIG.STAFF_HEADERS.length).setValues([merged]);
    } else {
      const newRow = buildStaffRow_({
        id: nextStaffId_(sheet),
        staffName: staffName,
        specialty: specialty,
        phone: phone,
        status: 'Đang làm',
        email: email,
        role: role,
        permissions: permissions
      });
      sheet.appendRow(newRow);
    }

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
    const emailToken = payload && payload._emailToken;
    assertPermission_(emailToken, 'manageUsers');
    const target = String(payload && payload.email || '').trim().toLowerCase();
    const newRole = String(payload && payload.role || '').trim().toLowerCase();
    const newStaffName = payload && typeof payload.staffName === 'string' ? payload.staffName.trim() : undefined;
    const newSpecialty = payload && typeof payload.specialty === 'string' ? payload.specialty.trim() : undefined;
    const newPhone = payload && typeof payload.phone === 'string' ? payload.phone.trim() : undefined;
    const newStatus = payload && typeof payload.status === 'string' ? payload.status.trim() : '';
    const newPermissions = payload && payload.permissions;
    if (!target) return { success: false, error: 'Thiếu email.' };
    if (newRole && newRole !== ROLE.ADMIN && newRole !== ROLE.STAFF) {
      return { success: false, error: 'Role phải là admin hoặc staff.' };
    }

    const sheet = ensureStaffSheetSchema_();
    const all = sheet.getDataRange().getValues();
    const idx = getStaffEmailIndex_(all, target);
    if (idx === -1) return { success: false, error: 'Không tìm thấy user.' };
    const rowNum = idx + 1;
    const row = all[idx];
    const oldRole = String(row[STAFF_COL.ROLE] || '').trim().toLowerCase();
    const effectiveRole = newRole || oldRole;
    const effectiveStaffName = newStaffName !== undefined ? newStaffName : String(row[STAFF_COL.NAME] || '').trim();
    if (!effectiveStaffName) {
      return { success: false, error: 'Phải có Tên.' };
    }

    // Không cho hạ chính mình khỏi admin nếu đang là admin duy nhất
    const current = getCurrentUser(emailToken);
    if (target === current.email && newRole && newRole !== ROLE.ADMIN) {
      const adminCount = listUsersRaw().filter(u => u.role === ROLE.ADMIN && isLoginActive_(u.status)).length;
      if (adminCount <= 1) return { success: false, error: 'Không thể hạ quyền admin duy nhất.' };
    }

    if (newRole) sheet.getRange(rowNum, STAFF_COL.ROLE + 1).setValue(newRole);
    if (newStaffName !== undefined) sheet.getRange(rowNum, STAFF_COL.NAME + 1).setValue(newStaffName);
    if (newSpecialty !== undefined) sheet.getRange(rowNum, STAFF_COL.SPECIALTY + 1).setValue(newSpecialty);
    if (newPhone !== undefined) sheet.getRange(rowNum, STAFF_COL.PHONE + 1).setValue(newPhone);
    if (newStatus) sheet.getRange(rowNum, STAFF_COL.STATUS + 1).setValue(newStatus);
    if (newPermissions) sheet.getRange(rowNum, STAFF_COL.PERMISSIONS + 1).setValue(serializeUserPermissions_(effectiveRole, newPermissions));

    clearCache();
    logAction_('user_update', { email: target, role: newRole, staffName: newStaffName, status: newStatus, permissions: newPermissions });
    return { success: true };
  } catch (e) {
    console.error('updateUser error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Xóa user. Hành vi:
 *  - Nếu row chỉ là admin (không có Chuyên môn/SĐT → không phải thợ cắt thực) → XÓA row.
 *  - Nếu row là nhân viên + có dữ liệu lịch hẹn → CHỈ XÓA cột Email/Role/Quyền (giữ row làm thợ cắt).
 */
function deleteUser(email, emailToken) {
  try {
    assertPermission_(emailToken, 'manageUsers');
    const target = String(email || '').trim().toLowerCase();
    const current = getCurrentUser(emailToken);
    if (target === current.email) return { success: false, error: 'Không thể xoá chính mình.' };

    const users = listUsersRaw();
    const targetUser = users.find(u => u.email === target);
    if (!targetUser) return { success: false, error: 'Không tìm thấy user.' };
    const adminCount = users.filter(u => u.role === ROLE.ADMIN && isLoginActive_(u.status)).length;
    if (targetUser.role === ROLE.ADMIN && adminCount <= 1) {
      return { success: false, error: 'Không thể xoá admin duy nhất.' };
    }

    const sheet = ensureStaffSheetSchema_();
    const all = sheet.getDataRange().getValues();
    const idx = getStaffEmailIndex_(all, target);
    if (idx === -1) return { success: false, error: 'Không tìm thấy user.' };
    const rowNum = idx + 1;
    const row = all[idx];
    const isPureAdmin = targetUser.role === ROLE.ADMIN
      && !String(row[STAFF_COL.SPECIALTY] || '').trim()
      && !String(row[STAFF_COL.PHONE] || '').trim();

    if (isPureAdmin) {
      sheet.deleteRow(rowNum);
    } else {
      // Giữ row, chỉ xóa thông tin login
      sheet.getRange(rowNum, STAFF_COL.EMAIL + 1).setValue('');
      sheet.getRange(rowNum, STAFF_COL.ROLE + 1).setValue('');
      sheet.getRange(rowNum, STAFF_COL.PERMISSIONS + 1).setValue('');
    }
    clearCache();
    logAction_('user_delete', { email: target, mode: isPureAdmin ? 'row_deleted' : 'login_revoked' });
    return { success: true };
  } catch (e) {
    console.error('deleteUser error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

/**
 * MIGRATION 1 LẦN: gộp data từ sheet Users (cũ) vào sheet Nhân viên (mới).
 * Cách chạy: vào Apps Script editor → chọn function migrateUsersToStaff → Run.
 *
 * Logic:
 *  - Đảm bảo sheet Nhân viên có 9 cột.
 *  - Đọc tất cả row từ sheet Users (legacy).
 *  - Mỗi row: nếu staffName khớp 1 row trong Nhân viên → update Email/Role/Quyền vào row đó.
 *    Nếu không khớp → append row mới (admin không có chuyên môn).
 *  - KHÔNG xóa sheet Users tự động — bạn tự kiểm tra & xóa tay sau migration.
 */
/**
 * MIGRATION Ngược lại: Sao chép toàn bộ data từ sheet "Nhân viên" (cũ) vào sheet "Users" (mới).
 * Cách chạy: vào Apps Script editor → chọn function migrateStaffToUsers → Run.
 */
function migrateStaffToUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const staffSheet = ss.getSheetByName('Nhân viên');
  if (!staffSheet) {
    return { success: true, migrated: 0, message: 'Không tìm thấy sheet "Nhân viên" để chuyển.' };
  }
  const usersSheet = ensureStaffSheetSchema_();
  
  const data = staffSheet.getDataRange().getValues();
  if (data.length < 2) {
    return { success: true, migrated: 0, message: 'Sheet "Nhân viên" trống.' };
  }
  
  // Ghi đè toàn bộ dữ liệu từ sheet "Nhân viên" sang "Users"
  usersSheet.clear();
  
  const targetCols = CONFIG.STAFF_HEADERS.length;
  usersSheet.getRange(1, 1, data.length, targetCols).setValues(
    data.map(row => {
      const newRow = new Array(targetCols).fill('');
      for (let i = 0; i < targetCols; i++) {
        newRow[i] = row[i] !== undefined ? row[i] : '';
      }
      return newRow;
    })
  );
  
  clearCache();
  return {
    success: true,
    migrated: data.length - 1,
    message: 'Đã sao chép toàn bộ dữ liệu từ sheet "Nhân viên" sang sheet "Users" thành công. Hãy kiểm tra lại và xóa sheet "Nhân viên" thủ công.'
  };
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
function logAction_(action, details, emailToken) {
  try {
    const sheet = getOrCreateSheet(CONFIG.SHEETS.LOGS, CONFIG.LOG_HEADERS);
    let email = '(anon)';
    let role = '';
    if (emailToken) {
      const u = getCurrentUser(emailToken);
      email = (u && u.email) || emailToken || '(anon)';
      role = (u && u.role) || (u && u.isSetupNeeded ? 'setup' : (u && u.denied ? 'denied' : ''));
    }
    let detailStr = '';
    if (details != null) detailStr = typeof details === 'string' ? details : JSON.stringify(details);
    if (detailStr.length > 2000) detailStr = detailStr.slice(0, 2000) + '…';
    sheet.appendRow([new Date(), email, role, String(action || ''), detailStr]);
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
function getLogs(limit, emailToken) {
  try {
    assertPermission_(emailToken, 'viewLogs');
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

function assertCanMutateAppointment_(appointmentRow, emailToken) {
  const u = getCurrentUser(emailToken);
  if (u.isSetupNeeded || u.denied) throw new Error('Phiên không hợp lệ. Vui lòng tải lại trang.');
  if (u.role === ROLE.ADMIN) return u;
  const rowStaff = String((appointmentRow && appointmentRow[6]) || '').trim().toLowerCase();
  const myName = String(u.staffName || '').trim().toLowerCase();
  if (!myName || rowStaff !== myName) {
    throw new Error('Bạn chỉ được thao tác trên lịch hẹn của chính mình.');
  }
  return u;
}
