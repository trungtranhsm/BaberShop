// ========== APPOINTMENT MANAGEMENT ==========

/**
 * Lấy toàn bộ danh sách lịch hẹn.
 * Chức năng này hiện không được Tab Quản lý Lịch hẹn sử dụng trực tiếp
 * nhưng có thể hữu ích cho các tính năng báo cáo hoặc quản trị khác trong tương lai.
 */
function getAppointments(filterOptions) {
  try {
    const data = getSheetData(CONFIG.SHEETS.APPOINTMENTS); // Lấy toàn bộ dữ liệu thô

    // Chuyển đổi dữ liệu thô thành object để dễ xử lý
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
 * Tạo một lịch hẹn mới và trả về đầy đủ đối tượng của lịch hẹn đó.
 */
function createAppointment(appointmentData) {
  try {
    // Validate required fields
    const requiredFields = ['customerName', 'phone', 'service', 'date', 'time'];
    const errors = requiredFields.filter(key => !appointmentData[key] || String(appointmentData[key]).trim() === '');
    if (errors.length > 0) {
      return { success: false, error: `Trường bắt buộc còn thiếu: ${errors.join(', ')}` };
    }

    const sheet = getOrCreateSheet(CONFIG.SHEETS.APPOINTMENTS, CONFIG.APPOINTMENT_HEADERS);
    const newId = generateId('LH', sheet.getLastRow() + 1);

    // Tạo một mảng newRow với thứ tự các trường chính xác 100%
    const newRow = [
      newId,                                  // Cột A: ID
      appointmentData.customerName,           // Cột B: Tên khách hàng
      appointmentData.phone,                  // Cột C: Số điện thoại
      appointmentData.service,                // Cột D: Dịch vụ
      appointmentData.date,                   // Cột E: Ngày
      appointmentData.time,                   // Cột F: Giờ
      appointmentData.staff || '',            // Cột G: Nhân viên
      'Đã đặt',                               // Cột H: Trạng thái
      appointmentData.notes || ''             // Cột I: Ghi chú
    ];

    sheet.appendRow(newRow);
    sortAppointmentsSheet();

    addCustomerIfNotExists(appointmentData.customerName, appointmentData.phone);
    clearCache();

    // Trả về đối tượng đã được tạo để client có thể dùng (quan trọng cho Optimistic UI)
    const newAppointmentObject = {
      id: newRow[0],
      customerName: newRow[1],
      phone: newRow[2],
      service: newRow[3],
      date: newRow[4],
      time: newRow[5],
      staff: newRow[6],
      status: newRow[7],
      notes: newRow[8]
    };

    return { success: true, data: newAppointmentObject };

  } catch (error) {
    console.error('Error in createAppointment:', error.stack);
    return { success: false, error: error.toString() };
  }
}

/**
 * Hoàn thành một lịch hẹn, cập nhật dịch vụ, trạng thái và ghi chú.
 */
function completeAppointment(id, finalData) {
  try {
    const sheet = getOrCreateSheet(CONFIG.SHEETS.APPOINTMENTS, CONFIG.APPOINTMENT_HEADERS);
    const idColumn = sheet.getRange('A:A'); 
    const textFinder = idColumn.createTextFinder(id).matchEntireCell(true);
    const foundCell = textFinder.findNext();

    if (!foundCell) {
      return { success: false, error: 'Không tìm thấy lịch hẹn với ID: ' + id };
    }

    const rowIndex = foundCell.getRow();
    // Cột 4: Dịch vụ, Cột 8: Trạng thái, Cột 9: Ghi chú
    sheet.getRange(rowIndex, 4).setValue(finalData.services.join(', '));
    sheet.getRange(rowIndex, 8).setValue('Hoàn thành');
    sheet.getRange(rowIndex, 9).setValue(finalData.notes || '');

    clearCache();
    return { success: true };

  } catch (error) {
    console.error('Error in completeAppointment:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Hủy một lịch hẹn bằng cách cập nhật trạng thái.
 */
function cancelAppointment(appointmentId) {
  try {
    const sheet = getOrCreateSheet(CONFIG.SHEETS.APPOINTMENTS, CONFIG.APPOINTMENT_HEADERS);
    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex(row => String(row[0]) === String(appointmentId));
    
    if (rowIndex === -1) {
      return { success: false, error: 'Không tìm thấy lịch hẹn' };
    }

    // Cập nhật cột Trạng thái (cột 8) thành "Đã hủy"
    sheet.getRange(rowIndex + 1, 8).setValue('Đã hủy');
    
    clearCache();
    return { success: true, id: appointmentId };

  } catch (error) {
    console.error('Error in cancelAppointment:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Thêm khách hàng vào sheet Khách hàng nếu SĐT chưa tồn tại.
 * SỬA LỖI: Cập nhật lại logic để ghi đúng cấu trúc cột (ID, Tên, SĐT...).
 */
function addCustomerIfNotExists(name, phone) {
  try {
    if (!name || !phone) return;
    const customerSheet = getOrCreateSheet(CONFIG.SHEETS.CUSTOMERS, CONFIG.CUSTOMER_HEADERS);
    // Cấu trúc đúng: Cột C là SĐT
    const phoneColumnValues = customerSheet.getRange(2, 3, customerSheet.getLastRow(), 1).getValues();
    const phoneList = phoneColumnValues.flat(); // Chuyển mảng 2D thành 1D

    if (!phoneList.includes(phone)) {
      console.log(`✨ Adding new customer: ${name}`);
      const newId = "KH-" + (customerSheet.getLastRow());
      // Ghi theo đúng thứ tự cột: ID, Tên, SĐT, Email, Ngày tạo, Ghi chú
      customerSheet.appendRow([newId, name, phone, '', new Date(), '']);
    }
  } catch (error) {
    console.error('Error in addCustomerIfNotExists:', error);
  }
}

/**
 * Tạo ID duy nhất dựa trên tiền tố và số thứ tự.
 */
function generateId(prefix, sequenceNumber) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${prefix.toUpperCase()}-${year}${month}${day}-${sequenceNumber}`;
}