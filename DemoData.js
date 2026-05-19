// ========== DEMO DATA SEEDER - Chạy 1 lần rồi xóa ==========
// Cách dùng: Mở Apps Script Editor > chọn hàm addDemoData > nhấn Run

function addDemoData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── 1. KHÁCH HÀNG ──────────────────────────────────────────────
  const customers = [
    ['KH-D001', 'Nguyễn Văn An',     '0901234561', '', new Date('2026-04-03'), ''],
    ['KH-D002', 'Trần Minh Khoa',    '0912345672', '', new Date('2026-04-10'), ''],
    ['KH-D003', 'Lê Văn Bình',       '0923456783', '', new Date('2026-04-15'), ''],
    ['KH-D004', 'Phạm Đức Huy',      '0934567894', '', new Date('2026-04-20'), 'Khách VIP'],
    ['KH-D005', 'Hoàng Văn Nam',     '0945678905', '', new Date('2026-05-01'), ''],
    ['KH-D006', 'Đặng Thành Long',   '0956789016', '', new Date('2026-05-03'), ''],
    ['KH-D007', 'Ngô Quốc Việt',     '0967890127', '', new Date('2026-05-05'), ''],
    ['KH-D008', 'Bùi Văn Tùng',      '0978901238', '', new Date('2026-05-07'), ''],
    ['KH-D009', 'Vũ Minh Đức',       '0989012349', '', new Date('2026-05-09'), ''],
    ['KH-D010', 'Đinh Văn Phong',    '0990123450', '', new Date('2026-05-11'), 'Hay đến cuối tuần'],
  ];

  const custSheet = ss.getSheetByName('Khách hàng') || ss.insertSheet('Khách hàng');
  // Kiểm tra tránh thêm trùng
  const existingPhones = custSheet.getLastRow() > 1
    ? custSheet.getRange(2, 3, custSheet.getLastRow() - 1, 1).getValues().flat().map(String)
    : [];

  let custAdded = 0;
  customers.forEach(row => {
    if (!existingPhones.includes(String(row[2]))) {
      custSheet.appendRow(row);
      custAdded++;
    }
  });

  // ── 2. LỊCH HẸN THÁNG 5/2026 ───────────────────────────────────
  // [ID, Tên KH, SĐT, Dịch vụ, Ngày, Giờ, Nhân viên, Trạng thái, Ghi chú]
  const appointments = [
    // Tuần 1 (1–4/5)
    ['LH-D001', 'Nguyễn Văn An',   '0901234561', 'Cắt tóc nam',           '2026-05-01', '09:00', 'Minh',  'Hoàn thành', ''],
    ['LH-D002', 'Trần Minh Khoa',  '0912345672', 'Cắt + Gội',             '2026-05-01', '10:30', 'Tuấn',  'Hoàn thành', ''],
    ['LH-D003', 'Lê Văn Bình',     '0923456783', 'Nhuộm tóc',             '2026-05-02', '14:00', 'Hùng',  'Hoàn thành', 'Nhuộm nâu ánh vàng'],
    ['LH-D004', 'Phạm Đức Huy',    '0934567894', 'Combo cắt + gội + râu', '2026-05-03', '09:30', 'Minh',  'Hoàn thành', 'KH VIP'],
    ['LH-D005', 'Hoàng Văn Nam',   '0945678905', 'Cắt tóc nam',           '2026-05-03', '11:00', 'Khoa',  'Hoàn thành', ''],
    ['LH-D006', 'Đặng Thành Long', '0956789016', 'Gội đầu + Cạo râu',     '2026-05-04', '15:00', 'Tuấn',  'Đã hủy',     'Khách báo bận'],

    // Tuần 2 (5–11/5)
    ['LH-D007', 'Ngô Quốc Việt',   '0967890127', 'Cắt tóc nam',           '2026-05-05', '08:30', 'Hùng',  'Hoàn thành', ''],
    ['LH-D008', 'Bùi Văn Tùng',    '0978901238', 'Uốn tóc',               '2026-05-06', '13:00', 'Minh',  'Hoàn thành', ''],
    ['LH-D009', 'Nguyễn Văn An',   '0901234561', 'Cạo râu',               '2026-05-07', '09:00', 'Tuấn',  'Hoàn thành', ''],
    ['LH-D010', 'Vũ Minh Đức',     '0989012349', 'Cắt + Gội',             '2026-05-08', '10:00', 'Khoa',  'Hoàn thành', ''],
    ['LH-D011', 'Đinh Văn Phong',  '0990123450', 'Cắt tóc nam',           '2026-05-10', '14:30', 'Minh',  'Hoàn thành', ''],
    ['LH-D012', 'Phạm Đức Huy',    '0934567894', 'Nhuộm tóc',             '2026-05-10', '16:00', 'Hùng',  'Hoàn thành', 'Nhuộm đen tuyền'],
    ['LH-D013', 'Trần Minh Khoa',  '0912345672', 'Combo cắt + gội + râu', '2026-05-11', '09:00', 'Tuấn',  'Hoàn thành', ''],

    // Tuần 3 (12–17/5)
    ['LH-D014', 'Lê Văn Bình',     '0923456783', 'Cắt tóc nam',           '2026-05-12', '08:00', 'Khoa',  'Hoàn thành', ''],
    ['LH-D015', 'Hoàng Văn Nam',   '0945678905', 'Gội đầu',               '2026-05-13', '11:30', 'Minh',  'Hoàn thành', ''],
    ['LH-D016', 'Đặng Thành Long', '0956789016', 'Cắt tóc nam',           '2026-05-14', '10:00', 'Hùng',  'Hoàn thành', ''],
    ['LH-D017', 'Ngô Quốc Việt',   '0967890127', 'Uốn tóc',               '2026-05-15', '14:00', 'Tuấn',  'Hoàn thành', ''],
    ['LH-D018', 'Bùi Văn Tùng',    '0978901238', 'Cắt + Gội',             '2026-05-16', '09:30', 'Minh',  'Hoàn thành', ''],
    ['LH-D019', 'Nguyễn Văn An',   '0901234561', 'Combo cắt + gội + râu', '2026-05-17', '08:30', 'Khoa',  'Hoàn thành', ''],
    ['LH-D020', 'Đinh Văn Phong',  '0990123450', 'Nhuộm tóc',             '2026-05-17', '10:00', 'Hùng',  'Đã đặt',     ''],

    // Sắp tới (18–31/5) - trạng thái Đã đặt
    ['LH-D021', 'Vũ Minh Đức',     '0989012349', 'Cắt tóc nam',           '2026-05-19', '09:00', 'Minh',  'Đã đặt',     ''],
    ['LH-D022', 'Phạm Đức Huy',    '0934567894', 'Combo cắt + gội + râu', '2026-05-20', '10:00', 'Tuấn',  'Đã đặt',     'KH VIP'],
    ['LH-D023', 'Trần Minh Khoa',  '0912345672', 'Cắt tóc nam',           '2026-05-21', '11:00', 'Hùng',  'Đã đặt',     ''],
    ['LH-D024', 'Lê Văn Bình',     '0923456783', 'Gội đầu + Cạo râu',     '2026-05-23', '14:00', 'Khoa',  'Đã đặt',     ''],
    ['LH-D025', 'Hoàng Văn Nam',   '0945678905', 'Uốn tóc',               '2026-05-24', '09:30', 'Minh',  'Đã đặt',     ''],
    ['LH-D026', 'Đặng Thành Long', '0956789016', 'Cắt + Gội',             '2026-05-25', '15:00', 'Tuấn',  'Đã đặt',     ''],
    ['LH-D027', 'Bùi Văn Tùng',    '0978901238', 'Cắt tóc nam',           '2026-05-31', '10:00', 'Hùng',  'Đã đặt',     ''],
  ];

  const aptSheet = ss.getSheetByName('Lịch hẹn') || ss.insertSheet('Lịch hẹn');
  const existingIds = aptSheet.getLastRow() > 1
    ? aptSheet.getRange(2, 1, aptSheet.getLastRow() - 1, 1).getValues().flat().map(String)
    : [];

  let aptAdded = 0;
  appointments.forEach(row => {
    if (!existingIds.includes(String(row[0]))) {
      aptSheet.appendRow(row);
      aptAdded++;
    }
  });

  // Xóa cache để app tải lại dữ liệu mới
  try { CacheService.getScriptCache().remove('allAppData_v3'); } catch(e) {}

  SpreadsheetApp.getUi().alert(
    `✅ Đã thêm demo data!\n\n` +
    `👥 Khách hàng mới: ${custAdded}/10\n` +
    `📅 Lịch hẹn mới: ${aptAdded}/27\n\n` +
    `Reload webapp để thấy dữ liệu mới.`
  );
}
