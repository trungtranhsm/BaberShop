// ========== STAFF MANAGEMENT ==========

function getStaff() {
try {
  const cacheKey = 'staff';
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const data = getSheetData(CONFIG.SHEETS.STAFF);
  const staff = data.filter(row => row[0]);

  setCache(cacheKey, staff);
  return staff;

} catch (error) {
  console.error('Error in getStaff:', error);
  return [];
}
}

function addStaff(staffData) {
try {
  assertPermission_('manageStaff');
  // Validate required fields
  const requiredFields = ['name'];
  const errors = validateRequired(staffData, requiredFields);
  if (errors.length > 0) {
    return { success: false, error: errors.join(', ') };
  }

  const sheet = getOrCreateSheet(CONFIG.SHEETS.STAFF, CONFIG.STAFF_HEADERS);
  const lastRow = sheet.getLastRow();
  const newId = lastRow;

  const newRow = [
    newId,
    staffData.name || '',
    staffData.specialty || ''
  ];

  sheet.appendRow(newRow);
  clearCache('staff');
  logAction_('staff_add', { id: newId, name: staffData.name });

  return { success: true, id: newId };

} catch (error) {
  console.error('Error in addStaff:', error);
  return { success: false, error: error.toString() };
}
}

function updateStaff(staffId, staffData) {
try {
  assertPermission_('manageStaff');
  const sheet = getOrCreateSheet(CONFIG.SHEETS.STAFF, CONFIG.STAFF_HEADERS);
  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] == staffId);
  
  if (rowIndex === -1) {
    return { success: false, error: 'Staff not found' };
  }

  // Update staff data
  sheet.getRange(rowIndex + 1, 2).setValue(staffData.name || '');
  sheet.getRange(rowIndex + 1, 3).setValue(staffData.specialty || '');

  clearCache('staff');
  logAction_('staff_update', { id: staffId, name: staffData.name });
  return { success: true };

} catch (error) {
  console.error('Error in updateStaff:', error);
  return { success: false, error: error.toString() };
}
}

function deleteStaff(staffId) {
try {
  assertPermission_('manageStaff');
  const sheet = getOrCreateSheet(CONFIG.SHEETS.STAFF, CONFIG.STAFF_HEADERS);
  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] == staffId);
  
  if (rowIndex === -1) {
    return { success: false, error: 'Staff not found' };
  }

  sheet.deleteRow(rowIndex + 1);
  clearCache('staff');
  logAction_('staff_delete', { id: staffId });

  return { success: true };

} catch (error) {
  console.error('Error in deleteStaff:', error);
  return { success: false, error: error.toString() };
}
}

// ========== SERVICE MANAGEMENT ==========

function getServices() {
try {
  const cacheKey = 'services';
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const data = getSheetData(CONFIG.SHEETS.SERVICES);
  const services = data.filter(row => row[0]);

  setCache(cacheKey, services);
  return services;

} catch (error) {
  console.error('Error in getServices:', error);
  return [];
}
}

function addService(serviceData) {
try {
  assertPermission_('manageServices');
  // Validate required fields
  const requiredFields = ['name', 'price'];
  const errors = validateRequired(serviceData, requiredFields);
  if (errors.length > 0) {
    return { success: false, error: errors.join(', ') };
  }

  const sheet = getOrCreateSheet(CONFIG.SHEETS.SERVICES, CONFIG.SERVICE_HEADERS);
  const lastRow = sheet.getLastRow();
  const newId = lastRow;

  const newRow = [
    newId,
    serviceData.name || '',
    serviceData.price || 0
  ];

  sheet.appendRow(newRow);
  clearCache('services');
  clearCache('initialData');
  logAction_('service_add', { id: newId, name: serviceData.name, price: serviceData.price });

  return { success: true, id: newId };

} catch (error) {
  console.error('Error in addService:', error);
  return { success: false, error: error.toString() };
}
}

function updateService(serviceId, serviceData) {
try {
  assertPermission_('manageServices');
  const sheet = getOrCreateSheet(CONFIG.SHEETS.SERVICES, CONFIG.SERVICE_HEADERS);
  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] == serviceId);
  
  if (rowIndex === -1) {
    return { success: false, error: 'Service not found' };
  }

  // Update service data
  sheet.getRange(rowIndex + 1, 2).setValue(serviceData.name || '');
  sheet.getRange(rowIndex + 1, 3).setValue(serviceData.price || 0);

  clearCache('services');
  clearCache('initialData');
  logAction_('service_update', { id: serviceId, name: serviceData.name, price: serviceData.price });
  return { success: true };

} catch (error) {
  console.error('Error in updateService:', error);
  return { success: false, error: error.toString() };
}
}

function deleteService(serviceId) {
try {
  assertPermission_('manageServices');
  const sheet = getOrCreateSheet(CONFIG.SHEETS.SERVICES, CONFIG.SERVICE_HEADERS);
  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[0] == serviceId);
  
  if (rowIndex === -1) {
    return { success: false, error: 'Service not found' };
  }

  sheet.deleteRow(rowIndex + 1);
  clearCache('services');
  clearCache('initialData');
  logAction_('service_delete', { id: serviceId });

  return { success: true };

} catch (error) {
  console.error('Error in deleteService:', error);
  return { success: false, error: error.toString() };
}
}

// ========== STAFF PERFORMANCE ==========

function getStaffPerformance(startDate, endDate) {
try {
  const appointments = getAppointments();
  const services = getServices();
  
  const completedAppointments = appointments.filter(apt => {
    if (apt[7] !== 'Hoàn thành' || !apt[4]) return false;
    
    const aptDate = new Date(apt[4]);
    const start = startDate ? new Date(startDate) : new Date('1900-01-01');
    const end = endDate ? new Date(endDate) : new Date('2100-12-31');
    
    return aptDate >= start && aptDate <= end;
  });

  const staffPerformance = {};

  completedAppointments.forEach(apt => {
    const staffName = apt[6] || 'Không xác định';
    const service = services.find(s => s[1] === apt[3]);
    const revenue = service ? (service[2] || 0) : 0;

    if (!staffPerformance[staffName]) {
      staffPerformance[staffName] = {
        appointments: 0,
        revenue: 0,
        services: {}
      };
    }

    staffPerformance[staffName].appointments++;
    staffPerformance[staffName].revenue += revenue;

    const serviceName = apt[3];
    if (!staffPerformance[staffName].services[serviceName]) {
      staffPerformance[staffName].services[serviceName] = 0;
    }
    staffPerformance[staffName].services[serviceName]++;
  });

  return staffPerformance;

} catch (error) {
  console.error('Error in getStaffPerformance:', error);
  return {};
}
}
