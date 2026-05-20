// ========== APPOINTMENT MANAGEMENT ==========

function getAppointments(filterOptions) {
  try {
    const data = getSheetData(CONFIG.SHEETS.APPOINTMENTS);
    const allAppointments = data.map(row => ({
      id: row[0],
      customerName: row[1],
      phone: row[2],
      service: row[3],
      date: row[4] instanceof Date ? row[4].toISOString().split('T')[0] : row[4],
      time: row[5],
      staff: row[6],
      status: row[7],
      notes: row[8]
    }));
    return { success: true, data: allAppointments, total: allAppointments.length };
  } catch (error) {
    console.error('Error in getAppointments:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Tạo một lịch hẹn mới.
 * @param {object} appointmentData  Dữ liệu lịch hẹn, phải có _emailToken.
 */
function createAppointment(appointmentData) {
  try {
    const emailToken = appointmentData && appointmentData._emailToken;
    const me = getCurrentUser(emailToken);
    if (me.isSetupNeeded || me.denied) {
      return { success: false, error: 'Phiên không hợp lệ. Tải lại trang.' };
    }
    if (me.role === 'staff') {
      appointmentData.staff = me.staffName || appointmentData.staff;
      if (!me.staffName) {
        return { success: false, error: 'Tài khoản nhân viên chưa được gắn tên nhân viên.' };
      }
    }

    const requiredFields = ['customerName', 'phone', 'service', 'date', 'time'];
    const errors = requiredFields.filter(key => !appointmentData[key] || String(appointmentData[key]).trim() === '');
    if (errors.length > 0) {
      return { success: false, error: 'Trường bắt buộc còn thiếu: ' + errors.join(', ') };
    }

    const sheet = getOrCreateSheet(CONFIG.SHEETS.APPOINTMENTS, CONFIG.APPOINTMENT_HEADERS);
    const newId = generateId('LH', sheet.getLastRow() + 1);

    const newRow = [
      newId,
      appointmentData.customerName,
      appointmentData.phone,
      appointmentData.service,
      appointmentData.date,
      appointmentData.time,
      appointmentData.staff || '',
      'Đã đặt',
      appointmentData.notes || ''
    ];

    sheet.appendRow(newRow);
    sortAppointmentsSheet();
    addCustomerIfNotExists(appointmentData.customerName, appointmentData.phone);
    clearCache();
    logAction_('appointment_create', { id: newId, customer: appointmentData.customerName, date: appointmentData.date, staff: appointmentData.staff }, emailToken);

    return { success: true, data: {
      id: newRow[0], customerName: newRow[1], phone: newRow[2],
      service: newRow[3], date: newRow[4], time: newRow[5],
      staff: newRow[6], status: newRow[7], notes: newRow[8]
    }};
  } catch (error) {
    console.error('Error in createAppointment:', error.stack);
    return { success: false, error: error.toString() };
  }
}

/**
 * Cập nhật toàn bộ thông tin của 1 lịch hẹn.
 */
function updateAppointment(id, data) {
  try {
    if (!id) return { success: false, error: 'Thiếu ID lịch hẹn.' };
    const emailToken = data && data._emailToken;
    const sheet = getOrCreateSheet(CONFIG.SHEETS.APPOINTMENTS, CONFIG.APPOINTMENT_HEADERS);
    const finder = sheet.getRange('A:A').createTextFinder(id).matchEntireCell(true);
    const cell = finder.findNext();
    if (!cell) return { success: false, error: 'Không tìm thấy lịch hẹn với ID: ' + id };
    const rowIndex = cell.getRow();
    const existingRow = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];

    const me = assertCanMutateAppointment_(existingRow, emailToken);
    if (me.role === 'staff') {
      data.staff = me.staffName || existingRow[6];
    }

    const required = ['customerName', 'phone', 'service', 'date', 'time'];
    const missing = required.filter(k => !data[k] || String(data[k]).trim() === '');
    if (missing.length) return { success: false, error: 'Trường bắt buộc còn thiếu: ' + missing.join(', ') };

    sheet.getRange(rowIndex, 2, 1, 6).setValues([[
      data.customerName, data.phone, data.service, data.date, data.time, data.staff || ''
    ]]);
    sheet.getRange(rowIndex, 9).setValue(data.notes || '');

    sortAppointmentsSheet();
    addCustomerIfNotExists(data.customerName, data.phone);
    clearCache();
    logAction_('appointment_update', { id: id, after: data }, emailToken);

    return { success: true, data: {
      id: id, customerName: data.customerName, phone: data.phone,
      service: data.service, date: data.date, time: data.time,
      staff: data.staff || '', status: existingRow[7], notes: data.notes || ''
    }};
  } catch (e) {
    console.error('Error in updateAppointment:', e.stack);
    return { success: false, error: e.toString() };
  }
}

/**
 * Hoàn thành một lịch hẹn.
 */
function completeAppointment(id, finalData) {
  try {
    const emailToken = finalData && finalData._emailToken;
    const sheet = getOrCreateSheet(CONFIG.SHEETS.APPOINTMENTS, CONFIG.APPOINTMENT_HEADERS);
    const foundCell = sheet.getRange('A:A').createTextFinder(id).matchEntireCell(true).findNext();
    if (!foundCell) return { success: false, error: 'Không tìm thấy lịch hẹn với ID: ' + id };

    const rowIndex = foundCell.getRow();
    const existingRow = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    assertCanMutateAppointment_(existingRow, emailToken);

    sheet.getRange(rowIndex, 4).setValue(finalData.services.join(', '));
    sheet.getRange(rowIndex, 8).setValue('Hoàn thành');
    sheet.getRange(rowIndex, 9).setValue(finalData.notes || '');

    clearCache();
    logAction_('appointment_complete', { id: id, services: finalData.services }, emailToken);
    return { success: true };
  } catch (error) {
    console.error('Error in completeAppointment:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Hủy một lịch hẹn.
 */
function cancelAppointment(appointmentId, emailToken) {
  try {
    const sheet = getOrCreateSheet(CONFIG.SHEETS.APPOINTMENTS, CONFIG.APPOINTMENT_HEADERS);
    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex(row => String(row[0]) === String(appointmentId));
    if (rowIndex === -1) return { success: false, error: 'Không tìm thấy lịch hẹn' };

    assertCanMutateAppointment_(data[rowIndex], emailToken);
    sheet.getRange(rowIndex + 1, 8).setValue('Đã hủy');

    clearCache();
    logAction_('appointment_cancel', { id: appointmentId }, emailToken);
    return { success: true, id: appointmentId };
  } catch (error) {
    console.error('Error in cancelAppointment:', error);
    return { success: false, error: error.toString() };
  }
}

function addCustomerIfNotExists(name, phone) {
  try {
    if (!name || !phone) return;
    const customerSheet = getOrCreateSheet(CONFIG.SHEETS.CUSTOMERS, CONFIG.CUSTOMER_HEADERS);
    const phoneColumnValues = customerSheet.getRange(2, 3, customerSheet.getLastRow(), 1).getValues();
    const phoneList = phoneColumnValues.flat();
    if (!phoneList.includes(phone)) {
      const newId = 'KH-' + (customerSheet.getLastRow());
      customerSheet.appendRow([newId, name, phone, '', new Date(), '']);
    }
  } catch (error) {
    console.error('Error in addCustomerIfNotExists:', error);
  }
}

function generateId(prefix, sequenceNumber) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return prefix.toUpperCase() + '-' + year + month + day + '-' + sequenceNumber;
}