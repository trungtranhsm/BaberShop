/**
 * @fileoverview Service functions for the Revenue tab.
 * V-FINAL: Simplified to provide raw data for client-side processing.
 */

/**
 * Lấy toàn bộ dữ liệu giao dịch đã hoàn thành để trình duyệt tự xử lý.
 * Cách này giúp các thao tác lọc, xem báo cáo sau đó nhanh tức thì.
 */
function getRevenueReportData() {
  try {
    assertPermission_('viewRevenue');
    const servicePriceMap = new Map(loadServices().map(s => [s.name, s.price]));
    const allAppointments = getSheetData(CONFIG.SHEETS.APPOINTMENTS);

    const transactions = allAppointments
      .filter(row => row[7] === 'Hoàn thành' && row[4] instanceof Date)
      .map(row => {
        const serviceNamesStr = row[3] || '';
        const serviceNames = serviceNamesStr.split(',').map(s => s.trim());
        const revenue = serviceNames.reduce((sum, name) => sum + (servicePriceMap.get(name) || 0), 0);
        
        return {
          date: row[4].toISOString().split('T')[0], // Format: YYYY-MM-DD
          revenue: revenue,
          customerName: row[1],
          service: serviceNamesStr,
          staff: row[6]
        };
      })
      .filter(t => t.revenue > 0); // Chỉ lấy các giao dịch có doanh thu

    return { success: true, data: transactions };
  } catch (error) {
    console.error('LỖI TRONG getRevenueReportData:', error.stack);
    return { success: false, error: 'Lỗi khi lấy dữ liệu báo cáo: ' + error.message };
  }
}
