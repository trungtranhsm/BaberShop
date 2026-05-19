// ========== STAFF MANAGEMENT ==========
// Quản lý nhân viên (thợ cắt) và dịch vụ.
// Các hàm đọc (loadStaff, loadServices) nằm trong Code.js.

/**
 * Thêm nhân viên mới (thợ cắt, không có tài khoản login).
 * payload: { name, specialty }
 */
function addStaff(payload) {
  try {
    assertPermission_('manageStaff');
    const name = String(payload && payload.name || '').trim();
    const specialty = String(payload && payload.specialty || '').trim();
    if (!name) return { success: false, error: 'Thiếu tên nhân viên.' };

    const sheet = ensureStaffSheetSchema_();
    const data = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.STAFF_HEADERS.length).getValues()
      : [];
    if (data.some(r => String(r[STAFF_COL.NAME] || '').trim().toLowerCase() === name.toLowerCase())) {
      return { success: false, error: 'Tên nhân viên đã tồn tại.' };
    }

    const id = nextStaffId_(sheet);
    const row = new Array(CONFIG.STAFF_HEADERS.length).fill('');
    row[STAFF_COL.ID]         = id;
    row[STAFF_COL.NAME]       = name;
    row[STAFF_COL.SPECIALTY]  = specialty;
    row[STAFF_COL.STATUS]     = 'Đang làm';
    row[STAFF_COL.CREATED_AT] = new Date();
    sheet.appendRow(row);

    clearCache();
    logAction_('staff_add', { id: id, name: name, specialty: specialty });
    return { success: true, id: id };
  } catch (e) {
    console.error('addStaff error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Cập nhật thông tin nhân viên.
 * payload: { name?, specialty?, status? }
 */
function updateStaff(staffId, payload) {
  try {
    assertPermission_('manageStaff');
    const sheet = ensureStaffSheetSchema_();
    if (sheet.getLastRow() < 2) return { success: false, error: 'Không tìm thấy nhân viên.' };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.STAFF_HEADERS.length).getValues();
    const idx = data.findIndex(r => String(r[STAFF_COL.ID]) === String(staffId));
    if (idx === -1) return { success: false, error: 'Không tìm thấy nhân viên ID: ' + staffId };

    const rowNum = idx + 2;
    if (payload.name !== undefined && String(payload.name).trim()) {
      sheet.getRange(rowNum, STAFF_COL.NAME + 1).setValue(String(payload.name).trim());
    }
    if (payload.specialty !== undefined) {
      sheet.getRange(rowNum, STAFF_COL.SPECIALTY + 1).setValue(String(payload.specialty).trim());
    }
    if (payload.status !== undefined) {
      sheet.getRange(rowNum, STAFF_COL.STATUS + 1).setValue(String(payload.status).trim());
    }

    clearCache();
    logAction_('staff_update', { id: staffId, name: payload.name, specialty: payload.specialty });
    return { success: true };
  } catch (e) {
    console.error('updateStaff error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Xóa nhân viên. Không cho xóa nếu nhân viên có tài khoản login.
 */
function deleteStaff(staffId) {
  try {
    assertPermission_('manageStaff');
    const sheet = ensureStaffSheetSchema_();
    if (sheet.getLastRow() < 2) return { success: false, error: 'Không tìm thấy nhân viên.' };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.STAFF_HEADERS.length).getValues();
    const idx = data.findIndex(r => String(r[STAFF_COL.ID]) === String(staffId));
    if (idx === -1) return { success: false, error: 'Không tìm thấy nhân viên ID: ' + staffId };

    const row = data[idx];
    if (String(row[STAFF_COL.EMAIL] || '').trim()) {
      return { success: false, error: 'Nhân viên này có tài khoản đăng nhập. Hãy xoá tài khoản user trước trong phần Quản lý user.' };
    }

    sheet.deleteRow(idx + 2);
    clearCache();
    logAction_('staff_delete', { id: staffId, name: row[STAFF_COL.NAME] });
    return { success: true };
  } catch (e) {
    console.error('deleteStaff error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

// ========== SERVICE MANAGEMENT ==========

/**
 * Tính ID tiếp theo cho dịch vụ.
 */
function nextServiceId_() {
  const sheet = getOrCreateSheet(CONFIG.SHEETS.SERVICES);
  if (sheet.getLastRow() < 2) return 1;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(r => Number(r[0]) || 0);
  return Math.max(0, ...ids) + 1;
}

/**
 * Thêm dịch vụ mới.
 * payload: { name, price }
 */
function addService(payload) {
  try {
    assertPermission_('manageServices');
    const name = String(payload && payload.name || '').trim();
    const price = Number(payload && payload.price) || 0;
    if (!name) return { success: false, error: 'Thiếu tên dịch vụ.' };

    const sheet = getOrCreateSheet(CONFIG.SHEETS.SERVICES, CONFIG.SERVICE_HEADERS);
    if (sheet.getLastRow() > 1) {
      const names = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
      if (names.some(r => String(r[0] || '').trim().toLowerCase() === name.toLowerCase())) {
        return { success: false, error: 'Tên dịch vụ đã tồn tại.' };
      }
    }

    const id = nextServiceId_();
    sheet.appendRow([id, name, price]);
    clearCache();
    logAction_('service_add', { id: id, name: name, price: price });
    return { success: true, id: id };
  } catch (e) {
    console.error('addService error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Xóa dịch vụ theo ID.
 */
function deleteService(serviceId) {
  try {
    assertPermission_('manageServices');
    const sheet = getOrCreateSheet(CONFIG.SHEETS.SERVICES);
    if (sheet.getLastRow() < 2) return { success: false, error: 'Không tìm thấy dịch vụ.' };

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    const idx = data.findIndex(r => String(r[0]) === String(serviceId));
    if (idx === -1) return { success: false, error: 'Không tìm thấy dịch vụ ID: ' + serviceId };

    sheet.deleteRow(idx + 2);
    clearCache();
    logAction_('service_delete', { id: serviceId });
    return { success: true };
  } catch (e) {
    console.error('deleteService error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}
