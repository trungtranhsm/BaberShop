/**
 * @fileoverview Settings management service.
 * Handles reading and writing general settings (Shop info, payment info)
 * stored in the "Cài Đặt" sheet.
 */

/**
 * Tải toàn bộ cài đặt hệ thống từ sheet Cài Đặt.
 * @returns {object}
 */
function loadSystemSettings() {
  try {
    const sheet = getOrCreateSheet(CONFIG.SHEETS.SETTINGS, ['Khóa', 'Giá trị']);
    const lastRow = sheet.getLastRow();
    const settings = {
      bank_id: '',
      account_no: '',
      account_name: '',
      shop_name: 'Barber Shop',
      shop_address: '',
      shop_phone: ''
    };
    
    if (lastRow < 2) return settings;
    
    const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    values.forEach(row => {
      const key = String(row[0]).trim();
      const val = String(row[1]).trim();
      if (key) {
        settings[key] = val;
      }
    });
    return settings;
  } catch (e) {
    console.error('Error in loadSystemSettings:', e);
    return {};
  }
}

/**
 * Lưu cài đặt hệ thống.
 * @param {object} settings
 * @param {string} emailToken
 * @returns {object}
 */
function saveSystemSettings(settings, emailToken) {
  try {
    assertPermission_(emailToken, 'viewSettings'); // Check permissions
    const sheet = getOrCreateSheet(CONFIG.SHEETS.SETTINGS, ['Khóa', 'Giá trị']);
    
    // Read existing keys to update or append
    const lastRow = sheet.getLastRow();
    const existingKeys = {};
    if (lastRow >= 2) {
      const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      values.forEach((row, i) => {
        existingKeys[String(row[0]).trim()] = i + 2; // 2-based rowIndex
      });
    }
    
    const keys = ['bank_id', 'account_no', 'account_name', 'shop_name', 'shop_address', 'shop_phone'];
    keys.forEach(key => {
      if (settings.hasOwnProperty(key)) {
        const val = String(settings[key]).trim();
        if (existingKeys[key]) {
          sheet.getRange(existingKeys[key], 2).setValue(val);
        } else {
          sheet.appendRow([key, val]);
        }
      }
    });
    
    clearCache();
    logAction_('settings_update', settings, emailToken);
    return { success: true };
  } catch (e) {
    console.error('Error in saveSystemSettings:', e);
    return { success: false, error: e.toString() };
  }
}
