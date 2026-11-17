export interface ColorTokenSpec {
  nameVi: string
  cssVar: string
  hex: string
  contrastLabel: string
  roleVi: string
  sampleTextHex: string
  borderHex?: string
}

export const COLOR_TOKENS: ColorTokenSpec[] = [
  {
    nameVi: 'Giấy nền vở (Nền chính)',
    cssVar: '--paper-bg',
    hex: '#F6F1E7',
    contrastLabel: 'Nền gốc · 1.00:1',
    roleVi: 'Nền tổng thể của trang, thanh tiêu đề, lề điều hướng; luôn phẳng, không phủ lưới ô ly.',
    sampleTextHex: '#1B2230',
    borderHex: '#D9D0BF',
  },
  {
    nameVi: 'Mặt giấy đề (Tờ câu hỏi)',
    cssVar: '--paper-sheet',
    hex: '#FBF8F1',
    contrastLabel: 'Tương phản chữ 15.1:1',
    roleVi: 'Bề mặt tờ câu hỏi và khung hình vẽ; kết hợp lưới ô ly mờ 4mm riêng trên vùng đề.',
    sampleTextHex: '#1B2230',
    borderHex: '#D9D0BF',
  },
  {
    nameVi: 'Giấy chìm (Khóa / Phụ trợ)',
    cssVar: '--paper-recessed',
    hex: '#EDE5D5',
    contrastLabel: 'Bề mặt lùi cấp',
    roleVi: 'Trạng thái đã khoá khi hết giờ, ô tiêu đề bảng thông số, vùng chú giải tĩnh.',
    sampleTextHex: '#485164',
    borderHex: '#D9D0BF',
  },
  {
    nameVi: 'Đường kẻ mực mờ 1px',
    cssVar: '--rule-ink',
    hex: '#D9D0BF',
    contrastLabel: 'Thay thế đổ bóng',
    roleVi: 'Đường kẻ phân tách 1px trên toàn hệ thống; tuyệt đối không dùng đổ bóng mờ (drop shadow).',
    sampleTextHex: '#1B2230',
    borderHex: '#B9AE99',
  },
  {
    nameVi: 'Mực xanh đen (Văn bản chính)',
    cssVar: '--ink-primary',
    hex: '#1B2230',
    contrastLabel: '14.2:1 trên #F6F1E7 (AAA)',
    roleVi: 'Mực bút máy chủ đạo cho tiêu đề, ngữ liệu đọc hiểu, công thức và trục đồ thị.',
    sampleTextHex: '#F6F1E7',
  },
  {
    nameVi: 'Mực phụ (Chú thích & Nhãn)',
    cssVar: '--ink-secondary',
    hex: '#485164',
    contrastLabel: '6.8:1 trên #F6F1E7 (AA)',
    roleVi: 'Nhãn phụ, đơn vị đo, nguồn trích dẫn ngữ liệu, chú thích trục toạ độ.',
    sampleTextHex: '#FBF8F1',
  },
  {
    nameVi: 'Bút đỏ giáo viên (Điểm nhấn)',
    cssVar: '--pen-red',
    hex: '#C4322B',
    contrastLabel: '5.1:1 trên #FBF8F1 (AA)',
    roleVi: 'Màu nhấn duy nhất: nút hành động chính, phương án đang khoanh, đồng hồ khẩn và gạch sửa sai.',
    sampleTextHex: '#FBF8F1',
  },
  {
    nameVi: 'Mực xanh chấm đúng',
    cssVar: '--ink-green',
    hex: '#2F6B4F',
    contrastLabel: '5.6:1 trên #FBF8F1 (AA)',
    roleVi: 'Xác nhận phương án đúng, đáp án điền số khớp kết quả sau khi nộp bài luyện.',
    sampleTextHex: '#FBF8F1',
  },
  {
    nameVi: 'Vàng đất cảnh báo',
    cssVar: '--ink-ochre',
    hex: '#B7791F',
    contrastLabel: 'Cảnh báo thời gian & định dạng',
    roleVi: 'Đồng hồ đếm ngược dưới 5 phút, câu đánh dấu cần kiểm tra lại và nhắc lỗi cú pháp nhập số.',
    sampleTextHex: '#FBF8F1',
  },
]

export interface SpacingStepSpec {
  token: string
  px: number
  rem: string
  gridUnits: string
  usageVi: string
}

export const SPACING_SCALE: SpacingStepSpec[] = [
  {
    token: 'space-0.5',
    px: 4,
    rem: '0.25rem',
    gridUnits: '0,5 bước (vi chỉnh)',
    usageVi: 'Khoảng cách biểu tượng – nhãn con, độ lệch đường kẻ lề đôi vở học sinh.',
  },
  {
    token: 'space-1',
    px: 8,
    rem: '0.5rem',
    gridUnits: '1 đơn vị gốc (8px)',
    usageVi: 'Khoảng cách giữa các phương án A–D liền kề, đệm dọc trong nhãn đồng hồ.',
  },
  {
    token: 'space-2',
    px: 16,
    rem: '1.0rem',
    gridUnits: '2 đơn vị · 1 ô ly lớn (4mm)',
    usageVi: 'Đệm tiêu chuẩn trong ô phương án, ô nhập số và thanh công cụ hình vẽ.',
  },
  {
    token: 'space-3',
    px: 24,
    rem: '1.5rem',
    gridUnits: '3 đơn vị (24px)',
    usageVi: 'Đệm trong tờ câu hỏi, khoảng tách giữa dẫn đề và khung đồ thị khoa học.',
  },
  {
    token: 'space-4',
    px: 32,
    rem: '2.0rem',
    gridUnits: '4 đơn vị (32px)',
    usageVi: 'Khoảng cách giữa cột ngữ liệu đọc hiểu và cột câu hỏi thành phần.',
  },
  {
    token: 'space-6',
    px: 48,
    rem: '3.0rem',
    gridUnits: '6 đơn vị (48px)',
    usageVi: 'Khoảng ngắt giữa các phần chính trên tờ quy chuẩn hoặc cụm câu hỏi chùm.',
  },
  {
    token: 'space-8',
    px: 64,
    rem: '4.0rem',
    gridUnits: '8 đơn vị · 4 ô ly lớn',
    usageVi: 'Khoảng đệm đầu trang và biên lề ngoài trên màn hình máy tính để bàn.',
  },
]
