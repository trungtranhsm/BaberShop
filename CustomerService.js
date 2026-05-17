// ========== CUSTOMER MANAGEMENT SERVICE - V3 (ON-DEMAND) ==========

/**
 * Lấy thông tin chi tiết, các chỉ số tính toán (tổng chi tiêu, lần ghé cuối)
 * và lịch sử hẹn của MỘT khách hàng duy nhất.
 */
function getCustomerDetailsWithStats(customerPhone) {
  try {
    const appointments = loadAppointments();
    const services = loadServices();
    const servicePriceMap = new Map(services.map(s => [s.name, s.price]));

    let totalSpend = 0;
    let lastVisit = null;

    const customerAppointments = appointments
      .filter(apt => String(apt.phone).trim() === String(customerPhone).trim())
      .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
      
    // Tính toán các chỉ số từ lịch sử hẹn
    customerAppointments.forEach(apt => {
      if (apt.status === 'Hoàn thành') {
        const serviceNames = apt.service.split(',').map(s => s.trim());
        const revenue = serviceNames.reduce((sum, name) => sum + (servicePriceMap.get(name) || 0), 0);
        totalSpend += revenue;

        const visitDate = new Date(apt.date);
        if (!lastVisit || visitDate > lastVisit) {
          lastVisit = visitDate;
        }
      }
    });

    return { 
      success: true, 
      data: {
        totalSpend: totalSpend,
        lastVisit: lastVisit ? lastVisit.toISOString().split('T')[0] : 'Chưa có',
        appointmentHistory: customerAppointments
      }
    };
  } catch (error) {
    console.error('Error in getCustomerDetailsWithStats:', error.stack);
    return { success: false, error: error.toString() };
  }
}

/**
 * Lấy thông tin chi tiết và lịch sử hẹn của một khách hàng.
 */
function getCustomerDetails(customerPhone) {
  try {
    const appointments = loadAppointments(); // Hàm này nằm trong Code.gs
    const customerAppointments = appointments
      .filter(apt => apt.phone === customerPhone)
      .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
    
    return { success: true, data: customerAppointments };
  } catch (error) {
    console.error('Error in getCustomerDetails:', error.stack);
    return { success: false, error: error.toString() };
  }
}

/**
 * Tạo hoặc cập nhật thông tin khách hàng.
 */
function createOrUpdateCustomer(customerData) {
  try {
    const sheet = getOrCreateSheet(CONFIG.SHEETS.CUSTOMERS, CONFIG.CUSTOMER_HEADERS); // Hàm này nằm trong Code.gs
    const phoneColumn = sheet.getRange("C:C").getValues(); // Giả sử SĐT ở cột C
    let rowIndex = -1;
    for(let i = 0; i < phoneColumn.length; i++){
      if(phoneColumn[i][0] == customerData.phone){
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex !== -1) { // Cập nhật
      sheet.getRange(rowIndex, 2).setValue(customerData.name); // Cột B là Tên
    } else { // Tạo mới
      const newId = "KH-" + (sheet.getLastRow());
      sheet.appendRow([newId, customerData.name, customerData.phone, customerData.email || '', new Date(), customerData.notes || '']);
    }
    
    clearCache(); // Hàm này nằm trong Code.gs
    return { success: true };
  } catch (error) {
    console.error('Error in createOrUpdateCustomer:', error.stack);
    return { success: false, error: error.toString() };
  }
}