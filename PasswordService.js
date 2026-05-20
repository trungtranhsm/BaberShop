// ========== PASSWORD MANAGEMENT ==========

/**
 * Hash mật khẩu bằng SHA-256 (GAS built-in).
 */
function hashPassword_(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password || '')
  );
  return bytes.map(function(b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

/**
 * Đặt/đổi mật khẩu trong cột Mật khẩu của sheet Nhân viên.
 * Cột Mật khẩu là cột thứ 10 (index 9, header 'Mật khẩu').
 */
function setUserPassword_(email, rawPassword, sheet) {
  var s = sheet || ensureStaffSheetSchema_();
  var data = s.getDataRange().getValues();
  var idx = getStaffEmailIndex_(data, email);
  if (idx === -1) return false;
  var rowNum = idx + 1;
  // Đảm bảo có đủ cột (cột 10 = index 9 = Mật khẩu)
  var hash = hashPassword_(rawPassword);
  s.getRange(rowNum, 10).setValue(hash);
  return true;
}

/**
 * Lấy password hash của user theo email.
 */
function getUserPasswordHash_(email) {
  var sheet = ensureStaffSheetSchema_();
  var data = sheet.getDataRange().getValues();
  var idx = getStaffEmailIndex_(data, email);
  if (idx === -1) return null;
  // Cột 10 (index 9) = Mật khẩu
  return String(data[idx][9] || '');
}

/**
 * Đăng nhập bằng email + mật khẩu.
 * Trả về { success, email, role, ... } hoặc { denied, reason } hoặc { isSetupNeeded }.
 */
function loginWithEmailAndPassword(email, password) {
  try {
    var normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return { denied: true, reason: 'Vui lòng nhập email.' };
    if (!password) return { denied: true, reason: 'Vui lòng nhập mật khẩu.' };

    ensureStaffSheetSchema_();
    var users = listUsersRaw();
    if (users.length === 0) {
      return { isSetupNeeded: true, email: normalizedEmail };
    }

    var u = users.find(function(x) { return x.email === normalizedEmail && isLoginActive_(x.status); });
    if (!u) {
      return { denied: true, email: normalizedEmail, reason: 'Email không có trong hệ thống hoặc tài khoản bị khóa.' };
    }

    var storedHash = getUserPasswordHash_(normalizedEmail);
    if (!storedHash) {
      // Chưa có mật khẩu → yêu cầu đặt mật khẩu lần đầu
      return { needSetPassword: true, email: normalizedEmail };
    }

    var isPasswordCorrect = false;
    var inputHash = hashPassword_(password);

    if (storedHash.length !== 64) {
      // Nếu mật khẩu trong sheet là text thường (chưa hash, vd: 123456 do tự điền tay)
      if (storedHash === String(password || '')) {
        isPasswordCorrect = true;
        // Tự động chuyển đổi và lưu lại dưới dạng hash SHA-256 an toàn
        setUserPassword_(normalizedEmail, password, ensureStaffSheetSchema_());
      }
    } else {
      if (storedHash === inputHash) {
        isPasswordCorrect = true;
      }
    }

    if (!isPasswordCorrect) {
      return { denied: true, email: normalizedEmail, reason: 'Mật khẩu không đúng.' };
    }

    logAction_('auth_login', { email: normalizedEmail, role: u.role }, normalizedEmail);
    return {
      success: true,
      email: u.email,
      role: u.role || ROLE.STAFF,
      staffName: u.staffName,
      name: u.staffName || u.email,
      permissions: u.permissions
    };
  } catch (e) {
    console.error('loginWithEmailAndPassword error:', e && e.stack || e);
    return { denied: true, reason: 'Lỗi server: ' + ((e && e.message) || String(e)) };
  }
}

/**
 * Đặt mật khẩu lần đầu (khi chưa có pass).
 */
function setFirstPassword(email, password) {
  try {
    var normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return { success: false, error: 'Thiếu email.' };
    if (!password || password.length < 6) return { success: false, error: 'Mật khẩu phải từ 6 ký tự.' };

    var sheet = ensureStaffSheetSchema_();
    var users = listUsersRaw();
    var u = users.find(function(x) { return x.email === normalizedEmail && isLoginActive_(x.status); });
    if (!u) return { success: false, error: 'Email không tồn tại trong hệ thống.' };

    // Kiểm tra chưa có pass
    var existing = getUserPasswordHash_(normalizedEmail);
    if (existing) return { success: false, error: 'Tài khoản này đã có mật khẩu. Dùng chức năng đổi mật khẩu.' };

    setUserPassword_(normalizedEmail, password, sheet);
    clearCache();
    logAction_('auth_set_first_password', { email: normalizedEmail }, normalizedEmail);
    return { success: true };
  } catch (e) {
    console.error('setFirstPassword error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Đổi mật khẩu (phải biết mật khẩu cũ).
 */
function changePassword(emailToken, oldPassword, newPassword) {
  try {
    var email = String(emailToken || '').trim().toLowerCase();
    if (!email) return { success: false, error: 'Chưa đăng nhập.' };
    if (!oldPassword) return { success: false, error: 'Vui lòng nhập mật khẩu cũ.' };
    if (!newPassword || newPassword.length < 6) return { success: false, error: 'Mật khẩu mới phải từ 6 ký tự.' };

    var storedHash = getUserPasswordHash_(email);
    if (!storedHash) return { success: false, error: 'Tài khoản chưa có mật khẩu. Đặt mật khẩu mới từ màn hình đăng nhập.' };

    var isOldPasswordCorrect = false;
    var oldHash = hashPassword_(oldPassword);

    if (storedHash.length !== 64) {
      if (storedHash === String(oldPassword || '')) {
        isOldPasswordCorrect = true;
      }
    } else {
      if (storedHash === oldHash) {
        isOldPasswordCorrect = true;
      }
    }

    if (!isOldPasswordCorrect) return { success: false, error: 'Mật khẩu cũ không đúng.' };

    var sheet = ensureStaffSheetSchema_();
    setUserPassword_(email, newPassword, sheet);
    clearCache();
    logAction_('auth_change_password', { email: email }, email);
    return { success: true };
  } catch (e) {
    console.error('changePassword error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Admin reset mật khẩu của user khác (xóa hash → user phải đặt lại khi đăng nhập).
 */
function adminResetPassword(targetEmail, emailToken) {
  try {
    assertPermission_(emailToken, 'manageUsers');
    var target = String(targetEmail || '').trim().toLowerCase();
    if (!target) return { success: false, error: 'Thiếu email.' };

    var sheet = ensureStaffSheetSchema_();
    var data = sheet.getDataRange().getValues();
    var idx = getStaffEmailIndex_(data, target);
    if (idx === -1) return { success: false, error: 'Không tìm thấy user.' };

    // Xóa hash → lần đăng nhập sau sẽ yêu cầu đặt pass mới
    sheet.getRange(idx + 1, 10).setValue('');
    clearCache();
    logAction_('admin_reset_password', { target: target }, emailToken);
    return { success: true };
  } catch (e) {
    console.error('adminResetPassword error:', e && e.stack || e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}
