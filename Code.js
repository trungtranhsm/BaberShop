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
  },
  APPOINTMENT_HEADERS: ['ID', 'Tên khách hàng', 'Số điện thoại', 'Dịch vụ', 'Ngày', 'Giờ', 'Nhân viên', 'Trạng thái', 'Ghi chú'],
  SERVICE_HEADERS: ['ID', 'Tên dịch vụ', 'Giá'],
  STAFF_HEADERS: ['ID', 'Tên nhân viên', 'Chuyên môn'],
  CUSTOMER_HEADERS: ['Tên', 'Số điện thoại', 'Ngày tạo'],
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
  const cached = cache.get(cacheKey);

  if (cached) {
    console.log('✅ Returning data from CacheService.');
    return JSON.parse(cached);
  }

  try {
    console.log('🔄 Loading all initial data from Sheets...');

    const appointments = loadAppointments();
    const services = loadServices();
    const staff = loadStaff();
    const customers = loadCustomers();
    
    const result = {
      appointments: appointments,
      services: services,
      staff: staff,
      customers: customers,
      loadedAt: new Date().toISOString()
    };

    cache.put(cacheKey, JSON.stringify(result), CONFIG.CACHE_DURATION_SECONDS);
    
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
    const cacheKey = 'allAppData_v3';
    cache.remove(cacheKey);
    console.log(`🗑️ Cache cleared for key: ${cacheKey}`);
  } catch(e) {
    console.error('Error clearing cache:', e);
  }
  bumpDataVersion();
}

// =================================================================
// SYNC 2 CHIỀU: SHEET ↔ WEB APP
// =================================================================

const DATA_VERSION_KEY = 'DATA_VERSION';

/**
 * Cập nhật version để FE biết dữ liệu vừa thay đổi.
 * Được gọi khi: (1) user sửa trực tiếp trên Sheet (qua onSheetEdit),
 * (2) các write function trên web app (qua clearCache).
 */
function bumpDataVersion() {
  try {
    PropertiesService.getScriptProperties().setProperty(DATA_VERSION_KEY, String(Date.now()));
  } catch (e) {
    console.error('bumpDataVersion error:', e);
  }
}

/**
 * Endpoint FE poll để biết có dữ liệu mới hay không.
 */
function getDataVersion() {
  try {
    const props = PropertiesService.getScriptProperties();
    let v = props.getProperty(DATA_VERSION_KEY);
    if (!v) {
      v = String(Date.now());
      props.setProperty(DATA_VERSION_KEY, v);
    }
    return { version: Number(v), serverTime: new Date().toISOString() };
  } catch (e) {
    return { version: 0, error: e.toString() };
  }
}

/**
 * Installable onEdit trigger — chạy khi bất kỳ sheet nào trong spreadsheet bị sửa.
 * Chỉ xoá cache + bump version nếu sheet bị sửa nằm trong CONFIG.SHEETS.
 */
function onSheetEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheetName = e.range.getSheet().getName();
    const tracked = Object.values(CONFIG.SHEETS);
    if (tracked.indexOf(sheetName) === -1) return;

    const cache = CacheService.getScriptCache();
    cache.remove('allAppData_v3');
    bumpDataVersion();
    console.log(`🔁 onSheetEdit: invalidated cache & bumped version (sheet: ${sheetName})`);
  } catch (err) {
    console.error('onSheetEdit error:', err);
  }
}

/**
 * Cài installable trigger 1 lần. Chạy thủ công từ Apps Script editor.
 * Idempotent — xoá trigger cũ trùng tên trước khi tạo mới.
 */
function installSyncTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(t => {
    if (t.getHandlerFunction() === 'onSheetEdit') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  bumpDataVersion();
  console.log('✅ Installed onSheetEdit trigger for spreadsheet:', ss.getName());
  return 'OK';
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