// ========== CUSTOMER MANAGEMENT SERVICE ==========

function getCustomerDetailsWithStats(customerPhone, emailToken) {
  try {
    assertPermission_(emailToken, 'viewCustomers');
    const appointments = loadAppointments();
    const services = loadServices();
    const servicePriceMap = new Map(services.map(s => [s.name, s.price]));

    let totalSpend = 0;
    let lastVisit = null;
    const customerAppointments = appointments
      .filter(apt => String(apt.phone).trim() === String(customerPhone).trim())
      .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));

    customerAppointments.forEach(apt => {
      if (apt.status === 'Hoàn thành') {
        const serviceNames = apt.service.split(',').map(s => s.trim());
        totalSpend += serviceNames.reduce((sum, name) => sum + (servicePriceMap.get(name) || 0), 0);
        const visitDate = new Date(apt.date);
        if (!lastVisit || visitDate > lastVisit) lastVisit = visitDate;
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

function getCustomerDetails(customerPhone, emailToken) {
  try {
    assertPermission_(emailToken, 'viewCustomers');
    const appointments = loadAppointments();
    const customerAppointments = appointments
      .filter(apt => apt.phone === customerPhone)
      .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
    return { success: true, data: customerAppointments };
  } catch (error) {
    console.error('Error in getCustomerDetails:', error.stack);
    return { success: false, error: error.toString() };
  }
}

function createOrUpdateCustomer(customerData, emailToken) {
  try {
    assertPermission_(emailToken, 'viewCustomers');
    const sheet = getOrCreateSheet(CONFIG.SHEETS.CUSTOMERS, CONFIG.CUSTOMER_HEADERS);
    const phoneColumn = sheet.getRange('C:C').getValues();
    let rowIndex = -1;
    for (let i = 0; i < phoneColumn.length; i++) {
      if (phoneColumn[i][0] == customerData.phone) { rowIndex = i + 1; break; }
    }
    if (rowIndex !== -1) {
      sheet.getRange(rowIndex, 2).setValue(customerData.name);
    } else {
      const newId = 'KH-' + sheet.getLastRow();
      sheet.appendRow([newId, customerData.name, customerData.phone, customerData.email || '', new Date(), customerData.notes || '']);
    }
    clearCache();
    return { success: true };
  } catch (error) {
    console.error('Error in createOrUpdateCustomer:', error.stack);
    return { success: false, error: error.toString() };
  }
}
